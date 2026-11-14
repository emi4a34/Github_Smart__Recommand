import type { ReactNode } from 'react'
import { compactNumber, githubRepoUrl, splitRepo } from '../format'
import { PreviewImage } from './ui'

export interface RepoCardData {
  repo: string
  name?: string
  description?: string | null
  stars?: number
  forks?: number
  openIssues?: number
  topics?: string[]
  htmlUrl?: string
  ownerAvatar?: string | null
  previewUrl?: string
}

export function RepoCard({
  data,
  badges,
  statusLine,
  children,
}: {
  data: RepoCardData
  badges?: ReactNode
  statusLine?: ReactNode
  children?: ReactNode
}) {
  const { owner, name } = splitRepo(data.repo)
  const title = data.name ?? name
  const url = data.htmlUrl ?? githubRepoUrl(data.repo)
  const preview = data.previewUrl ?? `https://opengraph.githubassets.com/1/${data.repo}`
  return (
    <article className="card">
      <div className="card-preview">
        <PreviewImage
          src={preview}
          alt={title}
          fallback={
            <div className="preview-fallback-inner">
              {data.ownerAvatar ? <img src={data.ownerAvatar} alt="" className="avatar" /> : null}
              <span className="mono">{data.repo}</span>
            </div>
          }
        />
        {badges}
      </div>
      <div className="card-body">
        <h3 className="card-title">{title}</h3>
        <div className="card-repo mono">
          {owner}/{name}
        </div>
        <p className="card-desc">{data.description ?? '（無描述）'}</p>
        <div className="card-stats">
          <span title="Stars">★ {compactNumber(data.stars)}</span>
          <span title="Forks">⑂ {compactNumber(data.forks)}</span>
          <span title="Issues">◔ {compactNumber(data.openIssues)}</span>
        </div>
        {statusLine}
        <div className="card-actions">{children}</div>
      </div>
    </article>
  )
}
