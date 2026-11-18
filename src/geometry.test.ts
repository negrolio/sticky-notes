import { describe, expect, test } from 'vitest'
import { applyMinSize, clampRect, normalizeRect } from './geometry.ts'

describe('normalizeRect', () => {
  test('builds a rect from a top-left to bottom-right drag', () => {
    expect(normalizeRect({ x: 100, y: 100 }, { x: 400, y: 350 })).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 250,
    })
  })

  test('handles a drag toward the top-left', () => {
    expect(normalizeRect({ x: 400, y: 350 }, { x: 100, y: 100 })).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 250,
    })
  })

  test('handles mixed directions', () => {
    expect(normalizeRect({ x: 400, y: 100 }, { x: 100, y: 350 })).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 250,
    })
  })

  test('gives a zero-size rect for a click', () => {
    expect(normalizeRect({ x: 50, y: 60 }, { x: 50, y: 60 })).toEqual({
      x: 50,
      y: 60,
      width: 0,
      height: 0,
    })
  })
})

describe('applyMinSize', () => {
  const min = { width: 80, height: 80 }

  test('grows a small rect to the minimum, keeping its origin', () => {
    expect(applyMinSize({ x: 100, y: 100, width: 30, height: 20 }, min)).toEqual({
      x: 100,
      y: 100,
      width: 80,
      height: 80,
    })
  })

  test('grows only the dimension that is too small', () => {
    expect(applyMinSize({ x: 0, y: 0, width: 300, height: 10 }, min)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 80,
    })
  })

  test('leaves a large enough rect unchanged', () => {
    const rect = { x: 1, y: 2, width: 300, height: 250 }
    expect(applyMinSize(rect, min)).toEqual(rect)
  })
})

describe('clampRect', () => {
  const board = { width: 1024, height: 768 }

  test('leaves a rect inside the board unchanged', () => {
    const rect = { x: 100, y: 100, width: 300, height: 250 }
    expect(clampRect(rect, board)).toEqual(rect)
  })

  test('shifts a rect past the right and bottom edges back inside', () => {
    expect(clampRect({ x: 900, y: 700, width: 300, height: 200 }, board)).toEqual({
      x: 724,
      y: 568,
      width: 300,
      height: 200,
    })
  })

  test('shifts a rect past the left and top edges back inside', () => {
    expect(clampRect({ x: -50, y: -10, width: 200, height: 200 }, board)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    })
  })

  test('shrinks a rect larger than the board to the board', () => {
    expect(clampRect({ x: 10, y: 10, width: 2000, height: 1000 }, board)).toEqual({
      x: 0,
      y: 0,
      width: 1024,
      height: 768,
    })
  })
})
