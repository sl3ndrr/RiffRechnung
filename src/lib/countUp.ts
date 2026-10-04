export interface CountUpClock {
  now: () => number
  request: (callback: () => void) => number
  cancel: (id: number) => void
}

// Interpolate integers only; elapsed time also catches up after a suspended tab.
export function startCountUp(target: number, duration: number, publish: (value: number, finished: boolean) => void, clock: CountUpClock) {
  const startedAt = clock.now()
  let frame: number | null = null
  let stopped = false
  const tick = () => {
    if (stopped) return
    const progress = duration > 0 ? Math.min(1, Math.max(0, (clock.now() - startedAt) / duration)) : 1
    publish(progress === 1 ? target : Math.round(target * (1 - (1 - progress) ** 3)), progress === 1)
    if (progress < 1) frame = clock.request(tick)
    else frame = null
  }
  tick()
  return () => { stopped = true; if (frame !== null) clock.cancel(frame) }
}

// Lifecycle used by useCountUp, independently testable without a DOM renderer.
export function createCountUp(target: number, reduced: boolean, publish: (value: number) => void, clock: CountUpClock, duration = 750) {
  let current = target
  let displayed = reduced ? target : 0
  let finished = reduced || target === 0
  let cancel: (() => void) | undefined
  const stop = () => { cancel?.(); cancel = undefined }
  return {
    value: () => displayed,
    finished: () => finished,
    start: () => {
      if (finished || cancel) return
      cancel = startCountUp(target, duration, (next, done) => { displayed = next; finished = done; publish(next) }, clock)
    },
    update: (next: number, reduce: boolean) => {
      if (next === current && !reduce) return
      stop()
      current = next
      displayed = next
      finished = true
      publish(next)
    },
    stop,
  }
}
