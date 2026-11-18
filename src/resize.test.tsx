import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memo } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App.tsx'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { resizedRect } from './resize.ts'
import { installPointerStubs } from './test/pointer.ts'

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
})

// jsdom's default viewport is 1024x768, the minimum the app supports.
const board = { width: 1024, height: 768 }
// Bottom-right corner at (300,250); presses on the handle start at (295,245).
const note: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'hi', color: '#C5E1A5', z: 1 }
const other: Note = { id: 'b', x: 500, y: 300, width: 100, height: 100, text: '', color: '#FFF59D', z: 2 }

async function renderApp(initial: readonly Note[]) {
  const stored = createMemoryRepository(initial)
  const upsert = vi.fn((n: Note) => stored.upsert(n))
  const repository: NotesRepository = { ...stored, upsert }
  render(<App repository={repository} />)
  const main = screen.getByRole('main')
  await waitFor(() => {
    expect(main.getAttribute('aria-busy')).toBe('false')
  })
  return { repository, upsert }
}

function groupOf(id: string): HTMLElement {
  const group = screen.getAllByRole('group').find((g) => g.dataset.noteId === id)
  if (!group) throw new Error(`no note ${id}`)
  return group
}

function handleOf(id: string): HTMLElement {
  const handle = groupOf(id).querySelector<HTMLElement>('[aria-label="Resize note"]')
  if (!handle) throw new Error(`no resize handle on note ${id}`)
  return handle
}

async function stored(repository: NotesRepository, id: string) {
  return (await repository.load()).find((n) => n.id === id)
}

function dragHandle(id: string, from: [number, number], to: [number, number]) {
  const handle = handleOf(id)
  fireEvent.pointerDown(handle, { clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(handle, { clientX: to[0], clientY: to[1] })
  act(flushFrames)
  fireEvent.pointerUp(handle, { clientX: to[0], clientY: to[1] })
}

describe('resizedRect', () => {
  test('adds the pointer delta to the size and keeps the position', () => {
    expect(resizedRect(note, { x: 60, y: 40 }, board)).toEqual({ x: 100, y: 100, width: 260, height: 190 })
  })

  test('never goes below 80x80', () => {
    expect(resizedRect(note, { x: -500, y: -500 }, board)).toEqual({ x: 100, y: 100, width: 80, height: 80 })
  })

  test('stops at the board right and bottom edges', () => {
    expect(resizedRect(note, { x: 5000, y: 5000 }, board)).toEqual({ x: 100, y: 100, width: 924, height: 668 })
  })

  test('keeps the minimum size inside the board when the note sits within 80px of its edge', () => {
    const nearEdge = { ...note, x: 980, y: 720, width: 44, height: 48 }
    expect(resizedRect(nearEdge, { x: 0, y: 0 }, board)).toEqual({ x: 944, y: 688, width: 80, height: 80 })
  })
})

describe('resize', () => {
  test('AC 13: dragging the handle by (+60,+40) grows the note by (+60,+40)', async () => {
    const { repository } = await renderApp([note])
    dragHandle('a', [295, 245], [355, 285])

    expect(await stored(repository, 'a')).toMatchObject({ x: 100, y: 100, width: 260, height: 190 })
    const group = groupOf('a')
    expect(group.style.width).toBe('260px')
    expect(group.style.height).toBe('190px')
    expect(group.style.left).toBe('100px')
    expect(group.style.top).toBe('100px')
  })

  test('AC 14: dragging the handle by (-500,-500) leaves the note at 80x80', async () => {
    const { repository } = await renderApp([note])
    dragHandle('a', [295, 245], [-205, -255])

    expect(await stored(repository, 'a')).toMatchObject({ x: 100, y: 100, width: 80, height: 80 })
  })

  test('AC 15: dragging the handle past the right and bottom edges keeps the note inside', async () => {
    const { repository } = await renderApp([note])
    dragHandle('a', [295, 245], [3000, 3000])

    const resized = await stored(repository, 'a')
    expect(resized).toMatchObject({ x: 100, y: 100, width: 924, height: 668 })
  })

  test('AC 15: the size is clamped while it is dragged, too', async () => {
    await renderApp([note])
    const handle = handleOf('a')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: 3000, clientY: -500 })
    act(flushFrames)
    expect(groupOf('a').style.width).toBe('924px')
    expect(groupOf('a').style.height).toBe('80px')
  })

  test('mid-resize, the size goes through the DOM and position stays put', async () => {
    const { upsert } = await renderApp([note])
    const handle = handleOf('a')
    const group = groupOf('a')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: 355, clientY: 285 })
    act(flushFrames)
    expect(group.style.width).toBe('260px')
    expect(group.style.height).toBe('190px')
    expect(group.style.left).toBe('100px')
    expect(group.style.top).toBe('100px')
    expect(group.style.transform).toBe('')
    expect(upsert).not.toHaveBeenCalled()
    expect(renders.get('a')).toBe(1)
  })

  test('pointer moves are throttled to one size write per animation frame', async () => {
    await renderApp([note])
    const handle = handleOf('a')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: 305, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: 315, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: 325, clientY: 245 })
    expect(frames).toHaveLength(1)
    expect(groupOf('a').style.width).toBe('200px')

    act(flushFrames)
    expect(groupOf('a').style.width).toBe('230px')
  })

  test.each([
    ['AC 16: Escape', (handle: HTMLElement) => fireEvent.keyDown(handle, { key: 'Escape' })],
    ['pointercancel', (handle: HTMLElement) => fireEvent.pointerCancel(handle)],
    ['window blur', () => fireEvent.blur(window)],
  ])('%s mid-resize reverts the size and writes nothing', async (_name, cancel) => {
    const { repository, upsert } = await renderApp([note])
    const handle = handleOf('a')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: 355, clientY: 285 })
    act(flushFrames)
    cancel(handle)
    fireEvent.pointerMove(handle, { clientX: 400, clientY: 400 })
    act(flushFrames)
    fireEvent.pointerUp(handle, { clientX: 400, clientY: 400 })

    const group = groupOf('a')
    expect(group.style.width).toBe('200px')
    expect(group.style.height).toBe('150px')
    expect(await stored(repository, 'a')).toMatchObject({ width: 200, height: 150 })
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a frame still pending when the gesture is cancelled does not apply', async () => {
    await renderApp([note])
    const handle = handleOf('a')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: 355, clientY: 285 })
    fireEvent.keyDown(window, { key: 'Escape' })
    act(flushFrames)
    expect(groupOf('a').style.width).toBe('200px')
    expect(groupOf('a').style.height).toBe('150px')
  })

  test('a complete resize gesture makes exactly one repository write', async () => {
    const { upsert } = await renderApp([note])
    const handle = handleOf('a')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    for (let i = 1; i <= 20; i++) {
      fireEvent.pointerMove(handle, { clientX: 295 + i * 3, clientY: 245 + i * 2 })
      act(flushFrames)
    }
    expect(upsert).not.toHaveBeenCalled()
    fireEvent.pointerUp(handle, { clientX: 355, clientY: 285 })

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...note, width: 260, height: 190 })
  })

  test('a press on the handle without moving writes nothing', async () => {
    const { upsert } = await renderApp([note])
    const handle = handleOf('a')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    fireEvent.pointerUp(handle, { clientX: 295, clientY: 245 })
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a handle drag neither moves the note nor creates one', async () => {
    const { repository } = await renderApp([note])
    dragHandle('a', [295, 245], [355, 285])
    const notes = await repository.load()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ x: 100, y: 100 })
    expect(groupOf('a').style.transform).toBe('')
  })

  test('resizing one note renders no other note component', async () => {
    const { repository } = await renderApp([note, other])
    renders.clear()
    const handle = handleOf('a')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    for (let i = 1; i <= 10; i++) {
      fireEvent.pointerMove(handle, { clientX: 295 + i * 6, clientY: 245 + i * 4 })
      act(flushFrames)
    }
    expect(renders.size).toBe(0)

    fireEvent.pointerUp(handle, { clientX: 355, clientY: 285 })
    await waitFor(() => {
      expect(groupOf('a').style.width).toBe('260px')
    })
    expect([...renders.keys()]).toEqual(['a'])
    expect(await stored(repository, 'b')).toEqual(other)
  })
})
