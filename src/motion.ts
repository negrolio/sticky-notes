/**
 * Whether the user asked for reduced motion. Read through `window.matchMedia` on each call, so tests
 * can stub it. A browser without it (jsdom) counts as not asking.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
