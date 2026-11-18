import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memo } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

// Counts renders of each note component by id. The real component's render function is wrapped
// and memoized again, so a missing memo in StickyNote.tsx fails here (`type` is undefined).
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
const note: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'hi', color: '#C5E1A5', z: 1 }
const other: Note = { id: 'b', x: 500, y: 300, width: 100, height: 100, text: '', color: '#FFF59D', z: 2 }

async function renderApp(initial: readonly Note[]) {
  const stored = createMemoryRepository(initial)
  const upsert = vi.fn((n: Note) => stored.upsert(n))
  const repository: NotesRepository = { ...stored, upsert }
  render(<App repository={repository} />)
  const board = screen.getByRole('main')
  await waitFor(() => {
    expect(board.getAttribute('aria-busy')).toBe('false')
  })
  return { repository, upsert }
}

function groupOf(id: string): HTMLElement {
  const group = screen.getAllByRole('group').find((g) => g.dataset.noteId === id)
  if (!group) throw new Error(`no note ${id}`)
  return group
}

function headerOf(id: string): HTMLElement {
  const header = groupOf(id).querySelector<HTMLElement>('.note-header')
  if (!header) throw new Error(`no header on note ${id}`)
  return header
}

async function stored(repository: NotesRepository, id: string) {
  return (await repository.load()).find((n) => n.id === id)
}

function dragHeader(id: string, from: [number, number], to: [number, number]) {
  const header = headerOf(id)
  fireEvent.pointerDown(header, { clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(header, { clientX: to[0], clientY: to[1] })
  act(flushFrames)
  fireEvent.pointerUp(header, { clientX: to[0], clientY: to[1] })
}

describe('move', () => {
  test('AC 7: dragging the header by (+50,+30) moves the note by (+50,+30)', async () => {
    const { repository } = await renderApp([note])
    dragHeader('a', [150, 110], [200, 140])

    expect(await stored(repository, 'a')).toMatchObject({ x: 150, y: 130, width: 200, height: 150 })
    const group = groupOf('a')
    expect(group.style.left).toBe('150px')
    expect(group.style.top).toBe('130px')
    expect(group.style.transform).toBe('')
  })

  test('AC 8: dragging past the board edge keeps the note fully inside', async () => {
    const { repository } = await renderApp([note])
    dragHeader('a', [150, 110], [2000, 2000])
    expect(await stored(repository, 'a')).toMatchObject({ x: 824, y: 618 })

    dragHeader('a', [830, 620], [-500, -500])
    expect(await stored(repository, 'a')).toMatchObject({ x: 0, y: 0 })
  })

  test('AC 8: the note is clamped inside the board while it is dragged, too', async () => {
    await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 2000, clientY: -500 })
    act(flushFrames)
    expect(groupOf('a').style.transform).toBe('translate(724px, -100px)')
  })

  test('AC 9: a drag that starts on the textarea does not move the note', async () => {
    const { repository, upsert } = await renderApp([note])
    const textarea = within(groupOf('a')).getByRole('textbox')
    fireEvent.pointerDown(textarea, { clientX: 150, clientY: 150 })
    fireEvent.pointerMove(textarea, { clientX: 300, clientY: 300 })
    act(flushFrames)
    fireEvent.pointerUp(textarea, { clientX: 300, clientY: 300 })

    expect(await stored(repository, 'a')).toMatchObject({ x: 100, y: 100 })
    expect(groupOf('a').style.transform).toBe('')
    expect(upsert).not.toHaveBeenCalled()
  })

  test('AC 10: mid-move, top and left stay put and only the transform changes', async () => {
    await renderApp([note])
    const header = headerOf('a')
    const group = groupOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    act(flushFrames)
    expect(group.style.left).toBe('100px')
    expect(group.style.top).toBe('100px')
    expect(group.style.transform).toBe('translate(50px, 30px)')

    fireEvent.pointerMove(header, { clientX: 260, clientY: 170 })
    act(flushFrames)
    expect(group.style.left).toBe('100px')
    expect(group.style.top).toBe('100px')
    expect(group.style.transform).toBe('translate(110px, 60px)')
  })

  test('pointer moves are throttled to one transform write per animation frame', async () => {
    await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 160, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 170, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 180, clientY: 110 })
    expect(frames).toHaveLength(1)
    expect(groupOf('a').style.transform).toBe('')

    act(flushFrames)
    expect(groupOf('a').style.transform).toBe('translate(30px, 0px)')
  })

  test.each([
    ['AC 11: Escape', (header: HTMLElement) => fireEvent.keyDown(header, { key: 'Escape' })],
    ['AC 12: pointercancel', (header: HTMLElement) => fireEvent.pointerCancel(header)],
    ['window blur', () => fireEvent.blur(window)],
  ])('%s mid-move reverts the note and writes nothing', async (_name, cancel) => {
    const { repository, upsert } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    act(flushFrames)
    cancel(header)
    fireEvent.pointerMove(header, { clientX: 300, clientY: 300 })
    act(flushFrames)
    fireEvent.pointerUp(header, { clientX: 300, clientY: 300 })

    const group = groupOf('a')
    expect(group.style.transform).toBe('')
    expect(group.style.left).toBe('100px')
    expect(group.style.top).toBe('100px')
    expect(await stored(repository, 'a')).toMatchObject({ x: 100, y: 100 })
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a frame still pending when the gesture is cancelled does not apply', async () => {
    await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    fireEvent.keyDown(window, { key: 'Escape' })
    act(flushFrames)
    expect(groupOf('a').style.transform).toBe('')
  })

  test('AC 39: a complete move gesture makes exactly one repository write', async () => {
    const { upsert } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    for (let i = 1; i <= 20; i++) {
      fireEvent.pointerMove(header, { clientX: 150 + i * 5, clientY: 110 + i * 3 })
      act(flushFrames)
    }
    expect(upsert).not.toHaveBeenCalled()
    fireEvent.pointerUp(header, { clientX: 250, clientY: 170 })

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...note, x: 200, y: 160 })
  })

  test('a press on the header without moving writes nothing', async () => {
    const { upsert } = await renderApp([note])
    const header = headerOf('a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerUp(header, { clientX: 150, clientY: 110 })
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a header drag does not create a note', async () => {
    const { repository } = await renderApp([note])
    dragHeader('a', [150, 110], [400, 400])
    expect(await repository.load()).toHaveLength(1)
  })

  test('moving one note leaves the other where it was', async () => {
    const { repository } = await renderApp([note, other])
    dragHeader('a', [150, 110], [200, 140])
    expect(await stored(repository, 'b')).toEqual(other)
    expect(groupOf('b').style.left).toBe('500px')
  })
})

describe('performance', () => {
  test('AC 48: moving one note among 200 renders no other note component', async () => {
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
    for (let i = 1; i <= 10; i++) {
      fireEvent.pointerMove(header, { clientX: 90 + i * 10, clientY: 105 + i * 10 })
      act(flushFrames)
    }
    expect(renders.size).toBe(0)

    fireEvent.pointerUp(header, { clientX: 190, clientY: 205 })
    await waitFor(() => {
      expect(groupOf('n42').style.left).toBe('180px')
    })
    expect([...renders.keys()]).toEqual(['n42'])
  })
})
