import { useEffect, useState } from 'react'
import { UNDO_TOAST_MS } from './model.ts'

/** Shown for as long as the undo toast; the parent remounts it (by key) on each rejected file. */
export function ImageErrorToast() {
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
  return <div className="toast">Couldn&apos;t use that image.</div>
}
