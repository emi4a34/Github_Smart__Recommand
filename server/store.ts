import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppConfig, Project } from '../shared/types.js'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_DATA_DIR = join(ROOT, 'data')

export function atomicWrite(file: string, data: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

const DEFAULT_TARGETS: AppConfig['targets'] = [
  { id: 'shared', label: 'Devin + Cursor 共用（~/.agents/skills）', cliAgent: 'cursor', default: true },
  { id: 'devin', label: 'Devin 專用（~/.codeium/windsurf/skills）', cliAgent: 'windsurf', default: false },
]

const LEGACY_TARGETS = [
  { id: 'devin', label: 'Devin', cliAgent: 'windsurf' },
  { id: 'cursor', label: 'Cursor', cliAgent: 'cursor' },
]

function isLegacyTargets(targets: unknown): boolean {
  if (!Array.isArray(targets) || targets.length !== LEGACY_TARGETS.length) return false
  const agents = targets.map((t) => (t as any)?.cliAgent).sort()
  return agents.join(',') === 'cursor,windsurf' && targets.every((t) => t && typeof t === 'object' && !('default' in t))
}

const DEFAULT_SEARCH_TOPICS = ['agent-skills', 'claude-skills', 'cursor-rules', 'claude-code-skills']

function defaultConfig(): AppConfig {
  return { targets: DEFAULT_TARGETS, keywords: [], searchTopics: [...DEFAULT_SEARCH_TOPICS] }
}

function seedProjects(): Project[] {
  const now = new Date().toISOString()
  return [
    { repo: 'mattpocock/skills', tags: [], addedAt: now },
    { repo: 'GoogleChrome/modern-web-guidance', tags: [], addedAt: now },
  ]
}

export interface Store {
  dir: string
  cacheDir: string
  getProjects(): Project[]
  addProject(project: Project): void
  updateProject(repo: string, patch: { category?: string | null; tags?: string[]; note?: string | null }): Project | null
  removeProject(repo: string): boolean
  getConfig(): AppConfig
  saveConfig(patch: Partial<AppConfig>): AppConfig
}

export function createStore(dataDir: string): Store {
  const dir = dataDir
  const cacheDir = join(dir, 'cache')
  const projectsFile = join(dir, 'projects.json')
  const configFile = join(dir, 'config.json')

  if (!existsSync(projectsFile)) {
    atomicWrite(projectsFile, JSON.stringify(seedProjects(), null, 2))
  }

  const findProject = (projects: Project[], repo: string) => {
    const needle = repo.toLowerCase()
    return projects.find((p) => p.repo.toLowerCase() === needle)
  }

  return {
    dir,
    cacheDir,

    getProjects() {
      return readJson<Project[]>(projectsFile, [])
    },

    addProject(project) {
      const projects = this.getProjects()
      if (findProject(projects, project.repo)) return
      projects.push(project)
      atomicWrite(projectsFile, JSON.stringify(projects, null, 2))
    },

    updateProject(repo, patch) {
      const projects = this.getProjects()
      const p = findProject(projects, repo)
      if (!p) return null
      if (patch.category !== undefined) {
        if (patch.category === null || patch.category === '') delete p.category
        else p.category = patch.category
      }
      if (patch.tags !== undefined) p.tags = patch.tags
      if (patch.note !== undefined) {
        if (patch.note === null || patch.note === '') delete p.note
        else p.note = patch.note
      }
      atomicWrite(projectsFile, JSON.stringify(projects, null, 2))
      return p
    },

    removeProject(repo) {
      const projects = this.getProjects()
      const next = projects.filter((p) => p.repo.toLowerCase() !== repo.toLowerCase())
      if (next.length === projects.length) return false
      atomicWrite(projectsFile, JSON.stringify(next, null, 2))
      return true
    },

    getConfig() {
      const raw = readJson<Partial<AppConfig>>(configFile, {})
      const base = defaultConfig()
      const targets =
        Array.isArray(raw.targets) && raw.targets.length > 0
          ? isLegacyTargets(raw.targets)
            ? base.targets
            : raw.targets
          : base.targets
      return {
        ...base,
        ...raw,
        targets,
        keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
        searchTopics: Array.isArray(raw.searchTopics) && raw.searchTopics.length > 0 ? raw.searchTopics : base.searchTopics,
      }
    },

    saveConfig(patch) {
      const current = this.getConfig()
      const next: AppConfig = { ...current, ...patch }
      if (patch.githubToken === '') delete next.githubToken
      atomicWrite(configFile, JSON.stringify(next, null, 2))
      return this.getConfig()
    },
  }
}
