import { useLayoutEffect, useState, type CSSProperties } from 'react'
import { useReducedMotion } from './useReducedMotion'

export const staggerStyle = (index: number) => ({ '--stagger-index': index } as CSSProperties)

// Once per mount/first visible display. Any list update ends the entrance,
// including updates before its last staggered row has started.
export function usePageEntrance(revision?: unknown, visible = true) {
  const reduced = useReducedMotion()
  const [initialRevision] = useState(() => revision)
  const [phase, setPhase] = useState<'pending' | 'enter' | 'done'>(visible ? 'enter' : 'pending')
  useLayoutEffect(() => {
    if (!visible) { if (phase === 'enter') setPhase('done'); return }
    if (phase === 'pending') { setPhase(reduced ? 'done' : 'enter'); return }
    if (phase !== 'enter') return
    if (reduced || revision !== initialRevision) { setPhase('done'); return }
    const style = getComputedStyle(document.documentElement)
    const duration = parseFloat(style.getPropertyValue('--dur-base')) + 7 * parseFloat(style.getPropertyValue('--dur-stagger'))
    const timer = window.setTimeout(() => setPhase('done'), duration || 0)
    return () => window.clearTimeout(timer)
  }, [initialRevision, phase, reduced, revision, visible])
  return phase === 'enter' && visible && !reduced && revision === initialRevision
}
