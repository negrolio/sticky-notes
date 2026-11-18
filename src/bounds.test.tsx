import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memo } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App.tsx'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
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

let frames: FrameRequestCallback[] = []
function flushFrames() {
  const pending = frames
  frames = []
  for (const callback of pending) callback(performance.now())
}

function resizeWindow(width: number, height: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
    window.dispatchEvent(new Event('resize'))
  })
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
  resizeWindow(1024, 768)
})

// The app starts in jsdom's 1024x768 viewport; tests shrink it to 900x700.
const inner: Note = { id: 'inner', x: 100, y: 100, width: 200, height: 150, text: '', color: '#C5E1A5', z: 1 }
// In 900x700 it is displayed at (700,550): header presses at (750,560), handle presses at (895,695).
const edge: Note = { id: 'edge', x: 800, y: 600, width: 200, height: 150, text: '', color: '#FFF59D', z: 2 }
// In 800x600 it is displayed at (0,100), 800 wide: handle presses at (795,295).
const wide: Note = { id: 'wide', x: 24, y: 100, width: 1000, height: 200, text: '', color: '#B3E5FC', z: 3 }

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

function partOf(id: string, selector: string): HTMLElement {
  const part = groupOf(id).querySelector<HTMLElement>(selector)
  if (!part) throw new Error(`no ${selector} on note ${id}`)
  return part
}

const headerOf = (id: string) => partOf(id, '.note-header')
const handleOf = (id: string) => partOf(id, '[aria-label="Resize note"]')

async function stored(repository: NotesRepository, id: string) {
  return (await repository.load()).find((n) => n.id === id)
}

function displayed(id: string) {
  const { left, top, width, height, transform } = groupOf(id).style
  return { left, top, width, height, transform }
}

function drag(target: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(target, { clientX: to[0], clientY: to[1] })
  act(flushFrames)
  fireEvent.pointerUp(target, { clientX: to[0], clientY: to[1] })
}

describe('window resize', () => {
  test('AC 43: shrinking the window displays a note fully inside, stored x,y unchanged', async () => {
    const { repository } = await renderApp([edge])
    resizeWindow(900, 700)

    expect(displayed('edge')).toMatchObject({ left: '700px', top: '550px', width: '200px', height: '150px' })
    expect(await stored(repository, 'edge')).toEqual(edge)
  })

  test('AC 43: a note larger than the board is displayed shrunk to it, stored size unchanged', async () => {
    const { repository } = await renderApp([wide])
    resizeWindow(800, 600)

    expect(displayed('wide')).toMatchObject({ left: '0px', top: '100px', width: '800px', height: '200px' })
    expect(await stored(repository, 'wide')).toEqual(wide)
  })

  test('AC 44: growing the window back displays the note at its stored rect', async () => {
    await renderApp([edge, wide])
    resizeWindow(800, 600)
    resizeWindow(1024, 768)

    expect(displayed('edge')).toMatchObject({ left: '800px', top: '600px', width: '200px', height: '150px' })
    expect(displayed('wide')).toMatchObject({ left: '24px', top: '100px', width: '1000px', height: '200px' })
  })

  test('a window resize writes nothing to the repository', async () => {
    const { upsert } = await renderApp([inner, edge, wide])
    resizeWindow(800, 600)
    resizeWindow(1024, 768)
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a window resize renders only the notes whose displayed rect changes', async () => {
    await renderApp([inner, edge])
    renders.clear()
    resizeWindow(900, 700)
    expect([...renders.keys()]).toEqual(['edge'])

    renders.clear()
    resizeWindow(900, 701)
    expect([...renders.keys()]).toEqual(['edge'])

    renders.clear()
    resizeWindow(900, 701)
    resizeWindow(950, 701)
    expect([...renders.keys()]).toEqual(['edge'])
  })

  test('a resize that keeps a clamped note in place does not render it', async () => {
    await renderApp([inner, edge])
    resizeWindow(900, 700)
    renders.clear()
    // Height grows past what edge needs, width stays: its displayed rect is (700,600) either way.
    resizeWindow(900, 760)
    resizeWindow(900, 765)
    expect(displayed('edge')).toMatchObject({ left: '700px', top: '600px' })
    expect(renders.get('edge')).toBe(1)
    expect(renders.has('inner')).toBe(false)
  })
})

describe('gestures on a clamped note start from its displayed rect', () => {
  test('a move previews and commits relative to the displayed position', async () => {
    const { repository } = await renderApp([edge])
    resizeWindow(900, 700)
    const header = headerOf('edge')
    fireEvent.pointerDown(header, { clientX: 750, clientY: 560 })
    fireEvent.pointerMove(header, { clientX: 650, clientY: 460 })
    act(flushFrames)
    expect(displayed('edge')).toMatchObject({ left: '700px', top: '550px', transform: 'translate(-100px, -100px)' })
    fireEvent.pointerUp(header, { clientX: 650, clientY: 460 })

    expect(await stored(repository, 'edge')).toEqual({ ...edge, x: 600, y: 450 })
    expect(displayed('edge')).toMatchObject({ left: '600px', top: '450px', transform: '' })
  })

  test('a move keeps the stored size of a note shrunk to the board', async () => {
    const { repository } = await renderApp([wide])
    resizeWindow(800, 600)
    drag(headerOf('wide'), [400, 110], [400, 160])

    expect(await stored(repository, 'wide')).toEqual({ ...wide, x: 0, y: 150 })
    expect(displayed('wide')).toMatchObject({ left: '0px', top: '150px', width: '800px' })
  })

  test('a move pushing a clamped note further out writes nothing and does not shift it', async () => {
    const { upsert } = await renderApp([edge])
    resizeWindow(900, 700)
    drag(headerOf('edge'), [750, 560], [850, 660])

    expect(upsert).not.toHaveBeenCalled()
    expect(displayed('edge')).toMatchObject({ left: '700px', top: '550px', transform: '' })
  })

  test('a press on the header without moving writes nothing', async () => {
    const { upsert } = await renderApp([edge])
    resizeWindow(900, 700)
    const header = headerOf('edge')
    fireEvent.pointerDown(header, { clientX: 750, clientY: 560 })
    fireEvent.pointerUp(header, { clientX: 750, clientY: 560 })
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a press on a partly visible resize handle without moving writes nothing and does not shift the note', async () => {
    const { upsert } = await renderApp([wide])
    resizeWindow(800, 600)
    const handle = handleOf('wide')
    fireEvent.pointerDown(handle, { clientX: 795, clientY: 295 })
    fireEvent.pointerMove(handle, { clientX: 795, clientY: 295 })
    act(flushFrames)
    expect(displayed('wide')).toMatchObject({ left: '0px', top: '100px', width: '800px', height: '200px' })
    fireEvent.pointerUp(handle, { clientX: 795, clientY: 295 })

    expect(upsert).not.toHaveBeenCalled()
    expect(displayed('wide')).toMatchObject({ left: '0px', top: '100px', width: '800px', height: '200px' })
  })

  test('a resize previews and commits relative to the displayed rect', async () => {
    const { repository } = await renderApp([edge])
    resizeWindow(900, 700)
    const handle = handleOf('edge')
    fireEvent.pointerDown(handle, { clientX: 895, clientY: 695 })
    fireEvent.pointerMove(handle, { clientX: 845, clientY: 665 })
    act(flushFrames)
    expect(displayed('edge')).toMatchObject({ left: '700px', top: '550px', width: '150px', height: '120px' })
    fireEvent.pointerUp(handle, { clientX: 845, clientY: 665 })

    expect(await stored(repository, 'edge')).toEqual({ ...edge, x: 700, y: 550, width: 150, height: 120 })
    expect(displayed('edge')).toMatchObject({ left: '700px', top: '550px', width: '150px', height: '120px' })
  })

  const cancels: [string, (target: HTMLElement) => void][] = [
    ['Escape', (target) => fireEvent.keyDown(target, { key: 'Escape' })],
    ['pointercancel', (target) => fireEvent.pointerCancel(target)],
    ['window blur', () => fireEvent.blur(window)],
  ]

  test.each(cancels)('%s mid-move reverts to the displayed rect and writes nothing', async (_name, cancel) => {
    const { repository, upsert } = await renderApp([edge])
    resizeWindow(900, 700)
    const header = headerOf('edge')
    fireEvent.pointerDown(header, { clientX: 750, clientY: 560 })
    fireEvent.pointerMove(header, { clientX: 650, clientY: 460 })
    act(flushFrames)
    cancel(header)

    expect(displayed('edge')).toEqual({ left: '700px', top: '550px', width: '200px', height: '150px', transform: '' })
    expect(upsert).not.toHaveBeenCalled()
    expect(await stored(repository, 'edge')).toEqual(edge)
  })

  test.each(cancels)('%s mid-resize reverts to the displayed rect and writes nothing', async (_name, cancel) => {
    const { repository, upsert } = await renderApp([wide])
    resizeWindow(800, 600)
    const handle = handleOf('wide')
    fireEvent.pointerDown(handle, { clientX: 795, clientY: 295 })
    fireEvent.pointerMove(handle, { clientX: 595, clientY: 395 })
    act(flushFrames)
    expect(displayed('wide')).toMatchObject({ width: '600px', height: '300px' })
    cancel(handle)

    expect(displayed('wide')).toEqual({ left: '0px', top: '100px', width: '800px', height: '200px', transform: '' })
    expect(upsert).not.toHaveBeenCalled()
    expect(await stored(repository, 'wide')).toEqual(wide)
  })

  // In 1024x768 wide is displayed at its stored rect: handle presses at (1019,295).
  test.each(cancels)(
    '%s after a window resize mid-resize shows the size React last rendered',
    async (_name, cancel) => {
      const { upsert } = await renderApp([wide])
      const handle = handleOf('wide')
      fireEvent.pointerDown(handle, { clientX: 1019, clientY: 295 })
      fireEvent.pointerMove(handle, { clientX: 919, clientY: 295 })
      act(flushFrames)
      resizeWindow(800, 600)
      cancel(handle)

      expect(displayed('wide')).toEqual({ left: '0px', top: '100px', width: '800px', height: '200px', transform: '' })
      expect(upsert).not.toHaveBeenCalled()
    },
  )

  test('a resize committed after a window resize mid-gesture shows the stored note clamped', async () => {
    const { repository } = await renderApp([wide])
    const handle = handleOf('wide')
    fireEvent.pointerDown(handle, { clientX: 1019, clientY: 295 })
    fireEvent.pointerMove(handle, { clientX: 1019, clientY: 335 })
    act(flushFrames)
    resizeWindow(800, 600)
    fireEvent.pointerUp(handle, { clientX: 1019, clientY: 335 })

    const resized = await stored(repository, 'wide')
    if (!resized) throw new Error('wide was not stored')
    const { x, y, width, height } = resized
    expect(x + width).toBeLessThanOrEqual(800)
    expect(displayed('wide')).toMatchObject({
      left: `${String(x)}px`,
      top: `${String(y)}px`,
      width: `${String(width)}px`,
      height: `${String(height)}px`,
    })
  })
})
