import { describe, expect, it } from 'vitest'
import { buildProfile, buildQueries, rankRecommendations, scoreCandidate, tokenize, type CandidateRepo } from './recommend.js'
import type { InstalledSkill, InventoryResult } from '../shared/types.js'

const skill = (name: string, description: string, source?: string): InstalledSkill => ({
  name,
  description,
  tools: ['devin'],
  dirs: [],
  builtin: false,
  readonly: false,
  tracked: Boolean(source),
  source,
})

const inventory: InventoryResult = {
  skills: [
    skill('tdd', 'test driven development workflow', 'o/skills'),
    skill('code-review', 'review pull requests carefully', 'o/skills'),
  ],
  lock: null,
}

const projects = [
  { repo: 'saved/repo', info: { topics: ['testing', 'tdd'], description: 'A testing toolkit' }, tags: [] },
]

const config = { keywords: ['typescript'] }
const sourceTopics = { 'o/skills': ['testing', 'agent-skills'] }

describe('buildProfile', () => {
  it('weights repo topics and keywords above skill tokens', () => {
    const p = buildProfile(inventory, projects, config, sourceTopics)
    const byTerm = new Map(p.terms.map((t) => [t.term, t]))
    expect(byTerm.get('testing')?.weight).toBeGreaterThanOrEqual(3)
    expect(byTerm.get('testing')?.kind).toBe('topic')
    expect(byTerm.get('typescript')?.kind).toBe('keyword')
    const tdd = byTerm.get('tdd')
    expect(tdd).toBeTruthy()
    expect(tdd!.kind).toBe('topic')
    expect(byTerm.get('driven')?.kind).toBe('skill')
    expect(p.terms.every((t) => t.weight >= 1)).toBe(true)
  })

  it('is deterministic', () => {
    const a = buildProfile(inventory, projects, config, sourceTopics)
    const b = buildProfile(inventory, projects, config, sourceTopics)
    expect(a).toEqual(b)
  })
})

describe('buildQueries', () => {
  it('returns at most 5 queries in expected shapes', () => {
    const p = buildProfile(inventory, projects, config, sourceTopics)
    const qs = buildQueries(p, ['agent-skills'])
    expect(qs.length).toBeLessThanOrEqual(5)
    expect(qs.length).toBeGreaterThan(0)
    expect(qs.some((q) => q.startsWith('topic:'))).toBe(true)
    expect(qs.some((q) => q.includes('skills in:name,description,topics'))).toBe(true)
  })

  it('falls back to searchTopics when profile is empty', () => {
    const qs = buildQueries({ terms: [] }, ['agent-skills', 'claude-skills'])
    expect(qs).toEqual(['topic:agent-skills', 'topic:claude-skills'])
  })
})

describe('scoreCandidate', () => {
  const now = new Date('2026-11-14T00:00:00Z')
  const profile = buildProfile(inventory, projects, config, sourceTopics)
  const base: CandidateRepo = { repo: 'x/y', topics: [], stars: 0, pushedAt: null }

  it('topic overlap outranks raw stars', () => {
    const relevant: CandidateRepo = { repo: 'a/relevant', topics: ['testing'], stars: 500, pushedAt: '2026-11-01T00:00:00Z' }
    const popular: CandidateRepo = { repo: 'b/popular', topics: ['cooking'], stars: 50000, pushedAt: '2026-11-01T00:00:00Z' }
    const rs = scoreCandidate(relevant, profile, now)
    const ps = scoreCandidate(popular, profile, now)
    expect(rs.score).toBeGreaterThan(ps.score)
    expect(rs.reasons.length).toBeGreaterThan(0)
  })

  it('produces Traditional Chinese reasons mentioning shared topics', () => {
    const r = scoreCandidate({ repo: 'a/x', topics: ['testing'], stars: 10, pushedAt: '2026-11-10T00:00:00Z' }, profile, now)
    expect(r.reasons.some((x) => x.includes('同主題') || x.includes('相符'))).toBe(true)
    expect(r.reasons.some((x) => x.includes('90'))).toBe(true)
  })

  it('is deterministic with fixed now', () => {
    const repo: CandidateRepo = { repo: 'a/x', topics: ['testing'], stars: 100, pushedAt: '2026-10-01T00:00:00Z' }
    expect(scoreCandidate(repo, profile, now)).toEqual(scoreCandidate(repo, profile, now))
  })

  it('always returns at least one reason', () => {
    const r = scoreCandidate(base, profile, now)
    expect(r.reasons.length).toBeGreaterThan(0)
  })
})

describe('rankRecommendations', () => {
  const now = new Date('2026-11-14T00:00:00Z')
  const profile = buildProfile(inventory, projects, config, sourceTopics)

  it('excludes saved projects and installed sources, caps at 30', () => {
    const candidates: CandidateRepo[] = [
      { repo: 'saved/repo', topics: ['testing'], stars: 99999 },
      { repo: 'o/skills', topics: ['testing'], stars: 99999 },
      ...Array.from({ length: 40 }, (_, i) => ({ repo: `cand/${i}`, topics: ['testing'], stars: i })),
    ]
    const ranked = rankRecommendations(candidates, profile, now, ['saved/repo', 'o/skills'])
    expect(ranked).toHaveLength(30)
    expect(ranked.some((r) => r.repo === 'saved/repo')).toBe(false)
    expect(ranked.some((r) => r.repo === 'o/skills')).toBe(false)
    expect(ranked[0].repo).toBe('cand/39')
  })

  it('sorts by score descending', () => {
    const ranked = rankRecommendations(
      [
        { repo: 'low/x', topics: [], stars: 1, pushedAt: '2020-01-01T00:00:00Z' },
        { repo: 'high/y', topics: ['testing'], stars: 100, pushedAt: '2026-11-10T00:00:00Z' },
      ],
      profile,
      now,
    )
    expect(ranked[0].repo).toBe('high/y')
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })
})
