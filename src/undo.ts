import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from './model.ts'

interface UndoableDeleteOptions {
  remove: (id: string) => void
  upsert: (note: Note) => void
}

/**
 * The one delete path: every delete goes through `deleteNote`, which keeps the note on a stack
 * for `undo`. `toast` identifies the current undo toast, or is 0 when none is shown; it changes
 * on every delete so the toast restarts its timer.
 */
export function useUndoableDelete({ remove, upsert }: UndoableDeleteOptions) {
  const deleted = useRef<Note[]>([])
  const [toast, setToast] = useState(0)

  const deleteNote = useCallback(
    (note: Note) => {
      remove(note.id)
      deleted.current.push(note)
      setToast((t) => t + 1)
    },
    [remove],
  )

  /** Restores the most recently deleted note. Returns false, having done nothing, when there is none. */
  const undo = useCallback((): boolean => {
    const note = deleted.current.pop()
    if (!note) return false
    setToast(0)
    upsert(note)
    return true
  }, [upsert])

  return { toast, deleteNote, undo }
}

function isUndoKey(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z'
}

/** Ctrl+Z, or Cmd+Z, anywhere but in a textarea, where the browser's own text undo applies. */
export function useUndoKey(undo: () => boolean) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isUndoKey(event) || event.target instanceof HTMLTextAreaElement) return
      if (undo()) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [undo])
}
