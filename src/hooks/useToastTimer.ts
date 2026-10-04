import { useCallback, useEffect, useRef, useState } from 'react'

export function useToastTimer(durationMs: number, onExpire: () => void) {
  const remaining = useRef(durationMs)
  const startedAt = useRef(0)
  const timer = useRef<number | null>(null)
  const active = useRef(false)
  const reasons = useRef(new Set<'hover' | 'focus'>())
  const [paused, setPaused] = useState(false)

  const stop = useCallback(() => {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
  }, [])
  const start = useCallback(() => {
    if (!active.current || reasons.current.size || timer.current !== null) return
    startedAt.current = Date.now()
    timer.current = window.setTimeout(() => {
      timer.current = null
      remaining.current = 0
      active.current = false
      onExpire()
    }, remaining.current)
  }, [onExpire])

  useEffect(() => {
    active.current = true
    start()
    return () => { stop(); active.current = false }
  }, [start, stop])

  const pause = (reason: 'hover' | 'focus', value: boolean) => {
    if (value) { reasons.current.add(reason); stop() }
    else reasons.current.delete(reason)
    setPaused(reasons.current.size > 0)
    start()
  }
  const claim = () => {
    stop()
    if (!active.current || remaining.current <= 0) return false
    active.current = false
    return true
  }
  return { paused, pause, claim }
}
