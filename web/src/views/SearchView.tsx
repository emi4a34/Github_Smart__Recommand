import { useState } from 'react'
import type { PublicConfig, SearchCard } from '../../../shared/types'
import { api, isApiError, ApiError } from '../api'
import { RepoCard } from '../components/RepoCard'

export function SearchView({
  config,
  savedRepos,
  onChanged,
  onError,
}: {
  config: PublicConfig | null
  savedRepos: Set<string>
  onChanged: () => void
  onError: (e: ApiError) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchCard[] | null>(null)
  const [searched, setSearched] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const run = async (query: string, topic?: string) => {
    const term = topic ?? query.trim()
    if (!term) return
    setLoading(true)
    setSearched(term)
    try {
      const d = await api.search(topic ? '' : term, topic)
      setResults(d.results)
    } catch (e) {
      setResults(null)
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    } finally {
      setLoading(false)
    }
  }

  const save = async (repo: string) => {
    setSaving(repo)
    try {
      await api.addProject(repo)
      onChanged()
    } catch (e) {
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="view">
      <div className="view-head">
        <h1>搜尋 GitHub</h1>
        <form
          className="add-repo"
          onSubmit={(e) => {
            e.preventDefault()
            run(q)
          }}
        >
          <input
            className="input mono"
            placeholder="搜尋 skill 專案…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={loading || !q.trim()}>
            {loading ? '搜尋中…' : '搜尋'}
          </button>
        </form>
      </div>
      {config && config.searchTopics.length > 0 && (
        <div className="chips">
          {config.searchTopics.map((t) => (
            <button key={t} className="chip" onClick={() => run(q, t)}>
              topic: {t}
            </button>
          ))}
        </div>
      )}
      {!loading && results === null && <p className="muted">輸入關鍵字或點選上方主題開始搜尋。</p>}
      {loading && <p className="muted">搜尋中…</p>}
      {!loading && results && results.length === 0 && <p className="muted">沒有找到符合的專案。</p>}
      <div className="card-grid">
        {results?.map((r) => {
          const saved = savedRepos.has(r.repo.toLowerCase())
          return (
            <RepoCard
              key={r.repo}
              data={r}
              badges={<span className="badge badge-left badge-skill">SKILL</span>}
            >
              <button
                className="btn btn-primary btn-sm"
                disabled={saved || saving === r.repo}
                onClick={() => save(r.repo)}
              >
                {saving === r.repo ? '加入中…' : saved ? '已收藏' : '收藏'}
              </button>
              <a className="btn btn-ghost btn-sm" href={r.htmlUrl} target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
            </RepoCard>
          )
        })}
      </div>
      {searched && results && results.length > 0 && <p className="muted">「{searched}」的搜尋結果</p>}
    </div>
  )
}
