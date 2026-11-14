export const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
export const REPO_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/
export const REPO_FULL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/
export const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/

export interface ParsedRepo {
  owner: string
  repo: string
  full: string
}

export function parseRepo(input: unknown): ParsedRepo | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!s) return null
  const direct = s.match(REPO_FULL_RE)
  if (direct) {
    const [owner, repo] = s.split('/')
    return { owner, repo, full: `${owner}/${repo}` }
  }
  const m = s.match(/^https?:\/\/(?:www\.)?github\.com\/(.+)$/i)
  if (!m) return null
  const segs = m[1].split('/').filter(Boolean)
  if (segs.length < 2) return null
  const owner = segs[0]
  let repo = segs[1]
  if (repo.endsWith('.git')) repo = repo.slice(0, -4)
  if (!OWNER_RE.test(owner) || !REPO_NAME_RE.test(repo)) return null
  return { owner, repo, full: `${owner}/${repo}` }
}

export function isValidSkillName(name: unknown): name is string {
  return typeof name === 'string' && SKILL_NAME_RE.test(name)
}

export function isValidAgent(id: unknown, allowed: readonly string[]): id is string {
  return typeof id === 'string' && allowed.includes(id)
}
