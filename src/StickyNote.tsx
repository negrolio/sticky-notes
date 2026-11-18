import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { boardSize } from './board.ts'
import { clampRect, type Point, type Rect } from './geometry.ts'
import { MAX_TEXT_LENGTH, TEXT_DEBOUNCE_MS, type Note } from './model.ts'
import { resizedRect } from './resize.ts'
import { isOverTrash } from './trash.ts'
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
  /** Deletes the note through the undoable path. Must be stable across renders, like `onChange`. */
  onDelete: (note: Note) => void
  /** Reports whether a move has the pointer over the trash zone. Must be stable across renders. */
  onTrashHover: (over: boolean) => void
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
 * The note after this one in Tab order, or the one before it if this is the last. Notes render in
 * ascending z, so their sibling order is the Tab order.
 */
function adjacentNote(root: HTMLElement): HTMLElement | null {
  const isNote = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('note')
  for (let el = root.nextElementSibling; el; el = el.nextElementSibling) if (isNote(el)) return el
  for (let el = root.previousElementSibling; el; el = el.previousElementSibling) if (isNote(el)) return el
  return null
}

/**
 * A move or resize writes to the note's DOM instead of rendering it. Gestures start from the
 * displayed rect, so the preview and the committed result agree. The note renders mid-gesture only
 * if a window resize changes its displayed rect.
 */
function StickyNoteView({ note, x, y, width, height, autoFocus, onChange, onDelete, onTrashHover }: StickyNoteProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const startGesture = usePointerGesture()
  // The last rendered size, which a resize gesture restores on reset. A window resize may have
  // changed it since the gesture started, and React does not rewrite a style whose prop is unchanged.
  const renderedSize = useRef({ width, height })
  // The note as last rendered. Writes start from it, not from the note a gesture's closures captured
  // at pointer down, because text may have been written since.
  const latestNote = useRef(note)
  useLayoutEffect(() => {
    renderedSize.current = { width, height }
    latestNote.current = note
  })

  // Typed text lives here until it is written, so typing renders only this note, never App.
  const [text, setText] = useState(note.text)
  const pendingText = useRef<{ text: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  // A note unmounts only when it is deleted, and the delete already carried the pending text.
  useEffect(
    () => () => {
      if (pendingText.current) clearTimeout(pendingText.current.timer)
    },
    [],
  )

  /**
   * The note with any pending text, which stops being pending. Every write and delete of the note
   * goes through here, so typed text is neither lost nor written twice.
   */
  const withPendingText = (changed: Note): Note => {
    const pending = pendingText.current
    if (!pending) return changed
    clearTimeout(pending.timer)
    pendingText.current = null
    return { ...changed, text: pending.text }
  }

  const flushText = () => {
    if (!pendingText.current) return
    // Set before the render that would set it, so a gesture ending first still sees the text.
    latestNote.current = withPendingText(latestNote.current)
    onChange(latestNote.current)
  }

  const onTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    // maxLength already caps typing and pasting; this also covers values set by script.
    const next = event.target.value.slice(0, MAX_TEXT_LENGTH)
    setText(next)
    if (pendingText.current) clearTimeout(pendingText.current.timer)
    pendingText.current = { text: next, timer: setTimeout(flushText, TEXT_DEBOUNCE_MS) }
  }

  // Escape leaves the textarea for the note itself, so the keyboard user keeps their place.
  const onTextKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') rootRef.current?.focus()
  }

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

    // Tracked so the zone is told only when the hover changes, not on every frame.
    let overTrash = false
    const setOverTrash = (root: HTMLDivElement, over: boolean) => {
      if (over === overTrash) return
      overTrash = over
      // The dim goes through the DOM, like the transform, so the note does not render mid-gesture.
      root.toggleAttribute('data-over-trash', over)
      onTrashHover(over)
    }

    startFrameGesture(event, {
      apply(root, point) {
        const moved = movedTo(point)
        root.style.transform = `translate(${String(moved.x - x)}px, ${String(moved.y - y)}px)`
        setOverTrash(root, isOverTrash(point, boardSize()))
      },
      reset(root) {
        root.style.transform = ''
        setOverTrash(root, false)
      },
      // Only the position is written: a note shrunk to the board keeps its stored size.
      commit(point) {
        if (isOverTrash(point, boardSize())) {
          onDelete(withPendingText(latestNote.current))
          return
        }
        const moved = movedTo(point)
        if (moved.x !== x || moved.y !== y) onChange(withPendingText({ ...latestNote.current, x: moved.x, y: moved.y }))
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
          onChange(withPendingText({ ...latestNote.current, ...resized }))
        }
      },
    })
  }

  // Only on the note itself: inside the textarea, Delete and Backspace edit text.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Delete' && event.key !== 'Backspace')) return
    event.preventDefault()
    // Focus moves before the delete, so it never falls to the body while a note is left.
    adjacentNote(event.currentTarget)?.focus()
    onDelete(withPendingText(note))
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Sticky note"
      tabIndex={0}
      data-note-id={note.id}
      className="note"
      onKeyDown={onKeyDown}
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
      <textarea
        className="note-text"
        aria-label="Note text"
        value={text}
        maxLength={MAX_TEXT_LENGTH}
        autoFocus={autoFocus}
        onChange={onTextChange}
        onBlur={flushText}
        onKeyDown={onTextKeyDown}
      />
      <div className="note-resize" role="img" aria-label="Resize note" onPointerDown={onResizePointerDown} />
    </div>
  )
}

/**
 * Memoized: a commit to one note leaves the others' props unchanged, so they skip rendering.
 * The explicit type argument keeps the wrapped component reachable as `StickyNote.type`.
 */
export const StickyNote = memo<typeof StickyNoteView>(StickyNoteView)
