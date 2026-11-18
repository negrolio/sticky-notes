import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import { UNDO_TOAST_MS, type Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

beforeEach(() => {
  installPointerStubs()
  // Frames run at once: these tests are about the release, not the throttling.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(performance.now())
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// jsdom's default viewport is 1024x768, so the trash zone spans x 928..1024 and y 672..768.
const OVER_TRASH: [number, number] = [1000, 740]
const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 3 }
const b: Note = { id: 'b', x: 400, y: 300, width: 120, height: 90, text: 'second', color: '#B3E5FC', z: 5 }
const MESSAGE = 'Note deleted. Undo (Ctrl+Z)'

async function renderApp(initial: readonly Note[]) {
  const stored = createMemoryRepository(initial)
  const upsert = vi.fn((n: Note) => stored.upsert(n))
  const remove = vi.fn((id: string) => stored.remove(id))
  const repository: NotesRepository = { ...stored, upsert, remove }
  render(<App repository={repository} />)
  const main = screen.getByRole('main')
  await waitFor(() => {
    expect(main.getAttribute('aria-busy')).toBe('false')
  })
  return { repository, upsert, remove, main }
}

function groupOf(id: string): HTMLElement | undefined {
  return screen.queryAllByRole('group').find((g) => g.dataset.noteId === id)
}

function trashNote(id: string) {
  const header = groupOf(id)?.querySelector<HTMLElement>('.note-header')
  if (!header) throw new Error(`no header on note ${id}`)
  const rect = header.getBoundingClientRect()
  fireEvent.pointerDown(header, { clientX: rect.left + 5, clientY: rect.top + 5 })
  fireEvent.pointerMove(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
  fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
}

function toastShown(): boolean {
  return screen.queryByText(MESSAGE) !== null
}

function undoButton(): HTMLElement {
  return within(screen.getByRole('status')).getByRole('button', { name: 'Undo' })
}

function pressUndo(target: Element | Window = window, init: KeyboardEventInit = { ctrlKey: true }) {
  return fireEvent.keyDown(target, { key: 'z', ...init })
}

describe('undo toast', () => {
  test('AC 20: a delete shows a role="status" toast with the message and an Undo button', async () => {
    await renderApp([a])
    expect(toastShown()).toBe(false)
    trashNote('a')

    const status = screen.getByRole('status')
    expect(within(status).getByText(MESSAGE)).toBeTruthy()
    expect(undoButton()).toBeTruthy()
  })

  test('decision 17: the toast renders after the board, outside the notes stacking context', async () => {
    const { main } = await renderApp([{ ...a, z: 1_000_000 }, b])
    trashNote('b')
    const status = screen.getByRole('status')
    expect(main.contains(status)).toBe(false)
    expect(main.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('AC 21: clicking Undo restores the note with the same id, rect, text, color and z, in one upsert', async () => {
    const { repository, upsert, remove } = await renderApp([a, b])
    trashNote('a')
    expect(groupOf('a')).toBeUndefined()
    fireEvent.click(undoButton())

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(a)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(await repository.load()).toEqual(expect.arrayContaining([a, b]))
    const group = groupOf('a')
    expect(group?.style.left).toBe('100px')
    expect(group?.style.top).toBe('100px')
    expect(group?.style.width).toBe('200px')
    expect(group?.style.height).toBe('150px')
    expect(group?.style.zIndex).toBe('3')
    expect(group?.style.backgroundColor).toBe('rgb(197, 225, 165)')
    expect(group?.querySelector('textarea')?.value).toBe('first')
  })

  test('the toast closes once its Undo has restored the note', async () => {
    await renderApp([a])
    trashNote('a')
    fireEvent.click(undoButton())
    expect(toastShown()).toBe(false)
  })

  test('AC 22: the toast closes 5 s after a delete', async () => {
    await renderApp([a])
    vi.useFakeTimers()
    trashNote('a')
    act(() => {
      vi.advanceTimersByTime(UNDO_TOAST_MS - 1)
    })
    expect(toastShown()).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(toastShown()).toBe(false)
  })

  test('decision 14: each new delete resets the 5 s timer', async () => {
    await renderApp([a, b])
    vi.useFakeTimers()
    trashNote('a')
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    trashNote('b')
    act(() => {
      vi.advanceTimersByTime(UNDO_TOAST_MS - 1)
    })
    expect(toastShown()).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(toastShown()).toBe(false)
  })

  test('AC 6: a create drag or click that starts on the toast creates nothing', async () => {
    const { upsert } = await renderApp([a])
    trashNote('a')
    const toast = screen.getByText(MESSAGE)
    fireEvent.pointerDown(toast, { clientX: 500, clientY: 740 })
    fireEvent.pointerMove(toast, { clientX: 300, clientY: 300 })
    fireEvent.pointerUp(toast, { clientX: 300, clientY: 300 })
    fireEvent.pointerDown(toast, { clientX: 500, clientY: 740 })
    fireEvent.pointerUp(toast, { clientX: 500, clientY: 740 })

    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('Ctrl+Z', () => {
  test('AC 23: deleting A then B, Ctrl+Z twice restores B, then A', async () => {
    const { upsert } = await renderApp([a, b])
    trashNote('a')
    trashNote('b')
    expect(screen.queryAllByRole('group')).toHaveLength(0)

    pressUndo()
    expect(groupOf('b')).toBeDefined()
    expect(groupOf('a')).toBeUndefined()
    expect(upsert).toHaveBeenLastCalledWith(b)

    pressUndo()
    expect(groupOf('a')).toBeDefined()
    expect(upsert).toHaveBeenLastCalledWith(a)
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  test('Cmd+Z restores like Ctrl+Z and the key is consumed', async () => {
    await renderApp([a])
    trashNote('a')
    const notPrevented = pressUndo(window, { metaKey: true })
    expect(notPrevented).toBe(false)
    expect(groupOf('a')).toBeDefined()
  })

  test('Ctrl+Shift+Z and a plain Z restore nothing', async () => {
    const { upsert } = await renderApp([a])
    trashNote('a')
    pressUndo(window, { ctrlKey: true, shiftKey: true, key: 'Z' })
    pressUndo(window, {})
    expect(groupOf('a')).toBeUndefined()
    expect(upsert).not.toHaveBeenCalled()
  })

  test('AC 24: Ctrl+Z after the toast has closed restores the last deleted note', async () => {
    const { upsert } = await renderApp([a])
    vi.useFakeTimers()
    trashNote('a')
    act(() => {
      vi.advanceTimersByTime(UNDO_TOAST_MS)
    })
    expect(toastShown()).toBe(false)

    pressUndo()
    expect(groupOf('a')).toBeDefined()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(a)
  })

  test('AC 25: Ctrl+Z in a textarea restores nothing and is left to the browser', async () => {
    const { upsert } = await renderApp([a, b])
    trashNote('a')
    const textarea = groupOf('b')?.querySelector('textarea')
    if (!textarea) throw new Error('no textarea on note b')
    textarea.focus()
    const notPrevented = pressUndo(textarea)

    expect(notPrevented).toBe(true)
    expect(groupOf('a')).toBeUndefined()
    expect(upsert).not.toHaveBeenCalled()
    expect(toastShown()).toBe(true)
  })

  test('with an empty stack, Ctrl+Z does nothing and writes nothing', async () => {
    const { repository, upsert, remove } = await renderApp([a])
    const notPrevented = pressUndo()
    expect(notPrevented).toBe(true)
    expect(upsert).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()

    trashNote('a')
    pressUndo()
    pressUndo()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(await repository.load()).toEqual([a])
  })

  test('decision 14: undo restores deletions only, not a move', async () => {
    const { upsert } = await renderApp([a])
    const header = groupOf('a')?.querySelector<HTMLElement>('.note-header')
    if (!header) throw new Error('no header on note a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    fireEvent.pointerUp(header, { clientX: 200, clientY: 140 })
    expect(upsert).toHaveBeenCalledTimes(1)

    pressUndo()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(groupOf('a')?.style.left).toBe('150px')
  })

  test('a restored note that was just created does not take focus, so a second Ctrl+Z still works', async () => {
    const { main } = await renderApp([b])
    fireEvent.pointerDown(main, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(main, { clientX: 100, clientY: 100 })
    const created = screen.getAllByRole('group').find((g) => g.dataset.noteId !== 'b')?.dataset.noteId
    if (!created) throw new Error('no note was created')
    trashNote(created)
    trashNote('b')

    pressUndo()
    expect(groupOf('b')).toBeDefined()
    pressUndo()
    const restored = groupOf(created)
    expect(restored).toBeDefined()
    expect(restored?.contains(document.activeElement)).toBe(false)
  })
})
