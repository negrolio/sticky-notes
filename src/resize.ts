import { clampRect, type Point, type Rect, type Size } from './geometry.ts'
import { MIN_NOTE_SIZE } from './model.ts'

/**
 * The rect after dragging its bottom-right corner by `delta`. The top-left corner stays, the size
 * stops at the board's right and bottom edges and never goes below the minimum. Only a note within
 * the minimum size of an edge is shifted, so that the minimum still fits.
 */
export function resizedRect(rect: Rect, delta: Point, board: Size): Rect {
  const width = Math.max(Math.min(rect.width + delta.x, board.width - rect.x), MIN_NOTE_SIZE.width)
  const height = Math.max(Math.min(rect.height + delta.y, board.height - rect.y), MIN_NOTE_SIZE.height)
  return clampRect({ x: rect.x, y: rect.y, width, height }, board)
}
