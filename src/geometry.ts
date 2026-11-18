export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

/** The rect spanned by two drag points, whatever the drag direction. */
export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

/** Grows the rect to at least `min`, keeping its top-left corner. */
export function applyMinSize(rect: Rect, min: Size): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(rect.width, min.width),
    height: Math.max(rect.height, min.height),
  }
}

/** Keeps the rect fully inside the board: shifts it first, shrinks it only if it is larger than the board. */
export function clampRect(rect: Rect, board: Size): Rect {
  const width = Math.min(rect.width, board.width)
  const height = Math.min(rect.height, board.height)
  return {
    x: clamp(rect.x, 0, board.width - width),
    y: clamp(rect.y, 0, board.height - height),
    width,
    height,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
