import { memo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { boardSize } from './board.ts'
import { clampRect, type Point } from './geometry.ts'
import type { Note } from './model.ts'
import { resizedRect } from './resize.ts'
import { usePointerGesture } from './usePointerGesture.ts'

interface StickyNoteProps {
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

/** During a move or resize the note does not render at all; the gesture writes to its DOM. */
function StickyNoteView({ note, autoFocus, onChange }: StickyNoteProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const startGesture = usePointerGesture()

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
      clampRect({ ...note, x: note.x + point.x - start.x, y: note.y + point.y - start.y }, boardSize())

    startFrameGesture(event, {
      apply(root, point) {
        const { x, y } = movedTo(point)
        root.style.transform = `translate(${String(x - note.x)}px, ${String(y - note.y)}px)`
      },
      reset(root) {
        root.style.transform = ''
      },
      commit(point) {
        const { x, y } = movedTo(point)
        if (x !== note.x || y !== note.y) onChange({ ...note, x, y })
      },
    })
  }

  const onResizePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const start = { x: event.clientX, y: event.clientY }
    const resizedTo = (point: Point) => resizedRect(note, { x: point.x - start.x, y: point.y - start.y }, boardSize())

    startFrameGesture(event, {
      apply(root, point) {
        const { width, height } = resizedTo(point)
        root.style.width = `${String(width)}px`
        root.style.height = `${String(height)}px`
      },
      reset(root) {
        root.style.width = `${String(note.width)}px`
        root.style.height = `${String(note.height)}px`
      },
      commit(point) {
        const rect = resizedTo(point)
        if (rect.x !== note.x || rect.y !== note.y || rect.width !== note.width || rect.height !== note.height) {
          onChange({ ...note, ...rect })
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
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
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
