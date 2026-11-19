import { useEffect, useState } from 'react'
import { UNDO_TOAST_MS } from './model.ts'

interface UndoToastProps {
  message: string
  onUndo: () => void
}

/**
 * Shown for UNDO_TOAST_MS from mount; the parent remounts it (by key) on each delete to restart
 * the timer. It closes itself, so the timeout renders only the toast, never App or the notes.
 */
export function UndoToast({ message, onUndo }: UndoToastProps) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpen(false)
    }, UNDO_TOAST_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [])

  if (!open) return null
  return (
    <div className="toast">
      <span>{message}</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
