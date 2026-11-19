import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import { clickRect, dragRect, frontZ, isWithinClickTolerance, newNote, topZ } from './create.ts'
import { boardSize, useBoardSize } from './board.ts'
import { ColorPopover } from './ColorPopover.tsx'
import { FontPopover } from './FontPopover.tsx'
import { GhostLayer } from './GhostLayer.tsx'
import { useGhosts } from './ghosts.ts'
import { clampRect, type Rect } from './geometry.ts'
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, TRASH_SIZE, type Note, type NoteColor } from './model.ts'
import { createLocalStorageRepository } from './localStorageRepository.ts'
import { prefersReducedMotion } from './motion.ts'
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
  const { loaded, loadFailed, retryLoad, notes, upsert, remove, saveRetrying, notSaved } = useNotes(repository)
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
  // The one open note popover (decision 26), its note, and the header button it is anchored to.
  const [popover, setPopover] = useState<{ kind: 'color' | 'font'; id: string; button: HTMLButtonElement } | null>(null)
  const togglePopover = useCallback((kind: 'color' | 'font', id: string, button: HTMLButtonElement) => {
    setPopover((open) => (open?.kind === kind && open.id === id ? null : { kind, id, button }))
  }, [])
  const onColorButton = useCallback(
    (id: string, button: HTMLButtonElement) => {
      togglePopover('color', id, button)
    },
    [togglePopover],
  )
  const onFontButton = useCallback(
    (id: string, button: HTMLButtonElement) => {
      togglePopover('font', id, button)
    },
    [togglePopover],
  )
  const closePopover = useCallback(() => {
    setPopover(null)
  }, [])
  const popoverNote = popover && notes.find((n) => n.id === popover.id)
  const { ghosts, addGhost, removeGhost, removeGhostsOf } = useGhosts()
  const restore = useCallback(
    (note: Note) => {
      removeGhostsOf(note.id)
      upsert(note)
    },
    [removeGhostsOf, upsert],
  )
  const { toast, deleteNote, undo } = useUndoableDelete({ remove, upsert: restore })
  useUndoKey(undo)
  // A deleted note must not take focus again when it is restored.
  const onDelete = useCallback(
    (note: Note, displayed: Rect) => {
      setFocusId(null)
      // Otherwise the popover would come back with the note if the delete is undone.
      setPopover((open) => (open?.id === note.id ? null : open))
      deleteNote(note)
      if (!prefersReducedMotion()) addGhost(note, displayed)
    },
    [deleteNote, addGhost],
  )
  const trashRef = useRef<HTMLDivElement>(null)
  // The highlight goes through the DOM so that App does not render mid-gesture.
  const onTrashHover = useCallback((over: boolean) => {
    trashRef.current?.toggleAttribute('data-active', over)
  }, [])
  const startGesture = usePointerGesture()
  const board = useBoardSize()

  const onBoardPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // Before the load lands, a new note's z could not be placed above the stored notes. After a failed
    // load the empty board is usable anyway (a later Retry merges in the stored notes), or a backend
    // that always fails would allow no change at all.
    if (!(loaded || loadFailed) || event.target !== event.currentTarget) return
    // A press on the board while a popover is open only closes the popover.
    if (popover) return
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
      <main
        className="board"
        aria-label="Sticky notes board"
        aria-busy={!loaded && !loadFailed}
        onPointerDown={onBoardPointerDown}
      >
        {byZ.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            {...clampRect(note, board)}
            autoFocus={note.id === focusId}
            onChange={upsert}
            onDelete={onDelete}
            raisedZ={raisedZ}
            colorsOpen={popover?.kind === 'color' && note.id === popover.id}
            onColorButton={onColorButton}
            fontOpen={popover?.kind === 'font' && note.id === popover.id}
            onFontButton={onFontButton}
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
      <GhostLayer ghosts={ghosts} onDone={removeGhost} />
      {/* A sibling after the board, which is its own stacking context, so it stays above every note whatever its z. */}
      <div ref={trashRef} className="trash" role="img" aria-label="Trash" style={{ width: TRASH_SIZE, height: TRASH_SIZE }}>
        <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z" fill="currentColor" />
        </svg>
      </div>
      {/* A live region must exist before its content changes, so the region stays and only the toast mounts.
          Like the trash zone, it is a sibling after the board, so it stays above every note. */}
      <div className="toasts" role="status">
        {loadFailed && (
          <div className="toast">
            <span>Couldn&apos;t load notes.</span>
            <button type="button" onClick={retryLoad}>
              Retry
            </button>
          </div>
        )}
        {saveRetrying && (
          <div className="toast">
            <span>Couldn&apos;t save changes. Retrying…</span>
          </div>
        )}
        {/* Stays until the unsaved notes are written by a later change. */}
        {notSaved && <div className="toast not-saved">Not saved</div>}
        {toast > 0 && <UndoToast key={toast} onUndo={undo} />}
      </div>
      {/* Like the trash zone and the toasts, after the board so it is drawn above every note. */}
      {popover?.kind === 'color' && popoverNote && (
        <ColorPopover
          key={popover.id}
          color={popoverNote.color}
          anchor={popover.button}
          onSelect={(color: NoteColor) => {
            if (color !== popoverNote.color) upsert({ ...popoverNote, color })
          }}
          onClose={closePopover}
        />
      )}
      {/* Each choice is one write (decision 26), of its own field only, so a note never given a font keeps its stored shape. */}
      {popover?.kind === 'font' && popoverNote && (
        <FontPopover
          key={popover.id}
          family={popoverNote.fontFamily ?? DEFAULT_FONT_FAMILY}
          size={popoverNote.fontSize ?? DEFAULT_FONT_SIZE}
          anchor={popover.button}
          onFamily={(fontFamily) => {
            upsert({ ...popoverNote, fontFamily })
          }}
          onSize={(fontSize) => {
            upsert({ ...popoverNote, fontSize })
          }}
          onClose={closePopover}
        />
      )}
    </>
  )
}
