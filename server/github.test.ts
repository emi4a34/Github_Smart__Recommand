import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RateLimitError, createGithub } from './github.js'

const jsonRes = (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })

describe('github client', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gh-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('serves fresh cache without a second fetch', async () => {
    let calls = 0
    const fetchMock = (async () => {
      calls++
      return jsonRes({ id: 1 })
    }) as typeof fetch
    const gh = createGithub({ fetch: fetchMock, cacheDir: dir })
    await gh.getRepo('o', 'r')
    await gh.getRepo('o', 'r')
    expect(calls).toBe(1)
  })

  it('refetches after TTL expires', async () => {
    let calls = 0
    let now = 1_000_000
    const fetchMock = (async () => {
      calls++
      return jsonRes({ id: calls })
    }) as typeof fetch
    const gh = createGithub({ fetch: fetchMock, cacheDir: dir, now: () => now })
    const first = await gh.getRepo('o', 'r')
    now += 25 * 3600 * 1000
    const second = await gh.getRepo('o', 'r')
    expect(calls).toBe(2)
    expect(first.id).toBe(1)
    expect(second.id).toBe(2)
  })

  it('revalidates with If-None-Match and reuses body on 304', async () => {
    let calls = 0
    const etags: (string | null)[] = []
    let now = 1_000_000
    const fetchMock = (async (_url: any, init: any) => {
      calls++
      etags.push(init?.headers?.['If-None-Match'] ?? null)
      if (calls === 1) return jsonRes({ v: 1 }, { headers: { etag: '"abc"' } })
      return new Response(null, { status: 304 })
    }) as typeof fetch
    const gh = createGithub({ fetch: fetchMock, cacheDir: dir, now: () => now })
    await gh.getRepo('o', 'r')
    now += 25 * 3600 * 1000
    const res = await gh.getRepo('o', 'r')
    expect(calls).toBe(2)
    expect(etags[1]).toBe('"abc"')
    expect(res.v).toBe(1)
  })

  it('throws RateLimitError on 403 remaining:0 without cache', async () => {
    const fetchMock = (async () =>
      new Response('API rate limit exceeded', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60) },
      })) as typeof fetch
    const gh = createGithub({ fetch: fetchMock, cacheDir: dir })
    try {
      await gh.getRepo('o', 'r')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError)
      expect((e as RateLimitError).resetAt).toBeTruthy()
    }
  })

  it('serves stale cache on rate limit', async () => {
    let calls = 0
    let now = 1_000_000
    const fetchMock = (async () => {
      calls++
      if (calls === 1) return jsonRes({ v: 'cached' })
      return new Response('rate limited', { status: 429, headers: { 'x-ratelimit-remaining': '0' } })
    }) as typeof fetch
    const gh = createGithub({ fetch: fetchMock, cacheDir: dir, now: () => now })
    await gh.getRepo('o', 'r')
    now += 25 * 3600 * 1000
    const res = await gh.getRepo('o', 'r')
    expect(res.v).toBe('cached')
  })

  it('sends Authorization when token configured and never leaks it', async () => {
    const auths: (string | undefined)[] = []
    const fetchMock = (async (_url: any, init: any) => {
      auths.push(init?.headers?.Authorization)
      return new Response('boom', { status: 500 })
    }) as typeof fetch
    const gh = createGithub({ fetch: fetchMock, cacheDir: dir, getToken: () => 'SECRET_TOKEN' })
    const err = await gh.getRepo('o', 'r').catch((e) => e)
    expect(auths[0]).toBe('Bearer SECRET_TOKEN')
    expect(String(err.message)).not.toContain('SECRET_TOKEN')
    expect(String(err.stack)).not.toContain('SECRET_TOKEN')

    const ghNoToken = createGithub({ fetch: fetchMock, cacheDir: join(dir, 'other'), getToken: () => undefined })
    auths.length = 0
    await ghNoToken.getRepo('o', 'r').catch(() => {})
    expect(auths[0]).toBeUndefined()
  })
})
