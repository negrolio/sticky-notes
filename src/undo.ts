import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from './model.ts'

interface UndoableDeleteOptions {
  remove: (id: string) => void
  upsert: (note: Note) => void
}

/** The undo toast being shown. `key` changes on every delete, so the toast restarts its timer. */
export interface UndoToastState {
  key: number
  /** Whether the last delete was a delete all, which has its own message (decision 24). */
  all: boolean
}

/**
 * The one delete path: every delete goes through `deleteNote` or `deleteNotes`, which keep the
 * deleted notes on a stack for `undo`. A delete all is one entry, so one undo restores it whole.
 */
export function useUndoableDelete({ remove, upsert }: UndoableDeleteOptions) {
  const deleted = useRef<(readonly Note[])[]>([])
  const toastKey = useRef(0)
  const [toast, setToast] = useState<UndoToastState | null>(null)

  const deleteEntry = useCallback(
    (notes: readonly Note[], all: boolean) => {
      for (const note of notes) remove(note.id)
      deleted.current.push(notes)
      toastKey.current += 1
      setToast({ key: toastKey.current, all })
    },
    [remove],
  )

  const deleteNote = useCallback(
    (note: Note) => {
      deleteEntry([note], false)
    },
    [deleteEntry],
  )

  /** Deletes every given note as one undo entry. Does nothing when there are none. */
  const deleteNotes = useCallback(
    (notes: readonly Note[]) => {
      if (notes.length > 0) deleteEntry(notes, true)
    },
    [deleteEntry],
  )

  /** Restores the most recent delete entry. Returns false, having done nothing, when there is none. */
  const undo = useCallback((): boolean => {
    const notes = deleted.current.pop()
    if (!notes) return false
    setToast(null)
    for (const note of notes) upsert(note)
    return true
  }, [upsert])

  return { toast, deleteNote, deleteNotes, undo }
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
