import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App.tsx'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { createRestMockRepository } from './restMockRepository.ts'
import { installPointerStubs } from './test/pointer.ts'
import { loadToolbarPosition, TOOLBAR_STORAGE_KEY } from './toolbarPosition.ts'

// jsdom does no layout, so the toolbar is given a size here: 200x40.
const TOOLBAR = { width: 200, height: 40 }

// Animation frames run only when a test flushes them, so throttling is observable.
let frames: FrameRequestCallback[] = []
function flushFrames() {
  const pending = frames
  frames = []
  for (const callback of pending) callback(performance.now())
}

beforeEach(() => {
  installPointerStubs()
  localStorage.clear()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames[handle - 1] = () => {}
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('toolbar') ? TOOLBAR.width : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('toolbar') ? TOOLBAR.height : 0
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setWindowSize(1024, 768)
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

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 1 }

async function renderApp(initial: readonly Note[], stored: NotesRepository = createMemoryRepository(initial)) {
  const upsert = vi.fn((n: Note) => stored.upsert(n))
  const repository: NotesRepository = { ...stored, upsert }
  render(<App repository={repository} />)
  const main = screen.getByRole('main')
  await waitFor(() => {
    expect(main.getAttribute('aria-busy')).toBe('false')
  })
  return { repository, upsert, main }
}

function toolbar(): HTMLElement {
  return screen.getByRole('toolbar', { name: 'Board tools' })
}

function grip(): HTMLElement {
  return screen.getByRole('img', { name: 'Move toolbar' })
}

function position() {
  const { left, top, transform } = toolbar().style
  return { left, top, transform }
}

function storedValue(): string | null {
  return localStorage.getItem(TOOLBAR_STORAGE_KEY)
}

/** Presses the grip at (start), moves by (dx,dy) and flushes the frame, without releasing. */
function dragGrip(dx: number, dy: number, start: [number, number] = [600, 30]) {
  fireEvent.pointerDown(grip(), { clientX: start[0], clientY: start[1] })
  fireEvent.pointerMove(grip(), { clientX: start[0] + dx, clientY: start[1] + dy })
  act(flushFrames)
}

function release(x: number, y: number) {
  fireEvent.pointerUp(grip(), { clientX: x, clientY: y })
}

describe('AC 57: first load', () => {
  test('the toolbar is named "Board tools", centred, 16 px from the top', async () => {
    await renderApp([])
    expect(position()).toEqual({ left: '412px', top: '16px', transform: '' })
    expect(storedValue()).toBeNull()
  })

  test('it is a sibling after the board, so it renders above every note', async () => {
    const { main } = await renderApp([{ ...a, z: 1_000_000 }])
    expect(main.contains(toolbar())).toBe(false)
    expect(toolbar().parentElement).toBe(main.parentElement)
    expect(main.compareDocumentPosition(toolbar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('the grip sits at its right end with "Move toolbar", a grab cursor class, and is not focusable', async () => {
    await renderApp([])
    expect(toolbar().lastElementChild).toBe(grip())
    expect(grip().hasAttribute('tabindex')).toBe(false)
    expect(grip().classList.contains('toolbar-grip')).toBe(true)
    // A 2x3 grid of dots.
    expect(grip().querySelectorAll('circle')).toHaveLength(6)
  })
})

describe('AC 58: dragging the grip', () => {
  test('moves the toolbar by the drag, only through transform until pointer up', async () => {
    await renderApp([])
    dragGrip(100, 50)
    expect(position()).toEqual({ left: '412px', top: '16px', transform: 'translate(100px, 50px)' })

    release(700, 80)
    expect(position()).toEqual({ left: '512px', top: '66px', transform: '' })
    expect(loadToolbarPosition()).toEqual({ x: 512, y: 66 })
  })

  test('moves are throttled to one DOM write per animation frame', async () => {
    await renderApp([])
    fireEvent.pointerDown(grip(), { clientX: 600, clientY: 30 })
    fireEvent.pointerMove(grip(), { clientX: 610, clientY: 30 })
    fireEvent.pointerMove(grip(), { clientX: 620, clientY: 30 })
    expect(frames).toHaveLength(1)
    expect(toolbar().style.transform).toBe('')
    act(flushFrames)
    expect(toolbar().style.transform).toBe('translate(20px, 0px)')
  })

  test('the drag renders no note and writes nothing to the notes repository', async () => {
    const { upsert } = await renderApp([a])
    dragGrip(100, 50)
    release(700, 80)
    expect(upsert).not.toHaveBeenCalled()
  })

  test('the position is stored only on pointer up', async () => {
    await renderApp([])
    dragGrip(100, 50)
    expect(storedValue()).toBeNull()
    release(700, 80)
    expect(storedValue()).not.toBeNull()
  })
})

describe('AC 59: clamping', () => {
  test.each([
    ['right and bottom', 2_000, 2_000, { left: '824px', top: '728px' }],
    ['left and top', -2_000, -2_000, { left: '0px', top: '0px' }],
  ])('a drag past the %s edges keeps the toolbar inside the viewport', async (_name, dx, dy, expected) => {
    await renderApp([])
    dragGrip(dx, dy)
    const [x, y] = [600 + dx, 30 + dy]
    const left = Number(expected.left.replace('px', ''))
    const top = Number(expected.top.replace('px', ''))
    expect(toolbar().style.transform).toBe(`translate(${String(left - 412)}px, ${String(top - 16)}px)`)
    release(x, y)
    expect(position()).toEqual({ ...expected, transform: '' })
  })
})

describe('AC 60: cancel', () => {
  test.each([
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['pointercancel', () => fireEvent.pointerCancel(grip())],
    ['window blur', () => fireEvent.blur(window)],
  ])('%s mid-drag reverts the toolbar and stores nothing', async (_name, cancel) => {
    localStorage.setItem(TOOLBAR_STORAGE_KEY, JSON.stringify({ x: 300, y: 200 }))
    await renderApp([])
    dragGrip(100, 50, [400, 210])
    cancel()
    act(flushFrames)
    release(500, 260)
    expect(position()).toEqual({ left: '300px', top: '200px', transform: '' })
    expect(storedValue()).toBe(JSON.stringify({ x: 300, y: 200 }))
  })
})

describe('AC 61: reload', () => {
  test('with localStorage, the moved toolbar comes back where it was', async () => {
    await renderApp([])
    dragGrip(-200, 100)
    release(400, 130)
    cleanup()
    await renderApp([])
    expect(position()).toEqual({ left: '212px', top: '116px', transform: '' })
  })

  test('with the REST mock, the position is still in localStorage and comes back', async () => {
    const fast = () => createRestMockRepository({ random: () => 0 })
    await renderApp([], fast())
    dragGrip(-200, 100)
    release(400, 130)
    cleanup()
    await renderApp([], fast())
    expect(position()).toEqual({ left: '212px', top: '116px', transform: '' })
  })

  test.each([
    ['not JSON', '{'],
    ['not an object', '42'],
    ['missing y', JSON.stringify({ x: 10 })],
    ['a string coordinate', JSON.stringify({ x: '10', y: 20 })],
    ['a non-finite coordinate', '{"x":1e999,"y":20}'],
  ])('a stored value that is %s is ignored', async (_name, raw) => {
    localStorage.setItem(TOOLBAR_STORAGE_KEY, raw)
    expect(loadToolbarPosition()).toBeNull()
    await renderApp([])
    expect(position()).toEqual({ left: '412px', top: '16px', transform: '' })
  })
})

describe('AC 62: window shrink', () => {
  test('the toolbar is displayed clamped, the stored position is kept, and it returns when the window grows', async () => {
    localStorage.setItem(TOOLBAR_STORAGE_KEY, JSON.stringify({ x: 800, y: 600 }))
    await renderApp([])
    resizeWindow(900, 500)
    expect(position()).toEqual({ left: '700px', top: '460px', transform: '' })
    expect(storedValue()).toBe(JSON.stringify({ x: 800, y: 600 }))
    resizeWindow(1024, 768)
    expect(position()).toEqual({ left: '800px', top: '600px', transform: '' })
  })

  test('a drag starts from the displayed position', async () => {
    localStorage.setItem(TOOLBAR_STORAGE_KEY, JSON.stringify({ x: 800, y: 600 }))
    await renderApp([])
    resizeWindow(900, 500)
    dragGrip(-100, 0, [880, 470])
    release(780, 470)
    expect(loadToolbarPosition()).toEqual({ x: 600, y: 460 })
  })

  test('the default position stays centred', async () => {
    await renderApp([])
    resizeWindow(1200, 768)
    expect(position()).toEqual({ left: '500px', top: '16px', transform: '' })
  })
})

describe('AC 63: no create from the toolbar', () => {
  test('a press, a click or a drag starting on the toolbar or the grip creates no note', async () => {
    const { upsert } = await renderApp([])
    fireEvent.pointerDown(toolbar(), { clientX: 450, clientY: 30 })
    fireEvent.pointerUp(toolbar(), { clientX: 450, clientY: 30 })
    fireEvent.pointerDown(toolbar(), { clientX: 450, clientY: 30 })
    fireEvent.pointerMove(toolbar(), { clientX: 600, clientY: 300 })
    fireEvent.pointerUp(toolbar(), { clientX: 600, clientY: 300 })
    dragGrip(100, 300)
    release(700, 330)
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(upsert).not.toHaveBeenCalled()
  })
})
