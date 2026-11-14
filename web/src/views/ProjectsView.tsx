import { useMemo, useState } from 'react'
import type { ProjectEntry } from '../../../shared/types'
import { api, isApiError, ApiError } from '../api'
import { ProjectCard, categoryCounts, effectiveCategory } from '../components/ProjectCard'

export function ProjectsView({
  projects,
  loading,
  category,
  onChanged,
  onInstall,
  onError,
}: {
  projects: ProjectEntry[] | null
  loading: boolean
  category?: string
  onChanged: () => void
  onInstall: (repo: string) => void
  onError: (e: ApiError) => void
}) {
  const [repoInput, setRepoInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [chip, setChip] = useState<string | null>(null)

  const counts = useMemo(() => (projects ? categoryCounts(projects) : []), [projects])
  const total = projects?.length ?? 0

  const addRepo = async () => {
    const repo = repoInput.trim()
    if (!repo || adding) return
    setAdding(true)
    try {
      await api.addProject(repo)
      setRepoInput('')
      onChanged()
    } catch (e) {
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    } finally {
      setAdding(false)
    }
  }

  const visible = useMemo(() => {
    if (!projects) return []
    return projects.filter((p) => !category || effectiveCategory(p) === category)
  }, [projects, category])

  const sections = useMemo(() => {
    const map = new Map<string, ProjectEntry[]>()
    for (const p of visible) {
      const c = effectiveCategory(p)
      const arr = map.get(c) ?? []
      arr.push(p)
      map.set(c, arr)
    }
    const order = ['開發工具', 'Agent 搭建', '設計視覺', '文件寫作', '未分類']
    return [...map.entries()].sort(([a], [b]) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [visible])

  const shownSections = chip ? sections.filter(([c]) => c === chip) : sections

  return (
    <div className="view">
      <div className="view-head">
        <h1>GitHub 專案</h1>
        <div className="add-repo">
          <input
            className="input mono"
            placeholder="貼上 repo URL 或 owner/repo"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRepo()}
          />
          <button className="btn btn-primary" onClick={addRepo} disabled={adding || !repoInput.trim()}>
            {adding ? '加入中…' : '加入收藏'}
          </button>
        </div>
      </div>

      <div className="chips">
        <button className={`chip ${chip === null ? 'chip-active' : ''}`} onClick={() => setChip(null)}>
          全部 {total}
        </button>
        {counts.map(([c, n]) => (
          <button key={c} className={`chip ${chip === c ? 'chip-active' : ''}`} onClick={() => setChip(chip === c ? null : c)}>
            {c} {n}
          </button>
        ))}
      </div>

      {loading && <p className="muted">載入中…</p>}
      {!loading && projects && projects.length === 0 && (
        <div className="empty">
          <p>還沒有收藏任何專案。</p>
          <p className="muted">在上方輸入 GitHub repo URL 或 owner/repo 開始收藏。</p>
        </div>
      )}
      {!loading && projects && projects.length > 0 && shownSections.length === 0 && (
        <p className="muted">此分類目前沒有專案。</p>
      )}
      {shownSections.map(([cat, items]) => (
        <section key={cat} className="cat-section">
          <h2 className="cat-title">
            {cat} <span className="cat-count">{items.length}</span>
          </h2>
          <div className="card-grid">
            {items.map((p) => (
              <ProjectCard key={p.repo} project={p} onInstall={onInstall} onChanged={onChanged} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
