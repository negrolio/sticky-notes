import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import { clickRect, dragRect, isWithinClickTolerance, newNote, topZ } from './create.ts'
import { boardSize, useBoardSize } from './board.ts'
import { clampRect, type Rect } from './geometry.ts'
import { TRASH_SIZE } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { StickyNote } from './StickyNote.tsx'
import { useNotes } from './store.ts'
import { usePointerGesture } from './usePointerGesture.ts'

// Created once at module load so useNotes sees the same repository on every render.
const defaultRepository = createMemoryRepository()

interface AppProps {
  repository?: NotesRepository
}

export function App({ repository = defaultRepository }: AppProps) {
  const { loaded, notes, upsert, remove } = useNotes(repository)
  const [draft, setDraft] = useState<Rect | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
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
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            {...clampRect(note, board)}
            autoFocus={note.id === focusId}
            onChange={upsert}
            onDelete={remove}
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
    </>
  )
}
