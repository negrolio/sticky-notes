import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import css from './App.css?raw'
import { App } from './App.tsx'
import type { Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

beforeEach(installPointerStubs)
afterEach(cleanup)

const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 1 }

async function renderApp(initial: readonly Note[], repository: NotesRepository = createMemoryRepository(initial)) {
  render(<App repository={repository} />)
  const board = screen.getByRole('main')
  await waitFor(() => {
    expect(board.getAttribute('aria-busy')).toBe('false')
  })
  return board
}

function hint(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.empty-hint')
}

describe('empty board hint', () => {
  test('an empty board shows how to create a note', async () => {
    await renderApp([])
    expect(hint()?.textContent).toContain('Click anywhere')
    expect(hint()?.textContent).toContain('drag')
  })

  test('a board with notes shows no hint', async () => {
    await renderApp([a])
    expect(hint()).toBeNull()
  })

  test('no hint while the notes are still loading', () => {
    const pending: NotesRepository = {
      ...createMemoryRepository(),
      load: () => new Promise<Note[]>(() => {}),
    }
    render(<App repository={pending} />)
    expect(hint()).toBeNull()
  })

  test('it goes away while a note is drawn and once it exists', async () => {
    const board = await renderApp([])
    fireEvent.pointerDown(board, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(board, { clientX: 300, clientY: 300 })
    expect(hint()).toBeNull()
    fireEvent.pointerUp(board, { clientX: 300, clientY: 300 })
    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(hint()).toBeNull()
  })

  test('it comes back when the last note is deleted', async () => {
    await renderApp([a])
    const group = screen.getByRole('group')
    group.focus()
    fireEvent.keyDown(group, { key: 'Delete' })
    expect(hint()).not.toBeNull()
  })

  test('it is inside the board, so it stays below every note, toolbar and popover', async () => {
    const board = await renderApp([])
    expect(board.contains(hint())).toBe(true)
  })
})

describe('empty board hint styles', () => {
  function rules(): CSSStyleRule[] {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    const sheet = style.sheet
    style.remove()
    if (!sheet) throw new Error('App.css did not parse')
    const all = [...sheet.cssRules]
    const nested = all.flatMap((rule) => (rule instanceof CSSMediaRule ? [...rule.cssRules] : []))
    return [...all, ...nested].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
  }

  function declared(selector: string, property: string, inReducedMotion = false): string {
    const values = rules()
      .filter((rule) => {
        const media = rule.parentRule instanceof CSSMediaRule ? rule.parentRule.conditionText : ''
        return media.includes('prefers-reduced-motion') === inReducedMotion && rule.selectorText === selector
      })
      .map((rule) => rule.style.getPropertyValue(property))
      .filter((value) => value !== '')
    return values[values.length - 1] ?? ''
  }

  test('presses pass through it to the board, so a click on it still creates a note', () => {
    expect(declared('.empty-hint', 'pointer-events')).toBe('none')
  })

  test('it breathes slowly, and holds still under reduced motion', () => {
    expect(declared('.empty-hint', 'animation')).toContain('hint-breathe')
    expect(declared('.empty-hint', 'animation', true)).toBe('none')
  })
})
