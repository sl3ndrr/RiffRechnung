import { useEffect, useState } from 'react'
import { createCountUp } from '../lib/countUp'
import { useReducedMotion } from './useReducedMotion'

export function useCountUp(value: number, duration = 750) {
  const reduced = useReducedMotion()
  const [initialValue] = useState(value)
  const [displayed, setDisplayed] = useState(reduced ? value : 0)
  const [animation] = useState(() => createCountUp(value, reduced, setDisplayed, {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  }, duration))
  useEffect(() => {
    animation.update(value, reduced)
    animation.start()
    return animation.stop
  }, [animation, reduced, value])

  // New data is authoritative immediately, even before effect cleanup.
  return reduced || value !== initialValue || animation.finished() ? value : displayed
}
