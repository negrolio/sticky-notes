import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App.tsx'
import { newId } from './create.ts'
import { createMemoryRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

// A phone opening the dev server by its LAN address is on plain HTTP, where crypto.randomUUID is missing.
beforeEach(() => {
  installPointerStubs()
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new TypeError('crypto.randomUUID is not a function')
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderApp() {
  const repository = createMemoryRepository([])
  render(<App repository={repository} />)
  const board = screen.getByRole('main')
  await waitFor(() => {
    expect(board.getAttribute('aria-busy')).toBe('false')
  })
  return { repository, board }
}

describe('outside a secure context', () => {
  test('a tap creates a note', async () => {
    const { repository, board } = await renderApp()
    fireEvent.pointerDown(board, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(board, { clientX: 100, clientY: 100 })
    expect(await repository.load()).toHaveLength(1)
  })

  test('a drag creates a note of the dragged size', async () => {
    const { repository, board } = await renderApp()
    fireEvent.pointerDown(board, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(board, { clientX: 400, clientY: 350 })
    fireEvent.pointerUp(board, { clientX: 400, clientY: 350 })
    const [note] = await repository.load()
    expect(note && { width: note.width, height: note.height }).toEqual({ width: 300, height: 250 })
  })

  test('ids are distinct v4 UUIDs', () => {
    const ids = Array.from({ length: 50 }, newId)
    expect(new Set(ids).size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
