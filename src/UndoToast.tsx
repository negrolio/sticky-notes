import { useEffect, useState } from 'react'
import { UNDO_TOAST_MS } from './model.ts'

interface UndoToastProps {
  onUndo: () => void
}

/**
 * Shown for UNDO_TOAST_MS from mount; the parent remounts it (by key) on each delete to restart
 * the timer. It closes itself, so the timeout renders only the toast, never App or the notes.
 */
export function UndoToast({ onUndo }: UndoToastProps) {
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
      <span>Note deleted. Undo (Ctrl+Z)</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
