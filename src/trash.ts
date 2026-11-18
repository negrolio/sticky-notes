import type { Point, Size } from './geometry.ts'
import { TRASH_SIZE } from './model.ts'

/**
 * Whether the pointer is over the trash zone, the TRASH_SIZE square in the board's bottom-right
 * corner. The pointer is tested, not the note, so a large note never hits the zone by accident.
 */
export function isOverTrash(point: Point, board: Size): boolean {
  return (
    point.x >= board.width - TRASH_SIZE &&
    point.x < board.width &&
    point.y >= board.height - TRASH_SIZE &&
    point.y < board.height
  )
}
