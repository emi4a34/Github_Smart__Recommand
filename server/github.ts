import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from './store.js'

export class RateLimitError extends Error {
  resetAt: string
  constructor(resetAt: string, message = 'GitHub API 暫時達到速率限制') {
    super(message)
    this.name = 'RateLimitError'
    this.resetAt = resetAt
  }
}

export class GithubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'GithubError'
    this.status = status
  }
}

export interface GithubDeps {
  fetch?: typeof fetch
  cacheDir: string
  getToken?: () => string | undefined
  now?: () => number
}

export interface GithubClient {
  getRepo(owner: string, repo: string): Promise<Record<string, any>>
  searchRepos(query: string, opts?: { perPage?: number; sort?: string; order?: 'asc' | 'desc' }): Promise<Record<string, any>[]>
  getTree(owner: string, repo: string): Promise<GitTree>
  getRawFile(owner: string, repo: string, ref: string, path: string, blobSha?: string): Promise<string>
}

export interface TreeEntry {
  path: string
  mode?: string
  type?: string
  sha?: string
  size?: number
  url?: string
}

export interface GitTree {
  sha?: string
  tree?: TreeEntry[]
  truncated?: boolean
  [key: string]: unknown
}

interface CacheEntry {
  etag?: string
  fetchedAt: number
  body: string
}

const TTL = {
  repo: 24 * 3600 * 1000,
  search: 3600 * 1000,
  tree: 10 * 60 * 1000,
}

const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'skill-hub',
}

function hashKey(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function resetAtFrom(res: Response, now: number): string {
  const epoch = res.headers.get('x-ratelimit-reset')
  if (epoch) {
    const ms = Number(epoch) * 1000
    if (!Number.isNaN(ms)) return new Date(ms).toISOString()
  }
  const retry = res.headers.get('retry-after')
  if (retry) {
    const sec = Number(retry)
    if (!Number.isNaN(sec)) return new Date(now + sec * 1000).toISOString()
  }
  return new Date(now + 3600 * 1000).toISOString()
}

function isRateLimited(res: Response, body: string): boolean {
  if (res.status === 429) return true
  if (res.status !== 403) return false
  if (res.headers.get('x-ratelimit-remaining') === '0') return true
  if (res.headers.get('retry-after')) return true
  return /rate limit|secondary rate|abuse/i.test(body)
}

export function createGithub(deps: GithubDeps): GithubClient {
  const fetchImpl = deps.fetch ?? fetch
  const nowFn = deps.now ?? (() => Date.now())
  const apiDir = join(deps.cacheDir, 'api')
  const rawDir = join(deps.cacheDir, 'raw')

  const cacheFile = (url: string) => join(apiDir, `${hashKey(url)}.json`)

  const readCache = (file: string): CacheEntry | null => {
    try {
      if (!existsSync(file)) return null
      return JSON.parse(readFileSync(file, 'utf8')) as CacheEntry
    } catch {
      return null
    }
  }

  const writeCache = (file: string, entry: CacheEntry) => {
    try {
      mkdirSync(apiDir, { recursive: true })
      atomicWrite(file, JSON.stringify(entry))
    } catch {
      // cache write failure must not break requests
    }
  }

  const apiFetch = async (url: string, ttlMs: number): Promise<any> => {
    const file = cacheFile(url)
    const cached = readCache(file)
    const now = nowFn()
    if (cached && now - cached.fetchedAt < ttlMs) {
      return JSON.parse(cached.body)
    }

    const headers: Record<string, string> = { ...API_HEADERS }
    const token = deps.getToken?.()
    if (token) headers.Authorization = `Bearer ${token}`
    if (cached?.etag) headers['If-None-Match'] = cached.etag

    const res = await fetchImpl(url, { headers })
    if (res.status === 304 && cached) {
      cached.fetchedAt = now
      writeCache(file, cached)
      return JSON.parse(cached.body)
    }

    const body = await res.text()
    if (res.status === 403 || res.status === 429) {
      if (isRateLimited(res, body)) {
        if (cached) {
          cached.fetchedAt = now
          writeCache(file, cached)
          return JSON.parse(cached.body)
        }
        throw new RateLimitError(resetAtFrom(res, now))
      }
      throw new GithubError(`GitHub API 錯誤 (${res.status})`, res.status)
    }
    if (!res.ok) {
      throw new GithubError(`GitHub API 錯誤 (${res.status})`, res.status)
    }

    const entry: CacheEntry = {
      etag: res.headers.get('etag') ?? undefined,
      fetchedAt: now,
      body,
    }
    writeCache(file, entry)
    return JSON.parse(body)
  }

  return {
    async getRepo(owner, repo) {
      return apiFetch(`https://api.github.com/repos/${owner}/${repo}`, TTL.repo)
    },

    async searchRepos(query, opts) {
      const perPage = opts?.perPage ?? 30
      const sort = opts?.sort ?? 'stars'
      const order = opts?.order ?? 'desc'
      const q = encodeURIComponent(query)
      const data = await apiFetch(
        `https://api.github.com/search/repositories?q=${q}&sort=${sort}&order=${order}&per_page=${perPage}`,
        TTL.search,
      )
      return Array.isArray(data?.items) ? data.items : []
    },

    async getTree(owner, repo) {
      return apiFetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, TTL.tree) as Promise<GitTree>
    },

    async getRawFile(owner, repo, ref, path, blobSha) {
      const rawFile = blobSha ? join(rawDir, blobSha) : null
      if (rawFile && existsSync(rawFile)) {
        return readFileSync(rawFile, 'utf8')
      }
      const encodedPath = path.split('/').map(encodeURIComponent).join('/')
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encodedPath}`
      const headers: Record<string, string> = { 'User-Agent': 'skill-hub' }
      const token = deps.getToken?.()
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetchImpl(url, { headers })
      if (!res.ok) {
        throw new GithubError(`無法取得 ${path} (${res.status})`, res.status)
      }
      const text = await res.text()
      if (rawFile) {
        try {
          mkdirSync(rawDir, { recursive: true })
          atomicWrite(rawFile, text)
        } catch {
          // ignore cache write failure
        }
      }
      return text
    },
  }
}
