import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCountUp, type CountUpClock } from '../src/lib/countUp'

function fixture(target = 123457, reduced = false) {
  let time = 0
  let sequence = 0
  const frames = new Map<number, () => void>()
  const values: number[] = []
  const clock: CountUpClock = {
    now: () => time,
    request: (callback) => { frames.set(++sequence, callback); return sequence },
    cancel: (id) => { frames.delete(id) },
  }
  const animation = createCountUp(target, reduced, (value) => values.push(value), clock)
  const advance = (milliseconds: number) => {
    time += milliseconds
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback())
  }
  return { animation, advance, frames, values }
}

test('useCountUp: easing-out uses integer cents and reaches the exact end value', () => {
  const { animation, advance, values, frames } = fixture()
  animation.start()
  advance(375)
  assert.equal(animation.value(), 108025)
  advance(375)
  assert.equal(animation.value(), 123457)
  assert.equal(animation.finished(), true)
  assert.equal(frames.size, 0)
  assert.ok(values.every(Number.isSafeInteger))
})

test('useCountUp: unmount cancels the frame, including an already queued callback', () => {
  const { animation, frames, values, advance } = fixture()
  animation.start()
  const staleCallback = [...frames.values()][0]
  animation.stop()
  const count = values.length
  staleCallback()
  advance(1000)
  assert.equal(frames.size, 0)
  assert.equal(values.length, count)
})

test('useCountUp: reduced motion returns the end value with no animation frames', () => {
  const { animation, frames } = fixture(758, true)
  animation.start()
  assert.equal(animation.value(), 758)
  assert.equal(frames.size, 0)
})

test('useCountUp: a value change mid-animation is immediate and never restarts', () => {
  const { animation, advance, frames } = fixture()
  animation.start()
  advance(100)
  animation.update(990001, false)
  assert.equal(animation.value(), 990001)
  assert.equal(frames.size, 0)
  animation.start()
  advance(1000)
  assert.equal(animation.value(), 990001)
  animation.update(123457, false)
  animation.start()
  assert.equal(animation.value(), 123457)
  assert.equal(frames.size, 0)
})

test('useCountUp: enabling reduced motion finishes and stays finished when disabled', () => {
  const { animation, advance, frames } = fixture()
  animation.start()
  advance(100)
  animation.update(123457, true)
  animation.update(123457, false)
  animation.start()
  assert.equal(animation.value(), 123457)
  assert.equal(frames.size, 0)
})

test('useCountUp: a suspended tab catches up from elapsed time', () => {
  const { animation, advance, frames } = fixture(Number.MAX_SAFE_INTEGER)
  animation.start()
  advance(60_000)
  assert.equal(animation.value(), Number.MAX_SAFE_INTEGER)
  assert.equal(frames.size, 0)
})

test('useCountUp: effect cleanup and setup may replay before completion (StrictMode)', () => {
  const { animation, advance, frames } = fixture()
  animation.start()
  animation.stop()
  animation.start()
  advance(750)
  assert.equal(animation.value(), 123457)
  assert.equal(frames.size, 0)
})
