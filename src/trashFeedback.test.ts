import { afterEach, describe, expect, test } from 'vitest'
import css from './App.css?raw'

// jsdom does no layout or transitions, so AC 51 is checked through the rules the browser applies.
let style: HTMLStyleElement | null = null
afterEach(() => {
  style?.remove()
  style = null
})

function sheet(): CSSStyleSheet {
  style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  if (!style.sheet) throw new Error('App.css did not parse')
  return style.sheet
}

function styleRules(rules: CSSRuleList): CSSStyleRule[] {
  return [...rules].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
}

/** The value of `property` in the last rule for `selector`, as the cascade would pick it. */
function declared(rules: CSSStyleRule[], selector: string, property: string): string {
  const values = rules
    .filter((rule) => rule.selectorText.split(',').map((s) => s.trim()).includes(selector))
    .map((rule) => rule.style.getPropertyValue(property))
    .filter((value) => value !== '')
  return values[values.length - 1] ?? ''
}

function reducedMotionRules(root: CSSStyleSheet): CSSStyleRule[] {
  const media = [...root.cssRules].filter(
    (rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-reduced-motion: reduce'),
  )
  return media.flatMap((rule) => styleRules(rule.cssRules))
}

describe('AC 51: trash icon feedback', () => {
  test('the icon scales to 1.2x while the zone is highlighted and is unscaled otherwise', () => {
    const rules = styleRules(sheet().cssRules)
    expect(declared(rules, '.trash[data-active] svg', 'transform')).toBe('scale(1.2)')
    expect(declared(rules, '.trash svg', 'transform')).toBe('')
  })

  test('the scale has a ~150 ms ease-out transition both ways', () => {
    const rules = styleRules(sheet().cssRules)
    // On the unhighlighted rule, so it applies when the scale is added and when it is removed.
    expect(declared(rules, '.trash svg', 'transition')).toBe('transform 150ms ease-out')
    expect(declared(rules, '.trash[data-active] svg', 'transition')).toBe('')
  })

  test('under reduced motion the scale still applies, without the transition', () => {
    const root = sheet()
    const reduced = reducedMotionRules(root)
    expect(declared(reduced, '.trash svg', 'transition')).toBe('none')
    expect(declared(reduced, '.trash[data-active] svg', 'transform')).toBe('')
  })
})
