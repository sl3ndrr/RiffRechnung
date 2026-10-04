import { useLayoutEffect, useState, type RefObject } from 'react'
import { useReducedMotion } from './useReducedMotion'

function milliseconds(value: string) {
  return parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000) || 0
}

// Keep one element for its CSS exit, bounded by the computed duration even
// when animationend is lost. Reopening cancels both completion paths.
export function useMotionPresence(open: boolean, ref: RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion()
  const [retained, setRetained] = useState(open)
  const present = open || (!reduced && retained)

  useLayoutEffect(() => {
    if (open) { setRetained(true); return }
    const element = ref.current
    if (reduced || !element) { setRetained(false); return }
    const style = getComputedStyle(element)
    const delays = style.animationDelay.split(',').map(milliseconds)
    const duration = Math.max(0, ...style.animationDuration.split(',').map((value, index) => milliseconds(value) + delays[index % delays.length]))
    const finish = () => setRetained(false)
    if (!duration || style.animationName === 'none') { finish(); return }
    const onEnd = (event: AnimationEvent) => { if (event.target === element && style.animationName.split(',').map((name) => name.trim()).includes(event.animationName)) finish() }
    element.addEventListener('animationend', onEnd)
    const timer = window.setTimeout(finish, duration)
    return () => { window.clearTimeout(timer); element.removeEventListener('animationend', onEnd) }
  }, [open, reduced, ref])

  return present
}
