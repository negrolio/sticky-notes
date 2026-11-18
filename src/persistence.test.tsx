import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import { STORAGE_KEY } from './localStorageRepository.ts'
import type { Note } from './model.ts'
import { installPointerStubs } from './test/pointer.ts'

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  localStorage.clear()
  installPointerStubs()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(performance.now())
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 1 }
const b: Note = { id: 'b', x: 150, y: 150, width: 200, height: 150, text: 'second', color: '#B3E5FC', z: 2 }

/** Renders the app with its default repository, as a page load does. */
async function load() {
  cleanup()
  render(<App />)
  const main = screen.getByRole('main')
  await waitFor(() => {
    expect(main.getAttribute('aria-busy')).toBe('false')
  })
  return main
}

function groupOf(id: string): HTMLElement {
  const group = screen.queryAllByRole('group').find((g) => g.dataset.noteId === id)
  if (!group) throw new Error(`no note ${id}`)
  return group
}

function partOf(id: string, selector: string): HTMLElement {
  const part = groupOf(id).querySelector<HTMLElement>(selector)
  if (!part) throw new Error(`no ${selector} on note ${id}`)
  return part
}

/** What the board shows for each note, in document order. */
function board() {
  return screen.getAllByRole('group').map((g) => ({
    id: g.dataset.noteId,
    left: g.style.left,
    top: g.style.top,
    width: g.style.width,
    height: g.style.height,
    z: g.style.zIndex,
    color: g.style.backgroundColor,
    text: g.querySelector('textarea')?.value,
  }))
}

function stored(): unknown {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
}

describe('localStorage persistence', () => {
  test('AC 36: created, moved, resized, edited and recolored notes are identical after a reload', async () => {
    const main = await load()
    fireEvent.pointerDown(main, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(main, { clientX: 100, clientY: 100 })
    fireEvent.pointerDown(main, { clientX: 500, clientY: 300 })
    fireEvent.pointerMove(main, { clientX: 700, clientY: 450 })
    fireEvent.pointerUp(main, { clientX: 700, clientY: 450 })
    const [first, second] = screen.getAllByRole('group').map((g) => g.dataset.noteId ?? '')
    if (!first || !second) throw new Error('two notes were not created')

    const header = partOf(first, '.note-header')
    fireEvent.pointerDown(header, { clientX: 110, clientY: 105 })
    fireEvent.pointerMove(header, { clientX: 160, clientY: 135 })
    fireEvent.pointerUp(header, { clientX: 160, clientY: 135 })
    const handle = partOf(second, '.note-resize')
    fireEvent.pointerDown(handle, { clientX: 695, clientY: 445 })
    fireEvent.pointerMove(handle, { clientX: 755, clientY: 485 })
    fireEvent.pointerUp(handle, { clientX: 755, clientY: 485 })
    const textarea = partOf(first, 'textarea')
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'hello' } })
    textarea.blur()
    fireEvent.click(within(groupOf(second)).getByRole('button', { name: 'Change color' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Note color' })).getByRole('button', { name: 'Purple' }))

    const before = board()
    expect(before).toHaveLength(2)
    await load()
    expect(board()).toEqual(before)
  })

  test('AC 32: the z-order after bringing a note to front survives a reload', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([a, b]))
    await load()
    fireEvent.pointerDown(partOf('a', 'textarea'), { clientX: 120, clientY: 200 })
    const before = board()
    expect(before.map((n) => n.id)).toEqual(['b', 'a'])

    await load()
    expect(board()).toEqual(before)
  })

  test('a delete survives a reload', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([a, b]))
    await load()
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    await load()
    expect(board().map((n) => n.id)).toEqual(['b'])
    expect(stored()).toEqual([b])
  })

  test('text typed just before the page goes away is written on page hide', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([a]))
    await load()
    fireEvent.change(partOf('a', 'textarea'), { target: { value: 'last words' } })
    window.dispatchEvent(new Event('pagehide'))
    expect(stored()).toEqual([{ ...a, text: 'last words' }])
  })

  test.each([
    ['invalid JSON', '[{'],
    ['the wrong schema', JSON.stringify([{ id: 1, text: null }])],
  ])('AC 42: %s gives an empty board, one warning and no crash', async (_, raw) => {
    localStorage.setItem(STORAGE_KEY, raw)
    const main = await load()
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(main, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(main, { clientX: 100, clientY: 100 })
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })
})
