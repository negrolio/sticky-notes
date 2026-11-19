import { describe, expect, test } from 'vitest'
import css from './App.css?raw'

function ruleFor(selector: string): CSSStyleRule {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const sheet = style.sheet
  style.remove()
  if (!sheet) throw new Error('App.css did not parse')
  const rule = [...sheet.cssRules].find(
    (r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === selector && r.style.getPropertyValue('touch-action') !== '',
  )
  if (!rule) throw new Error(`no touch-action rule for ${selector}`)
  return rule
}

describe('touch', () => {
  // The board holds every note, so its value also covers note moves, resizes and drag-to-create.
  test.each(['.board', '.toolbar-grip'])('%s keeps the browser from panning, so a touch drag is not cancelled', (selector) => {
    expect(ruleFor(selector).style.getPropertyValue('touch-action')).toBe('none')
  })
})
