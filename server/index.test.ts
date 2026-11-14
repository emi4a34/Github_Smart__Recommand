import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, type AppDeps } from './index.js'
import { createStore } from './store.js'
import { RateLimitError } from './github.js'
import type { CliResult } from '../shared/types.js'

const HOST = { host: '127.0.0.1:4777' }
const JSON_CT = { 'content-type': 'application/json' }

const fakeRepo = (o: string, r: string) => ({
  full_name: `${o}/${r}`,
  name: r,
  owner: { login: o, avatar_url: 'https://avatar' },
  description: 'test repo',
  stargazers_count: 42,
  forks_count: 3,
  open_issues_count: 1,
  topics: ['testing'],
  pushed_at: '2026-11-01T00:00:00Z',
  html_url: `https://github.com/${o}/${r}`,
})

const tree = {
  sha: 'rootsha',
  truncated: false,
  tree: [
    { path: 'skills', type: 'tree', sha: 't1' },
    { path: 'skills/foo', type: 'tree', sha: 't2' },
    { path: 'skills/foo/SKILL.md', type: 'blob', sha: 'blob1' },
  ],
}

function makeDeps(overrides: Partial<AppDeps> = {}): { deps: AppDeps; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'app-'))
  const store = createStore(dir)
  const deps: AppDeps = {
    store,
    github: {
      getRepo: async (o: string, r: string) => fakeRepo(o, r),
      getTree: async () => tree,
      searchRepos: async () => [],
      getRawFile: async () => '---\nname: foo-skill\ndescription: A foo skill\n---\n',
    } as any,
    inventory: () => ({ skills: [], lock: null }),
    skillsCli: {
      add: async (): Promise<CliResult> => ({ code: 0, stdout: 'added', stderr: '' }),
      update: async (): Promise<CliResult> => ({ code: 0, stdout: 'updated', stderr: '' }),
      remove: async (): Promise<CliResult> => ({ code: 0, stdout: 'removed', stderr: '' }),
    } as any,
    port: 4777,
    webDist: join(dir, 'no-web'),
    ...overrides,
  }
  return { deps, dir }
}

describe('security middleware', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const app = () => {
    const { deps } = makeDeps()
    return createApp(deps)
  }

  it('rejects foreign Host', async () => {
    const res = await app().request('http://127.0.0.1:4777/api/inventory', { headers: { host: 'evil.example' } })
    expect(res.status).toBe(403)
  })

  it('rejects foreign Origin on POST /api/install', async () => {
    const res = await app().request('http://127.0.0.1:4777/api/install', {
      method: 'POST',
      headers: { ...HOST, ...JSON_CT, origin: 'http://evil.example' },
      body: JSON.stringify({ repo: 'o/r', skills: ['s'], agents: ['cursor'] }),
    })
    expect(res.status).toBe(403)
  })

  it('rejects non-JSON POST', async () => {
    const res = await app().request('http://127.0.0.1:4777/api/install', {
      method: 'POST',
      headers: { ...HOST, 'content-type': 'text/plain' },
      body: 'x',
    })
    expect(res.status).toBe(403)
  })

  it('allows localhost:5173 origin (vite dev)', async () => {
    const res = await app().request('http://127.0.0.1:4777/api/inventory', {
      headers: { host: 'localhost:5173', origin: 'http://localhost:5173' },
    })
    expect(res.status).toBe(200)
  })
  it('allows a loopback origin on another port (IDE preview proxy)', async () => {
    const res = await app().request('http://127.0.0.1:4777/api/inventory', {
      headers: { ...HOST, origin: 'http://127.0.0.1:54167' },
    })
    expect(res.status).toBe(200)
  })

  it('rejects origins that only look like loopback', async () => {
    for (const origin of ['http://127.0.0.1.evil.example', 'https://evil.example/http://localhost', 'http://localhost.evil.example:4777']) {
      const res = await app().request('http://127.0.0.1:4777/api/inventory', { headers: { ...HOST, origin } })
      expect(res.status).toBe(403)
    }
  })
})

describe('routes', () => {
  let dir: string
  let deps: AppDeps
  beforeEach(() => {
    const made = makeDeps()
    deps = made.deps
    dir = made.dir
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const req = (path: string, init?: RequestInit) =>
    createApp(deps).request(`http://127.0.0.1:4777${path}`, { headers: { ...HOST, ...JSON_CT }, ...init })

  it('GET /api/config never returns the token', async () => {
    deps.store.saveConfig({ githubToken: 'ghp_secretvalue' })
    const res = await req('/api/config')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.hasToken).toBe(true)
    expect(JSON.stringify(body)).not.toContain('ghp_secretvalue')
    expect(body.githubToken).toBeUndefined()
  })

  it('POST /api/projects accepts owner/repo and github URL, rejects garbage', async () => {
    const ok = await req('/api/projects', { method: 'POST', body: JSON.stringify({ repo: 'https://github.com/new/repo' }) })
    expect(ok.status).toBe(201)
    const bad = await req('/api/projects', { method: 'POST', body: JSON.stringify({ repo: 'a/b; rm -rf' }) })
    expect(bad.status).toBe(400)
    const again = await req('/api/projects', { method: 'POST', body: JSON.stringify({ repo: 'new/repo' }) })
    expect(again.status).toBe(200)
    expect((await again.json() as any).created).toBe(false)
  })

  it('GET /api/projects returns info, autoCategory and per-skill status', async () => {
    const res = await req('/api/projects')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.projects.length).toBeGreaterThanOrEqual(2)
    const p = body.projects[0]
    expect(p.info.stars).toBe(42)
    expect(p.info.previewUrl).toContain('opengraph.githubassets.com')
    expect(typeof p.autoCategory).toBe('string')
    expect(p.status.kind).toBe('not_installed')
    expect(p.status.skills[0].state).toBe('not_installed')
  })

  it('GET /api/projects/:o/:r/skills returns frontmatter name and state', async () => {
    const res = await req('/api/projects/mattpocock/skills/skills')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.skills[0].name).toBe('foo-skill')
    expect(body.skills[0].state).toBe('not_installed')
    expect(body.kind).toBe('not_installed')
  })

  it('POST /api/install validates and calls the CLI adapter', async () => {
    const calls: any[] = []
    deps.skillsCli = {
      add: async (a: any) => { calls.push(a); return { code: 0, stdout: '', stderr: '' } },
      update: async () => ({ code: 0, stdout: '', stderr: '' }),
      remove: async () => ({ code: 0, stdout: '', stderr: '' }),
    }
    const badAgent = await req('/api/install', {
      method: 'POST',
      body: JSON.stringify({ repo: 'o/r', skills: ['s'], agents: ['devin'] }),
    })
    expect(badAgent.status).toBe(400)
    const ok = await req('/api/install', {
      method: 'POST',
      body: JSON.stringify({ repo: 'o/r', skills: ['s-one'], agents: ['cursor', 'windsurf'] }),
    })
    expect(ok.status).toBe(200)
    const okBody = await ok.json() as any
    expect(okBody.ok).toBe(true)
    expect(okBody.inventory).toBeDefined()
    expect(calls[0]).toEqual({ repo: 'o/r', skills: ['s-one'], agents: ['cursor', 'windsurf'] })
  })

  it('POST /api/remove takes only skill names (full uninstall)', async () => {
    const calls: any[] = []
    deps.skillsCli = {
      add: async () => ({ code: 0, stdout: '', stderr: '' }),
      update: async () => ({ code: 0, stdout: '', stderr: '' }),
      remove: async (a: any) => { calls.push(a); return { code: 0, stdout: '', stderr: '' } },
    } as any
    const res = await req('/api/remove', {
      method: 'POST',
      body: JSON.stringify({ skills: ['tracked-one'] }),
    })
    expect(res.status).toBe(200)
    expect(calls[0]).toEqual({ skills: ['tracked-one'] })
    const empty = await req('/api/remove', { method: 'POST', body: JSON.stringify({ skills: [] }) })
    expect(empty.status).toBe(400)
  })

  it('rate limit maps to 429 with resetAt', async () => {
    deps.github = {
      ...deps.github as any,
      searchRepos: async () => { throw new RateLimitError('2026-11-14T01:00:00Z') },
    } as any
    const res = await req('/api/search?q=test')
    expect(res.status).toBe(429)
    const body = await res.json() as any
    expect(body.error).toBe('rate_limit')
    expect(body.resetAt).toBe('2026-11-14T01:00:00Z')
  })

  it('PUT /api/config validates targets cliAgent format', async () => {
    const bad = await req('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ targets: [{ id: 'x', label: 'X', cliAgent: 'Bad_Agent!', default: true }] }),
    })
    expect(bad.status).toBe(400)
    const missingDefault = await req('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ targets: [{ id: 'x', label: 'X', cliAgent: 'cursor' }] }),
    })
    expect(missingDefault.status).toBe(400)
    const ok = await req('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ keywords: ['typescript', 'testing'], searchTopics: ['agent-skills'] }),
    })
    expect(ok.status).toBe(200)
    const body = await ok.json() as any
    expect(body.keywords).toEqual(['typescript', 'testing'])
    expect(body.hasToken).toBe(false)
  })

  it('PATCH and DELETE project', async () => {
    const patch = await req('/api/projects/mattpocock/skills', {
      method: 'PATCH',
      body: JSON.stringify({ category: 'Agent 搭建', tags: ['x'], note: 'hi' }),
    })
    expect(patch.status).toBe(200)
    const del = await req('/api/projects/mattpocock/skills', { method: 'DELETE' })
    expect(del.status).toBe(200)
    const missing = await req('/api/projects/mattpocock/skills', { method: 'DELETE' })
    expect(missing.status).toBe(404)
  })

})
