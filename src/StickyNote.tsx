import type { Note } from './model.ts'

interface StickyNoteProps {
  note: Note
  autoFocus: boolean
}

export function StickyNote({ note, autoFocus }: StickyNoteProps) {
  return (
    <div
      role="group"
      aria-label="Sticky note"
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
      <div className="note-header" />
      {/* Read-only until text editing lands; still focusable so a new note can take focus. */}
      <textarea className="note-text" aria-label="Note text" value={note.text} readOnly autoFocus={autoFocus} />
      <div className="note-resize" role="img" aria-label="Resize note" />
    </div>
  )
}
