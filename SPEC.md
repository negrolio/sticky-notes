# SPEC: Sticky Notes

## Goals

A single-page sticky notes board where the user creates, moves, resizes and deletes notes with the
pointer (deletes can be undone), and edits, colors and raises them. Notes persist through one async
repository, backed by localStorage or by an async REST mock.

## Non-goals

- Keyboard move or resize of notes.
- A general undo history. Undo restores deleted notes only.
- A scrollable or zoomable board, or a board larger than the viewport.
- Cross-tab sync or conflict resolution (last write wins).
- A real server. The REST API is a mock.
- Rich text, Markdown or images in notes.
- Touch and pen-specific behaviour, full WCAG audit, screen-reader drag announcements, i18n, dark mode.
- A UI toggle for the persistence backend.

## Constraints

- Stack, typing rules, browsers, viewport, drag mechanics and git workflow: see `CLAUDE.md`
  (Constraints, Gotchas, Git). They are not restated here.
- The build is split into moves in `docs/plan.md`. Core features (create, move, resize, delete with
  undo) come first and bonuses last, so the work can stop at any move boundary with a working app.
- The data model and the persistence interface cover every feature, bonuses included, from the
  first move. Later moves add behaviour, not schema.
- `README.md` gets build and run instructions and a 2–3 paragraph architecture description, in
  English, at the end of the build.

## Prior decisions

1. **Scope.** All 4 core features and all 5 bonuses are in scope. *Reason:* the engineer's call.
   The ordering constraint above keeps it cuttable.
2. **Note model.** `{ id, x, y, width, height, text, color, z }`, with board coordinates in CSS
   pixels. *Reason:* one shape serves every feature, so no migrations.
3. **Persistence.** One `NotesRepository` interface with async methods only (load, upsert, remove).
   There are two implementations: localStorage, which is the default, and an in-memory async REST
   mock. *Reason:* the UI stays ignorant of the backend, and the mock is required to be async.
4. **Backend selection.** By query parameter: `?backend=rest` picks the mock, and `?fail=<0..1>`
   sets the mock's failure rate. There is no UI toggle. *Reason:* the backend is a testing knob,
   not something users choose.
5. **REST mock.** Simulated latency is 200–600 ms. Its data lives in its own localStorage key, so a
   reload behaves like a server. *Reason:* realistic async timing, and state survives a reload.
6. **Optimistic UI.** State updates immediately and persistence follows. There are no writes
   during a drag and one write per finished gesture. Text writes are debounced (~300 ms) and also
   flushed on blur. *Reason:* the UI stays responsive and the mock is not flooded with writes.
7. **Save errors.** A failed save shows a toast ("Couldn't save changes. Retrying…") and retries
   up to 3 times, waiting 1 s, 2 s and 4 s before them. After that, local state is kept and a
   persistent "Not saved" indicator is shown. *Reason:* the user never loses work silently.
8. **Load errors.** A failed load shows an empty board with an error toast and a Retry button.
   Corrupt stored data (bad JSON or schema) is discarded with a console warning, and the board
   starts empty. *Reason:* the app always starts.
9. **Create.** The user drags a rectangle on empty board space, and the gesture sets position and
   size. A rectangle smaller than 80×80 is clamped up to 80×80. A click without a drag creates a
   200×200 note at the click point. A new note is yellow, comes to the front and has its textarea
   focused. *Reason:* this answers "specified size at specified position" literally, in one
   gesture.
10. **Note anatomy.** The ~24 px header strip moves the note. The body is an always-editable
    `<textarea>` capped at 10,000 characters. A single bottom-right handle resizes the note, with
    an 80×80 minimum. *Reason:* text selection never starts a drag, and each gesture has one
    target.
11. **Bring to front.** A pointer down anywhere on a note raises it above all others, and z is
    persisted. *Reason:* the simplest rule users already expect.
12. **Color.** A swatch button in the header opens a popover that shows all 5 colors: yellow
    `#FFF59D` (the default), pink `#F8BBD0`, green `#C5E1A5`, blue `#B3E5FC` and purple
    `#D1C4E9`. The popover closes on selection, on Escape and on a click outside. *Reason:* every
    choice is visible in one click.
13. **Trash.** A fixed zone sits in the bottom-right corner (~96×96). A note is deleted when the
    *pointer* is over the zone at release, not when the note's rectangle overlaps it. While the
    pointer is over the zone during a drag, the zone highlights and the note dims. *Reason:* a
    large note must not hit the zone by accident.
14. **Undo.** A delete shows a toast reading "Note deleted. Undo (Ctrl+Z)" with an Undo button for
    5 s. Each new delete resets the timer. Deleted notes form a stack, and Ctrl+Z (Cmd+Z on Mac)
    restores them in reverse order, even after the toast closes. Ctrl+Z inside a textarea is left
    to the browser. Undo restores deletions only. *Reason:* the toast promises exactly that, and a
    full history is out of budget.
15. **Board bounds.** The board is the viewport and does not scroll. Create, move and resize are
    clamped so the note stays fully inside. When the window shrinks, stored coordinates are kept
    and notes are *displayed* clamped. *Reason:* nothing is ever off-screen, and nothing is lost
    on resize.
16. **Gesture cancel.** `pointercancel`, window blur or Escape during a move or resize reverts the
    note and saves nothing. A create drag that starts on the trash zone or a toast does nothing.
    *Reason:* an interrupted gesture must not leave a half-applied state.
17. **Layering.** The trash zone, toasts and the color popover always render above every note.
    *Reason:* they must stay reachable whatever the z-order of the notes.
18. **Keyboard and a11y.** Tab focuses notes in z-order. Delete or Backspace on a focused note
    (outside the textarea) deletes it through the undo path. Escape leaves the textarea. The trash
    zone, the resize handle and the color button have `aria-label`s, notes are `role="group"`
    with an accessible name, and toasts are `role="status"`. *Reason:* cheap usability wins, with
    no keyboard move or resize.
19. **Performance.** During a gesture only the dragged note re-renders, through a `transform`
    update throttled by `requestAnimationFrame`. App state commits once on pointer up. Target: 200
    notes stay smooth. *Reason:* performance is graded explicitly.
20. **Two tabs.** Not handled. *Reason:* out of scope for a local, single-user app.

## Acceptance criteria

Format: action → observed / expected.

Create
1. Drag from (100,100) to (400,350) on empty board → new note rect / x=100, y=100, w=300, h=250.
2. Drag from (100,100) to (130,120) → new note size / 80×80 at (100,100).
3. Click without moving at (300,300) → new note rect / 200×200 at (300,300), clamped inside the board.
4. Drag from (900,700) to (1200,900) in a 1024×768 viewport → new note rect / fully inside the board.
5. Create any note → its color, its z relative to other notes, and focus / `#FFF59D`; highest z; focus in its textarea.
6. Start a create drag on the trash zone or on a toast → note count / unchanged.

Move
7. Drag a note's header by (+50,+30) → note x,y / old x+50, old y+30.
8. Drag a note's header past the board edge → note rect / fully inside the board.
9. Pointer down on the textarea and drag → note x,y / unchanged.
10. During a move, between pointer down and pointer up → note `style.top`/`left` / unchanged; `transform` changes.
11. Press Escape mid-move → note x,y and number of repository writes / pre-gesture values; 0.
12. `pointercancel` mid-move → note x,y and number of repository writes / pre-gesture values; 0.

Resize
13. Drag the resize handle by (+60,+40) → note w,h / old w+60, old h+40.
14. Drag the resize handle by (−500,−500) → note w,h / 80×80.
15. Drag the resize handle past the board's right or bottom edge → note rect / fully inside the board.
16. Press Escape mid-resize → note w,h / pre-gesture values.

Delete and undo
17. Drag a note so that the pointer is over the trash zone → trash zone and note state / zone highlighted, note dimmed.
18. Release with the pointer over the trash zone → note count / −1.
19. Release with the note overlapping the trash zone but the pointer outside it → note count / unchanged.
20. Delete a note → toast / `role="status"` with the text "Note deleted. Undo (Ctrl+Z)" and an Undo button.
21. Click Undo → restored note / same id, rect, text, color and z as before the delete.
22. Wait 5 s after a delete → toast visible / no.
23. Delete note A, delete note B, press Ctrl+Z twice → restore order / B, then A.
24. Press Ctrl+Z after the toast has closed → last deleted note restored / yes.
25. Press Ctrl+Z while focus is in a textarea → deleted notes restored / none.
26. Focus a note (not its textarea) and press Delete or Backspace → note deleted and toast shown / yes, yes.

Text
27. Type "hello" in a note → repository text after ~300 ms idle / "hello".
28. Type and blur within 300 ms → repository writes / 1, with the final text.
29. Paste 12,000 characters → stored text length / 10,000.
30. Press Escape in a textarea → textarea focused / no.

Bring to front
31. Pointer down on a lower overlapping note → its z / greater than every other note's z.
32. Reload after bringing a note to front → z-order / unchanged.

Color
33. Click the swatch button → popover visible, swatches shown / yes, 5.
34. Select a swatch → note color, popover visible / chosen color, no.
35. Press Escape, or click outside, while the popover is open → popover visible, note color / no, unchanged.

Persistence
36. Create, move, resize, edit and recolor notes, then reload (localStorage) → board / identical notes.
37. Same as 36 with `?backend=rest` → board / identical notes.
38. Each mock call with `?backend=rest` → resolution / asynchronous, after 200–600 ms.
39. A complete move gesture → repository writes / exactly 1.
40. Save fails with `?fail=1` → toast, retries, final indicator / "Couldn't save changes. Retrying…"; 3, at +1 s, +2 s and +4 s; "Not saved" shown, local state kept.
41. Load fails → board and toast / empty board; error toast with a Retry button.
42. Stored data is invalid JSON or the wrong schema → board, console / empty board; one warning; no crash.

Bounds and layering
43. Shrink the window so a note would be off-screen → displayed note / fully visible; stored x,y unchanged.
44. Grow the window back → displayed note / at its stored x,y.
45. Raise a note to the highest z → trash zone, toast and popover / still drawn above it.

Accessibility
46. Press Tab repeatedly → focus order / notes in ascending z.
47. Query the accessibility tree → trash zone, resize handle, color button / each has an `aria-label`; each note is a `role="group"` with a name.

Performance
48. Move one note among 200 → renders of other note components during the gesture / 0.
49. Manual check: drag and resize with 200 notes in Chrome, Firefox and Edge → frame rate / smooth, no visible jank.

Deliverables
50. Read `README.md` → contents / build and run commands, plus a 2–3 paragraph architecture description.
