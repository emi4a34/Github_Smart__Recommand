import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [onClose])

  return (
    <dialog ref={ref} className={`dialog${wide ? ' dialog-wide' : ''}`} onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="關閉">
          ✕
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
