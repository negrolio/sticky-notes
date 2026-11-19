import { FONT_FAMILIES, FONT_SIZES, MAX_TEXT_LENGTH, MIN_NOTE_SIZE, PALETTE, type Note } from './model.ts'
import type { NotesRepository } from './repository.ts'

export const STORAGE_KEY = 'sticky-notes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** A copy of the note with only the schema's fields, or null if it does not fit the schema. */
export function toNote(value: unknown): Note | null {
  if (!isRecord(value)) return null
  const { id, x, y, width, height, text, z } = value
  const color = PALETTE.find((p) => p.color === value.color)?.color
  // The font fields are optional (decision 26): absent is valid, any other value outside the sets is not.
  const fontFamily = FONT_FAMILIES.find((f) => f.family === value.fontFamily)?.family
  const fontSize = FONT_SIZES.find((f) => f.size === value.fontSize)?.size
  if (
    ('fontFamily' in value && fontFamily === undefined) ||
    ('fontSize' in value && fontSize === undefined)
  ) {
    return null
  }
  if (
    typeof id !== 'string' ||
    id === '' ||
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    width < MIN_NOTE_SIZE.width ||
    height < MIN_NOTE_SIZE.height ||
    typeof text !== 'string' ||
    text.length > MAX_TEXT_LENGTH ||
    color === undefined ||
    !isFiniteNumber(z)
  ) {
    return null
  }
  const note: Note = { id, x, y, width, height, text, color, z }
  // Added only when stored, so a note never given a font keeps its stored shape.
  if (fontFamily !== undefined) note.fontFamily = fontFamily
  if (fontSize !== undefined) note.fontSize = fontSize
  return note
}

/** The notes in a stored JSON string, or null if it is not valid JSON or any note breaks the schema. */
export function parseNotes(raw: string): Note[] | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  const notes: Note[] = []
  for (const item of data) {
    const note = toNote(item)
    if (!note || notes.some((n) => n.id === note.id)) return null
    notes.push(note)
  }
  return notes
}

/** Runs `operation` at once; a throw, such as a full or blocked storage, becomes a rejection. */
function settle<T>(operation: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(operation())
  })
}

/**
 * Keeps all notes as one JSON array under one key. Every call reads and writes synchronously, so a
 * write made while the page is being hidden is not lost. `storage` defaults to `localStorage`, read
 * on each call so that a browser that blocks it fails a call instead of the module load.
 */
export function createLocalStorageRepository(storage?: Storage, key = STORAGE_KEY): NotesRepository {
  const store = () => storage ?? window.localStorage
  // Invalid data was already reported by load; a write simply replaces it.
  const read = () => parseNotes(store().getItem(key) ?? '[]') ?? []
  const write = (notes: readonly Note[]) => {
    store().setItem(key, JSON.stringify(notes))
  }
  // The invalid data last warned about. StrictMode loads twice in development, and AC 42 wants one warning.
  let reported: string | null = null

  return {
    load() {
      return settle(() => {
        const raw = store().getItem(key)
        if (raw === null) return []
        const notes = parseNotes(raw)
        if (notes) return notes
        if (raw !== reported) console.warn(`Discarding invalid stored notes under "${key}"`)
        reported = raw
        return []
      })
    },
    upsert(note) {
      return settle(() => {
        const notes = read()
        const copy = { ...note }
        write(notes.some((n) => n.id === note.id) ? notes.map((n) => (n.id === note.id ? copy : n)) : [...notes, copy])
      })
    },
    remove(id) {
      return settle(() => {
        write(read().filter((n) => n.id !== id))
      })
    },
  }
}
