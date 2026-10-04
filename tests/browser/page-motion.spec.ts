import { test, expect, type Page } from '@playwright/test'
import { serializeBackup } from '../../src/lib/storage'
import { dashboardStats } from '../../src/lib/dashboardStats'
import { euro } from '../../src/lib/utils'
import { dashboardFixture, dashboardManyOpen, dashboardNow } from '../dashboardFixtures'
import { navigateToInvoices } from './navigation'

type MotionEvent = { name: string; target: string }
type MotionWindow = Window & { pageMotion: MotionEvent[]; countUpProbe: { update: (value: number) => void; unmount: () => void } }

async function seed(page: Page, many = false) {
  await page.clock.setFixedTime(dashboardNow)
  await page.addInitScript(() => {
    const motion = window as unknown as MotionWindow
    motion.pageMotion = []
    document.addEventListener('animationstart', (event) => {
      const node = event.target as HTMLElement
      motion.pageMotion.push({ name: event.animationName, target: node.matches('.invoice-list-table tbody tr') ? 'invoice-row' : node.matches('.student-card, .guardian-row') ? 'person-row' : node.matches('.dashboard-stat') ? 'stat' : node.matches('.dashboard-chart__bar') ? 'bar' : 'other' })
    })
  })
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(many ? dashboardManyOpen() : dashboardFixture()))
  await page.reload()
}

const events = (page: Page, target: string) => page.evaluate((target) => (window as unknown as MotionWindow).pageMotion.filter((event) => event.target === target).length, target)
const navigation = (page: Page) => page.locator('.sidebar')

test('3.AP7: Dashboard-Endwerte sind sofort zugänglich und erreichen exakt die AP2-Kennzahlen', async ({ page }) => {
  await seed(page)
  const expected = dashboardStats(dashboardFixture(), dashboardNow)
  const values = [expected.paid.yearCents, expected.open.totalCents, expected.drafts.totalCents].map((value) => euro.format(value / 100)).concat(String(expected.people.guardians), String(expected.people.students))
  await expect(page.locator('.dashboard-stat__end')).toHaveText(values)
  expect(await page.locator('.dashboard-stat__value').evaluateAll((nodes) => nodes.every((node) => node.getAttribute('aria-hidden') === 'true'))).toBe(true)
  await expect(page.locator('.dashboard-stat__value')).toHaveText(values)
  const before = await events(page, 'stat')
  const bars = await events(page, 'bar')
  await page.getByRole('combobox', { name: 'Jahr für Zahlungseingang', exact: true }).selectOption('2025')
  await expect(page.locator('.dashboard-stat__value').first()).toHaveText(euro.format(50))
  await expect(page.locator('.dashboard-stat__end').first()).toHaveText(euro.format(50))
  expect(await events(page, 'stat')).toBe(before)
  const duration = await page.locator('.dashboard-chart__bar').first().evaluate((node) => parseFloat(getComputedStyle(node).animationDuration))
  if (duration > 0) await expect.poll(() => events(page, 'bar')).toBeGreaterThan(bars)
})

test('3.AP7: Rechnungszeilen treten einmal ein und starten nach Suche, Filter und Zahlung nicht erneut', async ({ page }) => {
  await seed(page, true)
  await navigateToInvoices(page)
  const animated = page.locator('.invoice-list-table tbody tr.page-entry')
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  if (!reduced) await expect.poll(() => events(page, 'invoice-row')).toBeGreaterThan(0)
  await page.getByRole('searchbox', { name: 'Rechnungen durchsuchen', exact: true }).fill('2026')
  await expect(animated).toHaveCount(0)
  const before = await events(page, 'invoice-row')
  await page.getByRole('searchbox', { name: 'Rechnungen durchsuchen', exact: true }).fill('')
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('unpaid')
  await expect(animated).toHaveCount(0)
  await page.getByRole('button', { name: '2026-0001-a', exact: true }).click()
  await page.getByLabel('Tatsächlicher Zahlungstag', { exact: true }).fill('2026-09-16')
  await page.getByRole('button', { name: 'Vollzahlung erfassen', exact: true }).click()
  await expect(page.locator('.invoice-detail__amount .status-chip').first()).toHaveText('Bezahlt')
  await expect(animated).toHaveCount(0)
  expect(await events(page, 'invoice-row')).toBe(before)
})

test('3.AP7: Personenlisten starten nach Suche, Aktivfilter und Speichern nicht erneut', async ({ page }) => {
  await seed(page)
  await navigation(page).getByRole('button', { name: 'Personen', exact: true }).click()
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  if (!reduced) await expect.poll(() => events(page, 'person-row')).toBeGreaterThan(0)
  await page.getByRole('searchbox', { name: 'Personen durchsuchen', exact: true }).fill('Anna')
  await expect(page.locator('.people-page .page-entry')).toHaveCount(0)
  const before = await events(page, 'person-row')
  await page.getByRole('searchbox', { name: 'Personen durchsuchen', exact: true }).fill('')
  await page.getByLabel('Nur aktive Lernende anzeigen').uncheck()
  await page.locator('.student-card').first().getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Lernende Person bearbeiten', exact: true })
  await dialog.getByLabel('Name *', { exact: true }).fill('Aktualisierte Person')
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.people-page .page-entry')).toHaveCount(0)
  expect(await events(page, 'person-row')).toBe(before)
})

test('3.AP7: Detailwechsel hält nur einen bedienbaren Bereich und Eingaben sind sofort möglich', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await page.getByRole('button', { name: '2026-0001-a', exact: true }).click()
  await page.getByRole('button', { name: '2026-0002-a', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Details zu 2026-0002-a', exact: true })).toHaveCount(1)
  await expect(page.getByRole('complementary', { name: 'Details zu 2026-0001-a', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Detailansicht schließen', exact: true })).toBeFocused()
  await page.getByLabel('Tatsächlicher Zahlungstag', { exact: true }).fill('2026-09-16')
  await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toHaveValue('2026-09-16')
})

test('3.AP7: Editor entfernt Daten sofort, begrenzt dekorative Exits und lässt neue Zeilen bedienbar', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
  const student = dialog.getByRole('group', { name: 'Lernende', exact: true }).getByRole('checkbox').first()
  await student.press('Space')
  await expect(student).toBeChecked()
  await expect(dialog.locator('[data-item-id]')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Position', exact: true }).click()
  await expect(dialog.locator('[data-item-id]')).toHaveCount(2)
  await dialog.locator('[data-item-id]').last().getByLabel('Beschreibung', { exact: true }).fill('Sofort bedienbar')
  await dialog.getByRole('button', { name: 'Position 1 löschen', exact: true }).click()
  await expect(dialog.locator('[data-item-id]')).toHaveCount(1)
  await expect(dialog.locator('[data-item-id]').getByLabel('Beschreibung', { exact: true })).toHaveValue('Sofort bedienbar')
  await expect(dialog.locator('.editor-item--exit')).toHaveCount(0)
})

for (const preference of ['reduce', 'no-preference'] as const) test(`3.AP7: useCountUp-Hook-Lifecycle mit ${preference}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: preference })
  await page.goto('/')
  await page.clock.install({ time: dashboardNow })
  await page.clock.pauseAt(new Date(dashboardNow.getTime() + 1000))
  await page.evaluate(async () => {
    const path = '/tests/browser/countUpHarness.tsx'
    const { mountCountUp } = await import(path)
    ;(window as unknown as MotionWindow).countUpProbe = mountCountUp(123457)
  })
  const probe = page.locator('.count-up-probe')
  await expect(probe).toHaveText(preference === 'reduce' ? '123457' : '0')
  await page.clock.runFor(200)
  await page.evaluate(() => (window as unknown as MotionWindow).countUpProbe.update(990001))
  await expect(probe).toHaveText('990001')
  await page.clock.runFor(1000)
  await expect(probe).toHaveText('990001')
  await page.evaluate(() => (window as unknown as MotionWindow).countUpProbe.unmount())
  await page.clock.runFor(1000)
  await expect(probe).toHaveCount(0)
})

test('3.AP7: Chromium unter CPU-Drosselung begrenzt Eintritte und beendet die Animationen', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU-Drosselung verwendet CDP')
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  try {
    await seed(page, true)
    await navigateToInvoices(page)
    expect(await page.locator('.invoice-list-table tbody tr.page-entry').count()).toBeLessThanOrEqual(8)
    await page.getByRole('searchbox', { name: 'Rechnungen durchsuchen', exact: true }).fill('2026-0001-a')
    await expect(page.locator('.invoice-list-table tbody tr')).toHaveCount(1)
    await expect(page.locator('.invoice-list-table .page-entry')).toHaveCount(0)
    await expect.poll(() => page.locator('.invoice-list-table').evaluate((node) => node.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0)
  } finally { await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await session.detach() }
})
