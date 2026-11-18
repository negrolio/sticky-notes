import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Point } from './geometry.ts'

/** Points are in client (viewport) coordinates. */
export interface GestureCallbacks {
  onMove: (point: Point) => void
  onEnd: (point: Point) => void
  /** Called on `pointercancel`, lost capture, window blur or Escape. `onEnd` is then never called. */
  onCancel: () => void
}

/**
 * Returns a function that starts a gesture from a primary-button pointer down. The pointer is
 * captured by the element that received the event, so the gesture keeps tracking outside it.
 * One gesture at a time; a pointer down while one is active is ignored. Returns whether the
 * gesture started.
 */
export function usePointerGesture() {
  const stopActive = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      stopActive.current?.()
    },
    [],
  )

  return useCallback((event: ReactPointerEvent<HTMLElement>, callbacks: GestureCallbacks): boolean => {
    if (event.button !== 0 || stopActive.current) return false
    const target = event.currentTarget
    const { pointerId } = event
    target.setPointerCapture(pointerId)

    const point = (e: PointerEvent): Point => ({ x: e.clientX, y: e.clientY })
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId === pointerId) callbacks.onMove(point(e))
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      stop()
      callbacks.onEnd(point(e))
    }
    // Also handles lostpointercapture: if capture goes before pointerup, pointerup may never arrive.
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      stop()
      callbacks.onCancel()
    }
    // After Escape or blur the pointer may still be down, so the capture is released by hand.
    // The check matters: releasing a pointer that is no longer active throws.
    const cancelHeld = () => {
      stop()
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
      callbacks.onCancel()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelHeld()
    }

    function stop() {
      target.removeEventListener('pointermove', onPointerMove)
      target.removeEventListener('pointerup', onPointerUp)
      target.removeEventListener('pointercancel', onPointerCancel)
      target.removeEventListener('lostpointercapture', onPointerCancel)
      window.removeEventListener('blur', cancelHeld)
      window.removeEventListener('keydown', onKeyDown)
      stopActive.current = null
    }

    target.addEventListener('pointermove', onPointerMove)
    target.addEventListener('pointerup', onPointerUp)
    target.addEventListener('pointercancel', onPointerCancel)
    target.addEventListener('lostpointercapture', onPointerCancel)
    window.addEventListener('blur', cancelHeld)
    window.addEventListener('keydown', onKeyDown)
    stopActive.current = stop
    return true
  }, [])
}
