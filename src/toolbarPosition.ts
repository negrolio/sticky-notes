import type { Point } from './geometry.ts'

/** Independent of the notes backend (decision 23). */
export const TOOLBAR_STORAGE_KEY = 'sticky-notes-toolbar'
/** The toolbar's first position: centred, this far from the top edge. */
export const TOOLBAR_TOP = 16

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** The stored toolbar position, or null when there is none or it is invalid. */
export function loadToolbarPosition(storage?: Storage): Point | null {
  try {
    const raw = (storage ?? window.localStorage).getItem(TOOLBAR_STORAGE_KEY)
    if (raw === null) return null
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || !('x' in data) || !('y' in data)) return null
    const { x, y } = data
    return isFiniteNumber(x) && isFiniteNumber(y) ? { x, y } : null
  } catch {
    return null
  }
}

export function saveToolbarPosition(position: Point, storage?: Storage) {
  ;(storage ?? window.localStorage).setItem(TOOLBAR_STORAGE_KEY, JSON.stringify(position))
}
