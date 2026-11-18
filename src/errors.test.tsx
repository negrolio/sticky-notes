import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import { createRepository, parseBackend } from './backend.ts'
import { MOCK_LATENCY_MS, SAVE_RETRY_DELAYS_MS, type Note } from './model.ts'
import { REST_STORAGE_KEY } from './restMockRepository.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

beforeEach(() => {
  installPointerStubs()
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
  vi.restoreAllMocks()
})

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 1 }
const b: Note = { id: 'b', x: 500, y: 300, width: 200, height: 150, text: 'second', color: '#B3E5FC', z: 2 }
const RETRYING = "Couldn't save changes. Retrying…"
const NOT_SAVED = 'Not saved'

/** A memory repository whose writes and loads fail while the matching flag is set. */
function failingRepository(initial: readonly Note[]) {
  const stored = createMemoryRepository(initial)
  const failing = { saves: false, load: false }
  const down = () => Promise.reject(new Error('backend down'))
  const upsert = vi.fn((n: Note) => (failing.saves ? down() : stored.upsert(n)))
  const remove = vi.fn((id: string) => (failing.saves ? down() : stored.remove(id)))
  const load = vi.fn(() => (failing.load ? down() : stored.load()))
  const repository: NotesRepository = { load, upsert, remove }
  return { repository, stored, failing, upsert, remove, load }
}

/** Renders and waits for the load with real timers, then switches to fake ones. */
async function renderApp(setup: ReturnType<typeof failingRepository>) {
  render(<App repository={setup.repository} />)
  const main = screen.getByRole('main')
  await waitFor(() => {
    expect(main.getAttribute('aria-busy')).toBe('false')
  })
  vi.useFakeTimers()
  return main
}

function groupOf(id: string): HTMLElement {
  const group = screen.queryAllByRole('group').find((g) => g.dataset.noteId === id)
  if (!group) throw new Error(`no note ${id}`)
  return group
}

function moveNote(id: string, by: [number, number]) {
  const header = groupOf(id).querySelector<HTMLElement>('.note-header')
  if (!header) throw new Error(`no header on note ${id}`)
  const rect = header.getBoundingClientRect()
  const start = { clientX: rect.left + 5, clientY: rect.top + 5 }
  fireEvent.pointerDown(header, start)
  fireEvent.pointerMove(header, { clientX: start.clientX + by[0], clientY: start.clientY + by[1] })
  fireEvent.pointerUp(header, { clientX: start.clientX + by[0], clientY: start.clientY + by[1] })
}

/** Lets rejected promises settle, then advances fake time. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function shown(text: string): boolean {
  return within(screen.getByRole('status')).queryByText(text) !== null
}

describe('AC 40: save errors', () => {
  test('a failed save shows the toast, retries 3 times at +1 s, +2 s and +4 s, then shows "Not saved"', async () => {
    const setup = failingRepository([a])
    await renderApp(setup)
    setup.failing.saves = true
    moveNote('a', [50, 30])
    await wait(0)
    expect(setup.upsert).toHaveBeenCalledTimes(1)
    expect(shown(RETRYING)).toBe(true)
    expect(shown(NOT_SAVED)).toBe(false)

    const [first, second, third] = SAVE_RETRY_DELAYS_MS
    if (first === undefined || second === undefined || third === undefined) throw new Error('3 delays expected')
    await wait(first - 1)
    expect(setup.upsert).toHaveBeenCalledTimes(1)
    await wait(1)
    expect(setup.upsert).toHaveBeenCalledTimes(2)
    await wait(second - 1)
    expect(setup.upsert).toHaveBeenCalledTimes(2)
    await wait(1)
    expect(setup.upsert).toHaveBeenCalledTimes(3)
    await wait(third - 1)
    expect(setup.upsert).toHaveBeenCalledTimes(3)
    expect(shown(RETRYING)).toBe(true)
    await wait(1)
    expect(setup.upsert).toHaveBeenCalledTimes(4)

    expect(shown(RETRYING)).toBe(false)
    expect(shown(NOT_SAVED)).toBe(true)
    // Local state is kept.
    expect(groupOf('a').style.left).toBe('150px')
    await wait(60_000)
    expect(setup.upsert).toHaveBeenCalledTimes(4)
    expect(shown(NOT_SAVED)).toBe(true)
  })

  test('every retry sends the same note', async () => {
    const setup = failingRepository([a])
    await renderApp(setup)
    setup.failing.saves = true
    moveNote('a', [50, 30])
    await wait(10_000)
    expect(setup.upsert.mock.calls).toEqual(Array.from({ length: 4 }, () => [{ ...a, x: 150, y: 130 }]))
  })

  test('a retry that succeeds hides the toast and stores the note, with no "Not saved"', async () => {
    const setup = failingRepository([a])
    await renderApp(setup)
    setup.failing.saves = true
    moveNote('a', [50, 30])
    await wait(0)
    setup.failing.saves = false
    await wait(SAVE_RETRY_DELAYS_MS[0] ?? 0)

    expect(shown(RETRYING)).toBe(false)
    expect(shown(NOT_SAVED)).toBe(false)
    expect(await setup.stored.load()).toEqual([{ ...a, x: 150, y: 130 }])
    await wait(10_000)
    expect(setup.upsert).toHaveBeenCalledTimes(2)
  })

  test('a newer write of the same note replaces a pending retry, so the old data is never sent again', async () => {
    const setup = failingRepository([a])
    await renderApp(setup)
    setup.failing.saves = true
    moveNote('a', [50, 30])
    await wait(0)
    setup.failing.saves = false
    moveNote('a', [100, 0])
    await wait(10_000)

    expect(setup.upsert).toHaveBeenCalledTimes(2)
    expect(await setup.stored.load()).toEqual([{ ...a, x: 250, y: 130 }])
    expect(shown(RETRYING)).toBe(false)
  })

  test('a failing delete retries too, and the deleted note stays deleted locally', async () => {
    const setup = failingRepository([a, b])
    await renderApp(setup)
    setup.failing.saves = true
    groupOf('a').focus()
    fireEvent.keyDown(groupOf('a'), { key: 'Delete' })
    await wait(10_000)

    expect(setup.remove).toHaveBeenCalledTimes(4)
    expect(screen.getAllByRole('group').map((g) => g.dataset.noteId)).toEqual(['b'])
    expect(shown(NOT_SAVED)).toBe(true)
  })

  test('"Not saved" goes once a later write of that note succeeds', async () => {
    const setup = failingRepository([a])
    await renderApp(setup)
    setup.failing.saves = true
    moveNote('a', [50, 30])
    await wait(10_000)
    expect(shown(NOT_SAVED)).toBe(true)

    setup.failing.saves = false
    moveNote('a', [10, 10])
    await wait(0)
    expect(shown(NOT_SAVED)).toBe(false)
    expect(await setup.stored.load()).toEqual([{ ...a, x: 160, y: 140 }])
  })

  test('"Not saved" stays while another note is still unsaved', async () => {
    const setup = failingRepository([a, b])
    await renderApp(setup)
    setup.failing.saves = true
    moveNote('a', [50, 30])
    moveNote('b', [50, 30])
    await wait(10_000)
    setup.failing.saves = false
    moveNote('a', [10, 10])
    await wait(0)
    expect(shown(NOT_SAVED)).toBe(true)
  })

  test('a write still in flight when the app unmounts is not retried', async () => {
    const setup = failingRepository([a])
    await renderApp(setup)
    let reject: (error: Error) => void = () => {}
    setup.upsert.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail
        }),
    )
    moveNote('a', [50, 30])
    cleanup()
    reject(new Error('backend down'))
    await wait(10_000)
    expect(setup.upsert).toHaveBeenCalledTimes(1)
  })

  test('with ?backend=rest&fail=1, an edit shows the retry toast, then "Not saved", and keeps the note', async () => {
    localStorage.clear()
    vi.useFakeTimers()
    render(<App repository={createRepository(parseBackend('?backend=rest&fail=1'))} />)
    await wait(MOCK_LATENCY_MS.max)
    expect(shown("Couldn't load notes.")).toBe(true)

    const main = screen.getByRole('main')
    fireEvent.pointerDown(main, { clientX: 300, clientY: 300 })
    fireEvent.pointerUp(main, { clientX: 300, clientY: 300 })
    await wait(MOCK_LATENCY_MS.max)
    expect(shown(RETRYING)).toBe(true)

    const retries = SAVE_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay + MOCK_LATENCY_MS.max, 0)
    await wait(retries)
    expect(shown(RETRYING)).toBe(false)
    expect(shown(NOT_SAVED)).toBe(true)
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(localStorage.getItem(REST_STORAGE_KEY)).toBeNull()
  })

  test('no retry runs after the app unmounts', async () => {
    const setup = failingRepository([a])
    await renderApp(setup)
    setup.failing.saves = true
    moveNote('a', [50, 30])
    await wait(0)
    cleanup()
    await wait(10_000)
    expect(setup.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('AC 41: load errors', () => {
  async function renderFailedLoad() {
    const setup = failingRepository([a, b])
    setup.failing.load = true
    render(<App repository={setup.repository} />)
    const main = screen.getByRole('main')
    await waitFor(() => {
      expect(within(screen.getByRole('status')).queryByRole('button', { name: 'Retry' })).not.toBeNull()
    })
    return { setup, main }
  }

  test('a failed load shows an empty board and an error toast with a Retry button', async () => {
    const { main } = await renderFailedLoad()
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(main.getAttribute('aria-busy')).toBe('false')
    expect(shown("Couldn't load notes.")).toBe(true)
  })

  test('the empty board stays usable, and a later successful Retry adds the stored notes', async () => {
    const { setup, main } = await renderFailedLoad()
    fireEvent.pointerDown(main, { clientX: 300, clientY: 300 })
    fireEvent.pointerUp(main, { clientX: 300, clientY: 300 })
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(setup.upsert).toHaveBeenCalledTimes(1)

    setup.failing.load = false
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Retry' }))
    await waitFor(() => {
      expect(screen.getAllByRole('group')).toHaveLength(3)
    })
  })

  test('Retry loads again: on success the notes show and the toast goes', async () => {
    const { setup } = await renderFailedLoad()
    setup.failing.load = false
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Retry' }))
    await waitFor(() => {
      expect(screen.getAllByRole('group')).toHaveLength(2)
    })
    expect(shown("Couldn't load notes.")).toBe(false)
    expect(setup.load).toHaveBeenCalledTimes(2)
  })

  test('a Retry that fails again keeps the toast', async () => {
    const { setup } = await renderFailedLoad()
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Retry' }))
    await waitFor(() => {
      expect(setup.load).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(within(screen.getByRole('status')).queryByRole('button', { name: 'Retry' })).not.toBeNull()
    })
    expect(screen.queryAllByRole('group')).toHaveLength(0)
  })
})
