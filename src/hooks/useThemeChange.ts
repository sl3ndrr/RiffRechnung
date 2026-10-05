import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ThemeMode } from '../types'
import { applyResolvedTheme, prefersReducedMotion, resolveTheme } from '../lib/theme'
import { canReveal, cancelThemeReveal, centerOf, runThemeReveal, type RevealOrigin } from '../lib/themeTransition'

export function useThemeChange(confirmed: ThemeMode, readConfirmed: () => ThemeMode, persist: (theme: ThemeMode) => Promise<boolean>) {
  const [requested, setRequested] = useState<ThemeMode | null>(null)
  const [appliedRequest, setAppliedRequest] = useState<ThemeMode | null>(null)
  const requestId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; requestId.current++; cancelThemeReveal() }
  }, [])

  const changeTheme = useCallback((theme: ThemeMode, origin?: RevealOrigin) => {
    const id = ++requestId.current
    const resolved = resolveTheme(theme)
    const start = origin ?? centerOf(document.querySelector('.theme-switch__thumb'))
    const reveal = start && canReveal() && !prefersReducedMotion() && document.documentElement.dataset.theme !== resolved
    const finish = (saved: boolean) => {
      if (!mounted.current || requestId.current !== id) return
      if (!saved) {
        cancelThemeReveal()
        applyResolvedTheme(resolveTheme(readConfirmed()))
      }
      setRequested(null)
      setAppliedRequest(null)
    }
    const update = () => {
      if (!mounted.current || requestId.current !== id) return
      // Include the thumb and both radio selections in the new snapshot; never
      // wait for storage inside the rendering-paused View Transition callback.
      applyResolvedTheme(resolveTheme(theme), !reveal)
      flushSync(() => setAppliedRequest(theme))
      // Start the existing storage queue only after the snapshot update. Its
      // promise is deliberately not returned to the transition callback.
      void persist(theme).then(finish, () => finish(false))
    }
    // Reflect the latest wish immediately, even before the snapshot callback.
    // Keep the DOM/OS-following mode separate until that callback actually runs.
    flushSync(() => setRequested(theme))
    if (reveal) runThemeReveal(update, start)
    else { cancelThemeReveal(); update() }
  }, [persist, readConfirmed])
  const theme = requested ?? confirmed
  return { theme, activeTheme: appliedRequest ?? confirmed, changeTheme }
}
