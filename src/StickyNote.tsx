import { memo, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { boardSize } from './board.ts'
import { clampRect, type Point, type Rect } from './geometry.ts'
import type { Note } from './model.ts'
import { resizedRect } from './resize.ts'
import { usePointerGesture } from './usePointerGesture.ts'

/**
 * The rect fields are where the note is displayed: its stored rect clamped to the board. They are
 * primitives so that a window resize re-renders only the notes whose displayed rect changes.
 */
interface StickyNoteProps extends Rect {
  /** As stored; its rect may lie partly outside a board that has shrunk since. */
  note: Note
  autoFocus: boolean
  /** Commits a changed note. Must be stable across renders, or every note re-renders on each commit. */
  onChange: (note: Note) => void
}

/** Applies a gesture's latest point to the DOM at most once per animation frame. */
interface FrameGesture {
  /** Writes the in-progress result straight to the note's DOM, bypassing React. */
  apply: (root: HTMLDivElement, point: Point) => void
  /** Undoes everything `apply` wrote, so React's own styles show again. */
  reset: (root: HTMLDivElement) => void
  commit: (point: Point) => void
}

/**
 * A move or resize writes to the note's DOM instead of rendering it. Gestures start from the
 * displayed rect, so the preview and the committed result agree. The note renders mid-gesture only
 * if a window resize changes its displayed rect.
 */
function StickyNoteView({ note, x, y, width, height, autoFocus, onChange }: StickyNoteProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const startGesture = usePointerGesture()
  // The last rendered size, which a resize gesture restores on reset. A window resize may have
  // changed it since the gesture started, and React does not rewrite a style whose prop is unchanged.
  const renderedSize = useRef({ width, height })
  useLayoutEffect(() => {
    renderedSize.current = { width, height }
  })

  const startFrameGesture = (event: ReactPointerEvent<HTMLElement>, gesture: FrameGesture) => {
    event.preventDefault()
    const root = rootRef.current
    if (!root) return
    let frame: number | null = null
    let latest: Point = { x: event.clientX, y: event.clientY }

    const stopFrames = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      gesture.reset(root)
    }

    startGesture(event, {
      onMove(point) {
        latest = point
        frame ??= requestAnimationFrame(() => {
          frame = null
          gesture.apply(root, latest)
        })
      },
      onEnd(point) {
        stopFrames()
        gesture.commit(point)
      },
      onCancel: stopFrames,
    })
  }

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const start = { x: event.clientX, y: event.clientY }
    const movedTo = (point: Point) =>
      clampRect({ x: x + point.x - start.x, y: y + point.y - start.y, width, height }, boardSize())

    startFrameGesture(event, {
      apply(root, point) {
        const moved = movedTo(point)
        root.style.transform = `translate(${String(moved.x - x)}px, ${String(moved.y - y)}px)`
      },
      reset(root) {
        root.style.transform = ''
      },
      // Only the position is written: a note shrunk to the board keeps its stored size.
      commit(point) {
        const moved = movedTo(point)
        if (moved.x !== x || moved.y !== y) onChange({ ...note, x: moved.x, y: moved.y })
      },
    })
  }

  const onResizePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const start = { x: event.clientX, y: event.clientY }
    const displayed = { x, y, width, height }
    const resizedTo = (point: Point) =>
      resizedRect(displayed, { x: point.x - start.x, y: point.y - start.y }, boardSize())

    startFrameGesture(event, {
      apply(root, point) {
        const resized = resizedTo(point)
        root.style.width = `${String(resized.width)}px`
        root.style.height = `${String(resized.height)}px`
      },
      reset(root) {
        root.style.width = `${String(renderedSize.current.width)}px`
        root.style.height = `${String(renderedSize.current.height)}px`
      },
      // The whole displayed rect is written, so a clamped note is stored where it was seen.
      commit(point) {
        const resized = resizedTo(point)
        if (resized.x !== x || resized.y !== y || resized.width !== width || resized.height !== height) {
          onChange({ ...note, ...resized })
        }
      },
    })
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Sticky note"
      data-note-id={note.id}
      className="note"
      style={{
        left: x,
        top: y,
        width,
        height,
        zIndex: note.z,
        backgroundColor: note.color,
      }}
    >
      <div className="note-header" onPointerDown={onHeaderPointerDown} />
      {/* Read-only until text editing lands; still focusable so a new note can take focus. */}
      <textarea className="note-text" aria-label="Note text" value={note.text} readOnly autoFocus={autoFocus} />
      <div className="note-resize" role="img" aria-label="Resize note" onPointerDown={onResizePointerDown} />
    </div>
  )
}

/**
 * Memoized: a commit to one note leaves the others' props unchanged, so they skip rendering.
 * The explicit type argument keeps the wrapped component reachable as `StickyNote.type`.
 */
export const StickyNote = memo<typeof StickyNoteView>(StickyNoteView)
