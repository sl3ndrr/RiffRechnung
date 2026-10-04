import { test, expect, type Locator, type Page } from '@playwright/test'
import { serializeBackup } from '../../src/lib/storage'
import { undoFixture } from '../undoFixtures'
import { navigateToInvoices } from './navigation'

test.use({ reducedMotion: 'no-preference', colorScheme: 'light' })

type MotionWindow = Window & { motionEvents: string[] }

async function seed(page: Page, reduced = false) {
  const state = undoFixture()
  state.settings.reducedMotion = reduced
  state.settings.theme = 'light'
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
  await page.evaluate(() => {
    const motion = window as unknown as MotionWindow
    motion.motionEvents = []
    document.addEventListener('animationstart', (event) => motion.motionEvents.push(event.animationName))
  })
}

async function durations(element: Locator, pseudo: string | null = null) {
  return element.evaluate((node, pseudo) => {
    const style = getComputedStyle(node, pseudo)
    const ms = (values: string) => values.split(',').map((value) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000))
    return { animations: ms(style.animationDuration), transitions: ms(style.transitionDuration), delays: ms(style.animationDelay) }
  }, pseudo)
}

async function expectReleased(page: Page) {
  await expect(page.locator('.modal-layer')).toHaveCount(0)
  await expect(page.locator('#root')).not.toHaveAttribute('inert')
  await expect(page.locator('body')).not.toHaveClass(/modal-open/)
}

test('3.AP6: Dialog und Bestätigung animieren, behalten Fokusfalle und geben Fokus zurück', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  const trigger = page.getByRole('button', { name: 'Neue Rechnung', exact: true })
  await trigger.focus()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
  await expect(dialog).toHaveCount(1)
  expect((await durations(dialog)).animations[0]).toBe(220)
  await expect(dialog.getByRole('heading', { name: 'Neue Rechnung', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Finalisieren', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Dialog schließen', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expectReleased(page)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => (window as unknown as MotionWindow).motionEvents)).toEqual(expect.arrayContaining(['motion-fade-in', 'motion-fade-out']))

  await page.locator('.sidebar').getByRole('button', { name: 'Einstellungen', exact: true }).click()
  const issuer = page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })
  await issuer.fill('Noch nicht gespeichert')
  const navigation = page.locator('.sidebar').getByRole('button', { name: 'Personen', exact: true })
  await navigation.focus()
  await navigation.click()
  const confirm = page.getByRole('alertdialog', { name: 'Ungespeicherte Einstellungen verwerfen?' })
  await expect(confirm).toHaveCount(1)
  await expect(confirm.getByRole('button', { name: 'Weiter bearbeiten', exact: true })).toBeFocused()
  await confirm.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click()
  await expectReleased(page)
  await expect(navigation).toBeFocused()
  await expect(issuer).toHaveValue('Noch nicht gespeichert')
})

test('3.AP6: ausgefallenes animationend entfernt Dialog und Toast über den Timeout', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  // Cancel each exit at animationstart: no animationend can reach the hook.
  await page.evaluate(() => document.addEventListener('animationstart', (event) => {
    if (!event.animationName.endsWith('-out') || !(event.target instanceof HTMLElement)) return
    for (const animation of event.target.getAnimations()) animation.cancel()
  }))
  await page.keyboard.press('Escape')
  await expectReleased(page)
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expectReleased(page)

  await page.locator('.sidebar').getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await page.getByRole('button', { name: 'JSON exportieren', exact: true }).click()
  await expect(page.locator('.toast')).toBeVisible()
  expect((await durations(page.locator('.toast'))).animations[0]).toBe(220)
  await page.getByRole('button', { name: 'Meldung schließen', exact: true }).click()
  await expect(page.locator('.toast')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as MotionWindow).motionEvents)).toContain('motion-rise-out')
})

test('3.AP6: Navigation bewegt Indikator und blendet nur den neuen Inhalt ein; Theme bleibt kurzzeitig', async ({ page }) => {
  await seed(page)
  const main = await page.locator('#main-content').elementHandle()
  const indicator = page.locator('.sidebar .nav-indicator')
  expect((await durations(indicator)).transitions[0]).toBe(220)
  for (const [name, index] of [['Rechnungen', 1], ['Personen', 2], ['Einstellungen', 3], ['Dashboard', 0]] as const) {
    await page.locator('.sidebar').getByRole('button', { name, exact: true }).click()
    await expect(page.locator('#main-content')).toHaveClass(/motion-fade/)
    expect(await main!.evaluate((node) => node === document.getElementById('main-content'))).toBe(true)
    await expect(page.locator('.sidebar nav')).toHaveCSS('--nav-index', String(index))
    await expect(page.locator('.sidebar [aria-current="page"]')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  }
  await main?.dispose()
  // Capture the short class without depending on assertion/network timing.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (document.documentElement.classList.contains('theme-changing')) (window as unknown as MotionWindow).motionEvents.push('theme-changing')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  })
  await page.locator('.topbar').getByRole('radio', { name: 'Dunkel', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).not.toHaveClass(/theme-changing/)
  expect(await page.evaluate(() => (window as unknown as MotionWindow).motionEvents)).toContain('theme-changing')
  expect((await durations(page.locator('.theme-switch__thumb'))).transitions[0]).toBe(220)
  await page.locator('.topbar').getByRole('radio', { name: 'System', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).not.toHaveClass(/theme-changing/)
})

test('3.AP6: mobile Schublade und Scrim schließen; Bottom-Navigation bleibt bedienbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page)
  const open = page.getByRole('button', { name: 'Navigation öffnen', exact: true })
  const sidebar = page.locator('.sidebar')
  expect((await durations(sidebar)).transitions[0]).toBe(220)
  expect((await durations(page.locator('.mobile-bottom-nav .nav-indicator'))).transitions[0]).toBe(220)
  for (const close of ['escape', 'scrim', 'navigation'] as const) {
    await open.click()
    await expect(sidebar).toHaveClass(/sidebar--open/)
    await expect(sidebar.getByRole('button', { name: 'Navigation schließen', exact: true })).toBeFocused()
    await expect(page.locator('.app-main')).toHaveAttribute('inert', '')
    if (close === 'escape') await page.keyboard.press('Escape')
    else if (close === 'scrim') await page.locator('.nav-scrim').click({ position: { x: 380, y: 200 } })
    else await sidebar.getByRole('button', { name: 'Personen', exact: true }).click()
    await expect(sidebar).not.toHaveClass(/sidebar--open/)
    await expect(sidebar).toHaveAttribute('inert', '')
    await expect(page.locator('.nav-scrim')).toHaveCount(0)
    await expect(page.locator('.app-main')).not.toHaveAttribute('inert')
    if (close !== 'navigation') await expect(open).toBeFocused()
    else await expect(page.locator('#main-content')).toBeFocused()
  }
  await navigateToInvoices(page)
  await expect(page.locator('.mobile-bottom-nav [aria-current="page"]')).toHaveAccessibleName('Rechnungen')
  await open.click()
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(page.locator('.nav-scrim')).toHaveCount(0)
  await expect(sidebar).not.toHaveAttribute('inert')
  await expect(sidebar).not.toHaveClass(/sidebar--open/)
})

test('3.AP6: Undo-Fortschritt und Pause bleiben während aktiver Toast-Animation erhalten', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await page.locator('.invoice-list-table').getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail__footer').getByRole('button', { name: 'Löschen', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Entwurf löschen', exact: true }).click()
  await expectReleased(page)
  const toast = page.locator('.toast').filter({ hasText: 'Entwurf gelöscht. Rückgängig möglich.' })
  const progress = toast.locator('.toast__progress')
  await expect(progress).toBeVisible()
  await expect(progress).toHaveCSS('animation-duration', '10s')
  await toast.hover()
  await expect(progress).toHaveCSS('animation-play-state', 'paused')
  await page.mouse.move(0, 0)
  await expect(progress).toHaveCSS('animation-play-state', 'running')
  await toast.getByRole('button', { name: 'Löschen von Entwurf rückgängig machen', exact: true }).click()
  await expect(toast).toHaveCount(0)
  await expect(page.locator('.invoice-list-table').getByRole('button', { name: 'Entwurf', exact: true })).toBeVisible()
})

for (const preference of ['setting', 'media'] as const) {
  test(`3.AP6: ${preference} reduziert alle Dauern und Staffelverzögerungen auf höchstens 0,01 ms`, async ({ page }) => {
    if (preference === 'media') await page.emulateMedia({ reducedMotion: 'reduce' })
    await seed(page, preference === 'setting')
    if (preference === 'setting') await expect(page.locator('html')).toHaveClass(/reduce-motion/)
    await page.evaluate(() => {
      const sample = document.createElement('div')
      sample.className = 'motion-rise motion-stagger motion-sample'
      sample.style.setProperty('--stagger-index', '5')
      document.body.append(sample)
    })
    await navigateToInvoices(page)
    await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
    for (const selector of ['.modal-layer', '.modal', '.theme-switch__thumb', '.sidebar .nav-indicator', '#main-content', '.motion-sample', '.button']) {
      const values = await durations(page.locator(selector).first())
      for (const ms of [...values.animations, ...values.transitions, ...values.delays]) expect(ms).toBeLessThanOrEqual(.010001)
    }
    await page.keyboard.press('Escape')
    await expectReleased(page)
    await page.locator('.sidebar').getByRole('button', { name: 'Einstellungen', exact: true }).click()
    const thumb = await durations(page.locator('.switch-row > i').first(), '::after')
    for (const ms of thumb.transitions) expect(ms).toBeLessThanOrEqual(.010001)
    await page.getByRole('button', { name: 'JSON exportieren', exact: true }).click()
    const toast = await durations(page.locator('.toast'))
    for (const ms of toast.animations) expect(ms).toBeLessThanOrEqual(.010001)
    await page.getByRole('button', { name: 'Meldung schließen', exact: true }).click()
    await expect(page.locator('.toast')).toHaveCount(0)
  })
}

test('3.AP6: Druck und print-root bleiben ohne Motion und ohne transparenten Startzustand', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await page.locator('.invoice-list-table').getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.evaluate(() => { window.print = () => {} })
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click()
  await expect(page.locator('.invoice-paper')).toHaveCount(1)
  await page.evaluate(() => {
    // Stress the exclusion during a theme change and with utility classes.
    document.documentElement.classList.add('theme-changing')
    const sample = document.createElement('div')
    sample.className = 'motion-fade motion-stagger print-motion-sample'
    sample.style.setProperty('--stagger-index', '5')
    document.querySelector('.print-root')!.append(sample)
  })
  for (const selector of ['.invoice-paper', '.invoice-paper h1', '.print-motion-sample']) {
    const values = await durations(page.locator(selector).first())
    expect(values.animations).toEqual([0])
    expect(values.transitions).toEqual([0])
    await expect(page.locator(selector).first()).toHaveCSS('opacity', '1')
  }
  await page.emulateMedia({ media: 'print' })
  const styles = await page.locator('body *').evaluateAll((nodes) => nodes.flatMap((node) => [null, '::before', '::after'].map((pseudo) => {
    const style = getComputedStyle(node, pseudo)
    return [style.animationName, style.animationDuration, style.transitionDuration]
  })))
  for (const [name, animation, transition] of styles) {
    expect(name).toBe('none')
    expect(animation).toBe('0s')
    expect(transition).toBe('0s')
  }
  await expect(page.locator('.print-motion-sample')).toHaveCSS('opacity', '1')
})
