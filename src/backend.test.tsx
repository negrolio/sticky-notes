import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import { createRepository, parseBackend } from './backend.ts'
import { STORAGE_KEY } from './localStorageRepository.ts'
import { MOCK_LATENCY_MS, type Note } from './model.ts'
import { createRestMockRepository, REST_STORAGE_KEY } from './restMockRepository.ts'
import { installPointerStubs } from './test/pointer.ts'

describe('backend selection by query parameter', () => {
  test.each([
    ['', { backend: 'local' }],
    ['?fail=1', { backend: 'local' }],
    ['?backend=local', { backend: 'local' }],
    ['?backend=rest', { backend: 'rest', failRate: 0 }],
    ['?backend=rest&fail=0.25', { backend: 'rest', failRate: 0.25 }],
    ['?fail=1&backend=rest', { backend: 'rest', failRate: 1 }],
    ['?backend=rest&fail=2', { backend: 'rest', failRate: 1 }],
    ['?backend=rest&fail=-1', { backend: 'rest', failRate: 0 }],
    ['?backend=rest&fail=abc', { backend: 'rest', failRate: 0 }],
    ['?backend=rest&fail=', { backend: 'rest', failRate: 0 }],
    ['?backend=rest&fail=Infinity', { backend: 'rest', failRate: 1 }],
  ])('%j selects %j', (search, expected) => {
    expect(parseBackend(search)).toEqual(expected)
  })
})

describe('the selected repository', () => {
  const note: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: '', color: '#FFF59D', z: 1 }

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('local writes at once under the localStorage key', async () => {
    await createRepository(parseBackend('')).upsert(note)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(localStorage.getItem(REST_STORAGE_KEY)).toBeNull()
  })

  test('rest answers after the mock latency, under its own key, and fails at the given rate', async () => {
    let settled = false
    void createRepository(parseBackend('?backend=rest'))
      .upsert(note)
      .then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.min - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    expect(settled).toBe(true)
    expect(localStorage.getItem(REST_STORAGE_KEY)).not.toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    const failing = createRepository(parseBackend('?backend=rest&fail=1')).upsert(note)
    failing.catch(() => {})
    await vi.advanceTimersByTimeAsync(MOCK_LATENCY_MS.max)
    await expect(failing).rejects.toThrow()
  })
})

describe('AC 37: the app on the REST mock', () => {
  beforeEach(() => {
    localStorage.clear()
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

  const settle = { timeout: MOCK_LATENCY_MS.max * 3 }

  async function load() {
    cleanup()
    render(<App repository={createRestMockRepository()} />)
    const main = screen.getByRole('main')
    await waitFor(() => {
      expect(main.getAttribute('aria-busy')).toBe('false')
    }, settle)
    return main
  }

  function board() {
    return screen.getAllByRole('group').map((g) => ({
      left: g.style.left,
      top: g.style.top,
      width: g.style.width,
      height: g.style.height,
      z: g.style.zIndex,
      color: g.style.backgroundColor,
      text: g.querySelector('textarea')?.value,
    }))
  }

  test('created, moved, resized, edited and recolored notes are identical after a reload', async () => {
    const main = await load()
    fireEvent.pointerDown(main, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(main, { clientX: 100, clientY: 100 })
    const group = screen.getByRole('group')
    const header = group.querySelector<HTMLElement>('.note-header')
    const handle = group.querySelector<HTMLElement>('.note-resize')
    const textarea = group.querySelector('textarea')
    if (!header || !handle || !textarea) throw new Error('note parts missing')
    fireEvent.pointerDown(header, { clientX: 110, clientY: 105 })
    fireEvent.pointerMove(header, { clientX: 160, clientY: 135 })
    fireEvent.pointerUp(header, { clientX: 160, clientY: 135 })
    fireEvent.pointerDown(handle, { clientX: 345, clientY: 325 })
    fireEvent.pointerMove(handle, { clientX: 405, clientY: 365 })
    fireEvent.pointerUp(handle, { clientX: 405, clientY: 365 })
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'over the wire' } })
    textarea.blur()
    fireEvent.click(within(group).getByRole('button', { name: 'Change color' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Note color' })).getByRole('button', { name: 'Blue' }))
    const before = board()

    // Every write lands within the maximum latency.
    await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS.max + 50))
    await load()
    expect(board()).toEqual(before)
    expect(localStorage.getItem(REST_STORAGE_KEY)).not.toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  }, 10_000)
})
