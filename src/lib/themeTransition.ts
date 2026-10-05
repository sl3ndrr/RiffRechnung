import { clearThemeFade, prefersReducedMotion } from './theme'

export interface RevealOrigin { x: number; y: number }

interface ThemeViewTransition {
  skipTransition: () => void
  ready: Promise<void>
  finished: Promise<void>
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ThemeViewTransition
}

let active: ThemeViewTransition | null = null
let generation = 0

export const canReveal = () => typeof (document as TransitionDocument).startViewTransition === 'function'

export function centerOf(element: Element | null): RevealOrigin | undefined {
  if (!element) return undefined
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export function cancelThemeReveal() {
  generation++
  active?.skipTransition()
  active = null
  delete document.documentElement.dataset.transition
}

export function runThemeReveal(update: () => void, origin: RevealOrigin) {
  cancelThemeReveal()
  const current = generation
  const root = document.documentElement
  const start = (document as TransitionDocument).startViewTransition
  if (!start || prefersReducedMotion()) { update(); return }
  clearThemeFade()
  root.dataset.transition = 'theme'
  root.style.setProperty('--reveal-x', `${origin.x}px`)
  root.style.setProperty('--reveal-y', `${origin.y}px`)
  root.style.setProperty('--reveal-radius', `${Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y))}px`)
  // Skipping a transition does not cancel its queued update callback. Guard
  // that callback too, so an old click can never overwrite the latest request.
  const apply = () => { if (generation === current) update() }
  try {
    const transition = start.call(document, apply)
    active = transition
    void transition.ready.catch(() => {})
    void transition.finished.catch(() => {}).finally(() => {
      if (active !== transition) return
      active = null
      delete root.dataset.transition
    })
  } catch {
    cancelThemeReveal()
    update()
  }
}
