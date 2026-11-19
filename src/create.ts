import { applyMinSize, clampRect, normalizeRect, type Point, type Rect, type Size } from './geometry.ts'
import { CLICK_NOTE_SIZE, DEFAULT_COLOR, MIN_NOTE_SIZE, type Note } from './model.ts'

/** A press whose pointer never moves this far from its start on either axis is a click. */
export const CLICK_TOLERANCE_PX = 4

export function isWithinClickTolerance(start: Point, point: Point): boolean {
  return Math.abs(point.x - start.x) < CLICK_TOLERANCE_PX && Math.abs(point.y - start.y) < CLICK_TOLERANCE_PX
}

/** A click creates a default-size note at the click point, kept inside the board. */
export function clickRect(point: Point, board: Size): Rect {
  return clampRect({ ...point, ...CLICK_NOTE_SIZE }, board)
}

/**
 * A drag creates the dragged rect grown to the minimum size. The end point is clamped to the
 * board first, so the note matches what the user saw, then the whole rect is kept inside.
 */
export function dragRect(start: Point, end: Point, board: Size): Rect {
  const clampedEnd = {
    x: Math.min(Math.max(end.x, 0), board.width),
    y: Math.min(Math.max(end.y, 0), board.height),
  }
  return clampRect(applyMinSize(normalizeRect(start, clampedEnd), MIN_NOTE_SIZE), board)
}

/** A z above every existing note. */
export function topZ(notes: readonly Note[]): number {
  return notes.reduce((max, note) => Math.max(max, note.z), 0) + 1
}

/** A z above every other note, or the note's own z if it is already above them all. */
export function frontZ(note: Note, notes: readonly Note[]): number {
  return Math.max(note.z, topZ(notes.filter((n) => n.id !== note.id)))
}

export function newNote(id: string, rect: Rect, notes: readonly Note[]): Note {
  return { id, ...rect, text: '', color: DEFAULT_COLOR, z: topZ(notes) }
}

/**
 * A random v4 UUID. Not `crypto.randomUUID`, which exists only in secure contexts, so it is missing
 * when a phone opens the dev server by its LAN address over plain HTTP.
 */
export function newId(): string {
  // Byte 6 carries the version (4), byte 8 the variant (10xx).
  const bytes = crypto
    .getRandomValues(new Uint8Array(16))
    .map((b, i) => (i === 6 ? (b & 0x0f) | 0x40 : i === 8 ? (b & 0x3f) | 0x80 : b))
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
