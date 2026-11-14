import type { AppConfig, InstalledSkill, InventoryResult } from '../shared/types.js'

export interface ProfileProject {
  repo: string
  info?: { topics?: string[] | null; description?: string | null } | null
  category?: string
  tags?: string[]
  note?: string
}

export type ProfileKind = 'topic' | 'keyword' | 'skill'

export interface ProfileTerm {
  term: string
  weight: number
  kind: ProfileKind
  via: string[]
}

export interface Profile {
  terms: ProfileTerm[]
}

export interface CandidateRepo {
  repo: string
  name?: string
  description?: string | null
  topics?: string[]
  stars?: number
  pushedAt?: string | null
  htmlUrl?: string
  ownerAvatar?: string | null
  previewUrl?: string
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'how', 'what', 'why', 'when', 'where', 'who',
  'skill', 'skills', 'agent', 'agents', 'use', 'used', 'using', 'this', 'that', 'these', 'those',
  'from', 'into', 'are', 'was', 'were', 'will', 'would', 'can', 'could', 'all', 'any', 'our',
  'out', 'its', 'per', 'via', 'not', 'but', 'have', 'has', 'had', 'they', 'them', 'their',
  'there', 'which', 'whom', 'about', 'over', 'under', 'between', 'within', 'without', 'through',
  'during', 'before', 'after', 'above', 'below', 'off', 'onto', 'upon', 'also', 'just', 'like',
  'only', 'more', 'most', 'other', 'others', 'some', 'such', 'own', 'same', 'than', 'then',
  'now', 'here', 'very', 'too', 'so', 'yes', 'we', 'us', 'my', 'me', 'mine', 'yours', 'ours',
  'each', 'few', 'both', 'many', 'much', 'one', 'two', 'first', 'last', 'next', 'previous',
  'including', 'include', 'includes', 'included', 'based', 'work', 'works', 'working', 'workflow',
  'guide', 'guides', 'guideline', 'guidelines', 'documentation', 'docs', 'tool', 'tools',
  'best', 'top', 'awesome', 'ultimate', 'complete', 'simple', 'easy', 'quick', 'fast', 'free',
  'open', 'source', 'code', 'coding', 'development', 'developer', 'developers', 'programming',
  'software', 'system', 'systems', 'project', 'projects', 'build', 'building', 'create',
  'creating', 'design', 'get', 'set', 'new', 'way', 'ways', 'thing', 'things', 'really', 'make',
  'made', 'github', 'com', 'http', 'https', 'www',
])

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

interface TermAcc {
  weight: number
  kind: ProfileKind
  via: Set<string>
}

function normRepo(repo: string): string {
  return repo.toLowerCase()
}

export function buildProfile(
  inventory: InventoryResult | InstalledSkill[],
  projects: ProfileProject[],
  config: Pick<AppConfig, 'keywords'>,
  sourceTopics: Record<string, string[]> = {},
): Profile {
  const skills = Array.isArray(inventory) ? inventory : inventory.skills
  const acc = new Map<string, TermAcc>()

  const add = (rawTerm: string, weight: number, kind: ProfileKind, via: string[]) => {
    const term = rawTerm.toLowerCase().trim()
    if (term.length < 3) return
    let t = acc.get(term)
    if (!t) {
      t = { weight: 0, kind, via: new Set() }
      acc.set(term, t)
    }
    t.weight += weight
    const prio = { topic: 2, keyword: 1, skill: 0 } as const
    if (prio[kind] > prio[t.kind]) t.kind = kind
    for (const v of via) t.via.add(v)
  }

  const skillsBySource = new Map<string, string[]>()
  for (const s of skills) {
    if (!s.source) continue
    const key = normRepo(s.source)
    const list = skillsBySource.get(key) ?? []
    list.push(s.name)
    skillsBySource.set(key, list)
  }

  const repoTopics = new Map<string, { topics: string[]; via: string[] }>()
  for (const p of projects) {
    const topics = p.info?.topics
    if (!Array.isArray(topics)) continue
    repoTopics.set(normRepo(p.repo), { topics, via: [`專案 ${p.repo}`] })
  }
  for (const [source, topics] of Object.entries(sourceTopics)) {
    const key = normRepo(source)
    const via = skillsBySource.get(key) ?? []
    const prev = repoTopics.get(key)
    const merged = new Set([...(prev?.topics ?? []), ...topics])
    repoTopics.set(key, { topics: [...merged], via: [...new Set([...(prev?.via ?? []), ...via])] })
  }

  for (const { topics, via } of repoTopics.values()) {
    for (const topic of new Set(topics.map((t) => t.toLowerCase()))) {
      if (topic.length < 3) continue
      add(topic, 3, 'topic', via)
    }
  }

  for (const kw of config.keywords ?? []) {
    const term = kw.toLowerCase().trim()
    if (term.length >= 3) add(term, 3, 'keyword', ['自訂關鍵字'])
  }

  for (const s of skills) {
    const via = [s.name]
    for (const tok of new Set([...tokenize(s.name), ...tokenize(s.description)])) {
      add(tok, 1, 'skill', via)
    }
  }

  const terms = [...acc.entries()]
    .map(([term, t]) => ({ term, weight: t.weight, kind: t.kind, via: [...t.via].sort() }))
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, 60)

  return { terms }
}

export function buildQueries(profile: Profile, searchTopics: string[] = []): string[] {
  const queries = profile.terms
    .slice(0, 5)
    .map((t) => (t.kind === 'topic' ? `topic:${t.term}` : `${t.term} skills in:name,description,topics`))
  if (queries.length === 0) {
    return searchTopics.slice(0, 5).map((t) => `topic:${t}`)
  }
  return queries
}

const RECENT_DAYS = 90

export function scoreCandidate(repo: CandidateRepo, profile: Profile, now: Date | number): { score: number; reasons: string[] } {
  const nowMs = now instanceof Date ? now.getTime() : now
  const topics = new Set((repo.topics ?? []).map((t) => t.toLowerCase()))

  let overlap = 0
  const matchedTerms: string[] = []
  const viaSkills = new Set<string>()
  let keywordHit = false
  for (const t of profile.terms) {
    if (!topics.has(t.term)) continue
    overlap += t.weight
    matchedTerms.push(t.term)
    if (t.kind === 'keyword') keywordHit = true
    for (const v of t.via) {
      if (!v.startsWith('專案 ') && v !== '自訂關鍵字') viaSkills.add(v)
    }
  }

  const stars = repo.stars ?? 0
  const score = overlap + Math.log10(stars + 1)

  let recent = false
  if (repo.pushedAt) {
    const pushed = Date.parse(repo.pushedAt)
    if (!Number.isNaN(pushed) && nowMs - pushed <= RECENT_DAYS * 86400 * 1000 && nowMs - pushed >= -86400 * 1000) {
      recent = true
    }
  }

  const reasons: string[] = []
  if (matchedTerms.length > 0) {
    const terms = [...new Set(matchedTerms)].slice(0, 5).join('、')
    if (viaSkills.size > 0) {
      reasons.push(`與你已安裝的 ${[...viaSkills].slice(0, 4).join('、')} 同主題：${terms}`)
    } else {
      reasons.push(`與你的興趣主題相符：${terms}`)
    }
  }
  if (keywordHit) reasons.push('符合你設定的興趣關鍵字')
  if (recent) reasons.push('最近 90 天內有更新')
  if (reasons.length === 0) reasons.push('綜合評分推薦')

  return { score: score + (recent ? 1 : 0), reasons }
}

export function rankRecommendations(
  candidates: CandidateRepo[],
  profile: Profile,
  now: Date | number,
  excludedRepos: Iterable<string> = [],
): (CandidateRepo & { score: number; reasons: string[] })[] {
  const excluded = new Set([...excludedRepos].map((r) => r.toLowerCase()))
  return candidates
    .filter((c) => c.repo && !excluded.has(c.repo.toLowerCase()))
    .map((c) => {
      const { score, reasons } = scoreCandidate(c, profile, now)
      return { ...c, score, reasons }
    })
    .sort((a, b) => b.score - a.score || a.repo.localeCompare(b.repo))
    .slice(0, 30)
}
