import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

// Three overlapping notes. `low` sits under the others; `top` is above both.
const low: Note = { id: 'low', x: 100, y: 100, width: 200, height: 150, text: 'low', color: '#C5E1A5', z: 2 }
const mid: Note = { id: 'mid', x: 150, y: 150, width: 200, height: 150, text: 'mid', color: '#B3E5FC', z: 5 }
const top: Note = { id: 'top', x: 200, y: 200, width: 200, height: 150, text: 'top', color: '#F8BBD0', z: 7 }
// jsdom's default viewport is 1024x768, so the trash zone spans x 928..1024 and y 672..768.
const OVER_TRASH: [number, number] = [1000, 740]

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
  return { repository, upsert, remove }
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

function zOf(id: string): number {
  return Number(groupOf(id).style.zIndex)
}

function noteOrder(): string[] {
  return screen.getAllByRole('group').map((g) => g.dataset.noteId ?? '')
}

describe('bring to front', () => {
  test('AC 31: pointer down on a lower note\'s text raises it above every other note, in one write', async () => {
    const { repository, upsert } = await renderApp([low, mid, top])
    fireEvent.pointerDown(partOf('low', 'textarea'), { clientX: 120, clientY: 200 })

    expect(zOf('low')).toBeGreaterThan(zOf('mid'))
    expect(zOf('low')).toBeGreaterThan(zOf('top'))
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...low, z: 8 })
    expect(await repository.load()).toEqual(expect.arrayContaining([{ ...low, z: 8 }, mid, top]))
  })

  test('pointer down on the top note writes nothing', async () => {
    const { upsert } = await renderApp([low, mid, top])
    fireEvent.pointerDown(partOf('top', 'textarea'), { clientX: 300, clientY: 300 })
    fireEvent.pointerDown(partOf('top', '.note-header'), { clientX: 300, clientY: 205 })
    fireEvent.pointerUp(partOf('top', '.note-header'), { clientX: 300, clientY: 205 })
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a note tied with another for the highest z is raised above it', async () => {
    const { upsert } = await renderApp([low, { ...mid, z: 7 }, top])
    fireEvent.pointerDown(partOf('top', 'textarea'), { clientX: 300, clientY: 300 })
    expect(upsert).toHaveBeenCalledWith({ ...top, z: 8 })
  })

  test('a header press raises the note at once, without a write until release', async () => {
    const { upsert } = await renderApp([low, mid, top])
    const header = partOf('low', '.note-header')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    expect(zOf('low')).toBeGreaterThan(zOf('top'))
    expect(upsert).not.toHaveBeenCalled()

    fireEvent.pointerUp(header, { clientX: 150, clientY: 110 })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...low, z: 8 })
  })

  test('AC 39: moving a lower note writes once, with its new position and z', async () => {
    const { upsert } = await renderApp([low, mid, top])
    const header = partOf('low', '.note-header')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    fireEvent.pointerUp(header, { clientX: 200, clientY: 140 })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...low, x: 150, y: 130, z: 8 })
  })

  test('resizing a lower note writes once, with its new size and z', async () => {
    const { upsert } = await renderApp([low, mid, top])
    const handle = partOf('low', '.note-resize')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    fireEvent.pointerMove(handle, { clientX: 355, clientY: 285 })
    fireEvent.pointerUp(handle, { clientX: 355, clientY: 285 })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...low, width: 260, height: 190, z: 8 })
  })

  test('decision 16: Escape mid-move puts the note back at its z and writes nothing', async () => {
    const { upsert } = await renderApp([low, mid, top])
    const header = partOf('low', '.note-header')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(zOf('low')).toBe(2)
    expect(upsert).not.toHaveBeenCalled()
  })

  test('decision 16: pointercancel mid-move and Escape mid-resize put the note back at its z', async () => {
    const { upsert } = await renderApp([low, mid, top])
    const header = partOf('low', '.note-header')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    fireEvent(header, new PointerEvent('pointercancel', { pointerId: 1 }))
    expect(zOf('low')).toBe(2)

    const handle = partOf('low', '.note-resize')
    fireEvent.pointerDown(handle, { clientX: 295, clientY: 245 })
    expect(zOf('low')).toBe(8)
    fireEvent.pointerMove(handle, { clientX: 355, clientY: 285 })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(zOf('low')).toBe(2)
    expect(upsert).not.toHaveBeenCalled()
  })

  test('a note restored by Ctrl+Z mid-move does not end up above the moved note', async () => {
    const { upsert } = await renderApp([low, mid, top])
    groupOf('top').focus()
    fireEvent.keyDown(groupOf('top'), { key: 'Delete' })
    const header = partOf('low', '.note-header')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    fireEvent.pointerMove(header, { clientX: 200, clientY: 140 })
    fireEvent.pointerUp(header, { clientX: 200, clientY: 140 })

    expect(upsert).toHaveBeenLastCalledWith({ ...low, x: 150, y: 130, z: 8 })
    expect(zOf('low')).toBeGreaterThan(zOf('top'))
  })

  test('a lower note dropped on the trash is restored by undo at its old z', async () => {
    const { upsert } = await renderApp([low, mid, top])
    const header = partOf('low', '.note-header')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerMove(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(low)
  })

  test('AC 46: a raised note moves to the end of the Tab order', async () => {
    await renderApp([low, mid, top])
    expect(noteOrder()).toEqual(['low', 'mid', 'top'])
    fireEvent.pointerDown(partOf('low', 'textarea'), { clientX: 120, clientY: 200 })
    expect(noteOrder()).toEqual(['mid', 'top', 'low'])
  })
})

describe('focus across a raise', () => {
  test('a focused textarea keeps focus when its note is raised', async () => {
    await renderApp([low, mid, top])
    const textarea = partOf('low', 'textarea')
    textarea.focus()
    fireEvent.pointerDown(textarea, { clientX: 120, clientY: 200 })
    expect(noteOrder().slice(-1)).toEqual(['low'])
    expect(document.activeElement).toBe(partOf('low', 'textarea'))
  })

  test('a focused note keeps focus when a header click raises it', async () => {
    await renderApp([low, mid, top])
    groupOf('low').focus()
    const header = partOf('low', '.note-header')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    fireEvent.pointerUp(header, { clientX: 150, clientY: 110 })
    expect(noteOrder().slice(-1)).toEqual(['low'])
    expect(document.activeElement).toBe(groupOf('low'))
  })
})
