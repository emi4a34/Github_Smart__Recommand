import { useEffect, useState } from 'react'
import type { PublicConfig } from '../../../shared/types'
import { api, isApiError, ApiError } from '../api'

export function SettingsView({
  config,
  onConfig,
  onError,
}: {
  config: PublicConfig | null
  onConfig: (c: PublicConfig) => void
  onError: (e: ApiError) => void
}) {
  const [token, setToken] = useState('')
  const [keywords, setKeywords] = useState('')
  const [topics, setTopics] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const init = (c: PublicConfig) => {
    setKeywords(c.keywords.join(', '))
    setTopics(c.searchTopics.join(', '))
  }

  useEffect(() => {
    if (config && keywords === '' && topics === '') init(config)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const save = async (patch?: { githubToken?: string | null }) => {
    setSaving(true)
    setMsg('')
    try {
      const body: { githubToken?: string | null; keywords?: string[]; searchTopics?: string[] } = {}
      if (patch) body.githubToken = patch.githubToken
      else {
        body.keywords = keywords.split(',').map((s) => s.trim()).filter(Boolean)
        body.searchTopics = topics.split(',').map((s) => s.trim()).filter(Boolean)
      }
      const c = await api.putConfig(body)
      onConfig(c)
      init(c)
      setMsg('已儲存')
      setToken('')
    } catch (e) {
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    } finally {
      setSaving(false)
    }
  }

  const clearToken = async () => {
    setSaving(true)
    setMsg('')
    try {
      const c = await api.putConfig({ githubToken: null })
      onConfig(c)
      init(c)
      setToken('')
      setMsg('Token 已清除')
    } catch (e) {
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="view view-narrow">
      <div className="view-head"><h1>設定</h1></div>

      <section className="settings-section">
        <h2>GitHub Token</h2>
        <p className="muted">提高 GitHub API 額度（匿名額度較低）。Token 只儲存在本機 data/config.json，不會回傳給前端。</p>
        <div className="settings-row">
          <input
            className="input"
            type="password"
            placeholder={config?.hasToken ? '已設定（輸入新 token 以更換）' : 'ghp_…'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
          <button className="btn btn-primary" onClick={() => save({ githubToken: token })} disabled={saving || !token.trim()}>
            儲存
          </button>
          {config?.hasToken && (
            <button className="btn btn-ghost" onClick={clearToken} disabled={saving}>
              清除
            </button>
          )}
        </div>
        {config?.hasToken && <p className="muted">狀態：已設定</p>}
      </section>

      <section className="settings-section">
        <h2>興趣關鍵字</h2>
        <p className="muted">以逗號分隔，用於智慧推薦的興趣分析。</p>
        <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="tdd, code-review, testing" />
      </section>

      <section className="settings-section">
        <h2>搜尋主題</h2>
        <p className="muted">以逗號分隔，作為搜尋頁的快速主題與推薦查詢。</p>
        <input className="input" value={topics} onChange={(e) => setTopics(e.target.value)} />
      </section>

      <div className="dialog-actions">
        <button className="btn btn-primary" onClick={() => save()} disabled={saving}>
          {saving ? '儲存中…' : '儲存設定'}
        </button>
        {msg && <span className="muted">{msg}</span>}
      </div>

      <section className="settings-section">
        <h2>安裝目標</h2>
        <p className="muted">安裝時可選擇的目標（唯讀說明）：</p>
        <ul className="target-list">
          {config?.targets.map((t) => (
            <li key={t.id}>
              <strong>{t.label}</strong>
              <span className="mono muted"> cliAgent: {t.cliAgent}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
