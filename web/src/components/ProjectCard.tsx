import { useState } from 'react'
import type { ProjectEntry } from '../../../shared/types'
import { compactNumber, githubRepoUrl, splitRepo } from '../format'
import { PreviewImage } from './ui'
import { Dialog } from './Dialog'
import { ConfirmDialog } from './ConfirmDialog'
import { api } from '../api'

const CATEGORIES = ['開發工具', 'Agent 搭建', '設計視覺', '文件寫作', '未分類']

export function effectiveCategory(p: ProjectEntry): string {
  return p.category ?? p.autoCategory ?? '未分類'
}

export function categoryCounts(projects: ProjectEntry[]): [string, number][] {
  const map = new Map<string, number>()
  for (const p of projects) {
    const c = effectiveCategory(p)
    map.set(c, (map.get(c) ?? 0) + 1)
  }
  const known = CATEGORIES.filter((c) => map.has(c))
  const extra = [...map.keys()].filter((c) => !CATEGORIES.includes(c)).sort()
  return [...known.map((c) => [c, map.get(c)!] as [string, number]), ...extra.map((c) => [c, map.get(c)!] as [string, number])]
}

function StatusLine({ p }: { p: ProjectEntry }) {
  const s = p.status
  if (p.error) return <div className="card-status card-status-error">{p.error}</div>
  if (!s) {
    return <div className="card-status">{p.statusError ?? '載入中…'}</div>
  }
  if (s.kind === 'library') return <div className="card-status">程式庫：只能參考</div>
  if (s.kind === 'not_installed') return <div className="card-status">未安裝</div>
  const parts: string[] = [`已安裝 ${s.installedCount} 個 skill`]
  if (s.updatableCount > 0) parts.push(`${s.updatableCount} 個可更新`)
  return <div className="card-status">{parts.join('，')}</div>
}

export function ProjectCard({
  project,
  onInstall,
  onChanged,
}: {
  project: ProjectEntry
  onInstall: (repo: string) => void
  onChanged: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [catDialog, setCatDialog] = useState(false)
  const [catValue, setCatValue] = useState('')
  const [removeOpen, setRemoveOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const { name } = splitRepo(project.repo)
  const info = project.info
  const title = info?.name ?? name
  const kind = project.status?.kind
  const isLibrary = kind === 'library'

  const saveCategory = async () => {
    setBusy(true)
    try {
      const [o, r] = project.repo.split('/')
      await api.updateProject(o, r, { category: catValue || null })
      setCatDialog(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const removeProject = async () => {
    const [o, r] = project.repo.split('/')
    await api.removeProject(o, r)
    onChanged()
  }

  return (
    <article className="card">
      <div className="card-preview">
        <PreviewImage
          src={info?.previewUrl}
          alt={title}
          fallback={
            <div className="preview-fallback-inner">
              {info?.ownerAvatar ? <img src={info.ownerAvatar} alt="" className="avatar" /> : null}
              <span className="mono">{project.repo}</span>
            </div>
          }
        />
        <span className={`badge badge-left ${isLibrary ? 'badge-library' : 'badge-skill'}`}>
          {isLibrary ? '程式庫' : 'SKILL'}
        </span>
        {kind === 'installed' && <span className="badge badge-right">已安裝</span>}
        {kind === 'updatable' && <span className="badge badge-right badge-warn">可更新</span>}
      </div>
      <div className="card-body">
        <h3 className="card-title">{title}</h3>
        <div className="card-repo mono">{project.repo}</div>
        <p className="card-desc">{info?.description ?? '（無描述）'}</p>
        <div className="card-stats">
          <span title="Stars">★ {compactNumber(info?.stars)}</span>
          <span title="Forks">⑂ {compactNumber(info?.forks)}</span>
          <span title="Issues">◔ {compactNumber(info?.openIssues)}</span>
        </div>
        <StatusLine p={project} />
        <div className="card-actions">
          {!isLibrary && kind !== undefined && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onInstall(project.repo)}
            >
              {kind === 'not_installed' ? '安裝' : '更新 / 安裝更多'}
            </button>
          )}
          <a className="btn btn-ghost btn-sm" href={githubRepoUrl(project.repo)} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <div className="card-menu-wrap">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="更多操作"
              aria-expanded={menuOpen}
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="menu-overlay" onClick={() => setMenuOpen(false)} />
                <div className="menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setCatValue(project.category ?? '')
                      setCatDialog(true)
                      setMenuOpen(false)
                    }}
                  >
                    變更分類
                  </button>
                  <button
                    role="menuitem"
                    className="menu-danger"
                    onClick={() => {
                      setRemoveOpen(true)
                      setMenuOpen(false)
                    }}
                  >
                    移除收藏
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={catDialog} onClose={() => setCatDialog(false)} title={`變更分類 — ${project.repo}`}>
        <label className="field">
          <span>分類</span>
          <select value={catValue} onChange={(e) => setCatValue(e.target.value)}>
            <option value="">自動</option>
            {catValue && !CATEGORIES.includes(catValue) && <option value={catValue}>{catValue}</option>}
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button className="btn" onClick={() => setCatDialog(false)} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" onClick={saveCategory} disabled={busy}>
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={removeOpen}
        title="移除收藏"
        message={`確定要將 ${project.repo} 從收藏中移除嗎？已安裝的 skill 不會被移除。`}
        confirmLabel="移除收藏"
        danger
        onConfirm={removeProject}
        onClose={() => setRemoveOpen(false)}
      />
    </article>
  )
}
