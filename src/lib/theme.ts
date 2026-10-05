import type { ThemeMode } from '../types'

export type ResolvedTheme = 'light' | 'dark'

let applied: ResolvedTheme | null = null
let fadeTimer: number | undefined

export function prefersReducedMotion() {
  return document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function resolveTheme(theme: ThemeMode): ResolvedTheme {
  return theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
}

export function clearThemeFade() {
  window.clearTimeout(fadeTimer)
  document.documentElement.classList.remove('theme-changing')
}

// One owner for DOM colors: a later layout effect must not fade an already
// applied reveal. The first confirmed paint never animates, even with a stale hint.
export function applyResolvedTheme(theme: ResolvedTheme, fade = false) {
  const root = document.documentElement
  if (applied === theme && root.dataset.theme === theme) return
  clearThemeFade()
  if (applied !== null && fade && !prefersReducedMotion()) {
    root.classList.add('theme-changing')
    void getComputedStyle(document.body).backgroundColor
    const duration = parseFloat(getComputedStyle(root).getPropertyValue('--dur-theme'))
    fadeTimer = window.setTimeout(clearThemeFade, Number.isFinite(duration) ? duration : 250)
  }
  applied = theme
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--surface').trim())
}

export function resetAppliedTheme() {
  clearThemeFade()
  applied = null
}
