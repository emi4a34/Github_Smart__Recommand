import { useEffect, useMemo, useState } from 'react'
import type { SearchCard, TrendingResponse } from '../../../shared/types'
import { api, isApiError, ApiError } from '../api'
import { RepoCard } from '../components/RepoCard'
import { useSaveProject } from '../useSaveProject'

const SORTS = [
  { id: 'stars', label: '熱門（Stars）' },
  { id: 'forks', label: 'Forks' },
  { id: 'updated', label: '最近更新' },
] as const

function monthOptions(): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

const WEEK_LABELS = ['全月', '第 1 週', '第 2 週', '第 3 週', '第 4 週']

export function TrendingView({
  savedRepos,
  onChanged,
  onError,
}: {
  savedRepos: Set<string>
  onChanged: () => void
  onError: (e: ApiError) => void
}) {
  const [month, setMonth] = useState(monthOptions()[0])
  const [week, setWeek] = useState(0)
  const [sort, setSort] = useState<string>('stars')
  const [data, setData] = useState<TrendingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const { saving, save } = useSaveProject(onChanged, onError)

  const months = useMemo(monthOptions, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .getTrending(month, week, sort)
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e) => {
        if (alive) onError(isApiError(e) ? e : new ApiError(0, String(e)))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [month, week, sort, onError])

  const results: SearchCard[] = data?.results ?? []

  return (
    <div className="view">
      <div className="view-head">
        <h1>熱度榜</h1>
        <p className="muted">依「建立月份」篩選 GitHub repo，再依所選指標排序。每小時更新一次快取。</p>
      </div>

      <div className="trending-controls">
        <label className="check">
          <span className="muted">月份</span>
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <div className="chips">
          {WEEK_LABELS.map((label, i) => (
            <button key={i} className={`chip ${week === i ? 'chip-active' : ''}`} onClick={() => setWeek(i)}>
              {label}
            </button>
          ))}
        </div>
        <label className="check">
          <span className="muted">排序</span>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data && (
        <p className="muted">
          {data.month} {WEEK_LABELS[data.week]}（建立於 {data.range.start} ~ {data.range.end}）· {results.length} 筆結果
        </p>
      )}

      {loading && <p className="muted">載入中…</p>}
      {!loading && results.length === 0 && <p className="muted">此期間沒有符合的 repo。</p>}
      <div className="card-grid">
        {results.map((r) => {
          const saved = savedRepos.has(r.repo.toLowerCase())
          return (
            <RepoCard
              key={r.repo}
              data={r}
              badges={<span className="badge badge-left">#{results.indexOf(r) + 1}</span>}
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
    </div>
  )
}
