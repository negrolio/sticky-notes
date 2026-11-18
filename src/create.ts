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
