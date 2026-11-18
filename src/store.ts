import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { SAVE_RETRY_DELAYS_MS, type Note } from './model.ts'
import type { NotesRepository } from './repository.ts'

export interface NotesState {
  loaded: boolean
  /** Before the load finishes, only the notes changed locally. */
  notes: readonly Note[]
  /** Ids removed locally before the load finished, dropped from its result when it lands. */
  removedBeforeLoad: readonly string[]
}

export type NotesAction =
  | { type: 'loaded'; notes: readonly Note[] }
  | { type: 'upserted'; note: Note }
  | { type: 'removed'; id: string }

export const initialNotesState: NotesState = { loaded: false, notes: [], removedBeforeLoad: [] }

export function notesReducer(state: NotesState, action: NotesAction): NotesState {
  switch (action.type) {
    case 'loaded':
      // Local changes are newer than the loaded data, so they win.
      return {
        loaded: true,
        notes: state.notes.reduce(
          upsertInto,
          action.notes.filter((n) => !state.removedBeforeLoad.includes(n.id)),
        ),
        removedBeforeLoad: [],
      }
    case 'upserted':
      return { ...state, notes: upsertInto(state.notes, action.note) }
    case 'removed': {
      if (!state.loaded) {
        return {
          ...state,
          notes: state.notes.filter((n) => n.id !== action.id),
          removedBeforeLoad: [...state.removedBeforeLoad, action.id],
        }
      }
      if (!state.notes.some((n) => n.id === action.id)) return state
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) }
    }
  }
}

function upsertInto(notes: readonly Note[], note: Note): readonly Note[] {
  return notes.some((n) => n.id === note.id)
    ? notes.map((n) => (n.id === note.id ? note : n))
    : [...notes, note]
}

function withId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return ids.has(id) ? ids : new Set(ids).add(id)
}

function withoutId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!ids.has(id)) return ids
  const next = new Set(ids)
  next.delete(id)
  return next
}

/**
 * Writes with retries (decision 7). A failed write is retried after each of SAVE_RETRY_DELAYS_MS;
 * when the last retry fails, the note stays unsaved until a later write of it succeeds. A newer
 * write of the same note supersedes an older one: its pending retry is cancelled and its late
 * outcome ignored, so old data is never sent after new.
 */
function useRetriedWrites() {
  /** Notes with a failed write that is waiting for, or making, a retry. */
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(new Set())
  /** Notes whose last write failed every retry. */
  const [unsaved, setUnsaved] = useState<ReadonlySet<string>>(new Set())
  const latest = useRef(new Map<string, number>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    const versions = latest.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
      // Writes still in flight are no longer the latest, so their failures schedule no retry.
      versions.clear()
    }
  }, [])

  const write = useCallback((id: string, send: () => Promise<void>) => {
    const version = (latest.current.get(id) ?? 0) + 1
    latest.current.set(id, version)
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    const isLatest = () => latest.current.get(id) === version

    const attempt = (retries: number) => {
      send().then(
        () => {
          if (!isLatest()) return
          setRetrying((ids) => withoutId(ids, id))
          setUnsaved((ids) => withoutId(ids, id))
        },
        (error: unknown) => {
          if (!isLatest()) return
          const delay = SAVE_RETRY_DELAYS_MS[retries]
          if (delay === undefined) {
            console.error('Failed to save note', error)
            setRetrying((ids) => withoutId(ids, id))
            setUnsaved((ids) => withId(ids, id))
            return
          }
          setRetrying((ids) => withId(ids, id))
          timers.current.set(
            id,
            setTimeout(() => {
              timers.current.delete(id)
              attempt(retries + 1)
            }, delay),
          )
        },
      )
    }
    attempt(0)
  }, [])

  return { write, retrying: retrying.size > 0, unsaved: unsaved.size > 0 }
}

/**
 * Notes state backed by a repository. Changes apply to state at once and are written after,
 * so the UI never waits on persistence.
 */
export function useNotes(repository: NotesRepository) {
  const [state, dispatch] = useReducer(notesReducer, initialNotesState)
  const [loadFailed, setLoadFailed] = useState(false)
  // Bumped by retryLoad to run the load effect again.
  const [loadAttempt, setLoadAttempt] = useState(0)
  const { write, retrying, unsaved } = useRetriedWrites()

  useEffect(() => {
    let active = true
    repository.load().then(
      (notes) => {
        if (active) dispatch({ type: 'loaded', notes })
      },
      (error: unknown) => {
        console.error('Failed to load notes', error)
        if (active) setLoadFailed(true)
      },
    )
    return () => {
      active = false
    }
  }, [repository, loadAttempt])

  const retryLoad = useCallback(() => {
    setLoadFailed(false)
    setLoadAttempt((n) => n + 1)
  }, [])

  const upsert = useCallback(
    (note: Note) => {
      dispatch({ type: 'upserted', note })
      write(note.id, () => repository.upsert(note))
    },
    [repository, write],
  )

  const remove = useCallback(
    (id: string) => {
      dispatch({ type: 'removed', id })
      write(id, () => repository.remove(id))
    },
    [repository, write],
  )

  return {
    loaded: state.loaded,
    loadFailed,
    retryLoad,
    notes: state.notes,
    upsert,
    remove,
    /** A failed write is being retried. */
    saveRetrying: retrying,
    /** Some note's last write failed every retry. */
    notSaved: unsaved,
  }
}
