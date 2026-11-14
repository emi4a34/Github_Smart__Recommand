export interface Project {
  repo: string
  category?: string
  tags: string[]
  note?: string
  addedAt: string
}

export interface RepoInfo {
  name: string
  owner: string
  description: string | null
  stars: number
  forks: number
  openIssues: number
  topics: string[]
  pushedAt: string | null
  ownerAvatar: string | null
  htmlUrl: string
  previewUrl: string
}

export type SkillState = 'not_installed' | 'installed' | 'updatable'
export type ProjectKind = 'library' | 'not_installed' | 'installed' | 'updatable'

export interface SkillStatus {
  name: string
  path: string
  state: SkillState
  lockName?: string
}

export interface ProjectStatus {
  kind: ProjectKind
  skills: SkillStatus[]
  installedCount: number
  updatableCount: number
}

export type ToolId = 'devin' | 'cursor' | 'claude'

export interface InstalledSkill {
  name: string
  description: string
  tools: ToolId[]
  dirs: string[]
  builtin: boolean
  readonly: boolean
  tracked: boolean
  lockName?: string
  source?: string
  skillPath?: string
  folderHash?: string
  updatedAt?: string
}

export interface LockEntry {
  source?: string
  sourceType?: string
  sourceUrl?: string
  skillPath?: string
  skillFolderHash?: string
  installMode?: string
  installedAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface SkillLock {
  version?: number
  skills: Record<string, LockEntry>
  dismissed?: unknown
}

export interface InventoryResult {
  skills: InstalledSkill[]
  lock: SkillLock | null
}

export interface ConfigTarget {
  id: string
  label: string
  cliAgent: string
  default: boolean
}

export interface AppConfig {
  githubToken?: string
  targets: ConfigTarget[]
  keywords: string[]
  searchTopics: string[]
}

export interface TrendingResponse {
  month: string
  week: number
  sort: string
  range: { start: string; end: string }
  results: SearchCard[]
}

export interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}

export interface ProjectEntry extends Project {
  info?: RepoInfo | null
  autoCategory?: string
  category?: string
  status?: ProjectStatus | null
  error?: string
  statusError?: string
}

export interface RepoSkillEntry {
  name: string
  folderName: string
  path: string
  folderSha: string
  state: SkillState
  lockName?: string
  description: string
}

export interface RepoSkillsResponse {
  repo: string
  kind: ProjectKind
  truncated: boolean
  total: number
  skills: RepoSkillEntry[]
}

export interface SearchCard {
  repo: string
  name: string
  owner: string
  ownerAvatar: string | null
  description: string | null
  stars: number
  forks: number
  openIssues: number
  topics: string[]
  pushedAt: string | null
  htmlUrl: string
  previewUrl: string
}

export interface Recommendation extends CandidateRepoLite {
  score: number
  reasons: string[]
}

export interface CandidateRepoLite {
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

export interface RecommendationsResponse {
  recommendations: Recommendation[]
  queries: string[]
}

export interface CliResponse {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  inventory: InventoryResult
}

export interface PublicConfig {
  hasToken: boolean
  targets: ConfigTarget[]
  keywords: string[]
  searchTopics: string[]
}
