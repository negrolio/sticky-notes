import { expect, test } from 'vitest'
import { DEFAULT_COLOR, PALETTE } from './model.ts'

test('the palette holds the 5 spec colors with yellow as the default', () => {
  expect(PALETTE.map((entry) => entry.color)).toEqual([
    '#FFF59D',
    '#F8BBD0',
    '#C5E1A5',
    '#B3E5FC',
    '#D1C4E9',
  ])
  expect(DEFAULT_COLOR).toBe('#FFF59D')
})
