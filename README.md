# Sticky Notes

**Live demo:** https://negrolio.github.io/sticky-notes/

A single-page sticky notes board in TypeScript and React. Drag on empty space to create a note
(a click makes a 200×200 one), move it by its header, resize it from the bottom-right corner, drop
it on the trash zone to delete it, and undo with the toast or Ctrl+Z / Cmd+Z. Notes can be edited,
recolored, given a font and size, and brought to the front, and they persist across reloads. A
movable toolbar deletes all notes at once (also undoable) and sets the board background to a color
or an image. Deleted notes fly into the trash, and an empty board says how to start. Built for
desktop: latest Chrome, Firefox and Edge, minimum viewport 1024×768. `SPEC.md` holds the decisions
and acceptance criteria, and `docs/plan.md` the order in which they were built.

It also works on touch devices, though it is not the best experience there: a tap creates a note,
and dragging sizes a new note, moves one by its header or resizes it from its corner. The layout
was not adapted to small screens, and text that overflows a note cannot be scrolled by touch.

## Build and run

Requires Node.js 20.9+ or 22+.

```bash
npm install
npm run dev         # Vite dev server, http://localhost:5173, also on the local network
npm run build       # production build in dist/
npm run preview     # serves the production build
```

To try it on a phone, run `npm run dev` and open the "Network" URL Vite prints (for example
`http://192.168.0.19:5173`) from a device on the same network.

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

## Scope

- **Required:** all four features. Create a note of a given size at a given position, resize it,
  move it, and delete it on the trash zone.
- **Optional bonuses:** all five. Note text, bring to front, localStorage persistence, note
  colors, and an async REST mock.
- **Beyond the brief**, added for usability:
  - undo for deletes (toast and Ctrl+Z / Cmd+Z), since a drop on the trash is easy to do by mistake;
  - a font and font size per note;
  - a movable toolbar that deletes all notes at once (also undoable) and sets the board
    background to a color or an image uploaded by the user;
  - motion feedback: deleted notes fly into the trash, and the trash reacts while a note is
    over it;
  - a hint on the empty board that says how to start;
  - basic touch support, outside the desktop requirement.

## Assumptions

- "A note of the specified size at the specified position" means the user sets both with the
  pointer, in one gesture: drag a rectangle on empty space. Notes are at least 80×80.
- A note is deleted when the pointer, not the note's rectangle, is over the trash at release, so a
  large note cannot hit it by accident. Since a delete is one gesture, it can be undone.
- The board is the viewport: it does not scroll or zoom, and nothing is placed outside it.
- Notes are plain text, up to 10,000 characters. There is no rich text or Markdown.
- There is no real server. The REST API is an async mock with latency and optional failures,
  selected by query parameter because it is a testing knob, not a user choice.
- One user in one tab: there is no cross-tab sync, and the last write wins.
- Moving and resizing are pointer only; there is no keyboard alternative for them.

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

## How it was built

The app was built with Claude Code as a coding agent, directed step by step: I made the product
and design decisions and reviewed every diff before it was committed. The process had three steps.
First, an interview (`/spec`) turned the brief into `SPEC.md`, which records goals, non-goals,
numbered decisions with their reasons, and acceptance criteria. Then `docs/plan.md` split the spec
into moves, each one commit that leaves the app working, with core features first and bonuses
after, so the work could stop at any point. Last, each move was implemented test-first and checked
against the spec before its commit.

The files that drive this process:

- `CLAUDE.md`: project instructions for the agent, covering commands, constraints (no libraries
  beyond React, strict typing), known gotchas and git rules.
- `SPEC.md`: the specification and the source of truth for behaviour.
- `docs/plan.md`: the build order, move by move, with the acceptance criteria each move covers.
- `.claude/commands/spec.md`: the `/spec` command that drafts `SPEC.md` by interview.
- `.claude/agents/spec-reviewer.md`: a subagent that reviews each diff against `SPEC.md` and
  reports only disagreements.
- `.claude/settings.json` and `.claude/hooks/`: hooks that keep the work honest. One refuses edits
  to committed test files, so a test cannot be changed to make code pass. The other refuses to end
  a turn while typecheck, lint or tests are red.
