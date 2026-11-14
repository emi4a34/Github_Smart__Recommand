import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { formatResetTime } from '../format'
import type { ApiError } from '../api'

export function Banner({ error, onDismiss }: { error: ApiError | null; onDismiss?: () => void }) {
  if (!error) return null
  const is429 = error.status === 429
  const reset = formatResetTime(error.resetAt)
  const message = is429
    ? `GitHub API 額度用盡${reset ? `，將於 ${reset} 重置` : ''}；到設定填入 token 可提高額度`
    : error.message
  return (
    <div className="banner banner-error" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button className="btn btn-ghost btn-sm" onClick={onDismiss} aria-label="關閉">
          ✕
        </button>
      )}
    </div>
  )
}

export function PreviewImage({ src, alt, fallback }: { src?: string | null; alt: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return <div className="preview-fallback">{fallback}</div>
  return (
    <img
      className="preview-img"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
