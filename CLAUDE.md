# Sticky Notes, take-home assessment

Single-page sticky notes app in TypeScript and React. Source in `src/`, tests next to the code
as `*.test.ts(x)`. The engineer directs: do the task you are asked for, one at a time, nothing
beyond it. Code, comments, docs and commit messages are in English.

## Commands

```bash
npm run typecheck   # tsc -b, strict, includes test files
npm run lint        # eslint strictTypeChecked, zero warnings
npm test            # vitest run, jsdom
npm run coverage    # vitest with v8 coverage
npm run dev         # Vite dev server
npm run build       # production build
```

These three are the whole check: typecheck, lint, test. Run all three before every commit.

## Constraints

- React without component, drag or state libraries. Runtime dependencies are `react` and `react-dom` only.
- No `any`, no non-null `!`, no `as` casts except at a DOM boundary with a comment saying why.
- Desktop only, minimum viewport 1024x768. Latest Chrome, Firefox and Edge.
- Comments only where they help a reader; no restating the code.

## Gotchas

- Drag uses Pointer Events with `setPointerCapture`, never HTML5 drag and drop (inconsistent in Firefox).
- jsdom has no `setPointerCapture` or `releasePointerCapture`; tests stub them.
- During a drag, position goes through `transform`, not `top`/`left`.

## Git

- Work on `main`. No branches unless asked.
- Commit only when the engineer asks, after they have read the diff. One commit per artifact
  and, during the build, one per move of `docs/plan.md`, every commit green.
- Never push.

## Hooks, in `.claude/settings.json`

- `deny_test_edits` refuses edits to committed `*.test.ts(x)` files. A new test file is yours until it is committed.
- `stop_gate` refuses to end the turn while typecheck, lint or the committed tests are red.
  Untracked test files are skipped so they may stay red. After five refusals it hands back.
