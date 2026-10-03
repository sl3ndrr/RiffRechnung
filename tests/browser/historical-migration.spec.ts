import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { documentAt, documentDraft, documentFamily, expectedTextless, legacyFixture } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { parseBackup, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../../src/lib/storage'

async function settings(page: Page) { await page.getByRole('button', { name: 'Einstellungen', exact: true }).click() }
async function raw(page: Page) { return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY) }
async function stored(page: Page) { return raw(page) }
async function stateOf(page: Page) { return parseBackup((await raw(page))!) }
async function confirmMigration(page: Page) {
  await page.getByRole('button', { name: 'Altformat und Reparatur prüfen', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
}

test('tatsächlich geöffnete Altversion: kontrollierter Umstieg schützt den neuen Schlüssel auch nach Reload', async ({ page, context }) => {
  await page.goto('/legacy/index.html')
  await settings(page)
  await expect(page.getByRole('button', { name: 'Automatisch gespeichert', exact: true })).toBeVisible()
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Historischer synthetischer Bestand')
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').settings?.issuer?.name, LEGACY_STORAGE_KEY)).toBe('Historischer synthetischer Bestand')
  const original = await page.evaluate((key) => localStorage.getItem(key), LEGACY_STORAGE_KEY)
  const current = await context.newPage()
  await current.goto('/')
  await current.getByRole('button', { name: 'Altformat und Reparatur prüfen', exact: true }).click()
  await current.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  await current.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
  await expect(current.locator('.save-indicator')).toContainText('Lokal gespeichert')
  const migrated = await stored(current)
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_STORAGE_KEY)).toBe(JSON.stringify(expectedTextless(JSON.parse(original!))))
  // P09 removes retired fields from internal copies. The genuine historical
  // app rejects autosave against that incomplete old schema; its explicit
  // recovery import can still write the old key and must be detected.
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Alter Tab schreibt nach Umstieg')
  await expect(page.locator('.persistence-error')).toBeVisible()
  expect(await stored(current)).toBe(migrated)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokale Daten benötigen Wiederherstellung' })).toBeVisible()
  const restoredLegacy = JSON.parse(original!)
  restoredLegacy.settings.issuer.name = 'Alter Tab schreibt nach Umstieg'
  await page.locator('input[type=file]').setInputFiles({ name: 'historische-sicherung.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(restoredLegacy)) })
  await page.getByRole('button', { name: 'Daten ersetzen', exact: true }).click()
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).settings.issuer.name, LEGACY_STORAGE_KEY)).toBe('Alter Tab schreibt nach Umstieg')
  await expect(current.locator('.external-update')).toBeVisible()
  expect(await stored(current)).toBe(migrated)
  await current.reload()
  await expect(current.locator('.external-update')).toBeVisible()
  await settings(current)
  await current.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Darf keinen der Stände überschreiben')
  await current.getByRole('button', { name: 'Jetzt speichern', exact: true }).click()
  await expect(current.locator('.persistence-error')).toContainText('alte Anwendungsversion')
  expect(await stored(current)).toBe(migrated)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).settings.issuer.name, LEGACY_STORAGE_KEY)).toBe('Alter Tab schreibt nach Umstieg')
})


test('P12 Browser: unabhängige Originaldatei kehrt mit echtem alten Code in getrenntem Profil zurück', async ({ page, browser }, testInfo) => {
  const legacy = { ...legacyFixture(saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)), schemaVersion: 2 }
  // The unchanged historical app requires these retired master-data fields.
  legacy.guardians.forEach((guardian) => Object.assign(guardian, { iban: '', paymentNote: '' }))
  legacy.students.forEach((student) => Object.assign(student, { note: '' }))
  Object.assign(legacy.settings, { defaultLegalText: 'Synthetischer historischer Rechtstext' })
  legacy.invoices.forEach((invoice) => {
    Object.assign(invoice, { introText: 'Synthetische historische Einleitung', legalText: 'Synthetischer historischer Rechtstext' })
    if (invoice.snapshot) Object.assign(invoice.snapshot, { legalText: 'Synthetischer historischer Rechtstext' })
  })
  await page.goto('/legacy/index.html')
  await page.evaluate(({ key, source }) => localStorage.setItem(key, source), { key: LEGACY_STORAGE_KEY, source: JSON.stringify(legacy) })
  await page.reload()
  await settings(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: /JSON.*exportieren|Backup exportieren|JSON-Backup/i }).first().click()
  const independentBackup = await readFile((await (await downloading).path())!)
  await testInfo.attach('unabhaengige-originalsicherung.json', { body: independentBackup, contentType: 'application/json' })
  const originalData = JSON.parse(independentBackup.toString()).data
  // Navigate away so the old application is closed before migration.
  await page.goto('/')
  await confirmMigration(page)
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
  const migrated = await raw(page)
  expect((await stateOf(page)).documentVersions[0].amounts.totalCents).toBe(757)
  const isolated = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    const rollback = await isolated.newPage()
    await rollback.goto('/legacy/index.html')
    await settings(rollback)
    await rollback.getByRole('main').locator('input[type=file]').setInputFiles({ name: 'original.json', mimeType: 'application/json', buffer: independentBackup })
    await rollback.getByRole('button', { name: 'Daten ersetzen', exact: true }).click()
    await expect.poll(() => rollback.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').invoices?.length, LEGACY_STORAGE_KEY)).toBe(1)
    await rollback.reload()
    const restored = await rollback.evaluate((key) => JSON.parse(localStorage.getItem(key)!), LEGACY_STORAGE_KEY)
    expect(restored.invoices).toEqual(originalData.invoices)
    expect(restored.settings).toEqual(originalData.settings)
    expect(restored.counters).toEqual(originalData.counters)
    expect(await raw(rollback)).toBeNull()
    expect(await raw(page)).toBe(migrated)
    await rollback.getByRole('button', { name: /^Rechnungen(?:\s*\d+)?$/ }).first().click()
    await expect(rollback.locator('.invoice-list-table')).toContainText(originalData.invoices[0].number!)
  } finally { await isolated.close() }
})
