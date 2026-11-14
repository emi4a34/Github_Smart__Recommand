import { useEffect, useMemo, useState } from 'react'
import type { PublicConfig, RepoSkillsResponse } from '../../../shared/types'
import { api, isApiError, ApiError } from '../api'
import { Dialog } from './Dialog'

export function InstallDialog({
  repo,
  open,
  config,
  onClose,
  onDone,
}: {
  repo: string | null
  open: boolean
  config: PublicConfig | null
  onClose: () => void
  onDone: (inventory?: unknown) => void
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<RepoSkillsResponse | null>(null)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState<'install' | 'update' | null>(null)
  const [result, setResult] = useState<{ ok: boolean; stdout: string; stderr: string } | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (!open || !repo || !config) return
    setLoading(true)
    setData(null)
    setResult(null)
    setError(null)
    setFilter('')
    setSelected(new Set())
    setTargets(new Set(config.targets.filter((t) => t.default).map((t) => t.cliAgent)))
    api
      .getRepoSkills(...(repo.split('/') as [string, string]))
      .then((d) => {
        setData(d)
        if (d.skills.length <= 10) {
          setSelected(new Set(d.skills.filter((s) => s.state === 'not_installed').map((s) => s.path)))
        }
      })
      .catch((e) => setError(isApiError(e) ? e : new ApiError(0, String(e))))
      .finally(() => setLoading(false))
  }, [open, repo, config])

  const filtered = useMemo(() => {
    if (!data) return []
    const f = filter.trim().toLowerCase()
    if (!f) return data.skills
    return data.skills.filter(
      (s) => s.name.toLowerCase().includes(f) || s.description.toLowerCase().includes(f) || s.folderName.toLowerCase().includes(f)
    )
  }, [data, filter])

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleTarget = (agent: string) => {
    setTargets((prev) => {
      const next = new Set(prev)
      if (next.has(agent)) next.delete(agent)
      else next.add(agent)
      return next
    })
  }

  const selectedSkills = useMemo(
    () => (data ? data.skills.filter((s) => selected.has(s.path) && s.state === 'not_installed') : []),
    [data, selected]
  )
  const updatable = useMemo(() => (data ? data.skills.filter((s) => s.state === 'updatable' && s.lockName) : []), [data])

  const doInstall = async () => {
    if (!repo || !data) return
    setRunning('install')
    setError(null)
    try {
      const res = await api.install(repo, selectedSkills.map((s) => s.name), [...targets])
      setResult(res)
      onDone(res.inventory)
    } catch (e) {
      setError(isApiError(e) ? e : new ApiError(0, String(e)))
    } finally {
      setRunning(null)
    }
  }

  const doUpdate = async () => {
    if (!updatable.length) return
    setRunning('update')
    setError(null)
    try {
      const res = await api.update(updatable.map((s) => s.lockName!))
      setResult(res)
      onDone(res.inventory)
    } catch (e) {
      setError(isApiError(e) ? e : new ApiError(0, String(e)))
    } finally {
      setRunning(null)
    }
  }

  const stateBadge = (state: string) => {
    if (state === 'installed') return <span className="badge badge-skill">已安裝</span>
    if (state === 'updatable') return <span className="badge badge-warn">可更新</span>
    return <span className="badge">未安裝</span>
  }

  return (
    <Dialog open={open} onClose={onClose} title={repo ? `安裝 — ${repo}` : '安裝'} wide>
      {loading && <p className="muted">載入 skill 清單中…</p>}
      {error && <p className="banner banner-error inline">{error.message}</p>}
      {data && (
        <>
          {data.truncated && (
            <p className="notice">此 repo 的 skill 數量過多，清單已截斷（僅顯示前 100 個）。</p>
          )}
          {data.kind === 'library' ? (
            <p className="muted">此 repo 沒有 SKILL.md，屬於程式庫，無法安裝。</p>
          ) : (
            <>
              {data.skills.length > 10 && (
                <input
                  className="input"
                  type="search"
                  placeholder="篩選 skill…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              )}
              <div className="skill-pick-head">
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(filtered.map((s) => s.path)))}>
                  全選
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                  全不選
                </button>
                <span className="muted">已選 {selectedSkills.length} 個未安裝</span>
              </div>
              <ul className="skill-pick-list">
                {filtered.map((s) => (
                  <li key={s.path}>
                    <label className="skill-pick-item">
                      <input
                        type="checkbox"
                        checked={selected.has(s.path)}
                        onChange={() => toggle(s.path)}
                        disabled={s.state !== 'not_installed' || running !== null}
                      />
                      <span className="skill-pick-name mono">{s.name}</span>
                      <span className="skill-pick-desc">{s.description}</span>
                      {stateBadge(s.state)}
                    </label>
                  </li>
                ))}
              </ul>
              <fieldset className="targets">
                <legend>安裝目標</legend>
                {config?.targets.map((t) => (
                  <label key={t.id} className="check">
                    <input
                      type="checkbox"
                      checked={targets.has(t.cliAgent)}
                      onChange={() => toggleTarget(t.cliAgent)}
                      disabled={running !== null}
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </fieldset>
              <p className="warning">⚠ 第三方 skill 可能執行任意程式碼，請只安裝你信任的來源</p>
            </>
          )}
          {result && (
            <div className={`result-box ${result.ok ? 'result-ok' : 'result-fail'}`}>
              <strong>{result.ok ? '✓ 成功' : '✗ 失敗'}</strong>
              {(result.stdout || result.stderr) && (
                <pre className="cli-output">{[result.stdout, result.stderr].filter(Boolean).join('\n')}</pre>
              )}
            </div>
          )}
        </>
      )}
      <div className="dialog-actions">
        {updatable.length > 0 && (
          <button className="btn" onClick={doUpdate} disabled={running !== null || !data || data.kind === 'library'}>
            {running === 'update' ? '更新中…' : `更新 ${updatable.length} 個`}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={doInstall}
          disabled={running !== null || !data || data.kind === 'library' || selectedSkills.length === 0 || targets.size === 0}
        >
          {running === 'install' ? '安裝中…' : `安裝選取 (${selectedSkills.length})`}
        </button>
        <button className="btn" onClick={onClose} disabled={running !== null}>
          關閉
        </button>
      </div>
    </Dialog>
  )
}
