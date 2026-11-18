import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { installPointerStubs } from './test/pointer.ts'
import { usePointerGesture, type GestureCallbacks } from './usePointerGesture.ts'

let setPointerCapture: Mock
let releasePointerCapture: Mock
let hasPointerCapture: Mock
beforeEach(() => {
  ;({ setPointerCapture, releasePointerCapture, hasPointerCapture } = installPointerStubs())
})
afterEach(cleanup)

function setup() {
  const callbacks = { onMove: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() } satisfies GestureCallbacks
  function Target() {
    const start = usePointerGesture()
    return (
      <div
        data-testid="target"
        onPointerDown={(event) => {
          start(event, callbacks)
        }}
      />
    )
  }
  const view = render(<Target />)
  return { callbacks, target: screen.getByTestId('target'), unmount: view.unmount }
}

describe('usePointerGesture', () => {
  test('captures the pointer and reports moves and the end point', () => {
    const { callbacks, target } = setup()
    fireEvent.pointerDown(target, { clientX: 10, clientY: 20, pointerId: 7 })
    expect(setPointerCapture).toHaveBeenCalledWith(7)

    fireEvent.pointerMove(target, { clientX: 30, clientY: 40, pointerId: 7 })
    expect(callbacks.onMove).toHaveBeenCalledWith({ x: 30, y: 40 })

    fireEvent.pointerUp(target, { clientX: 50, clientY: 60, pointerId: 7 })
    expect(callbacks.onEnd).toHaveBeenCalledWith({ x: 50, y: 60 })
    expect(callbacks.onCancel).not.toHaveBeenCalled()
  })

  test('ignores events after the gesture ends', () => {
    const { callbacks, target } = setup()
    fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
    fireEvent.pointerUp(target, { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(target, { clientX: 5, clientY: 5 })
    fireEvent.pointerUp(target, { clientX: 5, clientY: 5 })
    expect(callbacks.onMove).not.toHaveBeenCalled()
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1)
  })

  test('ignores other pointers', () => {
    const { callbacks, target } = setup()
    fireEvent.pointerDown(target, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(target, { clientX: 5, clientY: 5, pointerId: 2 })
    fireEvent.pointerUp(target, { clientX: 5, clientY: 5, pointerId: 2 })
    expect(callbacks.onMove).not.toHaveBeenCalled()
    expect(callbacks.onEnd).not.toHaveBeenCalled()
  })

  test('ignores a non-primary button', () => {
    const { callbacks, target } = setup()
    fireEvent.pointerDown(target, { clientX: 0, clientY: 0, button: 2 })
    fireEvent.pointerUp(target, { clientX: 0, clientY: 0 })
    expect(setPointerCapture).not.toHaveBeenCalled()
    expect(callbacks.onEnd).not.toHaveBeenCalled()
  })

  test.each([
    ['pointercancel', (target: HTMLElement) => fireEvent.pointerCancel(target)],
    ['window blur', () => fireEvent.blur(window)],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
  ])('%s cancels the gesture', (name, cancel) => {
    const { callbacks, target } = setup()
    fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
    cancel(target)
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1)
    expect(releasePointerCapture).toHaveBeenCalledTimes(name === 'pointercancel' ? 0 : 1)

    fireEvent.pointerUp(target, { clientX: 5, clientY: 5 })
    expect(callbacks.onEnd).not.toHaveBeenCalled()
  })

  test('losing pointer capture cancels the gesture and frees the hook for the next one', () => {
    const { callbacks, target } = setup()
    fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
    fireEvent(target, new PointerEvent('lostpointercapture', { pointerId: 1 }))
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(target, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(target, { clientX: 20, clientY: 20 })
    expect(callbacks.onEnd).toHaveBeenCalledWith({ x: 20, y: 20 })
  })

  test('a cancel when capture is already gone still reports the cancel without releasing', () => {
    const { callbacks, target } = setup()
    fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
    hasPointerCapture.mockReturnValue(false)
    fireEvent.blur(window)
    expect(releasePointerCapture).not.toHaveBeenCalled()
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1)
  })

  test('other keys do not cancel', () => {
    const { callbacks, target } = setup()
    fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.pointerUp(target, { clientX: 0, clientY: 0 })
    expect(callbacks.onCancel).not.toHaveBeenCalled()
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1)
  })

  test('unmounting mid-gesture stops listening', () => {
    const { callbacks, target, unmount } = setup()
    fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(target, { clientX: 0, clientY: 0 })
    expect(callbacks.onCancel).not.toHaveBeenCalled()
    expect(callbacks.onEnd).not.toHaveBeenCalled()
  })
})
