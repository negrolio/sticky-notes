import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import { clickRect, dragRect, frontZ, isWithinClickTolerance, newNote, topZ } from './create.ts'
import { boardSize, useBoardSize } from './board.ts'
import { ColorPopover } from './ColorPopover.tsx'
import { clampRect, type Rect } from './geometry.ts'
import { TRASH_SIZE, type Note, type NoteColor } from './model.ts'
import { createLocalStorageRepository } from './localStorageRepository.ts'
import type { NotesRepository } from './repository.ts'
import { StickyNote } from './StickyNote.tsx'
import { useNotes } from './store.ts'
import { useUndoableDelete, useUndoKey } from './undo.ts'
import { UndoToast } from './UndoToast.tsx'
import { usePointerGesture } from './usePointerGesture.ts'

// Created once at module load so useNotes sees the same repository on every render.
const defaultRepository = createLocalStorageRepository()

interface AppProps {
  repository?: NotesRepository
}

export function App({ repository = defaultRepository }: AppProps) {
  const { loaded, notes, upsert, remove } = useNotes(repository)
  // Notes render in ascending z because the Tab order follows the document order (decision 18).
  const byZ = useMemo(() => [...notes].sort((p, q) => p.z - q.z), [notes])
  // Read through a ref so that raisedZ stays stable and a commit to one note leaves the others' props unchanged.
  const notesRef = useRef(notes)
  useLayoutEffect(() => {
    notesRef.current = notes
  })
  const raisedZ = useCallback((note: Note) => frontZ(note, notesRef.current), [])
  const [draft, setDraft] = useState<Rect | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  // The note whose color popover is open, and the swatch button it is anchored to.
  const [colors, setColors] = useState<{ id: string; button: HTMLButtonElement } | null>(null)
  const onColorButton = useCallback((id: string, button: HTMLButtonElement) => {
    setColors((open) => (open?.id === id ? null : { id, button }))
  }, [])
  const closeColors = useCallback(() => {
    setColors(null)
  }, [])
  const colorsNote = colors && notes.find((n) => n.id === colors.id)
  const { toast, deleteNote, undo } = useUndoableDelete({ remove, upsert })
  useUndoKey(undo)
  // A deleted note must not take focus again when it is restored.
  const onDelete = useCallback(
    (note: Note) => {
      setFocusId(null)
      // Otherwise the popover would come back with the note if the delete is undone.
      setColors((open) => (open?.id === note.id ? null : open))
      deleteNote(note)
    },
    [deleteNote],
  )
  const trashRef = useRef<HTMLDivElement>(null)
  // The highlight goes through the DOM so that App does not render mid-gesture.
  const onTrashHover = useCallback((over: boolean) => {
    trashRef.current?.toggleAttribute('data-active', over)
  }, [])
  const startGesture = usePointerGesture()
  const board = useBoardSize()

  const onBoardPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // Before the load lands, a new note's z could not be placed above the stored notes.
    if (!loaded || event.target !== event.currentTarget) return
    // A press on the board while the color popover is open only closes the popover.
    if (colors) return
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY }
    let dragged = false
    startGesture(event, {
      onMove(point) {
        dragged ||= !isWithinClickTolerance(start, point)
        if (dragged) setDraft(dragRect(start, point, boardSize()))
      },
      onEnd(point) {
        setDraft(null)
        const rect = dragged ? dragRect(start, point, boardSize()) : clickRect(start, boardSize())
        const note = newNote(crypto.randomUUID(), rect, notes)
        setFocusId(note.id)
        upsert(note)
      },
      onCancel() {
        setDraft(null)
      },
    })
  }

  return (
    <>
      <main className="board" aria-label="Sticky notes board" aria-busy={!loaded} onPointerDown={onBoardPointerDown}>
        {byZ.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            {...clampRect(note, board)}
            autoFocus={note.id === focusId}
            onChange={upsert}
            onDelete={onDelete}
            raisedZ={raisedZ}
            colorsOpen={note.id === colors?.id}
            onColorButton={onColorButton}
            onTrashHover={onTrashHover}
          />
        ))}
        {draft && (
          <div
            className="draft"
            aria-hidden="true"
            style={{ left: draft.x, top: draft.y, width: draft.width, height: draft.height, zIndex: topZ(notes) }}
          />
        )}
      </main>
      {/* A sibling after the board, which is its own stacking context, so it stays above every note whatever its z. */}
      <div ref={trashRef} className="trash" role="img" aria-label="Trash" style={{ width: TRASH_SIZE, height: TRASH_SIZE }}>
        <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z" fill="currentColor" />
        </svg>
      </div>
      {/* A live region must exist before its content changes, so the region stays and only the toast mounts.
          Like the trash zone, it is a sibling after the board, so it stays above every note. */}
      <div className="toasts" role="status">
        {toast > 0 && <UndoToast key={toast} onUndo={undo} />}
      </div>
      {/* Like the trash zone and the toasts, after the board so it is drawn above every note. */}
      {colors && colorsNote && (
        <ColorPopover
          key={colors.id}
          color={colorsNote.color}
          anchor={colors.button}
          onSelect={(color: NoteColor) => {
            if (color !== colorsNote.color) upsert({ ...colorsNote, color })
          }}
          onClose={closeColors}
        />
      )}
    </>
  )
}
