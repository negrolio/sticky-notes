# SPEC: Sticky Notes

## Goals

A single-page sticky notes board where the user creates, moves, resizes and deletes notes with the
pointer (deletes can be undone), and edits, colors and raises them. Notes persist through one async
repository, backed by localStorage or by an async REST mock. UX additions: motion feedback on the
trash and on deletes, a movable toolbar (delete all, board background) and a per-note font.

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
  first move. Later moves add behaviour, not schema. The one exception is decision 26: the UX
  additions add two *optional* note fields, so every note stored before them stays valid unchanged.
- The UX additions (decisions 21–26, moves 16–21) come after move 14 and before the move 15
  wrap-up, so the README and the manual check describe the final app.
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

### UX additions

These decisions were added after move 14. Shared rules:
- Every motion below honours `prefers-reduced-motion: reduce` as stated in each decision.
- Committed tests stay valid. In particular, there is still exactly one `role="status"` region
  (new messages go inside it), no positive `tabIndex`, and a single delete still shows the toast
  text of AC 20.
- jsdom has no IndexedDB, no `matchMedia` and never fires `animationend`. Code reaches them
  through small injectable seams, and tests stub them. No new runtime dependency.

21. **Trash feedback.** While the zone is highlighted (decision 13), its icon scales to 1.2× with
    a ~150 ms ease-out transition, and scales back the same way when the pointer leaves. Under
    reduced motion the scale applies without the transition. *Reason:* a small, classic motion
    cue that the drop will land.
22. **Delete animation.** Every delete (trash drop, Delete/Backspace, delete all) still removes
    the note from state at once, so focus, undo and repository writes behave exactly as in
    decisions 7, 14 and 18. In addition, an `aria-hidden`, non-focusable *ghost* is drawn: a
    visual copy of the note (displayed rect, color, font and text) that starts where the note was
    (for a trash drop, where it was released) and is "sucked" into the centre of the trash zone. It
    translates there while scaling to ~0.1, rotating ~20° and fading out, in 350 ms with an ease-in
    curve, animating `transform` and `opacity` only (CSS keyframes). Ghosts live in a layer that is
    a sibling after the board and below the trash zone, so they vanish into it. A ghost is removed
    on `animationend`, with a 350 ms timeout as fallback. Undoing a note removes its ghost if it is
    still animating. Under reduced motion no ghost is drawn. For delete all, every note gets a
    ghost and their start times are staggered so the last starts by 250 ms (whole animation
    ≤ 600 ms). *If* ghosts for delete all need structural changes beyond the ghost layer, that part
    is dropped (delete all then has no animation) and the commit message says so. *Reason:* it shows
    where the note went without touching the delete path.
23. **Toolbar.** A floating horizontal toolbar, `role="toolbar"` with `aria-label="Board tools"`,
    is a sibling after the board, so it renders above every note (like decision 17). It holds icon
    buttons, each with an `aria-label` and a matching `title` tooltip, and at its right end a grip
    with a drag icon (a 2×3 grid of dots), `aria-label="Move toolbar"`, `cursor: grab`. Dragging the
    grip moves the toolbar with the gesture rules of notes: Pointer Events with
    `setPointerCapture`, `transform` throttled by `requestAnimationFrame` during the drag, one
    commit on pointer up, and Escape, `pointercancel` or window blur revert. The toolbar is clamped
    to stay fully inside the viewport. It first appears centred at the top, 16 px from the top
    edge. Its position is stored on pointer up in localStorage under `sticky-notes-toolbar`,
    independent of the notes backend. An invalid stored value is ignored. When the window shrinks,
    the toolbar is displayed clamped and the stored position is kept (like decision 15). A press on
    the toolbar never starts a create (extends decision 16). Its buttons come after the notes in the
    Tab order. The grip is not focusable: moving the toolbar by keyboard is a non-goal. *Reason:*
    board-wide actions need a home the user can move out of the way.
24. **Delete all.** A toolbar button, `aria-label="Delete all notes"`, is disabled when the board
    has no notes. It opens a custom modal: `role="alertdialog"`, `aria-modal="true"`, titled
    "Delete all notes?", with the text "This deletes N notes. You can undo it." ("1 note" when
    there is one), and two buttons, Cancel and Delete all. Focus starts on Cancel and is trapped in
    the dialog. Escape, Cancel or a click on the backdrop closes it with nothing deleted and returns
    focus to the toolbar button. Opening the dialog moves focus out of any textarea, so pending text
    is flushed first (decision 6). Confirming deletes every note through the undo path as *one*
    undo entry. The repository gets one `remove` per note, each retried as in decision 7, and the
    interface is unchanged. The toast reads "All notes deleted. Undo (Ctrl+Z)". One Undo or one
    Ctrl+Z restores every note with the same id, rect, text, color, font and z. *Reason:* a
    destructive bulk action needs a confirmation and stays undoable like any delete.
25. **Background.** A toolbar button, `aria-label="Change background"`, opens a popover
    (`role="dialog"`, `aria-label="Board background"`). It follows the open and close rules of the
    color popover (decision 12), is anchored to the button and renders above every note. It holds 6
    color swatches with `aria-label` names and `aria-pressed` on the current one: Default `#ECEFF1`
    (today's background), White `#FFFFFF`, Sand `#EFE6D8`, Sage `#DCE5DA`, Sky `#DDE7F0` and Slate
    `#B0BEC5`. It also holds an "Upload image" button that opens a file picker
    (`accept="image/*"`), and a "Remove image" button while an image is set. An image is shown with
    `background-size: cover`, centred and fixed to the viewport. Choosing a color replaces the
    image. A file that is not `image/*`, or is larger than 10 MB, is rejected with the toast
    "Couldn't use that image." inside the status region, and the background is unchanged. The
    background is global, not per note, and is a UI preference rather than note data, so it ignores
    `?backend`. It is stored in IndexedDB (database `sticky-notes-ui`, store `settings`, key
    `background`) as `{ kind: 'color', color }` or `{ kind: 'image', blob }`, with the Blob stored
    as is. It is displayed through an object URL that is revoked when it changes or on unmount.
    Storage sits behind a small async `BackgroundStore` (`load`, `save`) with an IndexedDB
    implementation and an in-memory one for tests. Until the load lands, the default shows. An
    invalid stored value, or IndexedDB being unavailable or failing, gives the default background
    and one console warning. A failed save keeps the background for the session and warns once.
    *Reason:* images exceed localStorage's ~5 MB quota, and IndexedDB stores Blobs natively.
26. **Font.** A second header button, next to the color swatch, `aria-label="Change font"` and
    `aria-haspopup="dialog"`, shows "Aa". It opens a popover (`role="dialog"`,
    `aria-label="Note font"`) with the open and close rules of decision 12, except that a choice
    does *not* close it, so family and size can be set in one visit. Only one popover (color, font
    or background) is open at a time. It has two rows of buttons with `aria-pressed`:
    - Families, each label shown in its own font and all from fonts already on the system (nothing
      is loaded): Sans `system-ui, sans-serif` (the default), Serif
      `Georgia, 'Times New Roman', serif`, Mono `ui-monospace, Menlo, Consolas, monospace` and
      Hand `'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive`.
    - Sizes: Small 14 px (the default and today's size), Medium 18 px, Large 24 px.

    Each choice applies to the textarea at once and is one repository write (carrying pending
    text, decision 6). The note model gains two *optional* fields:
    `fontFamily?: 'sans' | 'serif' | 'mono' | 'hand'` and `fontSize?: 14 | 18 | 24`. An absent field
    means the default. The app writes a field only when the user picks a value, so a note never
    given a font keeps its stored shape. Validation (decision 8) accepts an absent field and treats
    any other value outside these sets as invalid data. Undo restores the fields. *Reason:*
    per-note typography without a schema migration.

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

Trash feedback
51. Drag a note so that the pointer is over the trash zone, then out → icon scale / 1.2× while highlighted, then 1×; a ~150 ms transition both ways, none under reduced motion (checked through the CSS rules; the motion itself manually).

Delete animation
52. Delete a note by trash drop, by Delete/Backspace, and by delete all → ghosts / one per deleted note, `aria-hidden`, not focusable, not a `role="group"`; the notes are gone from state and the repository writes happen at once, as before.
53. Wait for `animationend`, or 350 ms → ghost / removed.
54. Undo while a ghost animates → ghost and restored note / ghost removed; note restored.
55. Delete with `prefers-reduced-motion: reduce` → ghosts / none.
56. Manual check in Chrome, Firefox and Edge → ghost / shrinks, rotates and fades into the trash zone; delete-all ghosts are staggered (unless dropped per decision 22).

Toolbar
57. First load → toolbar / `role="toolbar"` named "Board tools", centred, 16 px from the top.
58. Drag the grip by (+100,+50) → toolbar position / moved by (+100,+50); during the drag only `transform` changes.
59. Drag the grip past a viewport edge → toolbar rect / fully inside the viewport.
60. Press Escape mid-drag → toolbar position, stored value / unchanged, unchanged.
61. Reload after moving the toolbar, with either backend → toolbar position / unchanged.
62. Shrink the window so the toolbar would be off-screen → displayed toolbar, stored position / fully visible, unchanged.
63. Pointer down or drag starting on the toolbar → note count / unchanged.
64. Press Tab repeatedly → focus order / notes in ascending z, then the toolbar buttons; the grip is skipped.

Delete all
65. Board with no notes → "Delete all notes" button / disabled.
66. Click "Delete all notes" with 3 notes → dialog, focus / `role="alertdialog"` titled "Delete all notes?" with "This deletes 3 notes. You can undo it."; focus on Cancel.
67. Tab and Shift+Tab inside the dialog → focus / stays in the dialog.
68. Press Escape, click Cancel, or click the backdrop → note count, focus / unchanged; on the "Delete all notes" button.
69. Confirm → note count, repository removes, toast / 0; one per note; "All notes deleted. Undo (Ctrl+Z)".
70. Then click Undo, or press Ctrl+Z once → restored notes / all, with the same id, rect, text, color, font and z.
71. Type in a note, open the dialog within 300 ms, confirm and undo → restored text / includes the typed text.
72. Delete A, then delete all (B, C), then Ctrl+Z twice → restore order / B and C together, then A.

Background
73. Click "Change background" → popover / `role="dialog"` named "Board background", 6 swatches, an "Upload image" button.
74. Select a swatch → board background, popover visible / that color, no; same after a reload.
75. Upload an image → board background / the image, cover and centred; same after a reload.
76. Upload a non-image file, or one larger than 10 MB → toast, background / "Couldn't use that image."; unchanged.
77. With an image set, select a swatch or click "Remove image" → image, object URL / gone, revoked.
78. Change the background with `?backend=rest` → mock calls for it / none; it is kept after a reload.
79. Stored background invalid, or IndexedDB failing → board, console / default background; one warning; no crash.

Font
80. Click "Change font" → popover / `role="dialog"` named "Note font", 4 families and 3 sizes, the current ones pressed.
81. Choose Serif, then Large → textarea style, repository writes, popover / serif stack and 24 px; 1 write per choice; still open.
82. Create, move or edit a note without choosing a font → stored note / no `fontFamily` or `fontSize` field; shown in Sans 14 px.
83. Reload with each backend after choosing a font → note font / unchanged.
84. Open the font popover while the color popover is open, or the reverse → popovers open / only the newer one.
85. Stored note with a `fontFamily` or `fontSize` outside the allowed values → board, console / as AC 42.

Performance, revisited
86. Manual check: AC 49 repeated with an image background, and while delete ghosts animate → frame rate / smooth, no visible jank.
