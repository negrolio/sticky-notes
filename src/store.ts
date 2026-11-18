import { useCallback, useEffect, useReducer } from 'react'
import type { Note } from './model.ts'
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

/**
 * Notes state backed by a repository. Changes apply to state at once and are written after,
 * so the UI never waits on persistence.
 */
export function useNotes(repository: NotesRepository) {
  const [state, dispatch] = useReducer(notesReducer, initialNotesState)

  useEffect(() => {
    let active = true
    repository.load().then(
      (notes) => {
        if (active) dispatch({ type: 'loaded', notes })
      },
      (error: unknown) => {
        console.error('Failed to load notes', error)
      },
    )
    return () => {
      active = false
    }
  }, [repository])

  const upsert = useCallback(
    (note: Note) => {
      dispatch({ type: 'upserted', note })
      repository.upsert(note).catch((error: unknown) => {
        console.error('Failed to save note', error)
      })
    },
    [repository],
  )

  const remove = useCallback(
    (id: string) => {
      dispatch({ type: 'removed', id })
      repository.remove(id).catch((error: unknown) => {
        console.error('Failed to remove note', error)
      })
    },
    [repository],
  )

  return { loaded: state.loaded, notes: state.notes, upsert, remove }
}
