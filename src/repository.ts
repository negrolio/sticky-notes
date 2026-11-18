import type { Note } from './model.ts'

export interface NotesRepository {
  load(): Promise<Note[]>
  /** Inserts the note, or replaces the stored note with the same id. */
  upsert(note: Note): Promise<void>
  remove(id: string): Promise<void>
}

/** Keeps notes in memory. Copies on the way in and out so callers can't mutate what is stored. */
export function createMemoryRepository(initial: readonly Note[] = []): NotesRepository {
  let notes = initial.map((note) => ({ ...note }))

  return {
    load() {
      return Promise.resolve(notes.map((note) => ({ ...note })))
    },
    upsert(note) {
      const copy = { ...note }
      notes = notes.some((n) => n.id === note.id)
        ? notes.map((n) => (n.id === note.id ? copy : n))
        : [...notes, copy]
      return Promise.resolve()
    },
    remove(id) {
      notes = notes.filter((n) => n.id !== id)
      return Promise.resolve()
    },
  }
}
