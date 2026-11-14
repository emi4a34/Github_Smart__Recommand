import { describe, expect, it } from 'vitest'
import { projectStatus } from './status.js'
import type { RepoSkill } from './repoSkills.js'
import type { SkillLock } from '../shared/types.js'

const rs = (name: string, path: string, folderSha: string): RepoSkill => ({
  name,
  path,
  folderSha,
  blobSha: 'b',
  dirName: name,
})

const lock: SkillLock = {
  version: 3,
  skills: {
    foo: { source: 'Owner/Repo', skillPath: 'skills/foo/SKILL.md', skillFolderHash: 'h1' },
    samepath: { source: 'other/repo', skillPath: 'skills/foo/SKILL.md', skillFolderHash: 'hX' },
    bar: { source: 'owner/repo', skillPath: 'skills/bar/SKILL.md' },
  },
}

describe('projectStatus', () => {
  it('returns library when repo has no SKILL.md', () => {
    const st = projectStatus([], lock, 'owner/repo')
    expect(st.kind).toBe('library')
    expect(st.skills).toEqual([])
  })

  it('marks installed when lock hash matches (case-insensitive source)', () => {
    const st = projectStatus([rs('foo', 'skills/foo/SKILL.md', 'h1')], lock, 'owner/repo')
    expect(st.skills[0].state).toBe('installed')
    expect(st.skills[0].lockName).toBe('foo')
    expect(st.kind).toBe('installed')
    expect(st.installedCount).toBe(1)
  })

  it('marks updatable when folder hash differs', () => {
    const st = projectStatus([rs('foo', 'skills/foo/SKILL.md', 'DIFFERENT')], lock, 'owner/repo')
    expect(st.skills[0].state).toBe('updatable')
    expect(st.kind).toBe('updatable')
    expect(st.updatableCount).toBe(1)
  })

  it('marks not_installed without a lock entry', () => {
    const st = projectStatus([rs('new', 'skills/new/SKILL.md', 'h9')], lock, 'owner/repo')
    expect(st.skills[0].state).toBe('not_installed')
    expect(st.skills[0].lockName).toBeUndefined()
    expect(st.kind).toBe('not_installed')
  })

  it('does not count a same-path skill from a different source', () => {
    const st = projectStatus([rs('foo', 'skills/foo/SKILL.md', 'hX')], lock, 'unrelated/repo')
    expect(st.skills[0].state).toBe('not_installed')
    const st2 = projectStatus([rs('foo', 'skills/foo/SKILL.md', 'hX')], lock, 'other/repo')
    expect(st2.skills[0].state).toBe('installed')
  })

  it('treats missing hash as installed', () => {
    const st = projectStatus([rs('bar', 'skills/bar/SKILL.md', 'anything')], lock, 'owner/repo')
    expect(st.skills[0].state).toBe('installed')
  })
})
