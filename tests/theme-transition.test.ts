import test from 'node:test'
import assert from 'node:assert/strict'
import { applyResolvedTheme, resetAppliedTheme, resolveTheme } from '../src/lib/theme'
import { cancelThemeReveal, centerOf, runThemeReveal } from '../src/lib/themeTransition'

function environment() {
  const values = new Map<string, string>()
  const classes = new Set<string>()
  const root = {
    dataset: {} as Record<string, string>,
    style: { colorScheme: '', setProperty: (key: string, value: string) => { values.set(key, value) } },
    classList: { contains: (value: string) => classes.has(value), add: (value: string) => { classes.add(value) }, remove: (value: string) => { classes.delete(value) } },
  }
  const transitions: Array<{ update: () => void; finish: () => void; skipped: boolean }> = []
  let dark = false
  let reduce = false
  let meta = ''
  const document = {
    documentElement: root,
    body: {},
    querySelector: () => ({ setAttribute: (_: string, value: string) => { meta = value } }),
    startViewTransition: (update: () => void) => {
      let finish!: () => void
      const finished = new Promise<void>((resolve) => { finish = resolve })
      const entry = { update, finish, skipped: false }
      transitions.push(entry)
      return { ready: Promise.resolve(), finished, skipTransition: () => { entry.skipped = true } }
    },
  }
  const globals = {
    document,
    window: { clearTimeout, setTimeout },
    innerWidth: 800,
    innerHeight: 600,
    matchMedia: (query: string) => ({ matches: query.includes('reduced-motion') ? reduce : dark }),
    getComputedStyle: () => ({ backgroundColor: '', getPropertyValue: (key: string) => key === '--surface' ? (root.dataset.theme === 'dark' ? '#11151c' : '#f5f7fb') : '250ms' }),
  }
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true })
  return {
    root, transitions, values, classes,
    get meta() { return meta },
    setDark: (value: boolean) => { dark = value },
    setReduced: (value: boolean) => { reduce = value },
    cleanup: () => {
      cancelThemeReveal()
      resetAppliedTheme()
      for (const [key, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    },
  }
}

test('Theme reveal: stale callbacks cannot update or clear the latest transition', async () => {
  const env = environment()
  try {
    const updates: string[] = []
    runThemeReveal(() => updates.push('old'), { x: 20, y: 30 })
    runThemeReveal(() => updates.push('latest'), { x: 400, y: 300 })
    assert.equal(env.transitions[0].skipped, true)
    env.transitions[0].update()
    env.transitions[1].update()
    assert.deepEqual(updates, ['latest'])
    env.transitions[0].finish()
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(env.root.dataset.transition, 'theme')
    assert.equal(env.values.get('--reveal-radius'), '500px')
    env.transitions[1].finish()
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(env.root.dataset.transition, undefined)
  } finally { env.cleanup() }
})

test('Theme reveal: unmount cancellation invalidates the pending callback', () => {
  const env = environment()
  try {
    let called = false
    runThemeReveal(() => { called = true }, { x: 20, y: 30 })
    cancelThemeReveal()
    env.transitions[0].update()
    assert.equal(called, false)
    assert.equal(env.transitions[0].skipped, true)
    assert.equal(env.root.dataset.transition, undefined)
  } finally { env.cleanup() }
})

test('Theme: both reduced-motion sources bypass native snapshots', () => {
  const env = environment()
  try {
    let updates = 0
    env.setReduced(true)
    runThemeReveal(() => updates++, { x: 0, y: 0 })
    env.setReduced(false)
    env.classes.add('reduce-motion')
    runThemeReveal(() => updates++, { x: 0, y: 0 })
    assert.equal(updates, 2)
    assert.equal(env.transitions.length, 0)
    assert.equal(env.root.dataset.transition, undefined)
  } finally { env.cleanup() }
})

test('Theme: first paint and repeated colors do not fade; system changes do', () => {
  const env = environment()
  try {
    env.root.dataset.theme = 'dark' // stale first-paint hint
    applyResolvedTheme(resolveTheme('system'), true)
    assert.equal(env.root.dataset.theme, 'light')
    assert.equal(env.root.style.colorScheme, 'light')
    assert.equal(env.meta, '#f5f7fb')
    assert.equal(env.classes.has('theme-changing'), false)
    applyResolvedTheme('dark') // synchronous reveal update
    applyResolvedTheme('dark', true) // shell layout effect
    assert.equal(env.classes.has('theme-changing'), false)
    env.setDark(false)
    applyResolvedTheme(resolveTheme('system'), true)
    assert.equal(env.classes.has('theme-changing'), true)
    assert.equal(env.meta, '#f5f7fb')
    assert.deepEqual(centerOf({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 44, height: 44 }) } as Element), { x: 32, y: 42 })
  } finally { env.cleanup() }
})
