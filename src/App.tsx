import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'
import { clickRect, dragRect, frontZ, isWithinClickTolerance, newId, newNote, topZ } from './create.ts'
import { boardSize, useBoardSize } from './board.ts'
import { BackgroundPopover } from './BackgroundPopover.tsx'
import {
  BACKGROUND_COLORS,
  createMemoryBackgroundStore,
  DEFAULT_BACKGROUND,
  isUsableImage,
  useBackground,
  useObjectUrl,
  type BackgroundStore,
} from './background.ts'
import { ColorPopover } from './ColorPopover.tsx'
import { DeleteAllDialog } from './DeleteAllDialog.tsx'
import { FontPopover } from './FontPopover.tsx'
import { GhostLayer } from './GhostLayer.tsx'
import { ImageErrorToast } from './ImageErrorToast.tsx'
import { useGhosts } from './ghosts.ts'
import { clampRect, type Rect } from './geometry.ts'
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  GHOST_STAGGER_MS,
  TRASH_SIZE,
  type Note,
  type NoteColor,
} from './model.ts'
import { createLocalStorageRepository } from './localStorageRepository.ts'
import { prefersReducedMotion } from './motion.ts'
import type { NotesRepository } from './repository.ts'
import { StickyNote } from './StickyNote.tsx'
import { Toolbar } from './Toolbar.tsx'
import { useNotes } from './store.ts'
import { useUndoableDelete, useUndoKey } from './undo.ts'
import { UndoToast } from './UndoToast.tsx'
import { usePointerGesture } from './usePointerGesture.ts'

// Created once at module load so useNotes sees the same repository on every render.
const defaultRepository = createLocalStorageRepository()
// main.tsx passes the IndexedDB store. Kept in memory otherwise, so rendering App alone touches no IndexedDB.
const defaultBackgroundStore = createMemoryBackgroundStore()
const DEFAULT_BACKGROUND_COLOR = BACKGROUND_COLORS[0]?.color

interface AppProps {
  repository?: NotesRepository
  backgroundStore?: BackgroundStore
}

export function App({ repository = defaultRepository, backgroundStore = defaultBackgroundStore }: AppProps) {
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
  // The one open popover (decision 26), the note it belongs to (none for the background), and the button it is anchored to.
  const [popover, setPopover] = useState<{
    kind: 'color' | 'font' | 'background'
    id: string
    button: HTMLButtonElement
  } | null>(null)
  const togglePopover = useCallback((kind: 'color' | 'font' | 'background', id: string, button: HTMLButtonElement) => {
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
  const { toast, deleteNote, deleteNotes, undo } = useUndoableDelete({ remove, upsert: restore })
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
  const { background, setBackground } = useBackground(backgroundStore)
  const imageUrl = useObjectUrl(background.kind === 'image' ? background.blob : null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Identifies the current "Couldn't use that image." toast, or is 0 when none is shown.
  const [imageError, setImageError] = useState(0)
  const onImagePicked = (file: File | undefined) => {
    if (!file) return
    if (!isUsableImage(file)) {
      setImageError((n) => n + 1)
      return
    }
    setBackground({ kind: 'image', blob: file })
    popover?.button.focus()
    setPopover(null)
  }
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false)
  const deleteAllRef = useRef<HTMLButtonElement>(null)
  const returnFocusToDeleteAll = useRef(false)
  const cancelDeleteAll = () => {
    returnFocusToDeleteAll.current = true
    setConfirmingDeleteAll(false)
  }
  // Only once the dialog is gone: while it is mounted, it keeps focus inside itself.
  useEffect(() => {
    if (confirmingDeleteAll || !returnFocusToDeleteAll.current) return
    returnFocusToDeleteAll.current = false
    deleteAllRef.current?.focus()
  }, [confirmingDeleteAll])
  // One undo entry. Ghosts start in z order, staggered so the last starts by GHOST_STAGGER_MS.
  const confirmDeleteAll = () => {
    setConfirmingDeleteAll(false)
    setFocusId(null)
    setPopover(null)
    deleteNotes(byZ)
    if (prefersReducedMotion()) return
    const step = byZ.length > 1 ? GHOST_STAGGER_MS / (byZ.length - 1) : 0
    byZ.forEach((note, i) => {
      addGhost(note, clampRect(note, board), i * step)
    })
  }
  const trashRef = useRef<HTMLDivElement>(null)
  // The highlight goes through the DOM so that App does not render mid-gesture.
  const onTrashHover = useCallback((over: boolean) => {
    trashRef.current?.toggleAttribute('data-active', over)
  }, [])
  const backgroundButtonRef = useRef<HTMLButtonElement>(null)
  // While a note moves, the delete-all and background buttons are disabled, so their icons are not
  // taken for the trash zone. Through the DOM like the trash highlight, so App does not render mid-gesture.
  const onNoteMoving = useCallback((moving: boolean) => {
    for (const button of [deleteAllRef.current, backgroundButtonRef.current]) {
      if (moving) button?.setAttribute('aria-disabled', 'true')
      else button?.removeAttribute('aria-disabled')
    }
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
        const note = newNote(newId(), rect, notes)
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
        style={{
          backgroundColor: background.kind === 'color' ? background.color : DEFAULT_BACKGROUND_COLOR,
          ...(imageUrl && {
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
          }),
        }}
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
            onMoving={onNoteMoving}
          />
        ))}
        {draft && (
          <div
            className="draft"
            aria-hidden="true"
            style={{ left: draft.x, top: draft.y, width: draft.width, height: draft.height, zIndex: topZ(notes) }}
          />
        )}
        {(loaded || loadFailed) && notes.length === 0 && !draft && (
          <p className="empty-hint">
            <span className="empty-hint-title">Click anywhere for a fresh note</span>
            <span className="empty-hint-sub">or click and drag to make it just your size</span>
          </p>
        )}
      </main>
      <GhostLayer ghosts={ghosts} onDone={removeGhost} />
      {/* After the board, so it is drawn above every note and its buttons follow the notes in Tab order. */}
      <Toolbar>
        <button
          ref={deleteAllRef}
          type="button"
          className="toolbar-button"
          aria-label="Delete all notes"
          title="Delete all notes"
          disabled={notes.length === 0}
          onClick={() => {
            setConfirmingDeleteAll(true)
          }}
        >
          {/* A stack of notes with a cross, not a trash can, so it is not taken for the trash zone. */}
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16V5a1 1 0 0 1 1-1h11" />
              <rect x="8" y="8" width="12" height="12" rx="1.5" />
              <path d="M11.5 11.5l5 5m0-5l-5 5" />
            </g>
          </svg>
        </button>
        <button
          ref={backgroundButtonRef}
          type="button"
          className="toolbar-button"
          aria-label="Change background"
          title="Change background"
          aria-haspopup="dialog"
          aria-expanded={popover?.kind === 'background'}
          onClick={(event) => {
            togglePopover('background', '', event.currentTarget)
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v10l4-4 3 3 4-5 3 4V6H5zm3 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
              fill="currentColor"
            />
          </svg>
        </button>
      </Toolbar>
      {/* Outside the popover, so a pick still lands if the popover has closed meanwhile. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          onImagePicked(event.target.files?.[0])
          // Cleared, so picking the same file again fires a change.
          event.target.value = ''
        }}
      />
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
        {imageError > 0 && <ImageErrorToast key={imageError} />}
        {toast && (
          <UndoToast
            key={toast.key}
            message={toast.all ? 'All notes deleted. Undo (Ctrl+Z)' : 'Note deleted. Undo (Ctrl+Z)'}
            onUndo={undo}
          />
        )}
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
      {popover?.kind === 'background' && (
        <BackgroundPopover
          background={background}
          anchor={popover.button}
          onColor={(color) => {
            setBackground({ kind: 'color', color })
          }}
          onUpload={() => fileInputRef.current?.click()}
          onRemoveImage={() => {
            setBackground(DEFAULT_BACKGROUND)
          }}
          onClose={closePopover}
        />
      )}
      {confirmingDeleteAll && (
        <DeleteAllDialog count={notes.length} onCancel={cancelDeleteAll} onConfirm={confirmDeleteAll} />
      )}
    </>
  )
}
