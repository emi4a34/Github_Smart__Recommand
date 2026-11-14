import type { RepoSkill } from './repoSkills.js'
import type { ProjectKind, SkillLock, SkillState, SkillStatus, ProjectStatus } from '../shared/types.js'

export function projectStatus(repoSkills: RepoSkill[], lock: SkillLock | null | undefined, repo: string): ProjectStatus {
  const entries = Object.entries(lock?.skills ?? {})
  const needle = repo.toLowerCase()
  const match = (skillPath: string) =>
    entries.find(([, e]) => typeof e.source === 'string' && e.source.toLowerCase() === needle && e.skillPath === skillPath)

  const skills: SkillStatus[] = repoSkills.map((s) => {
    const hit = match(s.path)
    const entry = hit?.[1]
    let state: SkillState = 'not_installed'
    if (entry) {
      const updatable = Boolean(entry.skillFolderHash && s.folderSha && entry.skillFolderHash !== s.folderSha)
      state = updatable ? 'updatable' : 'installed'
    }
    const out: SkillStatus = { name: s.name, path: s.path, state }
    if (hit) out.lockName = hit[0]
    return out
  })

  const installedCount = skills.filter((s) => s.state !== 'not_installed').length
  const updatableCount = skills.filter((s) => s.state === 'updatable').length

  let kind: ProjectKind
  if (repoSkills.length === 0) kind = 'library'
  else if (updatableCount > 0) kind = 'updatable'
  else if (installedCount > 0) kind = 'installed'
  else kind = 'not_installed'

  return { kind, skills, installedCount, updatableCount }
}
