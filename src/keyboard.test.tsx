import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App.tsx'
import type { Note } from './model.ts'
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
  vi.unstubAllGlobals()
})

// Stored out of z order, so the Tab order cannot come from the load order.
const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 3 }
const b: Note = { id: 'b', x: 400, y: 300, width: 120, height: 90, text: 'second', color: '#B3E5FC', z: 5 }
const c: Note = { id: 'c', x: 600, y: 100, width: 150, height: 150, text: 'third', color: '#F8BBD0', z: 1 }
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

/**
 * jsdom does not move focus on Tab. With no positive tabIndex anywhere, the browser's sequential
 * focus order is document order among elements with tabIndex >= 0, so that is what is read here.
 */
function noteTabOrder(): string[] {
  expect(document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex^="-"])')).toHaveLength(0)
  return screen
    .getAllByRole('group')
    .filter((g) => g.tabIndex === 0)
    .map((g) => g.dataset.noteId ?? '')
}

function toastShown(): boolean {
  return screen.queryByText(MESSAGE) !== null
}

describe('focus order', () => {
  test('decision 18: a note is focusable and keeps its accessible name', async () => {
    await renderApp([a])
    const group = screen.getByRole('group', { name: 'Sticky note' })
    group.focus()
    expect(document.activeElement).toBe(group)
  })

  test('AC 46: Tab reaches the notes in ascending z', async () => {
    await renderApp([a, b, c])
    expect(noteTabOrder()).toEqual(['c', 'a', 'b'])
  })

  test('AC 46: a created note comes last, a restored note goes back to its z place', async () => {
    const { main } = await renderApp([a, b, c])
    fireEvent.pointerDown(main, { clientX: 800, clientY: 400 })
    fireEvent.pointerUp(main, { clientX: 800, clientY: 400 })
    const created = noteTabOrder().find((id) => !['a', 'b', 'c'].includes(id))
    expect(noteTabOrder()).toEqual(['c', 'a', 'b', created])

    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(noteTabOrder()).toEqual(['c', 'a', 'b', created])
  })
})

describe('keyboard delete', () => {
  test.each(['Delete', 'Backspace'])(
    'AC 26: %s on a focused note deletes it with one repository remove and shows the toast',
    async (key) => {
      const { repository, remove, upsert } = await renderApp([a, b])
      groupOf('a').focus()
      const notPrevented = fireEvent.keyDown(groupOf('a'), { key })

      expect(notPrevented).toBe(false)
      expect(screen.getAllByRole('group').map((g) => g.dataset.noteId)).toEqual(['b'])
      expect(remove).toHaveBeenCalledTimes(1)
      expect(remove).toHaveBeenCalledWith('a')
      expect(upsert).not.toHaveBeenCalled()
      expect(await repository.load()).toEqual([b])
      expect(toastShown()).toBe(true)
    },
  )

  test.each(['Delete', 'Backspace'])('%s in the textarea is left to the browser', async (key) => {
    const { remove } = await renderApp([a])
    const textarea = textareaOf('a')
    textarea.focus()
    const notPrevented = fireEvent.keyDown(textarea, { key })

    expect(notPrevented).toBe(true)
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(remove).not.toHaveBeenCalled()
    expect(toastShown()).toBe(false)
  })

  test('other keys on a focused note delete nothing', async () => {
    const { remove } = await renderApp([a])
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'x' })
    fireEvent.keyDown(groupOf('a'), { key: 'Enter' })
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  test('Ctrl+Z with focus on a note restores the note deleted from the keyboard', async () => {
    const { upsert } = await renderApp([a, b])
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    groupOf('b').focus()
    const notPrevented = fireEvent.keyDown(groupOf('b'), { key: 'z', ctrlKey: true })

    expect(notPrevented).toBe(false)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(a)
    expect(groupOf('a')).toBeDefined()
    expect(toastShown()).toBe(false)
  })
})

describe('focus after a keyboard delete', () => {
  test('goes to the next note in Tab order', async () => {
    await renderApp([a, b, c])
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    expect(document.activeElement).toBe(groupOf('b'))
  })

  test('goes to the previous note when the deleted note was last', async () => {
    await renderApp([a, b, c])
    groupOf('b').focus()
    fireEvent.keyDown(groupOf('b'), { key: 'Backspace' })
    expect(document.activeElement).toBe(groupOf('a'))
  })

  test('goes to the body when no note is left', async () => {
    await renderApp([a])
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(document.activeElement).toBe(document.body)
  })

  test('repeated Delete keeps deleting in Tab order, one remove each', async () => {
    const { remove } = await renderApp([a, b, c])
    groupOf('c').focus()
    for (let i = 0; i < 3; i++) {
      const focused = document.activeElement
      if (!(focused instanceof HTMLElement)) throw new Error('nothing focused')
      fireEvent.keyDown(focused, { key: 'Delete' })
    }
    expect(remove.mock.calls).toEqual([['c'], ['a'], ['b']])
    expect(screen.queryAllByRole('group')).toHaveLength(0)
  })
})
