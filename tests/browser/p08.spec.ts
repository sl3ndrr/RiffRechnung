import { test, expect, type Page } from '@playwright/test'
import type { AppState } from '../../src/types'
import { documentAt, documentDraft, documentFamily, legacyVersionedFixture } from '../documentFixtures'
import { saveInvoiceDraft, changeInvoiceStatus } from '../../src/lib/invoiceActions'
import { createCorrectionDraft } from '../../src/lib/documents'
import { parseBackup, serializeBackup, STORAGE_KEY } from '../../src/lib/storage'

async function stateOf(page: Page): Promise<AppState> {
  return parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
}
async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
}
const detail = (page: Page) => page.locator('.invoice-detail')
async function open(page: Page, number = '2026-0001-a') {
  await page.getByRole('button', { name: number, exact: true }).click()
  await expect(detail(page)).toBeVisible()
}
function assertDerived(state: AppState) {
  for (const invoice of state.invoices) for (const field of ['year', 'period', 'paidAt', 'openAmountCents']) expect(Object.hasOwn(invoice, field)).toBe(false)
  for (const version of state.documentVersions) expect(Object.hasOwn(version.content, 'year')).toBe(false)
}

test('P08 Browser: Fälligkeit, bestätigter Zahlungstag, Korrektur des Tages und Rücknahme bleiben nach Reload konsistent', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-16T12:00:00.000Z'))
  const initial = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  await seed(page, initial)
  await open(page)
  await expect(detail(page).locator('.status-chip')).toHaveText('Überfällig')
  await expect(page.getByRole('button', { name: 'Überfällig', exact: true })).toHaveCount(0)
  const fullPayment = page.getByRole('button', { name: 'Vollzahlung erfassen', exact: true })
  await expect(fullPayment).toBeDisabled()
  await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toHaveValue('')
  await page.getByLabel('Tatsächlicher Zahlungstag', { exact: true }).fill('2026-09-14')
  await fullPayment.click()
  await expect(detail(page).locator('.status-chip')).toHaveText('Bezahlt')
  const paid = await stateOf(page)
  assertDerived(paid)
  expect(paid.invoices[0].status).toBe('sent')
  expect(paid.payments[0].paidAt).toBe('2026-09-14')
  expect(paid.documentVersions).toEqual(initial.documentVersions)
  expect(paid.counters).toEqual(initial.counters)
  await page.reload(); await open(page)
  await expect(detail(page).locator('.status-chip')).toHaveText('Bezahlt')
  await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toHaveValue('2026-09-14')
  await page.getByLabel('Tatsächlicher Zahlungstag', { exact: true }).fill('2026-09-13')
  await page.getByRole('button', { name: 'Zahlungstag korrigieren', exact: true }).click()
  await expect.poll(async () => (await stateOf(page)).payments[0].paidAt).toBe('2026-09-13')
  await page.getByRole('button', { name: 'Versendet / offen', exact: true }).click()
  await expect(detail(page).locator('.status-chip')).toHaveText('Überfällig')
  await page.reload(); await open(page)
  await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toHaveValue('')
  const released = await stateOf(page)
  expect(released.payments).toHaveLength(1)
  expect(released.payments[0].paidAt).toBe('2026-09-13')
  expect(released.payments[0].allocations.at(-1)?.versionId).toBeNull()
  assertDerived(released)
  // The year filter consumes the projection, even though no invoice year is stored.
  await page.getByRole('combobox', { name: 'Jahr', exact: true }).selectOption('2026')
  await expect(page.getByRole('button', { name: initial.invoices[0].number!, exact: true })).toBeVisible()
})

test('P08 Browser: unbekannter Schema-13-Zahlungstag wird erst durch ausdrückliche Nachpflege bestätigt', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-16T12:00:00.000Z'))
  let state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-05')
  const legacy = legacyVersionedFixture(state, 13)
  legacy.payments[0].legacyPaymentDay = legacy.payments[0].paidAt
  legacy.payments[0].paidAt = null; legacy.payments[0].paymentDayStatus = 'unknown'
  await seed(page, legacy)
  await open(page)
  await expect(detail(page).locator('.status-chip')).toHaveText('Bezahlt')
  await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Zahlungstag korrigieren', exact: true })).toBeDisabled()
  await expect(detail(page)).toContainText('Zahlungsdatum unbekannt')
  await page.reload(); await open(page)
  await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toHaveValue('')
  await page.getByLabel('Tatsächlicher Zahlungstag', { exact: true }).fill('2026-09-04')
  await page.getByRole('button', { name: 'Zahlungstag korrigieren', exact: true }).click()
  await expect.poll(async () => (await stateOf(page)).payments[0].paymentDayStatus).toBe('confirmed')
  await page.reload(); await open(page)
  await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toHaveValue('2026-09-04')
  const confirmed = await stateOf(page)
  expect(confirmed.invoices[0].paidAt).toBe('2026-09-05')
  expect(confirmed.payments[0].paidAt).toBe('2026-09-04')
  expect(confirmed.documentVersions).toEqual(legacy.documentVersions)
})

test('P08 Browser: bestehende Zahlung auf Korrektur zuordnen und lösen aktualisiert Offen/Bezahlt nach Reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-16T12:00:00.000Z'))
  let state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-05')
  const original = structuredClone(state.documentVersions[0])
  state = createCorrectionDraft(state, state.invoices[0].id, 'Text berichtigen', documentAt)
  state = saveInvoiceDraft(state, { ...state.invoices.at(-1)!, freeText: 'Berichtigter Hinweis' }, true, documentAt)
  const target = state.documentVersions[1]
  await seed(page, state)
  await open(page, target.content.number!)
  await expect(detail(page).locator('.status-chip')).toHaveText('Überfällig')
  await page.getByRole('combobox', { name: 'Zahlung zuordnen', exact: true }).selectOption(target.id)
  await page.getByLabel('Zuordnungsgrund', { exact: true }).fill('Bestehende Zahlung auf Korrektur übertragen')
  await page.getByRole('button', { name: 'Zuordnung speichern', exact: true }).click()
  await expect(detail(page).locator('.status-chip')).toHaveText('Bezahlt')
  await page.reload(); await open(page, target.content.number!)
  await expect(detail(page).locator('.status-chip')).toHaveText('Bezahlt')
  await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toHaveValue('2026-09-05')
  await page.getByRole('combobox', { name: 'Zahlung zuordnen', exact: true }).selectOption('')
  await page.getByLabel('Zuordnungsgrund', { exact: true }).fill('Zuordnung zur Klärung lösen')
  await page.getByRole('button', { name: 'Zuordnung speichern', exact: true }).click()
  await expect(detail(page).locator('.status-chip')).toHaveText('Überfällig')
  await page.reload(); await open(page, target.content.number!)
  await expect(detail(page).locator('.status-chip')).toHaveText('Überfällig')
  const released = await stateOf(page)
  expect(released.payments).toHaveLength(1)
  expect(released.payments[0].amountCents).toBe(758)
  expect(released.documentVersions[0]).toEqual(original)
  expect(released.counters).toEqual(state.counters)
  assertDerived(released)
  await page.getByRole('button', { name: original.content.number!, exact: true }).click()
  await expect(detail(page).locator('.status-chip')).toHaveText('Versendet')
})
