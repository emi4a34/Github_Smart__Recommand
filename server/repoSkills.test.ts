import { describe, expect, it } from 'vitest'
import { skillsFromTree } from './repoSkills.js'
import type { GitTree } from './github.js'

const tree: GitTree = {
  sha: 'ROOTSHA',
  truncated: false,
  tree: [
    { path: 'skills', type: 'tree', sha: 't-skills' },
    { path: 'skills/eng', type: 'tree', sha: 't-eng' },
    { path: 'skills/eng/tdd', type: 'tree', sha: 't-tdd' },
    { path: 'skills/eng/tdd/SKILL.md', type: 'blob', sha: 'b-tdd' },
    { path: 'skills/eng/tdd/extra.md', type: 'blob', sha: 'b-extra' },
    { path: 'docs', type: 'tree', sha: 't-docs' },
    { path: 'docs/deep', type: 'tree', sha: 't-deep' },
    { path: 'docs/deep/SKILL.md', type: 'blob', sha: 'b-deep' },
    { path: 'SKILL.md', type: 'blob', sha: 'b-root' },
    { path: 'README.md', type: 'blob', sha: 'b-readme' },
    { path: 'x/SKILL.md.bak', type: 'blob', sha: 'b-bak' },
    { path: 'x/skill.md', type: 'blob', sha: 'b-lower' },
    { path: 'x/SKILL.MD', type: 'blob', sha: 'b-upper' },
  ],
}

describe('skillsFromTree', () => {
  it('finds nested and root SKILL.md blobs', () => {
    const { skills, truncated } = skillsFromTree(tree, 'myrepo')
    expect(truncated).toBe(false)
    expect(skills).toHaveLength(3)

    const tdd = skills.find((s) => s.path === 'skills/eng/tdd/SKILL.md')
    expect(tdd).toMatchObject({ name: 'tdd', folderSha: 't-tdd', blobSha: 'b-tdd', dirName: 'tdd' })

    const deep = skills.find((s) => s.path === 'docs/deep/SKILL.md')
    expect(deep).toMatchObject({ name: 'deep', folderSha: 't-deep' })

    const root = skills.find((s) => s.path === 'SKILL.md')
    expect(root).toMatchObject({ name: 'myrepo', folderSha: 'ROOTSHA', dirName: '' })
  })

  it('ignores lookalike filenames', () => {
    const { skills } = skillsFromTree(tree, 'myrepo')
    expect(skills.some((s) => s.path.includes('SKILL.md.bak'))).toBe(false)
    expect(skills.some((s) => s.path === 'x/skill.md')).toBe(false)
    expect(skills.some((s) => s.path === 'x/SKILL.MD')).toBe(false)
  })

  it('returns empty for repos without SKILL.md', () => {
    const { skills, truncated } = skillsFromTree({ sha: 'x', tree: [{ path: 'a.md', type: 'blob', sha: '1' }], truncated: false }, 'lib')
    expect(skills).toEqual([])
    expect(truncated).toBe(false)
  })

  it('reports truncated flag', () => {
    const { truncated } = skillsFromTree({ sha: 'x', tree: [], truncated: true }, 'lib')
    expect(truncated).toBe(true)
  })
})
