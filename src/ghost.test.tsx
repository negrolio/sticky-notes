import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import css from './App.css?raw'
import { App } from './App.tsx'
import { GHOST_MS, type Note } from './model.ts'
import { createMemoryRepository, type NotesRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

/** jsdom has no matchMedia; this one answers only the reduced-motion query, as the test sets it. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
  }))
}

beforeEach(() => {
  installPointerStubs()
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

// jsdom's default viewport is 1024x768, so the trash zone spans x 928..1024 and y 672..768, centre (976,720).
const a: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'first', color: '#C5E1A5', z: 1 }
const b: Note = {
  id: 'b',
  x: 400,
  y: 300,
  width: 120,
  height: 90,
  text: 'second',
  color: '#B3E5FC',
  z: 2,
  fontFamily: 'mono',
  fontSize: 24,
}
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

function ghosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ghost')]
}

function onlyGhost(): HTMLElement {
  const all = ghosts()
  expect(all).toHaveLength(1)
  const [ghost] = all
  if (!ghost) throw new Error('no ghost')
  return ghost
}

function dropOnTrash(id: string, from: [number, number]) {
  const header = groupOf(id).querySelector('.note-header')
  if (!(header instanceof HTMLElement)) throw new Error('no header')
  fireEvent.pointerDown(header, { clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
  fireEvent.pointerUp(header, { clientX: OVER_TRASH[0], clientY: OVER_TRASH[1] })
}

function deleteByKey(id: string) {
  groupOf(id).focus()
  fireEvent.keyDown(groupOf(id), { key: 'Delete' })
}

function rectOf(ghost: HTMLElement) {
  const { left, top, width, height } = ghost.style
  return { left, top, width, height }
}

describe('AC 52: a ghost per deleted note', () => {
  test('trash drop: one ghost where the note was released; the note and its write are gone at once', async () => {
    const { remove } = await renderApp([a])
    dropOnTrash('a', [150, 110])

    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(remove).toHaveBeenCalledTimes(1)
    // Released at (1000,740): the note was shown clamped at (824,618), not at its stored (100,100).
    expect(rectOf(onlyGhost())).toEqual({ left: '824px', top: '618px', width: '200px', height: '150px' })
  })

  test('keyboard delete: one ghost at the displayed rect', async () => {
    const { remove } = await renderApp([a, b])
    deleteByKey('b')

    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(remove).toHaveBeenCalledWith('b')
    expect(rectOf(onlyGhost())).toEqual({ left: '400px', top: '300px', width: '120px', height: '90px' })
  })

  test('a ghost is aria-hidden, not focusable and not a group, and copies color, font and text', async () => {
    await renderApp([b])
    deleteByKey('b')
    const ghost = onlyGhost()

    expect(ghost.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(ghost.matches('[tabindex], button, textarea, input')).toBe(false)
    expect(ghost.querySelector('[tabindex], button, textarea, input')).toBeNull()
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(ghost.getAttribute('role')).toBeNull()
    expect(ghost.style.backgroundColor).toBe('rgb(179, 229, 252)')
    expect(ghost.textContent).toBe('second')
    const text = ghost.querySelector<HTMLElement>('.ghost-text')
    expect(text?.style.fontSize).toBe('24px')
    expect(text?.style.fontFamily).toContain('monospace')
  })

  test('it is drawn towards the trash centre, given as custom properties', async () => {
    await renderApp([b])
    deleteByKey('b')
    const ghost = onlyGhost()
    // From the note's centre (460,345) to the zone's centre (976,720).
    expect(ghost.style.getPropertyValue('--ghost-dx')).toBe('516px')
    expect(ghost.style.getPropertyValue('--ghost-dy')).toBe('375px')
  })

  test('the ghost layer is a sibling after the board and before the trash zone', async () => {
    const { main } = await renderApp([a])
    deleteByKey('a')
    const layer = onlyGhost().parentElement
    if (!layer) throw new Error('no layer')
    const zone = screen.getByRole('img', { name: 'Trash' })
    expect(main.contains(layer)).toBe(false)
    expect(layer.parentElement).toBe(main.parentElement)
    expect(main.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(layer.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('each delete adds its own ghost', async () => {
    await renderApp([a, b])
    deleteByKey('a')
    deleteByKey('b')
    expect(ghosts()).toHaveLength(2)
  })

  test('the toast and focus behave as before', async () => {
    await renderApp([a, b])
    deleteByKey('a')
    expect(within(screen.getByRole('status')).getByText('Note deleted. Undo (Ctrl+Z)')).toBeTruthy()
    expect(document.activeElement).toBe(groupOf('b'))
  })
})

describe('AC 53: ghost removal', () => {
  test('on animationend', async () => {
    await renderApp([a])
    deleteByKey('a')
    fireEvent.animationEnd(onlyGhost())
    expect(ghosts()).toHaveLength(0)
  })

  test('after GHOST_MS without animationend', async () => {
    await renderApp([a])
    vi.useFakeTimers()
    deleteByKey('a')
    act(() => {
      vi.advanceTimersByTime(GHOST_MS - 1)
    })
    expect(ghosts()).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(ghosts()).toHaveLength(0)
    expect(GHOST_MS).toBe(350)
  })
})

describe('AC 54: undo while a ghost animates', () => {
  test('removes the ghost and restores the note', async () => {
    await renderApp([a, b])
    deleteByKey('a')
    deleteByKey('b')
    expect(ghosts()).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    expect(groupOf('b')).toBeTruthy()
    expect(ghosts()).toHaveLength(1)
    expect(onlyGhost().textContent).toBe('first')
  })
})

describe('AC 55: reduced motion', () => {
  test('no ghost is drawn, and the delete happens as usual', async () => {
    stubReducedMotion(true)
    const { remove } = await renderApp([a, b])
    deleteByKey('a')
    dropOnTrash('b', [410, 305])
    expect(ghosts()).toHaveLength(0)
    expect(remove).toHaveBeenCalledTimes(2)
  })

  test('a browser without matchMedia still draws ghosts', async () => {
    vi.stubGlobal('matchMedia', undefined)
    await renderApp([a])
    deleteByKey('a')
    expect(ghosts()).toHaveLength(1)
  })
})

describe('decision 22: the animation rules', () => {
  function sheet(): CSSStyleSheet {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    if (!style.sheet) throw new Error('App.css did not parse')
    return style.sheet
  }

  // jsdom parses keyframes but exposes no CSSKeyframesRule or CSSKeyframeRule global, so they are told by shape.
  function isKeyframes(rule: CSSRule): rule is CSSKeyframesRule {
    return 'name' in rule && 'cssRules' in rule
  }
  function isKeyframe(rule: CSSRule): rule is CSSKeyframeRule {
    return 'keyText' in rule && 'style' in rule
  }

  test('350 ms ease-in keyframes that animate transform and opacity only', () => {
    const rules = [...sheet().cssRules]
    const ghost = rules.find((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === '.ghost')
    const animation = ghost?.style.getPropertyValue('animation') ?? ''
    expect(animation).toContain('350ms')
    expect(animation).toContain('ease-in')
    const keyframes = rules.filter(isKeyframes).find((r) => animation.split(' ').includes(r.name))
    if (!keyframes) throw new Error('no keyframes for .ghost')
    const properties = new Set<string>()
    for (const frame of [...keyframes.cssRules]) {
      if (!isKeyframe(frame)) continue
      // The keyframe's style is a cssom declaration list without an iterator or item(), so it is read by index.
      for (let i = 0; i < frame.style.length; i++) properties.add(frame.style[i] ?? '')
    }
    expect([...properties].sort()).toEqual(['opacity', 'transform'])
    const last = keyframes.cssRules[keyframes.cssRules.length - 1]
    const end = last && isKeyframe(last) ? last.style.getPropertyValue('transform') : ''
    expect(end).toContain('var(--ghost-dx)')
    expect(end).toContain('scale(0.1)')
    expect(end).toContain('rotate(20deg)')
  })
})
