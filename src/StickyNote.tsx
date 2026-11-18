import { memo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { boardSize } from './board.ts'
import { clampRect } from './geometry.ts'
import type { Note } from './model.ts'
import { usePointerGesture } from './usePointerGesture.ts'

interface StickyNoteProps {
  note: Note
  autoFocus: boolean
  /** Commits a changed note. Must be stable across renders, or every note re-renders on each commit. */
  onChange: (note: Note) => void
}

/** During a move the note does not render at all; its position is written straight to `transform`. */
function StickyNoteView({ note, autoFocus, onChange }: StickyNoteProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const startGesture = usePointerGesture()

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    const root = rootRef.current
    if (!root) return
    const start = { x: event.clientX, y: event.clientY }
    let frame: number | null = null
    let latest = start

    const movedTo = (point: { x: number; y: number }) =>
      clampRect({ ...note, x: note.x + point.x - start.x, y: note.y + point.y - start.y }, boardSize())
    const stopFrames = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      root.style.transform = ''
    }

    startGesture(event, {
      onMove(point) {
        latest = point
        frame ??= requestAnimationFrame(() => {
          frame = null
          const { x, y } = movedTo(latest)
          root.style.transform = `translate(${String(x - note.x)}px, ${String(y - note.y)}px)`
        })
      },
      onEnd(point) {
        stopFrames()
        const { x, y } = movedTo(point)
        if (x !== note.x || y !== note.y) onChange({ ...note, x, y })
      },
      onCancel: stopFrames,
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
      <div className="note-resize" role="img" aria-label="Resize note" />
    </div>
  )
}

/**
 * Memoized: a commit to one note leaves the others' props unchanged, so they skip rendering.
 * The explicit type argument keeps the wrapped component reachable as `StickyNote.type`.
 */
export const StickyNote = memo<typeof StickyNoteView>(StickyNoteView)
