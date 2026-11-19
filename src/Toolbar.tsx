import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { boardSize, useBoardSize } from './board.ts'
import { clampRect, type Point, type Rect, type Size } from './geometry.ts'
import { loadToolbarPosition, saveToolbarPosition, TOOLBAR_TOP } from './toolbarPosition.ts'
import { usePointerGesture } from './usePointerGesture.ts'

interface ToolbarProps {
  /** Its buttons, before the grip. */
  children: ReactNode
}

/**
 * The floating board toolbar (decision 23). It is placed by its stored position, or centred at the
 * top until it is first moved, and displayed clamped to the viewport. The grip moves it with the
 * gesture rules of notes: transform during the drag, one commit on pointer up, revert on cancel.
 */
export function Toolbar({ children }: ToolbarProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [stored, setStored] = useState<Point | null>(() => loadToolbarPosition())
  const viewport = useBoardSize()
  const startGesture = usePointerGesture()

  // The centred default and the clamp need the rendered size, known only once mounted.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const { offsetWidth: width, offsetHeight: height } = root
    setSize((old) => (old.width === width && old.height === height ? old : { width, height }))
  }, [])

  const position = stored ?? { x: (viewport.width - size.width) / 2, y: TOOLBAR_TOP }
  const displayed: Rect = clampRect({ ...position, ...size }, viewport)

  const onGripPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    const root = rootRef.current
    if (!root) return
    const start = { x: event.clientX, y: event.clientY }
    const movedTo = (point: Point) =>
      clampRect({ ...displayed, x: displayed.x + point.x - start.x, y: displayed.y + point.y - start.y }, boardSize())
    let frame: number | null = null
    let latest = start

    const stopFrames = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      root.style.transform = ''
    }

    startGesture(event, {
      onMove(point) {
        latest = point
        frame ??= requestAnimationFrame(() => {
          frame = null
          const moved = movedTo(latest)
          root.style.transform = `translate(${String(moved.x - displayed.x)}px, ${String(moved.y - displayed.y)}px)`
        })
      },
      onEnd(point) {
        stopFrames()
        const { x, y } = movedTo(point)
        setStored({ x, y })
        saveToolbarPosition({ x, y })
      },
      onCancel: stopFrames,
    })
  }

  return (
    <div
      ref={rootRef}
      className="toolbar"
      role="toolbar"
      aria-label="Board tools"
      style={{ left: displayed.x, top: displayed.y }}
    >
      {children}
      {/* Not focusable: moving the toolbar by keyboard is a non-goal. */}
      <div className="toolbar-grip" role="img" aria-label="Move toolbar" onPointerDown={onGripPointerDown}>
        <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
          {[3, 7].flatMap((cx) =>
            [3, 8, 13].map((cy) => <circle key={`${String(cx)},${String(cy)}`} cx={cx} cy={cy} r="1.5" fill="currentColor" />),
          )}
        </svg>
      </div>
    </div>
  )
}
