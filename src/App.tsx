import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import { clickRect, dragRect, isWithinClickTolerance, newNote, topZ } from './create.ts'
import { boardSize, useBoardSize } from './board.ts'
import { clampRect, type Rect } from './geometry.ts'
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
  const { loaded, notes, upsert } = useNotes(repository)
  const [draft, setDraft] = useState<Rect | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
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
    <main className="board" aria-label="Sticky notes board" aria-busy={!loaded} onPointerDown={onBoardPointerDown}>
      {notes.map((note) => (
        <StickyNote
          key={note.id}
          note={note}
          {...clampRect(note, board)}
          autoFocus={note.id === focusId}
          onChange={upsert}
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
  )
}
