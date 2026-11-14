import type { GitTree } from './github.js'

export interface RepoSkill {
  name: string
  path: string
  folderSha: string
  blobSha: string
  dirName: string
}

export interface RepoSkillsResult {
  skills: RepoSkill[]
  truncated: boolean
}

function baseName(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

function dirName(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

export function skillsFromTree(tree: GitTree, repoName: string): RepoSkillsResult {
  const entries = Array.isArray(tree.tree) ? tree.tree : []
  const folderShaByPath = new Map<string, string>()
  for (const e of entries) {
    if (e.type === 'tree' && typeof e.path === 'string' && typeof e.sha === 'string') {
      folderShaByPath.set(e.path, e.sha)
    }
  }
  const skills: RepoSkill[] = []
  for (const e of entries) {
    if (e.type !== 'blob' || typeof e.path !== 'string' || baseName(e.path) !== 'SKILL.md') continue
    const dir = dirName(e.path)
    const isRoot = dir === ''
    const folderSha = isRoot ? (tree.sha ?? '') : (folderShaByPath.get(dir) ?? '')
    skills.push({
      name: isRoot ? repoName : baseName(dir),
      path: e.path,
      folderSha,
      blobSha: typeof e.sha === 'string' ? e.sha : '',
      dirName: isRoot ? '' : baseName(dir),
    })
  }
  skills.sort((a, b) => a.path.localeCompare(b.path))
  return { skills, truncated: tree.truncated === true }
}
