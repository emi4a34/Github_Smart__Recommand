import { useMemo, useState } from 'react'
import type { InstalledSkill, ToolId } from '../../../shared/types'
import { api, isApiError, ApiError } from '../api'
import { githubRepoUrl, TOOL_LABELS } from '../format'
import { ConfirmDialog } from '../components/ConfirmDialog'

export type SkillToolFilter = 'all' | ToolId | 'builtin'

export function SkillsView({
  skills,
  loading,
  tool,
  onChanged,
  onError,
}: {
  skills: InstalledSkill[] | null
  loading: boolean
  tool: SkillToolFilter
  onChanged: () => void
  onError: (e: ApiError) => void
}) {
  const [q, setQ] = useState('')
  const [removing, setRemoving] = useState<InstalledSkill | null>(null)

  const filtered = useMemo(() => {
    if (!skills) return []
    let list = skills
    if (tool === 'builtin') list = list.filter((s) => s.builtin)
    else if (tool !== 'all') list = list.filter((s) => s.tools.includes(tool))
    const f = q.trim().toLowerCase()
    if (f) list = list.filter((s) => s.name.toLowerCase().includes(f) || s.description.toLowerCase().includes(f))
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills, tool, q])

  const doRemove = async () => {
    if (!removing?.lockName) return
    try {
      await api.remove([removing.lockName])
      onChanged()
    } catch (e) {
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    }
  }

  return (
    <div className="view">
      <div className="view-head">
        <h1>本機 Skills</h1>
        <input
          className="input"
          type="search"
          placeholder="搜尋 skill…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading && <p className="muted">載入中…</p>}
      {!loading && skills && skills.length === 0 && (
        <div className="empty"><p>尚未安裝任何 skill。</p></div>
      )}
      {!loading && filtered.length === 0 && skills && skills.length > 0 && (
        <p className="muted">沒有符合的 skill。</p>
      )}
      <ul className="skill-list">
        {filtered.map((s) => (
          <li key={s.name} className="skill-row">
            <div className="skill-row-main">
              <div className="skill-row-name">
                <span className="mono">{s.name}</span>
                {s.builtin && <span className="badge">內建</span>}
              </div>
              <p className="skill-row-desc">{s.description || '（無描述）'}</p>
              <div className="skill-row-meta">
                {s.tools.map((t) => (
                  <span key={t} className="badge badge-tool">{TOOL_LABELS[t]}</span>
                ))}
                {s.source && (
                  <a className="mono source-link" href={githubRepoUrl(s.source)} target="_blank" rel="noreferrer">
                    {s.source}
                  </a>
                )}
                {!s.tracked && !s.builtin && <span className="muted">手動安裝</span>}
              </div>
            </div>
            {s.tracked && (
              <button className="btn btn-ghost btn-sm" onClick={() => setRemoving(s)}>
                移除
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title="移除 Skill"
        message={`確定要移除「${removing?.name ?? ''}」嗎？這會從所有工具（Devin、Cursor、Claude）中完整解除安裝。`}
        confirmLabel="移除"
        danger
        onConfirm={doRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
