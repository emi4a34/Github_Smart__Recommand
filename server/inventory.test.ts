import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanInventory, skillDirs } from './inventory.js'

const SKILL = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'inv-home-'))
  const put = (rel: string, name: string, desc: string, raw?: string) => {
    const dir = join(home, rel, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), raw ?? SKILL(name, desc))
  }
  return { home, put }
}

describe('scanInventory', () => {
  let home: string
  let appData: string
  beforeEach(() => {
    const h = makeHome()
    home = h.home
    appData = join(home, 'appdata-roaming')

    h.put('.agents/skills', 'shared-one', 'Shared skill')
    h.put('.codeium/windsurf/skills', 'shared-one', 'Shared skill windsurf')
    h.put('.cursor/skills', 'cursor-only', 'Cursor skill')
    h.put('.cursor/skills-cursor', 'builtin-x', 'Built-in skill')
    h.put('.claude/skills', 'claude-only', 'Claude skill', '---\n: [unclosed yaml\n---\n# broken')
    h.put('.claude/skills', 'no-frontmatter', 'x', '# just markdown')
    h.put('.claude/skills', 'everywhere', 'In many places')
    h.put('.agents/skills', 'everywhere', 'In many places')

    mkdirSync(join(home, '.agents'), { recursive: true })
    writeFileSync(
      join(home, '.agents', '.skill-lock.json'),
      JSON.stringify({
        version: 3,
        skills: {
          'shared-one': { source: 'o/r', skillPath: 'skills/shared-one/SKILL.md', skillFolderHash: 'h1' },
          'cursor-only': { source: 'o2/r2', skillPath: 'p/SKILL.md', skillFolderHash: 'h2' },
        },
        dismissed: {},
      }),
    )
  })
  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('maps dirs to reader tools and tolerates missing dirs', () => {
    const dirs = skillDirs(home, appData)
    const byPath = new Map(dirs.map((d) => [d.path, d]))
    expect(byPath.get(join(home, '.agents', 'skills'))?.readers).toEqual(['devin', 'cursor'])
    expect(byPath.get(join(home, '.codeium', 'windsurf', 'skills'))?.readers).toEqual(['devin'])
    expect(byPath.get(join(home, '.cursor', 'skills'))?.readers).toEqual(['cursor', 'devin'])
    expect(byPath.get(join(home, '.cursor', 'skills-cursor'))?.builtin).toBe(true)
    expect(byPath.get(join(home, '.claude', 'skills'))?.readers).toEqual(['claude', 'cursor', 'devin'])
    expect(byPath.get(join(appData, 'devin', 'skills'))?.readers).toEqual(['devin'])
    const { skills } = scanInventory({ home, appData: join(home, 'does-not-exist') })
    expect(skills.length).toBeGreaterThan(0)
  })

  it('unions readers, joins lock info and flags builtin/tracked', () => {
    const { skills, lock } = scanInventory({ home, appData })
    expect(lock?.skills['shared-one']).toBeTruthy()

    const shared = skills.find((s) => s.name === 'shared-one')
    expect(shared?.tools).toEqual(['devin', 'cursor'])
    expect(shared?.dirs).toHaveLength(2)
    expect(shared?.source).toBe('o/r')
    expect(shared?.skillPath).toBe('skills/shared-one/SKILL.md')
    expect(shared?.folderHash).toBe('h1')
    expect(shared?.lockName).toBe('shared-one')
    expect(shared?.tracked).toBe(true)
    expect(shared?.builtin).toBe(false)
    expect(shared?.readonly).toBe(false)

    const cursor = skills.find((s) => s.name === 'cursor-only')
    expect(cursor?.tools).toEqual(['devin', 'cursor'])
    expect(cursor?.source).toBe('o2/r2')

    const builtin = skills.find((s) => s.name === 'builtin-x')
    expect(builtin?.tools).toEqual(['cursor'])
    expect(builtin?.builtin).toBe(true)
    expect(builtin?.readonly).toBe(true)
    expect(builtin?.tracked).toBe(false)
    expect(builtin?.lockName).toBeUndefined()

    const claude = skills.find((s) => s.name === 'claude-only')
    expect(claude?.tools).toEqual(['devin', 'cursor', 'claude'])
    expect(claude?.description).toBe('')

    const everywhere = skills.find((s) => s.name === 'everywhere')
    expect(everywhere?.tools).toEqual(['devin', 'cursor', 'claude'])
    expect(everywhere?.dirs.length).toBeGreaterThanOrEqual(2)

    const nofm = skills.find((s) => s.name === 'no-frontmatter')
    expect(nofm?.description).toBe('')
  })
})
