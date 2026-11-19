import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import { createLocalStorageRepository, parseNotes, STORAGE_KEY } from './localStorageRepository.ts'
import { FONT_FAMILIES, FONT_SIZES, TEXT_DEBOUNCE_MS, type Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { createRestMockRepository, REST_STORAGE_KEY } from './restMockRepository.ts'
import { installPointerStubs } from './test/pointer.ts'

beforeEach(() => {
  installPointerStubs()
  localStorage.clear()
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
/** A font stack as the CSSOM serializes it, with double-quoted family names. */
function serialized(stack: string | undefined): string {
  return (stack ?? '').replace(/'/g, '"')
}
const SANS = 'system-ui, sans-serif'
const SERIF = serialized("Georgia, 'Times New Roman', serif")

async function renderApp(initial: readonly Note[], stored: NotesRepository = createMemoryRepository(initial)) {
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

function fontButtonOf(id: string): HTMLElement {
  return within(groupOf(id)).getByRole('button', { name: 'Change font' })
}

function colorButtonOf(id: string): HTMLElement {
  return within(groupOf(id)).getByRole('button', { name: 'Change color' })
}

/** A full press, as a mouse makes it. */
function press(button: HTMLElement) {
  fireEvent.pointerDown(button)
  fireEvent.pointerUp(button)
  fireEvent.click(button)
}

function fontPopover(): HTMLElement | null {
  return screen.queryByRole('dialog', { name: 'Note font' })
}

function colorPopover(): HTMLElement | null {
  return screen.queryByRole('dialog', { name: 'Note color' })
}

function choice(name: string): HTMLElement {
  const open = fontPopover()
  if (!open) throw new Error('the font popover is closed')
  return within(open).getByRole('button', { name })
}

function pressed(): string[] {
  const open = fontPopover()
  if (!open) throw new Error('the font popover is closed')
  return within(open)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.getAttribute('aria-label') ?? '')
}

describe('font popover', () => {
  test('AC 80: "Change font" shows "Aa" and opens the popover with 4 families and 3 sizes, the current ones pressed', async () => {
    await renderApp([a])
    const button = fontButtonOf('a')
    expect(button.textContent).toBe('Aa')
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(fontPopover()).toBeNull()

    press(button)
    const open = fontPopover()
    if (!open) throw new Error('the font popover did not open')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(within(open).getAllByRole('button').map((c) => c.getAttribute('aria-label'))).toEqual([
      ...FONT_FAMILIES.map((f) => f.name),
      ...FONT_SIZES.map((s) => s.name),
    ])
    expect(FONT_FAMILIES.map((f) => f.name)).toEqual(['Sans', 'Serif', 'Mono', 'Hand'])
    expect(FONT_SIZES.map((s) => s.name)).toEqual(['Small', 'Medium', 'Large'])
    expect(pressed()).toEqual(['Sans', 'Small'])
    // The popover is rendered outside the board, like the color popover.
    expect(screen.getByRole('main').contains(open)).toBe(false)
  })

  test('AC 80: each family label is shown in its own font', async () => {
    await renderApp([a])
    press(fontButtonOf('a'))
    for (const family of FONT_FAMILIES) expect(choice(family.name).style.fontFamily).toBe(serialized(family.stack))
  })

  test('AC 80: a stored font is the one pressed', async () => {
    await renderApp([{ ...a, fontFamily: 'mono', fontSize: 24 }])
    press(fontButtonOf('a'))
    expect(pressed()).toEqual(['Mono', 'Large'])
  })

  test('AC 81: Serif then Large applies at once, one write per choice, and the popover stays open', async () => {
    const { repository, upsert } = await renderApp([a])
    press(fontButtonOf('a'))

    fireEvent.click(choice('Serif'))
    expect(textareaOf('a').style.fontFamily).toBe(SERIF)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenLastCalledWith({ ...a, fontFamily: 'serif' })
    expect(fontPopover()).not.toBeNull()
    expect(pressed()).toEqual(['Serif', 'Small'])

    fireEvent.click(choice('Large'))
    expect(textareaOf('a').style.fontSize).toBe('24px')
    expect(textareaOf('a').style.fontFamily).toBe(SERIF)
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert).toHaveBeenLastCalledWith({ ...a, fontFamily: 'serif', fontSize: 24 })
    expect(fontPopover()).not.toBeNull()
    expect(pressed()).toEqual(['Serif', 'Large'])
    expect(await repository.load()).toEqual([{ ...a, fontFamily: 'serif', fontSize: 24 }])
  })

  test('AC 81: a choice writes only the field it sets', async () => {
    const { upsert } = await renderApp([a])
    press(fontButtonOf('a'))
    fireEvent.click(choice('Medium'))
    const written = upsert.mock.calls[0]?.[0]
    expect(written?.fontSize).toBe(18)
    expect(written && 'fontFamily' in written).toBe(false)
  })

  test('AC 81: every choice is one write, even of the value already stored', async () => {
    const { upsert } = await renderApp([{ ...a, fontFamily: 'serif' }])
    press(fontButtonOf('a'))
    fireEvent.click(choice('Serif'))
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenLastCalledWith({ ...a, fontFamily: 'serif' })
  })

  test('decision 26: a choice carries the pending text', async () => {
    const { upsert } = await renderApp([a])
    vi.useFakeTimers()
    const textarea = textareaOf('a')
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'typed' } })
    press(fontButtonOf('a'))
    fireEvent.click(choice('Mono'))
    act(() => {
      vi.advanceTimersByTime(TEXT_DEBOUNCE_MS * 2)
    })
    const last = upsert.mock.calls[upsert.mock.calls.length - 1]?.[0]
    expect(last).toEqual({ ...a, text: 'typed', fontFamily: 'mono' })
    expect(upsert.mock.calls.every(([n]) => n.text === 'typed')).toBe(true)
  })

  test.each([
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['a click outside', () => fireEvent.pointerDown(screen.getByRole('main'))],
  ])('decision 26: %s closes it, like the color popover', async (_name, close) => {
    const { upsert } = await renderApp([a])
    press(fontButtonOf('a'))
    close()
    expect(fontPopover()).toBeNull()
    expect(fontButtonOf('a').getAttribute('aria-expanded')).toBe('false')
    expect(upsert).not.toHaveBeenCalled()
  })

  test('focus starts on the current family, and Escape from inside returns it to the button', async () => {
    await renderApp([{ ...a, fontFamily: 'hand' }])
    press(fontButtonOf('a'))
    expect(document.activeElement).toBe(choice('Hand'))
    fireEvent.keyDown(choice('Hand'), { key: 'Escape' })
    expect(fontPopover()).toBeNull()
    expect(document.activeElement).toBe(fontButtonOf('a'))
  })

  test('pressing "Change font" again closes it', async () => {
    await renderApp([a])
    press(fontButtonOf('a'))
    press(fontButtonOf('a'))
    expect(fontPopover()).toBeNull()
  })

  test('a click on the board while it is open only closes it', async () => {
    const { upsert } = await renderApp([a])
    press(fontButtonOf('a'))
    const main = screen.getByRole('main')
    fireEvent.pointerDown(main, { clientX: 600, clientY: 100 })
    fireEvent.pointerUp(main, { clientX: 600, clientY: 100 })
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('one popover at a time', () => {
  test('AC 84: opening the font popover while the color popover is open leaves only the font one', async () => {
    await renderApp([a, b])
    press(colorButtonOf('a'))
    expect(colorPopover()).not.toBeNull()
    press(fontButtonOf('a'))
    expect(colorPopover()).toBeNull()
    expect(fontPopover()).not.toBeNull()
    expect(colorButtonOf('a').getAttribute('aria-expanded')).toBe('false')
  })

  test('AC 84: opening the color popover while the font popover is open leaves only the color one', async () => {
    await renderApp([a, b])
    press(fontButtonOf('a'))
    press(colorButtonOf('b'))
    expect(fontPopover()).toBeNull()
    expect(colorPopover()).not.toBeNull()
    expect(fontButtonOf('a').getAttribute('aria-expanded')).toBe('false')
  })

  test('the font popover of one note replaces that of another', async () => {
    await renderApp([a, b])
    press(fontButtonOf('a'))
    press(fontButtonOf('b'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(fontButtonOf('b').getAttribute('aria-expanded')).toBe('true')
  })
})

describe('default font', () => {
  test('AC 82: create, move and edit without choosing a font store no font field and show Sans 14 px', async () => {
    const { repository } = await renderApp([])
    vi.useFakeTimers()
    const main = screen.getByRole('main')
    fireEvent.pointerDown(main, { clientX: 300, clientY: 300 })
    fireEvent.pointerUp(main, { clientX: 300, clientY: 300 })
    const group = screen.getByRole('group')
    const id = group.dataset.noteId ?? ''
    fireEvent.change(textareaOf(id), { target: { value: 'hello' } })
    act(() => {
      vi.advanceTimersByTime(TEXT_DEBOUNCE_MS)
    })
    const header = group.querySelector('.note-header')
    if (!(header instanceof HTMLElement)) throw new Error('no header')
    fireEvent.pointerDown(header, { clientX: 310, clientY: 305 })
    fireEvent.pointerMove(header, { clientX: 360, clientY: 335 })
    fireEvent.pointerUp(header, { clientX: 360, clientY: 335 })
    vi.useRealTimers()

    const [stored] = await repository.load()
    if (!stored) throw new Error('nothing stored')
    expect(stored.text).toBe('hello')
    expect(stored.x).toBe(350)
    expect('fontFamily' in stored).toBe(false)
    expect('fontSize' in stored).toBe(false)
    expect(textareaOf(id).style.fontFamily).toBe(SANS)
    expect(textareaOf(id).style.fontSize).toBe('14px')
  })

  test('AC 82: a stored note without font fields keeps that shape through localStorage', async () => {
    const repository = createLocalStorageRepository()
    await repository.upsert(a)
    await repository.upsert({ ...a, x: 150 })
    const raw = localStorage.getItem(STORAGE_KEY) ?? ''
    expect(raw).not.toContain('fontFamily')
    expect(raw).not.toContain('fontSize')
  })
})

describe('persistence', () => {
  test('AC 83: a chosen font survives a reload with localStorage', async () => {
    await renderApp([], createLocalStorageRepository())
    cleanup()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([a]))
    await renderApp([], createLocalStorageRepository())
    press(fontButtonOf('a'))
    fireEvent.click(choice('Hand'))
    fireEvent.click(choice('Medium'))
    cleanup()

    await renderApp([], createLocalStorageRepository())
    expect(textareaOf('a').style.fontFamily).toBe(serialized(FONT_FAMILIES[3]?.stack))
    expect(textareaOf('a').style.fontSize).toBe('18px')
    expect(parseNotes(localStorage.getItem(STORAGE_KEY) ?? '')).toEqual([{ ...a, fontFamily: 'hand', fontSize: 18 }])
  })

  test('AC 83: a chosen font survives a reload with the REST mock', async () => {
    localStorage.setItem(REST_STORAGE_KEY, JSON.stringify([a]))
    const fast = () => createRestMockRepository({ random: () => 0 })
    const first = await renderApp([], fast())
    press(fontButtonOf('a'))
    fireEvent.click(choice('Serif'))
    fireEvent.click(choice('Large'))
    await waitFor(
      () => {
        expect(parseNotes(localStorage.getItem(REST_STORAGE_KEY) ?? '')).toEqual([
          { ...a, fontFamily: 'serif', fontSize: 24 },
        ])
      },
      { timeout: 2_000 },
    )
    expect(first.upsert).toHaveBeenCalledTimes(2)
    cleanup()

    await renderApp([], fast())
    await waitFor(() => {
      expect(textareaOf('a').style.fontFamily).toBe(SERIF)
    })
    expect(textareaOf('a').style.fontSize).toBe('24px')
  })

  test('undo restores the font fields', async () => {
    const { upsert } = await renderApp([{ ...a, fontFamily: 'mono', fontSize: 18 }])
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    expect(upsert).toHaveBeenLastCalledWith({ ...a, fontFamily: 'mono', fontSize: 18 })
    expect(textareaOf('a').style.fontSize).toBe('18px')
  })
})

describe('validation', () => {
  test.each([
    ['fontFamily', 'comic'],
    ['fontFamily', null],
    ['fontFamily', ''],
    ['fontSize', 16],
    ['fontSize', '14'],
    ['fontSize', null],
  ])('AC 85: a stored %s of %j is invalid data: empty board, one warning, no crash', async (field, value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...a, [field]: value }]))
    await renderApp([], createLocalStorageRepository())
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  test('AC 85: valid font fields are accepted, and absent ones stay absent', () => {
    expect(parseNotes(JSON.stringify([{ ...a, fontFamily: 'serif', fontSize: 18 }, b]))).toEqual([
      { ...a, fontFamily: 'serif', fontSize: 18 },
      b,
    ])
    const [plain] = parseNotes(JSON.stringify([a])) ?? []
    expect(plain && 'fontFamily' in plain).toBe(false)
    expect(plain && 'fontSize' in plain).toBe(false)
  })
})
