import { useRef } from 'react'
import { BACKGROUND_COLORS, type Background, type BackgroundColor } from './background.ts'
import { Popover } from './Popover.tsx'

interface BackgroundPopoverProps {
  background: Background
  /** The toolbar button that opened the popover. */
  anchor: HTMLElement
  onColor: (color: BackgroundColor) => void
  /** Opens the file picker. */
  onUpload: () => void
  onRemoveImage: () => void
  /** Must be stable across renders. */
  onClose: () => void
}

/** The board background choices (decision 25), with the open and close rules of the color popover. */
export function BackgroundPopover({ background, anchor, onColor, onUpload, onRemoveImage, onClose }: BackgroundPopoverProps) {
  const firstRef = useRef<HTMLButtonElement>(null)
  const current = background.kind === 'color' ? background.color : null
  const focusColor = current ?? BACKGROUND_COLORS[0]?.color

  return (
    <Popover label="Board background" className="background-popover" anchor={anchor} initialFocus={firstRef} onClose={onClose}>
      <div className="background-swatches">
        {BACKGROUND_COLORS.map((swatch) => (
          <button
            key={swatch.color}
            ref={swatch.color === focusColor ? firstRef : undefined}
            type="button"
            className="color-swatch"
            aria-label={swatch.name}
            title={swatch.name}
            aria-pressed={swatch.color === current}
            style={{ backgroundColor: swatch.color }}
            onClick={() => {
              onColor(swatch.color)
              anchor.focus()
              onClose()
            }}
          />
        ))}
      </div>
      <div className="background-actions">
        <button type="button" onClick={onUpload}>
          Upload image
        </button>
        {background.kind === 'image' && (
          <button
            type="button"
            onClick={() => {
              onRemoveImage()
              anchor.focus()
              onClose()
            }}
          >
            Remove image
          </button>
        )}
      </div>
    </Popover>
  )
}
