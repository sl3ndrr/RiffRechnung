import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { AppState } from '../../src/types'
import { dashboardStats } from '../../src/lib/dashboardStats'
import { createDemoState, emptyState } from '../../src/lib/defaults'
import { parseBackup, serializeBackup, STORAGE_KEY } from '../../src/lib/storage'
import { euro } from '../../src/lib/utils'
import { documentAt, documentDraft } from '../documentFixtures'
import { changeInvoiceStatus, saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { dashboardFixture, dashboardManyOpen, dashboardNow } from '../dashboardFixtures'

async function seed(page: Page, state: AppState) {
  await page.clock.setFixedTime(dashboardNow)
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
}

const amount = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true }).locator('.dashboard-stat__value')
const navigation = (page: Page) => page.locator((page.viewportSize()?.width ?? 1280) <= 820 ? '.mobile-bottom-nav' : '.sidebar')

test('3.AP3: Startseite begrüßt den gespeicherten Vornamen und zeigt exakte Fixture-Zahlen', async ({ page }) => {
  await seed(page, dashboardFixture())
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Guten Morgen, Anna')
  await expect(page.locator('.dashboard-header time')).toHaveText('Mittwoch, 16. September 2026')
  await expect(navigation(page).getByRole('button', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(amount(page, 'Bezahlt')).toHaveText(euro.format(10))
  await expect(amount(page, 'Offen')).toHaveText(euro.format(55))
  await expect(amount(page, 'Entwürfe (nicht finalisiert)')).toHaveText(euro.format(7.58))
  await expect(amount(page, 'Eltern')).toHaveText('2')
  await expect(amount(page, 'Kinder')).toHaveText('2')
  await expect(page.getByRole('article', { name: 'Kinder', exact: true })).toContainText('davon aktiv: 1')
  await expect(page.getByRole('article', { name: 'Bezahlt', exact: true })).toContainText('1 Zahlung ohne bestätigten Zahlungstag: 5,00')
  await expect(page.getByRole('article', { name: 'Offen', exact: true })).toContainText('1 Rechnung überfällig · 30,00')
  await expect(page.getByRole('heading', { name: 'Noch nicht gezahlt (2)', exact: true })).toBeVisible()
  await expect(page.locator('.dashboard-open-row__person > strong')).toHaveText(['2026-0001-a', '2026-0002-a'])
  await expect(page.locator('.dashboard-open-row').first()).toContainText('2 Tage überfällig')
  await expect(page.locator('.dashboard-open-row').first()).toContainText('seit 15 Tagen offen')
  await expect(page.locator('.dashboard-open-row').last()).toContainText('Fällig in 4 Tagen')
  await expect(page.getByRole('button', { name: 'Neue Rechnung', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('3.AP3: offene Rechnung öffnet per Enter die ausgewählte Rechnungsansicht', async ({ page }) => {
  await seed(page, dashboardFixture())
  await page.locator('.dashboard-open-row').last().press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Rechnungen', exact: true })).toBeVisible()
  await expect(page.locator('.invoice-detail h2')).toHaveText('2026-0002-a')
  await expect(page.getByRole('button', { name: 'Detailansicht schließen', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.invoice-detail')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '2026-0002-a', exact: true })).toBeFocused()
})

test('3.AP3: Jahresauswahl wechselt Zahlungseingang, Monatswerte und zugängliche Texttabelle', async ({ page }) => {
  await seed(page, dashboardFixture())
  const year = page.getByRole('combobox', { name: 'Jahr für Zahlungseingang', exact: true })
  await expect(year.locator('option')).toHaveText(['2026', '2025'])
  const table = page.getByRole('table', { name: /Zahlungseingang pro Monat/ })
  await expect(table.locator('tbody tr')).toHaveCount(12)
  await expect(table.getByRole('row', { name: /Februar/ })).toContainText(euro.format(10))
  await year.selectOption('2025')
  await expect(amount(page, 'Bezahlt')).toHaveText(euro.format(50))
  await expect(amount(page, 'Offen')).toHaveText(euro.format(55))
  await expect(table).toHaveAccessibleName(/2025/)
  await expect(table.getByRole('row', { name: /Dezember/ })).toContainText(euro.format(50))
  await expect(page.locator('.dashboard-chart__month--empty')).toHaveCount(11)
  await year.selectOption('2026')
  await expect(amount(page, 'Bezahlt')).toHaveText(euro.format(10))
})

test('3.AP3: leerer Einstieg, Namenshinweis und Person anlegen sind bedienbar', async ({ page }) => {
  await page.clock.setFixedTime(dashboardNow)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Guten Morgen')
  await expect(page.getByRole('heading', { name: 'Willkommen bei RiffRechnung', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Jahr für Zahlungseingang', exact: true }).locator('option')).toHaveText(['2026'])
  await expect(page.locator('.dashboard-chart__month--empty')).toHaveCount(12)
  await expect(page.locator('.dashboard-backup')).toHaveCount(0)
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('.dashboard-name-hint').getByRole('button', { name: 'Namen in den Einstellungen hinterlegen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
  await navigation(page).getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Person anlegen', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Erziehungsberechtigte Person anlegen', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Name *', { exact: true }).fill('Neue Familie')
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await navigation(page).getByRole('button', { name: 'Dashboard', exact: true }).click()
  await expect(amount(page, 'Eltern')).toHaveText('1')
  expect(parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!).guardians[0].name).toBe('Neue Familie')
})

test('3.AP3: acht Vorschauzeilen führen zur vollständigen offenen Liste mit Statusfilter', async ({ page }) => {
  await seed(page, dashboardManyOpen())
  await expect(page.getByRole('heading', { name: 'Noch nicht gezahlt (10)', exact: true })).toBeVisible()
  await expect(page.locator('.dashboard-open-row')).toHaveCount(8)
  await page.getByRole('button', { name: 'Alle in Rechnungen anzeigen', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('unpaid')
  await expect(page.locator('.invoice-list-table .invoice-data-row')).toHaveCount(10)
  await expect(page.locator('.invoice-detail')).toHaveCount(0)
})

test('3.AP3: Dashboard-Backup exportiert den bestätigten Bestand und entfernt die Erinnerung', async ({ page }) => {
  const fixture = dashboardFixture()
  await seed(page, fixture)
  const downloading = page.waitForEvent('download')
  await page.locator('.dashboard-backup').getByRole('button', { name: 'JSON exportieren', exact: true }).click()
  const download = await downloading
  expect(parseBackup(await readFile((await download.path())!, 'utf8'))).toEqual(fixture)
  await expect(page.locator('.dashboard-backup')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.dashboard-backup')).toHaveCount(0)
  await page.evaluate(() => localStorage.setItem('riffrechnung-v4-last-export-at', new Date('2026-08-16T12:00:00').toISOString()))
  await page.reload()
  await expect(page.locator('.dashboard-backup')).toBeVisible()
})

test('3.AP3: Demo-Zahlen stimmen und die Backup-Erinnerung bleibt aus', async ({ page }) => {
  await page.clock.setFixedTime(dashboardNow)
  await page.goto('/')
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await page.getByRole('button', { name: 'Mit Beispieldaten testen', exact: true }).click()
  const expected = dashboardStats(createDemoState(dashboardNow), dashboardNow)
  await expect(amount(page, 'Bezahlt')).toHaveText(euro.format(expected.paid.yearCents / 100))
  await expect(amount(page, 'Offen')).toHaveText(euro.format(expected.open.totalCents / 100))
  await expect(amount(page, 'Entwürfe (nicht finalisiert)')).toHaveText(euro.format(expected.drafts.totalCents / 100))
  await expect(page.locator('.dashboard-backup')).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before)
})

test('3.AP3: Wiederherstellung und Zurücksetzen führen auf das Dashboard', async ({ page, browser }) => {
  await seed(page, emptyState())
  await navigation(page).getByRole('button', { name: 'Einstellungen', exact: true }).click()
  const fixture = dashboardFixture()
  await page.locator('#backup input[type=file]').setInputFiles({ name: 'dashboard.json', mimeType: 'application/json', buffer: Buffer.from(serializeBackup(fixture)) })
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
  await expect(page.locator('.dashboard-page')).toBeVisible()
  await expect(amount(page, 'Offen')).toHaveText(euro.format(55))
  // Exercise the explicit confirmation in a fresh profile as well.
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    const fresh = await context.newPage()
    await fresh.goto('/')
    await navigation(fresh).getByRole('button', { name: 'Einstellungen', exact: true }).click()
    await fresh.getByRole('button', { name: 'Daten zurücksetzen', exact: true }).click()
    await fresh.getByRole('alertdialog').getByRole('checkbox').check()
    await fresh.getByRole('alertdialog').getByRole('button', { name: 'Endgültig zurücksetzen', exact: true }).click()
    await expect(fresh.locator('.dashboard-page')).toBeVisible()
  } finally { await context.close() }
})



for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) for (const theme of ['light', 'dark'] as const) {
  test(`Dashboard: große Kennzahlen passen einzeilig bei ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 })
    const state = dashboardFixture()
    state.settings.theme = theme
    // Echte React-Kennzahlen aus gültigen Belegen statt nachträglicher DOM-Texte.
    const draft = documentDraft()
    draft.items = [{ ...draft.items[0], id: 'large-dashboard', quantity: 1, unitPrice: 1234567.89 }]
    let large = saveInvoiceDraft(state, draft, true, documentAt)
    large = saveInvoiceDraft(large, { ...draft, items: [{ ...draft.items[0], id: 'large-paid' }] }, true, documentAt)
    large = changeInvoiceStatus(large, large.invoices.at(-1)!.id, 'paid', documentAt, '2026-09-16')
    large = saveInvoiceDraft(large, { ...draft, items: [{ ...draft.items[0], id: 'large-draft' }] }, false, documentAt)
    await seed(page, large)
    const stats = dashboardStats(large, dashboardNow)
    const values = [stats.open.totalCents, stats.paid.yearCents, stats.drafts.totalCents].map((cents) => euro.format(cents / 100)).concat('2', '2')
    await expect(page.locator('.dashboard-stat__value')).toHaveText(values)
    await page.evaluate(() => document.fonts.ready)
    expect(await page.locator('.dashboard-stat__value').evaluateAll((nodes) => nodes.every((node) => {
      const element = node as HTMLElement
      const range = document.createRange()
      range.selectNodeContents(element)
      const card = element.closest('.dashboard-stat')!.getBoundingClientRect()
      const rect = range.getBoundingClientRect()
      return element.scrollWidth <= element.clientWidth && range.getClientRects().length === 1
        && rect.left >= card.left && rect.right <= card.right
        && getComputedStyle(element).whiteSpace === 'nowrap'
    }))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('Dashboard: Bento, Diagrammhöhe, Zukunftsmonate und verdichtete Fälligkeit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await seed(page, dashboardFixture())
  await expect(page.locator('.dashboard-stat__next')).toContainText('20.09.26 · in 4 Tagen')
  await expect(page.locator('.dashboard-average')).toContainText('Ø 1,11')
  await expect(page.locator('.dashboard-chart__month--future')).toHaveCount(3)
  await expect(page.locator('.dashboard-chart__month--empty')).toHaveCount(11)
  const geometry = await page.locator('.dashboard-grid').evaluate((grid) => {
    const rect = (selector: string) => grid.querySelector(selector)!.getBoundingClientRect()
    return { list: rect('.dashboard-unpaid').height, chart: rect('.dashboard-monthly').height, plot: rect('.dashboard-chart__track').height,
      hero: rect('.dashboard-stat--open'), paid: rect('.dashboard-stat--paid'), people: rect('.dashboard-people') }
  })
  expect(geometry.list).toBe(geometry.chart)
  expect(geometry.plot).toBeGreaterThanOrEqual(260)
  expect(geometry.hero.top).toBe(geometry.paid.top)
  expect(geometry.hero.bottom).toBe(geometry.people.bottom)
  await expect(page.locator('.dashboard-chart__value').nth(1)).toHaveText('10,00')
  await expect(page.locator('.dashboard-chart__bar').nth(1)).toHaveAttribute('title', 'Februar: 10,00 €')
  expect(await page.locator('.dashboard-chart-scroll').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.getByRole('combobox', { name: 'Jahr für Zahlungseingang', exact: true }).selectOption('2025')
  await expect(page.locator('.dashboard-chart__month--future')).toHaveCount(0)
  await expect(page.locator('.dashboard-average')).toContainText('Ø 4,17')
})
