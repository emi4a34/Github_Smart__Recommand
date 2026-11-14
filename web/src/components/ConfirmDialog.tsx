import { useState } from 'react'
import { Dialog } from './Dialog'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '確認',
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)

  const handle = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="confirm-text">{message}</p>
      <div className="dialog-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={handle}
          disabled={busy}
        >
          {busy ? '處理中…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
