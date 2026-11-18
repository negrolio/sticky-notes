import type { Size } from './geometry.ts'

/** The board fills the viewport at (0,0), so client coordinates are board coordinates. */
export function boardSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight }
}
