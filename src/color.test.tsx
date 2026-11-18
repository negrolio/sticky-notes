import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import { PALETTE, TEXT_DEBOUNCE_MS, type Note } from './model.ts'
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

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#FFF59D', z: 1 }
const b: Note = { id: 'b', x: 400, y: 300, width: 200, height: 150, text: 'second', color: '#B3E5FC', z: 2 }
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
  return { repository, upsert, remove, main }
}

function groupOf(id: string): HTMLElement {
  const group = screen.queryAllByRole('group').find((g) => g.dataset.noteId === id)
  if (!group) throw new Error(`no note ${id}`)
  return group
}

function colorButtonOf(id: string): HTMLElement {
  return within(groupOf(id)).getByRole('button', { name: 'Change color' })
}

/** A full press on the swatch button, as a mouse makes it. */
function pressColorButton(id: string) {
  const button = colorButtonOf(id)
  fireEvent.pointerDown(button)
  fireEvent.pointerUp(button)
  fireEvent.click(button)
}

function popover(): HTMLElement | null {
  return screen.queryByRole('dialog', { name: 'Note color' })
}

function swatch(name: string): HTMLElement {
  const open = popover()
  if (!open) throw new Error('the popover is closed')
  return within(open).getByRole('button', { name })
}

describe('color popover', () => {
  test('AC 33: clicking the swatch button shows the popover with the 5 colors', async () => {
    await renderApp([a])
    expect(popover()).toBeNull()
    expect(colorButtonOf('a').getAttribute('aria-expanded')).toBe('false')
    pressColorButton('a')

    const open = popover()
    expect(open).not.toBeNull()
    expect(colorButtonOf('a').getAttribute('aria-expanded')).toBe('true')
    const swatches = within(open ?? document.body).getAllByRole('button')
    expect(swatches.map((s) => s.getAttribute('aria-label'))).toEqual(PALETTE.map((p) => p.name))
  })

  test('the current color is marked, and takes focus when the popover opens', async () => {
    await renderApp([b])
    pressColorButton('b')
    expect(swatch('Blue').getAttribute('aria-pressed')).toBe('true')
    expect(swatch('Pink').getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(swatch('Blue'))
  })

  test('AC 34: selecting a swatch recolors the note in one write and closes the popover', async () => {
    const { repository, upsert } = await renderApp([a])
    pressColorButton('a')
    fireEvent.click(swatch('Pink'))

    expect(popover()).toBeNull()
    expect(groupOf('a').style.backgroundColor).toBe('rgb(248, 187, 208)')
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({ ...a, color: '#F8BBD0' })
    expect(await repository.load()).toEqual([{ ...a, color: '#F8BBD0' }])
    expect(document.activeElement).toBe(colorButtonOf('a'))
  })

  test('selecting the current color closes the popover and writes nothing', async () => {
    const { upsert } = await renderApp([a])
    pressColorButton('a')
    fireEvent.click(swatch('Yellow'))
    expect(popover()).toBeNull()
    expect(upsert).not.toHaveBeenCalled()
  })

  test('AC 35: Escape closes the popover and leaves the color unchanged', async () => {
    const { upsert } = await renderApp([a])
    pressColorButton('a')
    fireEvent.keyDown(swatch('Pink'), { key: 'Escape' })

    expect(popover()).toBeNull()
    expect(groupOf('a').style.backgroundColor).toBe('rgb(255, 245, 157)')
    expect(upsert).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(colorButtonOf('a'))
  })

  test('AC 35: a click outside closes the popover, changes nothing and creates no note', async () => {
    const { upsert, main } = await renderApp([a])
    pressColorButton('a')
    fireEvent.pointerDown(main, { clientX: 700, clientY: 500 })
    fireEvent.pointerUp(main, { clientX: 700, clientY: 500 })
    fireEvent.click(main)

    expect(popover()).toBeNull()
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(groupOf('a').style.backgroundColor).toBe('rgb(255, 245, 157)')
    expect(upsert).not.toHaveBeenCalled()
  })

  test('decision 11: with the popover open, a press on another note closes it and still raises the note', async () => {
    const { upsert } = await renderApp([b, a])
    pressColorButton('b')
    const textarea = groupOf('a').querySelector('textarea')
    if (!textarea) throw new Error('no textarea on note a')
    fireEvent.pointerDown(textarea, { clientX: 150, clientY: 200 })
    expect(popover()).toBeNull()
    expect(upsert).toHaveBeenCalledWith({ ...a, z: 3 })
  })

  test('with the popover open, a header drag on a note still moves it', async () => {
    const { upsert } = await renderApp([a, b])
    pressColorButton('a')
    const header = groupOf('b').querySelector<HTMLElement>('.note-header')
    if (!header) throw new Error('no header on note b')
    fireEvent.pointerDown(header, { clientX: 450, clientY: 305 })
    fireEvent.pointerMove(header, { clientX: 500, clientY: 335 })
    fireEvent.pointerUp(header, { clientX: 500, clientY: 335 })
    expect(popover()).toBeNull()
    // Opening a's popover raised a to z 3, so the drag raises b above it.
    expect(upsert).toHaveBeenLastCalledWith({ ...b, x: 450, y: 330, z: 4 })
  })

  test('Escape with focus outside the popover closes it without moving focus', async () => {
    await renderApp([a, b])
    pressColorButton('a')
    groupOf('b').focus()
    fireEvent.keyDown(groupOf('b'), { key: 'Escape' })
    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(groupOf('b'))
  })

  test('a window resize closes the popover, which would no longer sit by its note', async () => {
    await renderApp([a])
    pressColorButton('a')
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(popover()).toBeNull()
  })

  test('a click inside the popover, between swatches, keeps it open', async () => {
    await renderApp([a])
    pressColorButton('a')
    const open = popover()
    if (!open) throw new Error('the popover is closed')
    fireEvent.pointerDown(open)
    expect(popover()).not.toBeNull()
  })

  test('pressing the swatch button again closes the popover', async () => {
    await renderApp([a])
    pressColorButton('a')
    pressColorButton('a')
    expect(popover()).toBeNull()
  })

  test('the swatch button of another note switches the popover to that note', async () => {
    const { upsert } = await renderApp([a, b])
    pressColorButton('a')
    pressColorButton('b')
    fireEvent.click(swatch('Green'))
    expect(upsert).toHaveBeenLastCalledWith({ ...b, color: '#C5E1A5', z: 4 })
    expect(groupOf('a').style.backgroundColor).toBe('rgb(255, 245, 157)')
  })

  test('a drag that starts on the swatch button does not move the note', async () => {
    const { upsert } = await renderApp([a])
    const button = colorButtonOf('a')
    fireEvent.pointerDown(button, { clientX: 290, clientY: 110 })
    fireEvent.pointerMove(button, { clientX: 400, clientY: 300 })
    fireEvent.pointerUp(button, { clientX: 400, clientY: 300 })
    expect(groupOf('a').style.left).toBe('100px')
    expect(upsert).not.toHaveBeenCalled()
  })

  test('decision 11: pressing the swatch button of a lower note raises it', async () => {
    const { upsert } = await renderApp([a, b])
    pressColorButton('a')
    expect(upsert).toHaveBeenCalledWith({ ...a, z: 3 })
    expect(popover()).not.toBeNull()
  })

  test('text typed before a recolor is kept', async () => {
    const { repository } = await renderApp([a])
    vi.useFakeTimers()
    const textarea = groupOf('a').querySelector('textarea')
    if (!textarea) throw new Error('no textarea on note a')
    fireEvent.change(textarea, { target: { value: 'typed' } })
    pressColorButton('a')
    fireEvent.click(swatch('Purple'))
    act(() => {
      vi.advanceTimersByTime(TEXT_DEBOUNCE_MS)
    })
    expect(await repository.load()).toEqual([{ ...a, text: 'typed', color: '#D1C4E9' }])
  })

  test('the popover closes when its note is deleted', async () => {
    await renderApp([a, b])
    pressColorButton('a')
    const header = groupOf('a').querySelector<HTMLElement>('.note-header')
    if (!header) throw new Error('no header on note a')
    fireEvent.pointerDown(header, { clientX: 150, clientY: 105 })
    fireEvent.pointerMove(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
    expect(popover()).toBeNull()
  })
})

describe('layering and accessibility', () => {
  test('AC 45: trash zone, toast and popover render after the board, above a note at the highest z', async () => {
    const { main } = await renderApp([{ ...a, z: 1_000_000 }, b])
    groupOf('b').focus()
    fireEvent.keyDown(groupOf('b'), { key: 'Delete' })
    pressColorButton('a')

    const layers = [screen.getByRole('img', { name: 'Trash' }), screen.getByRole('status'), popover()]
    for (const layer of layers) {
      if (!layer) throw new Error('a layer is missing')
      expect(main.contains(layer)).toBe(false)
      expect(main.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  test('AC 47: trash zone, resize handle and color button have aria-labels; each note is a named group', async () => {
    await renderApp([a, b])
    expect(screen.getByRole('img', { name: 'Trash' })).toBeTruthy()
    const groups = screen.getAllByRole('group', { name: 'Sticky note' })
    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect(within(group).getByRole('img', { name: 'Resize note' })).toBeTruthy()
      expect(within(group).getByRole('button', { name: 'Change color' })).toBeTruthy()
    }
  })
})
