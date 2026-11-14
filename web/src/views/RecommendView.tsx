import { useCallback, useEffect, useState } from 'react'
import type { RecommendationsResponse } from '../../../shared/types'
import { api, isApiError, ApiError } from '../api'
import { RepoCard } from '../components/RepoCard'

export function RecommendView({
  savedRepos,
  onChanged,
  onError,
}: {
  savedRepos: Set<string>
  onChanged: () => void
  onError: (e: ApiError) => void
}) {
  const [data, setData] = useState<RecommendationsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.getRecommendations())
    } catch (e) {
      setData(null)
      onError(isApiError(e) ? e : new ApiError(0, String(e)))
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

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
        <h1>智慧推薦</h1>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? '產生中…' : '重新整理'}
        </button>
      </div>
      {loading && <p className="muted">依據你的收藏與已安裝 skill 產生推薦中…</p>}
      {!loading && data && data.recommendations.length === 0 && (
        <div className="empty"><p>目前沒有推薦結果。</p></div>
      )}
      <div className="card-grid">
        {data?.recommendations.map((r) => {
          const saved = savedRepos.has(r.repo.toLowerCase())
          return (
            <RepoCard
              key={r.repo}
              data={r}
              badges={<span className="badge badge-left badge-accent">推薦</span>}
              statusLine={
                <ul className="reasons">
                  {r.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              }
            >
              <button
                className="btn btn-primary btn-sm"
                disabled={saved || saving === r.repo}
                onClick={() => save(r.repo)}
              >
                {saving === r.repo ? '加入中…' : saved ? '已收藏' : '收藏'}
              </button>
              {r.htmlUrl && (
                <a className="btn btn-ghost btn-sm" href={r.htmlUrl} target="_blank" rel="noreferrer">
                  GitHub ↗
                </a>
              )}
            </RepoCard>
          )
        })}
      </div>
      {data && data.queries.length > 0 && (
        <p className="muted queries">查詢：{data.queries.join(' ｜ ')}</p>
      )}
    </div>
  )
}
