import { useEffect, useLayoutEffect, useRef } from 'react'
import { PALETTE, type NoteColor } from './model.ts'

const GAP_PX = 4

interface ColorPopoverProps {
  color: NoteColor
  /** The swatch button that opened the popover. It gets focus back when a choice or Escape closes it. */
  anchor: HTMLElement
  onSelect: (color: NoteColor) => void
  /** Must be stable across renders. */
  onClose: () => void
}

/**
 * Rendered outside the board, so it is drawn above every note (decision 17). It closes on a
 * selection, on Escape and on a pointer down outside it. A press outside still reaches its target,
 * so a note pressed to close the popover is raised or dragged as usual. It also closes on a window
 * resize, which may move its note.
 */
export function ColorPopover({ color, anchor, onSelect, onClose }: ColorPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  // Placed under the anchor, or above it when there is no room below, and kept inside the viewport.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const rect = anchor.getBoundingClientRect()
    const below = rect.bottom + GAP_PX
    const top = below + root.offsetHeight > window.innerHeight ? rect.top - GAP_PX - root.offsetHeight : below
    const left = Math.min(rect.left, window.innerWidth - root.offsetWidth)
    root.style.top = `${String(Math.max(0, top))}px`
    root.style.left = `${String(Math.max(0, left))}px`
    currentRef.current?.focus()
  }, [anchor])

  useEffect(() => {
    // The anchor is left out: its click toggles the popover, and closing here first would reopen it.
    const onPointerDown = (event: PointerEvent) => {
      const { target } = event
      if (!(target instanceof Node) || rootRef.current?.contains(target) || anchor.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Focus goes back to the anchor only from inside the popover; elsewhere it stays where the user put it.
      if (rootRef.current?.contains(document.activeElement)) anchor.focus()
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  return (
    <div ref={rootRef} className="color-popover" role="dialog" aria-label="Note color">
      {PALETTE.map((swatch) => (
        <button
          key={swatch.color}
          ref={swatch.color === color ? currentRef : undefined}
          type="button"
          className="color-swatch"
          aria-label={swatch.name}
          aria-pressed={swatch.color === color}
          style={{ backgroundColor: swatch.color }}
          onClick={() => {
            onSelect(swatch.color)
            anchor.focus()
            onClose()
          }}
        />
      ))}
    </div>
  )
}
