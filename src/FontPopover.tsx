import { useRef } from 'react'
import { FONT_FAMILIES, FONT_SIZES, type FontFamily, type FontSize } from './model.ts'
import { Popover } from './Popover.tsx'

interface FontPopoverProps {
  family: FontFamily
  size: FontSize
  /** The "Aa" button that opened the popover. */
  anchor: HTMLElement
  onFamily: (family: FontFamily) => void
  onSize: (size: FontSize) => void
  /** Must be stable across renders. */
  onClose: () => void
}

/** The note's font choices (decision 26). Unlike the color popover, a choice keeps it open. */
export function FontPopover({ family, size, anchor, onFamily, onSize, onClose }: FontPopoverProps) {
  const currentRef = useRef<HTMLButtonElement>(null)

  return (
    <Popover label="Note font" className="font-popover" anchor={anchor} initialFocus={currentRef} onClose={onClose}>
      <div className="font-row">
        {FONT_FAMILIES.map((choice) => (
          <button
            key={choice.family}
            ref={choice.family === family ? currentRef : undefined}
            type="button"
            className="font-choice"
            aria-label={choice.name}
            aria-pressed={choice.family === family}
            style={{ fontFamily: choice.stack }}
            onClick={() => {
              onFamily(choice.family)
            }}
          >
            {choice.name}
          </button>
        ))}
      </div>
      <div className="font-row">
        {FONT_SIZES.map((choice) => (
          <button
            key={choice.size}
            type="button"
            className="font-choice"
            aria-label={choice.name}
            aria-pressed={choice.size === size}
            onClick={() => {
              onSize(choice.size)
            }}
          >
            {choice.name}
          </button>
        ))}
      </div>
    </Popover>
  )
}
