import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memo, Profiler } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App.tsx'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'
import { isOverTrash } from './trash.ts'

// Counts renders of each note component by id, as in move.test.tsx.
const renders = vi.hoisted(() => new Map<string, number>())
vi.mock('./StickyNote.tsx', async (importOriginal) => {
  const original = (await importOriginal<typeof import('./StickyNote.tsx')>()).StickyNote
  const render = original.type
  const Counted: typeof render = (props) => {
    renders.set(props.note.id, (renders.get(props.note.id) ?? 0) + 1)
    return render(props)
  }
  return { StickyNote: memo(Counted) }
})

// Animation frames run only when a test flushes them, so throttling is observable.
let frames: FrameRequestCallback[] = []
function flushFrames() {
  const pending = frames
  frames = []
  for (const callback of pending) callback(performance.now())
}

beforeEach(() => {
  installPointerStubs()
  renders.clear()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames[handle - 1] = () => {}
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setWindowSize(board.width, board.height)
})

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

function resizeWindow(width: number, height: number) {
  act(() => {
    setWindowSize(width, height)
    window.dispatchEvent(new Event('resize'))
  })
}

// jsdom's default viewport is 1024x768, so the zone spans x 928..1024 and y 672..768.
const board = { width: 1024, height: 768 }
// Header presses start at (150,110). The note is clamped at (824,618) near the corner.
const note: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'hi', color: '#C5E1A5', z: 1 }
const OVER_TRASH: [number, number] = [1000, 740]
// The note overlaps the zone here, but the pointer is left of it.
const BESIDE_TRASH: [number, number] = [900, 740]

async function renderApp(initial: readonly Note[]) {
  const stored = createMemoryRepository(initial)
  const upsert = vi.fn((n: Note) => stored.upsert(n))
  const remove = vi.fn((id: string) => stored.remove(id))
  const repository: NotesRepository = { ...stored, upsert, remove }
  // Called on every React commit anywhere in the app, so it shows whether App rendered at all.
  const commits = vi.fn()
  render(
    <Profiler id="app" onRender={commits}>
      <App repository={repository} />
    </Profiler>,
  )
  const main = screen.getByRole('main')
  await waitFor(() => {
    expect(main.getAttribute('aria-busy')).toBe('false')
  })
  return { repository, upsert, remove, main, commits }
}

function trash(): HTMLElement {
  return screen.getByLabelText('Trash')
}

function groupOf(id: string): HTMLElement {
  const group = screen.queryAllByRole('group').find((g) => g.dataset.noteId === id)
  if (!group) throw new Error(`no note ${id}`)
  return group
}

function headerOf(id: string): HTMLElement {
  const header = groupOf(id).querySelector<HTMLElement>('.note-header')
  if (!header) throw new Error(`no header on note ${id}`)
  return header
}

function isHighlighted() {
  return trash().hasAttribute('data-active')
}

function isDimmed(id: string) {
  return groupOf(id).hasAttribute('data-over-trash')
}

function moveHeaderTo(header: HTMLElement, to: [number, number]) {
  fireEvent.pointerMove(header, { clientX: to[0], clientY: to[1] })
  act(flushFrames)
}

describe('hit-test', () => {
  test('the pointer is over the zone only inside the bottom-right TRASH_SIZE square', () => {
    expect(isOverTrash({ x: 928, y: 672 }, board)).toBe(true)
    expect(isOverTrash({ x: 1023, y: 767 }, board)).toBe(true)
    expect(isOverTrash({ x: 927, y: 700 }, board)).toBe(false)
    expect(isOverTrash({ x: 1000, y: 671 }, board)).toBe(false)
    // Past the window edge, the pointer is no longer over the zone.
    expect(isOverTrash({ x: 1024, y: 700 }, board)).toBe(false)
    expect(isOverTrash({ x: 1000, y: 768 }, board)).toBe(false)
  })
})

describe('trash zone', () => {
  test('it has an aria-label and renders after the board, outside the notes stacking context', async () => {
    const { main } = await renderApp([{ ...note, z: 1_000_000 }])
    const zone = trash()
    expect(main.contains(zone)).toBe(false)
    expect(main.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(isHighlighted()).toBe(false)
  })

  test('AC 17: with the pointer over the zone, the zone is highlighted and the note dimmed', async () => {
    await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    moveHeaderTo(header, [400, 400])
    expect(isHighlighted()).toBe(false)
    expect(isDimmed('a')).toBe(false)

    moveHeaderTo(header, OVER_TRASH)
    expect(isHighlighted()).toBe(true)
    expect(isDimmed('a')).toBe(true)

    moveHeaderTo(header, [400, 400])
    expect(isHighlighted()).toBe(false)
    expect(isDimmed('a')).toBe(false)
  })

  test('decision 19: entering and leaving the zone commits nothing in React, App included', async () => {
    const { commits } = await renderApp([note])
    commits.mockClear()
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    moveHeaderTo(header, OVER_TRASH)
    expect(isHighlighted()).toBe(true)
    moveHeaderTo(header, [400, 400])
    moveHeaderTo(header, OVER_TRASH)
    expect(commits).not.toHaveBeenCalled()
  })

  test('the highlight and dim survive an App render mid-gesture, and the release still deletes', async () => {
    const { commits, remove } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    moveHeaderTo(header, OVER_TRASH)
    commits.mockClear()
    // A slightly larger window moves the zone to x 934..1030, y 674..770: still under the pointer.
    resizeWindow(1030, 770)
    expect(commits).toHaveBeenCalled()
    expect(isHighlighted()).toBe(true)
    expect(isDimmed('a')).toBe(true)

    fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(isHighlighted()).toBe(false)
  })

  test('AC 17: a note overlapping the zone with the pointer outside it is not highlighted', async () => {
    await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    moveHeaderTo(header, BESIDE_TRASH)
    expect(groupOf('a').style.transform).toBe('translate(724px, 518px)')
    expect(isHighlighted()).toBe(false)
    expect(isDimmed('a')).toBe(false)
  })

  test('AC 18: releasing with the pointer over the zone deletes the note with one remove and no upsert', async () => {
    const { repository, upsert, remove } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    moveHeaderTo(header, OVER_TRASH)
    fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })

    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('a')
    expect(upsert).not.toHaveBeenCalled()
    expect(await repository.load()).toHaveLength(0)
    expect(isHighlighted()).toBe(false)
  })

  test('AC 18: the release point decides, even before a frame has applied it', async () => {
    const { remove } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(screen.queryAllByRole('group')).toHaveLength(0)
  })

  test('AC 19: releasing with the note overlapping the zone but the pointer outside it is a normal move', async () => {
    const { repository, upsert, remove } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    moveHeaderTo(header, BESIDE_TRASH)
    fireEvent.pointerUp(header, { clientX: BESIDE_TRASH[0], clientY: BESIDE_TRASH[1] })

    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(remove).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(await repository.load()).toEqual([{ ...note, x: 824, y: 618 }])
  })

  test('moving off the zone before release is a normal move', async () => {
    const { upsert, remove } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    moveHeaderTo(header, OVER_TRASH)
    moveHeaderTo(header, [400, 400])
    fireEvent.pointerUp(header, { clientX: 400, clientY: 400 })

    expect(remove).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(isDimmed('a')).toBe(false)
  })

  test.each([
    ['Escape', (header: HTMLElement) => fireEvent.keyDown(header, { key: 'Escape' })],
    ['pointercancel', (header: HTMLElement) => fireEvent.pointerCancel(header)],
    ['window blur', () => fireEvent.blur(window)],
  ])('%s over the zone clears the highlight and dim and writes nothing', async (_name, cancel) => {
    const { repository, upsert, remove } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    moveHeaderTo(header, OVER_TRASH)
    cancel(header)
    act(flushFrames)
    fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })

    expect(isHighlighted()).toBe(false)
    expect(isDimmed('a')).toBe(false)
    expect(groupOf('a').style.transform).toBe('')
    expect(remove).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
    expect(await repository.load()).toEqual([note])
  })

  test('AC 6: a create drag or click that starts on the zone creates nothing', async () => {
    const { repository, upsert } = await renderApp([])
    const zone = trash()
    fireEvent.pointerDown(zone, { clientX: 950, clientY: 700 })
    fireEvent.pointerMove(zone, { clientX: 500, clientY: 400 })
    fireEvent.pointerUp(zone, { clientX: 500, clientY: 400 })
    fireEvent.pointerDown(zone, { clientX: 950, clientY: 700 })
    fireEvent.pointerUp(zone, { clientX: 950, clientY: 700 })

    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(upsert).not.toHaveBeenCalled()
    expect(await repository.load()).toHaveLength(0)
  })

  test('a resize that ends with the pointer over the zone never deletes nor highlights', async () => {
    const { upsert, remove } = await renderApp([note])
    const handle = screen.getByLabelText('Resize note')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    act(flushFrames)
    expect(isHighlighted()).toBe(false)
    expect(isDimmed('a')).toBe(false)
    fireEvent.pointerUp(handle, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })

    expect(remove).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })
})

describe('performance', () => {
  test('AC 48: dragging one note among 200 over the zone renders no note component', async () => {
    const many: Note[] = Array.from({ length: 200 }, (_, i) => ({
      id: `n${String(i)}`,
      x: (i % 20) * 40,
      y: Math.floor(i / 20) * 50,
      width: 100,
      height: 100,
      text: '',
      color: '#FFF59D',
      z: i + 1,
    }))
    await renderApp(many)
    renders.clear()

    const header = headerOf('n42')
    fireEvent.pointerDown(header, { clientX: 90, clientY: 105 })
    moveHeaderTo(header, [500, 500])
    moveHeaderTo(header, OVER_TRASH)
    expect(isHighlighted()).toBe(true)
    moveHeaderTo(header, [500, 500])
    moveHeaderTo(header, OVER_TRASH)
    expect(renders.size).toBe(0)

    fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    expect(screen.getAllByRole('group')).toHaveLength(199)
    expect(renders.size).toBe(0)
  })
})
