import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fmString, parseFrontmatter } from './frontmatter.js'
import type { InstalledSkill, InventoryResult, SkillLock, ToolId } from '../shared/types.js'

export interface SkillDir {
  path: string
  readers: ToolId[]
  builtin: boolean
}

const TOOL_ORDER: ToolId[] = ['devin', 'cursor', 'claude']

export function skillDirs(home: string, appData?: string): SkillDir[] {
  const dirs: SkillDir[] = [
    { path: join(home, '.agents', 'skills'), readers: ['devin', 'cursor'], builtin: false },
    { path: join(home, '.codeium', 'windsurf', 'skills'), readers: ['devin'], builtin: false },
    { path: join(home, '.cursor', 'skills'), readers: ['cursor', 'devin'], builtin: false },
    { path: join(home, '.cursor', 'skills-cursor'), readers: ['cursor'], builtin: true },
    { path: join(home, '.claude', 'skills'), readers: ['claude', 'cursor', 'devin'], builtin: false },
  ]
  if (appData) dirs.push({ path: join(appData, 'devin', 'skills'), readers: ['devin'], builtin: false })
  return dirs
}

function readLock(lockPath: string): SkillLock | null {
  try {
    if (!existsSync(lockPath)) return null
    const raw = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (!raw || typeof raw !== 'object' || typeof raw.skills !== 'object' || raw.skills === null) return null
    return raw as SkillLock
  } catch {
    return null
  }
}

interface Merged {
  name: string
  description: string
  tools: Set<ToolId>
  dirs: string[]
  folderNames: Set<string>
  sawNonBuiltin: boolean
}

export function scanInventory(opts: { home: string; appData?: string; lockPath?: string }): InventoryResult {
  const lockPath = opts.lockPath ?? join(opts.home, '.agents', '.skill-lock.json')
  const lock = readLock(lockPath)
  const merged = new Map<string, Merged>()

  for (const { path, readers, builtin } of skillDirs(opts.home, opts.appData)) {
    if (!existsSync(path)) continue
    let entries
    try {
      entries = readdirSync(path, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      const skillMd = join(path, ent.name, 'SKILL.md')
      if (!existsSync(skillMd)) continue
      let fmName: string | undefined
      let description = ''
      try {
        const fm = parseFrontmatter(readFileSync(skillMd, 'utf8'))
        fmName = fmString(fm, 'name')
        description = fmString(fm, 'description') ?? ''
      } catch {
        // unreadable SKILL.md: fall back to folder name
      }
      const name = fmName ?? ent.name
      let m = merged.get(name)
      if (!m) {
        m = { name, description, tools: new Set(), dirs: [], folderNames: new Set(), sawNonBuiltin: false }
        merged.set(name, m)
      }
      if (!m.description && description) m.description = description
      for (const t of readers) m.tools.add(t)
      m.dirs.push(path)
      m.folderNames.add(ent.name)
      if (!builtin) m.sawNonBuiltin = true
    }
  }

  const lockSkills = lock?.skills ?? {}
  const skills: InstalledSkill[] = [...merged.values()]
    .map((m) => {
      let lockName = m.name in lockSkills ? m.name : undefined
      if (!lockName) {
        for (const fn of m.folderNames) {
          if (fn in lockSkills) {
            lockName = fn
            break
          }
        }
      }
      const tools = TOOL_ORDER.filter((t) => m.tools.has(t))
      const isBuiltin = !m.sawNonBuiltin
      const entry = lockName ? lockSkills[lockName] : undefined
      const s: InstalledSkill = {
        name: m.name,
        description: m.description,
        tools,
        dirs: m.dirs,
        builtin: isBuiltin,
        readonly: isBuiltin,
        tracked: Boolean(lockName),
      }
      if (lockName) s.lockName = lockName
      if (entry) {
        if (entry.source) s.source = entry.source
        if (entry.skillPath) s.skillPath = entry.skillPath
        if (entry.skillFolderHash) s.folderHash = entry.skillFolderHash
        if (entry.updatedAt) s.updatedAt = entry.updatedAt
      }
      return s
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return { skills, lock }
}
