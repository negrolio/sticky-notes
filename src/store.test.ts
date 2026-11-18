import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { initialNotesState, notesReducer, useNotes } from './store.ts'

afterEach(cleanup)

const a: Note = { id: 'a', x: 0, y: 0, width: 200, height: 200, text: '', color: '#FFF59D', z: 1 }
const b: Note = { ...a, id: 'b', z: 2 }

describe('notesReducer', () => {
  test('starts empty and not loaded', () => {
    expect(initialNotesState).toEqual({ loaded: false, notes: [], removedBeforeLoad: [] })
  })

  test('loaded sets the notes and marks the state loaded', () => {
    const state = notesReducer(initialNotesState, { type: 'loaded', notes: [a, b] })
    expect(state).toEqual({ loaded: true, notes: [a, b], removedBeforeLoad: [] })
  })

  test('loaded keeps a note upserted before the load, local version winning', () => {
    const local = { ...a, x: 99 }
    const c = { ...a, id: 'c' }
    let state = notesReducer(initialNotesState, { type: 'upserted', note: local })
    state = notesReducer(state, { type: 'upserted', note: c })
    state = notesReducer(state, { type: 'loaded', notes: [a, b] })
    expect(state.notes).toEqual([local, b, c])
  })

  test('loaded drops a note removed before the load', () => {
    let state = notesReducer(initialNotesState, { type: 'removed', id: 'a' })
    state = notesReducer(state, { type: 'loaded', notes: [a, b] })
    expect(state).toEqual({ loaded: true, notes: [b], removedBeforeLoad: [] })
  })

  test('a note upserted after its removal before the load is kept', () => {
    let state = notesReducer(initialNotesState, { type: 'removed', id: 'a' })
    state = notesReducer(state, { type: 'upserted', note: a })
    state = notesReducer(state, { type: 'loaded', notes: [a, b] })
    expect(state.notes).toHaveLength(2)
    expect(state.notes).toContainEqual(a)
    expect(state.notes).toContainEqual(b)
  })

  test('upserted appends a new note', () => {
    const state = notesReducer({ loaded: true, notes: [a], removedBeforeLoad: [] }, { type: 'upserted', note: b })
    expect(state.notes).toEqual([a, b])
  })

  test('upserted replaces a note with the same id in place', () => {
    const moved = { ...a, x: 50 }
    const state = notesReducer({ loaded: true, notes: [a, b], removedBeforeLoad: [] }, { type: 'upserted', note: moved })
    expect(state.notes).toEqual([moved, b])
  })

  test('upserted keeps other note objects identical', () => {
    const state = notesReducer({ loaded: true, notes: [a, b], removedBeforeLoad: [] }, { type: 'upserted', note: { ...a, x: 5 } })
    expect(state.notes[1]).toBe(b)
  })

  test('removed drops the note with that id', () => {
    const state = notesReducer({ loaded: true, notes: [a, b], removedBeforeLoad: [] }, { type: 'removed', id: 'a' })
    expect(state.notes).toEqual([b])
  })

  test('removed with an unknown id returns the same state', () => {
    const before = { loaded: true, notes: [a], removedBeforeLoad: [] }
    expect(notesReducer(before, { type: 'removed', id: 'x' })).toBe(before)
  })
})

describe('useNotes', () => {
  test('loads notes from the repository at startup', async () => {
    const repo = createMemoryRepository([a, b])
    const { result } = renderHook(() => useNotes(repo))
    expect(result.current.loaded).toBe(false)
    await waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })
    expect(result.current.notes).toEqual([a, b])
  })

  test('upsert updates state immediately and writes to the repository', async () => {
    const repo = createMemoryRepository()
    const upsert = vi.spyOn(repo, 'upsert')
    const { result } = renderHook(() => useNotes(repo))
    await waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })

    act(() => {
      result.current.upsert(a)
    })

    expect(result.current.notes).toEqual([a])
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(a)
    await expect(repo.load()).resolves.toEqual([a])
  })

  test('remove updates state immediately and removes from the repository', async () => {
    const repo = createMemoryRepository([a, b])
    const remove = vi.spyOn(repo, 'remove')
    const { result } = renderHook(() => useNotes(repo))
    await waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })

    act(() => {
      result.current.remove('a')
    })

    expect(result.current.notes).toEqual([b])
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('a')
    await expect(repo.load()).resolves.toEqual([b])
  })

  test('changes made while the load is pending survive it', async () => {
    const stored = createMemoryRepository([a, b])
    let finishLoad = () => {}
    const repo: NotesRepository = {
      ...stored,
      load: () =>
        new Promise((resolve) => {
          finishLoad = () => {
            resolve([a, b])
          }
        }),
    }
    const c = { ...a, id: 'c' }
    const { result } = renderHook(() => useNotes(repo))

    act(() => {
      result.current.upsert(c)
      result.current.remove('a')
    })
    await act(async () => {
      finishLoad()
      await Promise.resolve()
    })

    expect(result.current.loaded).toBe(true)
    expect(result.current.notes).toEqual([b, c])
  })

  test('loading does not write to the repository', async () => {
    const repo: NotesRepository = createMemoryRepository([a])
    const upsert = vi.spyOn(repo, 'upsert')
    const remove = vi.spyOn(repo, 'remove')
    const { result } = renderHook(() => useNotes(repo))
    await waitFor(() => {
      expect(result.current.loaded).toBe(true)
    })
    expect(upsert).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})
