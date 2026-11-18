import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import { MAX_TEXT_LENGTH, TEXT_DEBOUNCE_MS, type Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

beforeEach(() => {
  installPointerStubs()
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

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: '', color: '#C5E1A5', z: 1 }
// jsdom's default viewport is 1024x768, so the trash zone spans x 928..1024 and y 672..768.
const OVER_TRASH: [number, number] = [1000, 740]

/** Renders with real timers so the load can land, then switches to fake ones for the debounce. */
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
  vi.useFakeTimers()
  return { repository, upsert, remove }
}

function groupOf(id: string): HTMLElement {
  const group = screen.queryAllByRole('group').find((g) => g.dataset.noteId === id)
  if (!group) throw new Error(`no note ${id}`)
  return group
}

function textareaOf(id: string): HTMLTextAreaElement {
  const textarea = groupOf(id).querySelector('textarea')
  if (!textarea) throw new Error(`no textarea on note ${id}`)
  return textarea
}

function type(id: string, text: string) {
  const textarea = textareaOf(id)
  textarea.focus()
  fireEvent.change(textarea, { target: { value: text } })
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function dragHeader(id: string, from: [number, number], to: [number, number]) {
  const header = groupOf(id).querySelector<HTMLElement>('.note-header')
  if (!header) throw new Error(`no header on note ${id}`)
  fireEvent.pointerDown(header, { clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(header, { clientX: to[0], clientY: to[1] })
  fireEvent.pointerUp(header, { clientX: to[0], clientY: to[1] })
}

describe('debounced writes', () => {
  test('AC 27: typing "hello" writes it once after ~300 ms idle', async () => {
    const { repository, upsert } = await renderApp([a])
    for (const text of ['h', 'he', 'hel', 'hell', 'hello']) {
      type('a', text)
      wait(50)
    }
    expect(textareaOf('a').value).toBe('hello')
    expect(upsert).not.toHaveBeenCalled()

    wait(TEXT_DEBOUNCE_MS - 50)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...a, text: 'hello' })
    expect(await repository.load()).toEqual([{ ...a, text: 'hello' }])
  })

  test('each change restarts the wait', async () => {
    const { upsert } = await renderApp([a])
    type('a', 'x')
    wait(TEXT_DEBOUNCE_MS - 1)
    type('a', 'xy')
    wait(TEXT_DEBOUNCE_MS - 1)
    expect(upsert).not.toHaveBeenCalled()
    wait(1)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...a, text: 'xy' })
  })

  test('AC 28: typing then blurring within 300 ms writes once, with the final text', async () => {
    const { upsert } = await renderApp([a])
    type('a', 'draft')
    wait(100)
    type('a', 'final')
    textareaOf('a').blur()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...a, text: 'final' })

    wait(TEXT_DEBOUNCE_MS * 2)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  test('a blur with nothing typed writes nothing', async () => {
    const { upsert } = await renderApp([a])
    textareaOf('a').focus()
    textareaOf('a').blur()
    wait(TEXT_DEBOUNCE_MS)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('length cap', () => {
  test('AC 29: pasting 12,000 characters stores 10,000', async () => {
    const { repository } = await renderApp([a])
    expect(textareaOf('a').maxLength).toBe(MAX_TEXT_LENGTH)
    type('a', 'x'.repeat(12_000))
    expect(textareaOf('a').value).toHaveLength(MAX_TEXT_LENGTH)
    wait(TEXT_DEBOUNCE_MS)

    const [stored] = await repository.load()
    expect(stored?.text).toHaveLength(MAX_TEXT_LENGTH)
  })
})

describe('Escape', () => {
  test('AC 30: Escape in the textarea leaves it, for the note itself, and writes the text', async () => {
    const { upsert } = await renderApp([a])
    type('a', 'hi')
    fireEvent.keyDown(textareaOf('a'), { key: 'Escape' })

    expect(document.activeElement).not.toBe(textareaOf('a'))
    expect(document.activeElement).toBe(groupOf('a'))
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...a, text: 'hi' })
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })
})

describe('pending text and gestures', () => {
  test('a move while text is pending writes position and text together, once', async () => {
    const { repository, upsert } = await renderApp([a])
    type('a', 'moved')
    dragHeader('a', [150, 110], [200, 140])
    wait(TEXT_DEBOUNCE_MS * 2)

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(await repository.load()).toEqual([{ ...a, x: 150, y: 130, text: 'moved' }])
    expect(textareaOf('a').value).toBe('moved')
  })

  test('a trash delete while text is pending writes nothing, and undo restores the typed text', async () => {
    const { repository, upsert, remove } = await renderApp([a])
    type('a', 'keep me')
    dragHeader('a', [150, 110], OVER_TRASH)
    wait(TEXT_DEBOUNCE_MS * 2)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(upsert).not.toHaveBeenCalled()

    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    expect(textareaOf('a').value).toBe('keep me')
    expect(await repository.load()).toEqual([{ ...a, text: 'keep me' }])
  })

  test.each([
    ['the debounce', () => {
      wait(TEXT_DEBOUNCE_MS)
    }],
    ['a blur', () => {
      textareaOf('a').blur()
    }],
  ])('text written by %s mid-move is not overwritten by the move', async (_, flush) => {
    const { repository, upsert } = await renderApp([a])
    type('a', 'typed')
    const header = groupOf('a').querySelector<HTMLElement>('.note-header')
    if (!header) throw new Error('no header on note a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    flush()
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    fireEvent.pointerUp(header, { clientX: 200, clientY: 140 })

    expect(upsert).toHaveBeenCalledTimes(2)
    expect(await repository.load()).toEqual([{ ...a, x: 150, y: 130, text: 'typed' }])
  })

  test('text written mid-resize is not overwritten by the resize', async () => {
    const { repository } = await renderApp([a])
    type('a', 'typed')
    const handle = screen.getByRole('img', { name: 'Resize note' })
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    wait(TEXT_DEBOUNCE_MS)
    fireEvent.pointerMove(handle, { clientX: 355, clientY: 285 })
    fireEvent.pointerUp(handle, { clientX: 355, clientY: 285 })
    expect(await repository.load()).toEqual([{ ...a, width: 260, height: 190, text: 'typed' }])
  })

  test('text written mid-drag survives a trash delete and its undo', async () => {
    const { repository } = await renderApp([a])
    type('a', 'typed')
    const header = groupOf('a').querySelector<HTMLElement>('.note-header')
    if (!header) throw new Error('no header on note a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    wait(TEXT_DEBOUNCE_MS)
    fireEvent.pointerMove(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    expect(await repository.load()).toEqual([{ ...a, text: 'typed' }])
  })

  test('a text write after a move keeps the moved position', async () => {
    const { repository } = await renderApp([a])
    dragHeader('a', [150, 110], [200, 140])
    type('a', 'after')
    wait(TEXT_DEBOUNCE_MS)
    expect(await repository.load()).toEqual([{ ...a, x: 150, y: 130, text: 'after' }])
  })
})
