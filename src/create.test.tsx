import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from './App.tsx'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

beforeEach(installPointerStubs)
afterEach(cleanup)

// jsdom's default viewport is 1024x768, the minimum the app supports.
const existing: Note = { id: 'old', x: 10, y: 10, width: 100, height: 100, text: 'hi', color: '#C5E1A5', z: 7 }

async function renderApp(initial: readonly Note[] = []) {
  const repository = createMemoryRepository(initial)
  render(<App repository={repository} />)
  const board = screen.getByRole('main')
  await waitFor(() => {
    expect(board.getAttribute('aria-busy')).toBe('false')
  })
  return { repository, board }
}

function drag(board: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(board, { clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(board, { clientX: to[0], clientY: to[1] })
  fireEvent.pointerUp(board, { clientX: to[0], clientY: to[1] })
}

function click(board: HTMLElement, at: [number, number]) {
  fireEvent.pointerDown(board, { clientX: at[0], clientY: at[1] })
  fireEvent.pointerUp(board, { clientX: at[0], clientY: at[1] })
}

function storedNotes(repository: NotesRepository) {
  return repository.load()
}

function rectOf(note: Note) {
  return { x: note.x, y: note.y, width: note.width, height: note.height }
}

describe('create', () => {
  test('AC 1: dragging from (100,100) to (400,350) creates a 300x250 note at (100,100)', async () => {
    const { repository, board } = await renderApp()
    drag(board, [100, 100], [400, 350])

    const [note] = await storedNotes(repository)
    expect(note && rectOf(note)).toEqual({ x: 100, y: 100, width: 300, height: 250 })
    const group = screen.getByRole('group')
    expect(group.style.left).toBe('100px')
    expect(group.style.top).toBe('100px')
    expect(group.style.width).toBe('300px')
    expect(group.style.height).toBe('250px')
  })

  test('dragging up and left creates the same rect as dragging down and right', async () => {
    const { repository, board } = await renderApp()
    drag(board, [400, 350], [100, 100])
    const [note] = await storedNotes(repository)
    expect(note && rectOf(note)).toEqual({ x: 100, y: 100, width: 300, height: 250 })
  })

  test('AC 2: a drag smaller than 80x80 is clamped up to 80x80', async () => {
    const { repository, board } = await renderApp()
    drag(board, [100, 100], [130, 120])
    const [note] = await storedNotes(repository)
    expect(note && rectOf(note)).toEqual({ x: 100, y: 100, width: 80, height: 80 })
  })

  test('AC 3: a click without moving creates a 200x200 note at the click point', async () => {
    const { repository, board } = await renderApp()
    click(board, [300, 300])
    const [note] = await storedNotes(repository)
    expect(note && rectOf(note)).toEqual({ x: 300, y: 300, width: 200, height: 200 })
  })

  test('AC 3: a click near the edge creates a note clamped inside the board', async () => {
    const { repository, board } = await renderApp()
    click(board, [1000, 700])
    const [note] = await storedNotes(repository)
    expect(note && rectOf(note)).toEqual({ x: 824, y: 568, width: 200, height: 200 })
  })

  test('AC 4: a drag past the board edge creates a note fully inside the board', async () => {
    const { repository, board } = await renderApp()
    drag(board, [900, 700], [1200, 900])
    const [note] = await storedNotes(repository)
    expect(note).toBeDefined()
    if (!note) return
    expect(note.x).toBeGreaterThanOrEqual(0)
    expect(note.y).toBeGreaterThanOrEqual(0)
    expect(note.x + note.width).toBeLessThanOrEqual(1024)
    expect(note.y + note.height).toBeLessThanOrEqual(768)
    expect(note.width).toBeGreaterThanOrEqual(80)
    expect(note.height).toBeGreaterThanOrEqual(80)
  })

  test('AC 5: a new note is yellow, has the highest z and focus in its textarea', async () => {
    const { repository, board } = await renderApp([existing])
    click(board, [300, 300])

    const created = (await storedNotes(repository)).find((n) => n.id !== existing.id)
    expect(created?.color).toBe('#FFF59D')
    expect(created?.z).toBeGreaterThan(existing.z)
    expect(created?.text).toBe('')

    const groups = screen.getAllByRole('group')
    const newGroup = groups.find((g) => g.style.left === '300px')
    expect(newGroup).toBeDefined()
    if (!newGroup) return
    expect(newGroup.style.zIndex).toBe(String(created?.z))
    expect(document.activeElement).toBe(within(newGroup).getByRole('textbox'))
  })

  test('each create writes exactly one note to the repository', async () => {
    const { repository, board } = await renderApp()
    drag(board, [100, 100], [400, 350])
    click(board, [600, 100])
    const notes = await storedNotes(repository)
    expect(notes).toHaveLength(2)
    expect(new Set(notes.map((n) => n.id)).size).toBe(2)
  })

  test('a pointer down on a note does not create a note', async () => {
    const { repository } = await renderApp([existing])
    const group = screen.getByRole('group')
    click(group, [50, 50])
    click(within(group).getByRole('textbox'), [50, 60])
    expect(await storedNotes(repository)).toHaveLength(1)
  })

  test('a drag that returns near its start point is still a drag, not a click', async () => {
    const { repository, board } = await renderApp()
    fireEvent.pointerDown(board, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(board, { clientX: 300, clientY: 300 })
    fireEvent.pointerMove(board, { clientX: 102, clientY: 101 })
    fireEvent.pointerUp(board, { clientX: 102, clientY: 101 })
    const [note] = await storedNotes(repository)
    expect(note && rectOf(note)).toEqual({ x: 100, y: 100, width: 80, height: 80 })
  })

  test('a press that moves less than the click tolerance is a click', async () => {
    const { repository, board } = await renderApp()
    fireEvent.pointerDown(board, { clientX: 300, clientY: 300 })
    fireEvent.pointerMove(board, { clientX: 302, clientY: 301 })
    fireEvent.pointerUp(board, { clientX: 302, clientY: 301 })
    const [note] = await storedNotes(repository)
    expect(note && rectOf(note)).toEqual({ x: 300, y: 300, width: 200, height: 200 })
  })

  test('presses on the board are ignored until the notes have loaded', async () => {
    const stored = createMemoryRepository([existing])
    let finishLoad = () => {}
    const repository: NotesRepository = {
      ...stored,
      load: () =>
        new Promise((resolve) => {
          finishLoad = () => {
            void stored.load().then(resolve)
          }
        }),
    }
    render(<App repository={repository} />)
    const board = screen.getByRole('main')
    expect(board.getAttribute('aria-busy')).toBe('true')

    click(board, [300, 300])
    expect(screen.queryByRole('group')).toBeNull()

    finishLoad()
    await waitFor(() => {
      expect(board.getAttribute('aria-busy')).toBe('false')
    })
    click(board, [300, 300])
    const created = (await stored.load()).find((n) => n.id !== existing.id)
    expect(created?.z).toBeGreaterThan(existing.z)
  })

  test('the drag outline is drawn above existing notes', async () => {
    const { board } = await renderApp([existing])
    fireEvent.pointerDown(board, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(board, { clientX: 300, clientY: 300 })
    const outline = document.querySelector<HTMLElement>('.draft')
    expect(Number(outline?.style.zIndex)).toBeGreaterThan(existing.z)
    fireEvent.pointerUp(board, { clientX: 300, clientY: 300 })
    expect(document.querySelector('.draft')).toBeNull()
  })

  test('Escape during a create drag creates nothing', async () => {
    const { repository, board } = await renderApp()
    fireEvent.pointerDown(board, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(board, { clientX: 300, clientY: 300 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(board, { clientX: 300, clientY: 300 })
    expect(await storedNotes(repository)).toHaveLength(0)
    expect(screen.queryByRole('group')).toBeNull()
  })
})

describe('note rendering', () => {
  test('a note shows its text, color and a labelled resize handle', async () => {
    await renderApp([existing])
    const group = screen.getByRole('group', { name: 'Sticky note' })
    expect(group.style.backgroundColor).toBe('rgb(197, 225, 165)')
    expect(within(group).getByRole<HTMLTextAreaElement>('textbox').value).toBe('hi')
    expect(within(group).getByLabelText('Resize note')).toBeTruthy()
  })
})
