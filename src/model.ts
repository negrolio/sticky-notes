import type { Size } from './geometry.ts'

export type NoteColor = '#FFF59D' | '#F8BBD0' | '#C5E1A5' | '#B3E5FC' | '#D1C4E9'

/** Board coordinates are CSS pixels from the board's top-left corner. */
export interface Note {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  color: NoteColor
  z: number
}

export const PALETTE: readonly { readonly name: string; readonly color: NoteColor }[] = [
  { name: 'Yellow', color: '#FFF59D' },
  { name: 'Pink', color: '#F8BBD0' },
  { name: 'Green', color: '#C5E1A5' },
  { name: 'Blue', color: '#B3E5FC' },
  { name: 'Purple', color: '#D1C4E9' },
]

export const DEFAULT_COLOR: NoteColor = '#FFF59D'

export const MIN_NOTE_SIZE: Readonly<Size> = { width: 80, height: 80 }
export const CLICK_NOTE_SIZE: Readonly<Size> = { width: 200, height: 200 }
export const HEADER_HEIGHT = 24
export const TRASH_SIZE = 96
export const MAX_TEXT_LENGTH = 10_000

export const TEXT_DEBOUNCE_MS = 300
export const UNDO_TOAST_MS = 5_000
export const SAVE_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000]
export const MOCK_LATENCY_MS: Readonly<{ min: number; max: number }> = { min: 200, max: 600 }
