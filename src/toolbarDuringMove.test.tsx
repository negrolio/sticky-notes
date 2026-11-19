import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App.tsx'
import type { Note } from './model.ts'
import { createMemoryRepository } from './repository.ts'
import { installPointerStubs } from './test/pointer.ts'

let frames: FrameRequestCallback[] = []
function flushFrames() {
  const pending = frames
  frames = []
  for (const callback of pending) callback(performance.now())
}

beforeEach(() => {
  installPointerStubs()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames[handle - 1] = () => {}
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const note: Note = { id: 'a', x: 100, y: 100, width: 200, height: 150, text: 'hi', color: '#C5E1A5', z: 1 }

async function renderApp() {
  render(<App repository={createMemoryRepository([note])} />)
  await waitFor(() => {
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('false')
  })
  const header = screen.getByRole('group').querySelector<HTMLElement>('.note-header')
  if (!header) throw new Error('no note header')
  return header
}

function toolbarButtons() {
  return [screen.getByRole('button', { name: 'Delete all notes' }), screen.getByRole('button', { name: 'Change background' })]
}

function startMove(header: HTMLElement) {
  fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
  fireEvent.pointerMove(header, { clientX: 250, clientY: 210 })
  act(flushFrames)
}

describe('toolbar during a note move', () => {
  test('delete all and change background are disabled while a note is dragged, and enabled after the drop', async () => {
    const header = await renderApp()
    startMove(header)
    for (const button of toolbarButtons()) expect(button.getAttribute('aria-disabled')).toBe('true')

    fireEvent.pointerUp(header, { clientX: 250, clientY: 210 })
    for (const button of toolbarButtons()) expect(button.hasAttribute('aria-disabled')).toBe(false)
  })

  test('they are enabled again when the move is cancelled', async () => {
    const header = await renderApp()
    startMove(header)
    fireEvent.keyDown(window, { key: 'Escape' })
    for (const button of toolbarButtons()) expect(button.hasAttribute('aria-disabled')).toBe(false)
  })

  test('a press on the header that never moves leaves them enabled', async () => {
    const header = await renderApp()
    fireEvent.pointerDown(header, { clientX: 150, clientY: 110 })
    for (const button of toolbarButtons()) expect(button.hasAttribute('aria-disabled')).toBe(false)
    fireEvent.pointerUp(header, { clientX: 150, clientY: 110 })
  })
})
