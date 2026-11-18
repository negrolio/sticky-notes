# Build plan

Moves implement `SPEC.md` in order. Each move is one commit and ends green (typecheck, lint, test)
with a working app. Core features come first (moves 1–8). Bonuses follow (moves 9–14). The work
can stop after any move. "AC n" refers to the acceptance criteria in `SPEC.md`.

Rules for every move:
- New behaviour comes with tests for the ACs the move names. Those tests are written before the
  code.
- Every element a move introduces gets the `aria-label`/role that SPEC decision 18 assigns to it.
  AC 47 is checked once the last labelled element exists (move 11).
- `src/App.test.tsx` is committed and read-only, so the app keeps rendering a `main` landmark.

## Core

1. **Foundation: model, geometry, store, repository.**
   - The `Note` type with the full schema (decision 2), the palette constant, and the size and
     timing constants.
   - Pure geometry helpers: normalize a dragged rectangle, apply the minimum size, clamp a rect to
     the board.
   - The async `NotesRepository` interface and an in-memory implementation (used by tests and
     until move 12).
   - A notes store (reducer plus hook) that loads from the repository at startup and writes after
     each committed change.
   - `App` renders an empty full-viewport board inside `main`.
   - Covers: none directly. Unit tests cover the geometry helpers and the reducer.

2. **Create by dragging or clicking, and note rendering.**
   - A shared pointer-gesture hook using `setPointerCapture`, with cancel on `pointercancel`,
     window blur and Escape.
   - A pointer down on empty board space starts a create gesture.
   - A note renders with its header, an always-present textarea (it only displays text until
     move 9) and the resize handle. New notes are yellow, take the highest z and get textarea
     focus.
   - Covers: AC 1, 2, 3, 4, 5.

3. **Move by the header.**
   - A header drag moves the note through `transform`, throttled with `requestAnimationFrame`, and
     commits on pointer up as a single repository write. The position is clamped to the board.
   - The textarea never starts a move. Cancel reverts.
   - Note components are memoized so that other notes don't re-render during a gesture.
   - Covers: AC 7, 8, 9, 10, 11, 12, 39, 48.

4. **Resize with the bottom-right handle.**
   - Same gesture path as move 3, with the minimum size and the board clamp. Escape reverts.
   - Covers: AC 13, 14, 15, 16.

5. **Board bounds when the window resizes.**
   - Track the board size. Notes are displayed clamped while their stored x, y, w, h stay
     unchanged.
   - Covers: AC 43, 44.

6. **Trash zone and delete on drop.**
   - A fixed bottom-right zone. A pointer hit-test during a move highlights the zone and dims the
     note. Releasing with the pointer over the zone deletes the note.
   - A create drag that starts on the zone is ignored.
   - Covers: AC 17, 18, 19, 6 (trash part).

7. **Undo: toast, stack and Ctrl+Z.**
   - A delete pushes the note onto a deleted stack and shows a `role="status"` toast with an Undo
     button for 5 s. Each new delete resets the timer.
   - A global Ctrl+Z / Cmd+Z pops the stack, except while focus is in a textarea.
   - A create drag that starts on the toast is ignored.
   - Covers: AC 20, 21, 22, 23, 24, 25, 6 (toast part).

8. **Keyboard delete and focus order.**
   - Notes are focusable and the Tab order follows ascending z. Delete or Backspace on a focused
     note (outside its textarea) goes through the move 7 delete path.
   - Covers: AC 26, 46.

## Bonuses

9. **Text editing (bonus I).**
   - The textarea becomes editable with the 10,000-character cap. Writes are debounced at ~300 ms
     and flushed on blur. Escape blurs the textarea.
   - Covers: AC 27, 28, 29, 30.

10. **Bring to front (bonus II).**
    - A pointer down anywhere on a note sets its z to max + 1 and commits it.
    - Covers: AC 31.

11. **Colors (bonus IV).**
    - The header swatch button opens a popover with the 5 palette colors. It closes on selection,
      on Escape and on a click outside.
    - The trash zone, toast and popover share a top layer above all notes.
    - Covers: AC 33, 34, 35, 45, 47.

12. **localStorage persistence (bonus III).**
    - A localStorage implementation of `NotesRepository` becomes the default. It validates stored
      data on load; invalid data is discarded with a console warning.
    - Covers: AC 32, 36, 42.

13. **Async REST mock (bonus V).**
    - A mock implementation with 200–600 ms latency and its own localStorage key, selected by
      `?backend=rest`. `?fail=<0..1>` sets its failure rate.
    - Covers: AC 37, 38.

14. **Persistence errors.**
    - Failed saves show the retry toast, retry at +1 s, +2 s and +4 s, and end with a "Not saved"
      indicator.
    - A failed load shows an empty board with an error toast and a Retry button.
    - Covers: AC 40, 41.

## Wrap-up

15. **README and manual check.**
    - Build and run instructions, plus the 2–3 paragraph architecture description.
    - Manual drag and resize check with 200 notes in Chrome, Firefox and Edge. Record the result
      in the commit message.
    - Covers: AC 49, 50.

## Coverage

| AC | Move | AC | Move | AC | Move | AC | Move | AC | Move |
|----|------|----|------|----|------|----|------|----|------|
| 1  | 2 | 11 | 3 | 21 | 7 | 31 | 10 | 41 | 14 |
| 2  | 2 | 12 | 3 | 22 | 7 | 32 | 12 | 42 | 12 |
| 3  | 2 | 13 | 4 | 23 | 7 | 33 | 11 | 43 | 5 |
| 4  | 2 | 14 | 4 | 24 | 7 | 34 | 11 | 44 | 5 |
| 5  | 2 | 15 | 4 | 25 | 7 | 35 | 11 | 45 | 11 |
| 6  | 6, 7 | 16 | 4 | 26 | 8 | 36 | 12 | 46 | 8 |
| 7  | 3 | 17 | 6 | 27 | 9 | 37 | 13 | 47 | 11 |
| 8  | 3 | 18 | 6 | 28 | 9 | 38 | 13 | 48 | 3 |
| 9  | 3 | 19 | 6 | 29 | 9 | 39 | 3 | 49 | 15 |
| 10 | 3 | 20 | 7 | 30 | 9 | 40 | 14 | 50 | 15 |
