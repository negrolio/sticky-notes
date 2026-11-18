import { vi } from 'vitest'

/** jsdom has no PointerEvent; this one carries what the app reads (coordinates, button, pointerId). */
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
  }
}

/** Installs the PointerEvent polyfill and stubs pointer capture, which jsdom also lacks. Capture reads as held. */
export function installPointerStubs() {
  Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true })
  const setPointerCapture = vi.fn()
  const releasePointerCapture = vi.fn()
  const hasPointerCapture = vi.fn(() => true)
  Element.prototype.setPointerCapture = setPointerCapture
  Element.prototype.releasePointerCapture = releasePointerCapture
  Element.prototype.hasPointerCapture = hasPointerCapture
  return { setPointerCapture, releasePointerCapture, hasPointerCapture }
}
