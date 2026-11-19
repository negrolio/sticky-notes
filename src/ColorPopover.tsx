import { useRef } from 'react'
import { PALETTE, type NoteColor } from './model.ts'
import { Popover } from './Popover.tsx'

interface ColorPopoverProps {
  color: NoteColor
  /** The swatch button that opened the popover. It gets focus back when a choice or Escape closes it. */
  anchor: HTMLElement
  onSelect: (color: NoteColor) => void
  /** Must be stable across renders. */
  onClose: () => void
}

/** The note's color choices (decision 12). A selection closes it. */
export function ColorPopover({ color, anchor, onSelect, onClose }: ColorPopoverProps) {
  const currentRef = useRef<HTMLButtonElement>(null)

  return (
    <Popover label="Note color" className="color-popover" anchor={anchor} initialFocus={currentRef} onClose={onClose}>
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
    </Popover>
  )
}
