import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import { GHOST_MS, SAVE_RETRY_DELAYS_MS, TEXT_DEBOUNCE_MS, type Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
  }))
}

beforeEach(() => {
  installPointerStubs()
  localStorage.clear()
  stubReducedMotion(false)
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

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 3 }
const b: Note = { id: 'b', x: 400, y: 300, width: 120, height: 90, text: 'second', color: '#B3E5FC', z: 5, fontFamily: 'serif' }
const c: Note = { id: 'c', x: 600, y: 100, width: 150, height: 150, text: 'third', color: '#F8BBD0', z: 1, fontSize: 24 }
const ALL_DELETED = 'All notes deleted. Undo (Ctrl+Z)'
const ONE_DELETED = 'Note deleted. Undo (Ctrl+Z)'

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

function noteIds(): string[] {
  return screen.queryAllByRole('group').map((g) => g.dataset.noteId ?? '')
}

function deleteAllButton(): HTMLButtonElement {
  const button = within(screen.getByRole('toolbar', { name: 'Board tools' })).getByRole('button', {
    name: 'Delete all notes',
  })
  if (!(button instanceof HTMLButtonElement)) throw new Error('not a button')
  return button
}

function dialog(): HTMLElement | null {
  return screen.queryByRole('alertdialog')
}

function openDialog(): HTMLElement {
  fireEvent.click(deleteAllButton())
  const open = dialog()
  if (!open) throw new Error('the dialog did not open')
  return open
}

function dialogButton(name: string): HTMLElement {
  const open = dialog()
  if (!open) throw new Error('the dialog is closed')
  return within(open).getByRole('button', { name })
}

function confirm() {
  openDialog()
  fireEvent.click(dialogButton('Delete all'))
}

function undoKey() {
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
}

function ghosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ghost')]
}

describe('the "Delete all notes" button', () => {
  test('it has a matching title tooltip', async () => {
    await renderApp([a])
    expect(deleteAllButton().title).toBe('Delete all notes')
  })

  test('AC 65: it is disabled when the board has no notes, and enabled once there is one', async () => {
    await renderApp([])
    expect(deleteAllButton().disabled).toBe(true)
    const main = screen.getByRole('main')
    fireEvent.pointerDown(main, { clientX: 300, clientY: 300 })
    fireEvent.pointerUp(main, { clientX: 300, clientY: 300 })
    expect(deleteAllButton().disabled).toBe(false)
  })

  test('AC 64: Tab reaches the notes in ascending z, then the toolbar buttons; the grip is skipped', async () => {
    await renderApp([a, b, c])
    expect(document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex^="-"])')).toHaveLength(0)
    // With no positive tabIndex, the sequential focus order is document order. Note children are
    // skipped here: only the note groups and the toolbar's own controls are compared.
    const stops = [...document.querySelectorAll<HTMLElement>('.note, .toolbar button, .toolbar [tabindex]')]
    const toolbarStops = stops.slice(3)
    expect(stops.slice(0, 3).map((el) => el.dataset.noteId)).toEqual(['c', 'a', 'b'])
    // Later moves add toolbar buttons, so only their place after the notes is pinned here.
    expect(toolbarStops[0]?.getAttribute('aria-label')).toBe('Delete all notes')
    expect(toolbarStops.every((el) => el.tagName === 'BUTTON')).toBe(true)
    const grip = screen.getByRole('img', { name: 'Move toolbar' })
    expect(grip.tabIndex).toBe(-1)
    expect(grip.hasAttribute('tabindex')).toBe(false)
  })
})

describe('the confirmation dialog', () => {
  test('AC 66: with 3 notes it is a modal alertdialog with title and count, focus on Cancel', async () => {
    await renderApp([a, b, c])
    const open = openDialog()
    expect(open.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('alertdialog', { name: 'Delete all notes?' })).toBe(open)
    expect(within(open).getByText('This deletes 3 notes. You can undo it.')).toBeTruthy()
    expect(document.activeElement).toBe(dialogButton('Cancel'))
    expect(screen.getByRole('main').contains(open)).toBe(false)
  })

  test('AC 66: with one note the text says "1 note"', async () => {
    await renderApp([a])
    expect(within(openDialog()).getByText('This deletes 1 note. You can undo it.')).toBeTruthy()
  })

  test('AC 67: Tab and Shift+Tab stay inside the dialog', async () => {
    await renderApp([a, b])
    openDialog()
    const cancel = dialogButton('Cancel')
    const deleteAll = dialogButton('Delete all')

    deleteAll.focus()
    const tabFromLast = fireEvent.keyDown(deleteAll, { key: 'Tab' })
    expect(tabFromLast).toBe(false)
    expect(document.activeElement).toBe(cancel)

    const shiftTabFromFirst = fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(shiftTabFromFirst).toBe(false)
    expect(document.activeElement).toBe(deleteAll)
  })

  test('AC 67: focus that escapes the dialog is brought back', async () => {
    await renderApp([a])
    openDialog()
    groupOf('a').focus()
    expect(document.activeElement).toBe(dialogButton('Cancel'))
  })

  test.each([
    ['Escape', () => fireEvent.keyDown(dialogButton('Cancel'), { key: 'Escape' })],
    ['Cancel', () => fireEvent.click(dialogButton('Cancel'))],
    [
      'a click on the backdrop',
      () => {
        const backdrop = document.querySelector('.dialog-backdrop')
        if (!backdrop) throw new Error('no backdrop')
        fireEvent.pointerDown(backdrop)
        fireEvent.click(backdrop)
      },
    ],
  ])('AC 68: %s closes it with nothing deleted and focus on the button', async (_name, close) => {
    const { remove } = await renderApp([a, b, c])
    openDialog()
    close()
    expect(dialog()).toBeNull()
    expect(noteIds()).toHaveLength(3)
    expect(remove).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(deleteAllButton())
  })

  test('a click inside the dialog does not close it', async () => {
    await renderApp([a])
    const open = openDialog()
    fireEvent.click(within(open).getByText('Delete all notes?'))
    expect(dialog()).not.toBeNull()
  })
})

describe('confirming', () => {
  test('AC 69: every note goes, one remove each, and the toast reads "All notes deleted"', async () => {
    const { remove, repository } = await renderApp([a, b, c])
    confirm()
    expect(dialog()).toBeNull()
    expect(noteIds()).toHaveLength(0)
    expect(remove).toHaveBeenCalledTimes(3)
    expect(remove.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'b', 'c'])
    expect(await repository.load()).toEqual([])
    const status = screen.getByRole('status')
    expect(within(status).getByText(ALL_DELETED)).toBeTruthy()
    expect(within(status).queryByText(ONE_DELETED)).toBeNull()
    expect(within(status).getByRole('button', { name: 'Undo' })).toBeTruthy()
    expect(deleteAllButton().disabled).toBe(true)
  })

  test('AC 69: each remove is retried as any write', async () => {
    const stored = createMemoryRepository([a, b])
    let failures = 2
    const flaky: NotesRepository = {
      ...stored,
      remove: (id) => (failures-- > 0 ? Promise.reject(new Error('down')) : stored.remove(id)),
    }
    const { remove } = await renderApp([], flaky)
    vi.useFakeTimers()
    confirm()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0] ?? 0)
    })
    expect(remove).toHaveBeenCalledTimes(4)
    vi.useRealTimers()
    expect(await stored.load()).toEqual([])
  })

  test.each([
    ['the Undo button', () => fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))],
    ['one Ctrl+Z', undoKey],
  ])('AC 70: %s restores every note with the same id, rect, text, color, font and z', async (_name, undo) => {
    const { repository } = await renderApp([a, b, c])
    confirm()
    undo()
    expect(noteIds()).toEqual(['c', 'a', 'b'])
    expect((await repository.load()).sort((p, q) => p.id.localeCompare(q.id))).toEqual([a, b, c])
    expect(groupOf('b').querySelector('textarea')?.style.fontFamily).toContain('Georgia')
    expect(within(screen.getByRole('status')).queryByText(ALL_DELETED)).toBeNull()
  })

  test('AC 71: text typed just before opening the dialog is restored by the undo', async () => {
    const { repository, upsert } = await renderApp([a, b])
    vi.useFakeTimers()
    const textarea = groupOf('a').querySelector('textarea')
    if (!textarea) throw new Error('no textarea')
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'first, edited' } })
    act(() => {
      vi.advanceTimersByTime(TEXT_DEBOUNCE_MS - 100)
    })
    openDialog()
    expect(document.activeElement).not.toBe(textarea)
    fireEvent.click(dialogButton('Delete all'))
    undoKey()
    act(() => {
      vi.advanceTimersByTime(TEXT_DEBOUNCE_MS * 2)
    })
    vi.useRealTimers()
    expect(groupOf('a').querySelector('textarea')?.value).toBe('first, edited')
    expect(upsert).toHaveBeenCalledWith({ ...a, text: 'first, edited' })
    expect((await repository.load()).find((n) => n.id === 'a')?.text).toBe('first, edited')
  })

  test('AC 72: delete A, delete all (B, C), then Ctrl+Z twice restores B and C together, then A', async () => {
    await renderApp([a, b, c])
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    expect(within(screen.getByRole('status')).getByText(ONE_DELETED)).toBeTruthy()
    confirm()
    expect(noteIds()).toHaveLength(0)

    undoKey()
    expect(noteIds().sort()).toEqual(['b', 'c'])
    undoKey()
    expect(noteIds()).toEqual(['c', 'a', 'b'])
  })

  test('a single delete after a delete all shows the single toast text again', async () => {
    await renderApp([a, b])
    confirm()
    undoKey()
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    expect(within(screen.getByRole('status')).getByText(ONE_DELETED)).toBeTruthy()
  })
})

describe('AC 52: delete-all ghosts', () => {
  test('one ghost per note, staggered so the last starts at 250 ms', async () => {
    await renderApp([a, b, c])
    confirm()
    const all = ghosts()
    expect(all).toHaveLength(3)
    expect(all.map((g) => g.style.animationDelay)).toEqual(['0ms', '125ms', '250ms'])
    expect(all[0]?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  test('a staggered ghost is removed once its delay and animation have passed', async () => {
    await renderApp([a, b, c])
    vi.useFakeTimers()
    confirm()
    act(() => {
      vi.advanceTimersByTime(GHOST_MS)
    })
    expect(ghosts()).toHaveLength(2)
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(ghosts()).toHaveLength(0)
  })

  test('undo removes every ghost of the group', async () => {
    await renderApp([a, b, c])
    confirm()
    undoKey()
    expect(ghosts()).toHaveLength(0)
  })

  test('none under reduced motion', async () => {
    stubReducedMotion(true)
    await renderApp([a, b, c])
    confirm()
    expect(ghosts()).toHaveLength(0)
    expect(noteIds()).toHaveLength(0)
  })
})
