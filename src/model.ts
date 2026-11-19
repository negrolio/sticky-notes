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
  /** Absent means DEFAULT_FONT_FAMILY. Written only once the user picks a family (decision 26). */
  fontFamily?: FontFamily
  /** Absent means DEFAULT_FONT_SIZE. Written only once the user picks a size. */
  fontSize?: FontSize
}

export type FontFamily = 'sans' | 'serif' | 'mono' | 'hand'
export type FontSize = 14 | 18 | 24

export const PALETTE: readonly { readonly name: string; readonly color: NoteColor }[] = [
  { name: 'Yellow', color: '#FFF59D' },
  { name: 'Pink', color: '#F8BBD0' },
  { name: 'Green', color: '#C5E1A5' },
  { name: 'Blue', color: '#B3E5FC' },
  { name: 'Purple', color: '#D1C4E9' },
]

export const DEFAULT_COLOR: NoteColor = '#FFF59D'

/** System fonts only, so nothing is loaded. */
export const FONT_FAMILIES: readonly { readonly name: string; readonly family: FontFamily; readonly stack: string }[] = [
  { name: 'Sans', family: 'sans', stack: 'system-ui, sans-serif' },
  { name: 'Serif', family: 'serif', stack: "Georgia, 'Times New Roman', serif" },
  { name: 'Mono', family: 'mono', stack: 'ui-monospace, Menlo, Consolas, monospace' },
  { name: 'Hand', family: 'hand', stack: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" },
]

export const FONT_SIZES: readonly { readonly name: string; readonly size: FontSize }[] = [
  { name: 'Small', size: 14 },
  { name: 'Medium', size: 18 },
  { name: 'Large', size: 24 },
]

export const DEFAULT_FONT_FAMILY: FontFamily = 'sans'
export const DEFAULT_FONT_SIZE: FontSize = 14

/** The CSS font-family stack a note's text is shown in. */
export function fontStack(note: Pick<Note, 'fontFamily'>): string {
  const family = note.fontFamily ?? DEFAULT_FONT_FAMILY
  return FONT_FAMILIES.find((f) => f.family === family)?.stack ?? 'system-ui, sans-serif'
}

export const MIN_NOTE_SIZE: Readonly<Size> = { width: 80, height: 80 }
export const CLICK_NOTE_SIZE: Readonly<Size> = { width: 200, height: 200 }
export const HEADER_HEIGHT = 24
export const TRASH_SIZE = 96
export const MAX_TEXT_LENGTH = 10_000

export const TEXT_DEBOUNCE_MS = 300
export const UNDO_TOAST_MS = 5_000
/** How long a delete ghost takes to reach the trash (decision 22), and its removal fallback. */
export const GHOST_MS = 350
export const SAVE_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000]
export const MOCK_LATENCY_MS: Readonly<{ min: number; max: number }> = { min: 200, max: 600 }
