# Sticky Notes

A single-page sticky notes board in TypeScript and React. Drag on empty space to create a note
(a click makes a 200×200 one), move it by its header, resize it from the bottom-right corner, drop
it on the trash zone to delete it, and undo with the toast or Ctrl+Z / Cmd+Z. Notes can be edited,
recolored, given a font and size, and brought to the front, and they persist across reloads. A
movable toolbar deletes all notes at once (also undoable) and sets the board background to a color
or an image. Deleted notes fly into the trash, and an empty board says how to start. Desktop only:
latest Chrome, Firefox and Edge, minimum viewport 1024×768. `SPEC.md` holds the decisions and
acceptance criteria, and `docs/plan.md` the order in which they were built.

## Build and run

Requires Node.js 20.9+ or 22+.

```bash
npm install
npm run dev         # Vite dev server, http://localhost:5173
npm run build       # production build in dist/
npm run preview     # serves the production build
```

Checks (typecheck, lint and test are green on every commit):

```bash
npm run typecheck   # tsc -b, strict, test files included
npm run lint        # eslint strictTypeChecked, zero warnings
npm test            # vitest in jsdom
npm run coverage    # tests with v8 coverage
```

Persistence uses localStorage by default. Query parameters select the async REST mock instead:

- `?backend=rest` uses the mock, which answers after 200–600 ms and keeps its data under its own
  localStorage key, so a reload behaves like a server.
- `&fail=<0..1>` sets the share of mock calls that fail, and is ignored without `backend=rest`.
  `?backend=rest&fail=1` shows the load-error toast, then the retry toast and the "Not saved"
  indicator on the first edit. A rate like `0.3` shows mostly retries that succeed.

## Architecture

State lives in hooks, and every change is applied to it at once, then persisted in the background:
the UI never waits on storage and never knows which backend it has. Notes are held by `useNotes`
(`src/store.ts`) and written through an async `NotesRepository` (`load`, `upsert`, `remove`),
implemented over localStorage and by a REST mock with latency and failures. A failed write is
retried after 1 s, 2 s and 4 s, and a newer write of the same note cancels an older retry so
stale data is never sent. Deletes go through one path in `undo.ts` that stacks each deletion, a
single note or all of them, for the toast and Ctrl+Z. The board background has its own
`BackgroundStore` over IndexedDB, since an image may be several megabytes, and the toolbar position
is a small localStorage entry; neither touches the notes.

Pointer gestures (`usePointerGesture.ts`) use Pointer Events with `setPointerCapture`, and cancel on
`pointercancel`, window blur or Escape. A move or resize does not re-render the note: the pointer
position is applied straight to its DOM (`transform` for a move, size for a resize) at most once
per animation frame, and the result is committed to state once, on pointer up, as a single write.
Note components are memoized and get stable callbacks and primitive props, so with 200 notes no
other note renders during a gesture. Text is kept in the note while typing and written after 300 ms
idle, on blur or on page hide. Animations (the delete ghosts, the trash icon, the empty-board hint)
are CSS on `transform` and `opacity` only, and are skipped under reduced motion.

The board is the viewport and does not scroll; `geometry.ts` clamps notes and the toolbar to it,
and on a smaller window they are displayed clamped while their stored positions stay unchanged.
Notes render in ascending z, so document order is Tab order. Everything above the notes (the
ghost layer, trash zone, toolbar, toasts, popovers and the delete-all dialog) is a sibling after the
board, which is its own stacking context, so it stays on top whatever a note's z; one shared
`Popover` keeps at most one open. Typing is strict, with no `any`, `!` or `as` casts, and all
outside data (localStorage, IndexedDB, the REST mock, image files) is validated when read, so a bad
value is discarded instead of trusted.
