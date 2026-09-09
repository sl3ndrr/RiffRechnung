import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { AppState } from '../../src/types'
import { documentAt, documentDraft, documentFamily, legacyFixture } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { parseBackup, serializeBackup, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../../src/lib/storage'

async function settings(page: Page) { await page.getByRole('button', { name: 'Einstellungen', exact: true }).click() }
async function raw(page: Page) { return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY) }
async function stateOf(page: Page) { return parseBackup((await raw(page))!) }
async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (source) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(source)
  }, serializeBackup(state))
  await page.reload()
}
async function confirmMigration(page: Page) {
  await page.getByRole('button', { name: 'Altformat und Reparatur prüfen', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
}

test('P12 Browser: negativer Preis verhindert Ansichtswechsel; gültiger Abschluss überlebt Schließen', async ({ page, context }) => {
  await seed(page, documentFamily())
  await settings(page)
  const before = await raw(page)
  const price = page.getByLabel('Standardpreis Solo', { exact: true })
  await price.fill('-1')
  await page.getByRole('button', { name: 'Familien', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
  await expect(price).toHaveValue('-1')
  expect(await raw(page)).toBe(before)
  await price.fill('37,50')
  await page.getByRole('button', { name: 'Familien', exact: true }).first().click()
  await expect.poll(async () => (await stateOf(page)).settings.privateRate).toBe(37.5)
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/')
  expect((await stateOf(reopened)).settings.privateRate).toBe(37.5)
})

test('P12 Browser mit Fehlerinjektion: Quota-Fehler bestätigt nichts und Wiederholung speichert den Formularwert', async ({ page }) => {
  await seed(page, documentFamily())
  await settings(page)
  const before = await raw(page)
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    Reflect.set(window, 'p12FailWrite', true)
    Storage.prototype.setItem = function (name, value) {
      if (name === key && Reflect.get(window, 'p12FailWrite')) throw new DOMException('Synthetischer Speicherfehler', 'QuotaExceededError')
      return original.call(this, name, value)
    }
  }, STORAGE_KEY)
  const name = page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })
  await name.fill('Nach Wiederholung gespeichert')
  await expect(page.locator('.persistence-error')).toContainText('Synthetischer Speicherfehler')
  await expect(page.locator('.save-indicator')).not.toContainText('Lokal gespeichert')
  expect(await raw(page)).toBe(before)
  await page.getByRole('button', { name: 'Familien', exact: true }).first().click()
  await expect(name).toHaveValue('Nach Wiederholung gespeichert')
  await page.evaluate(() => Reflect.set(window, 'p12FailWrite', false))
  await page.getByRole('button', { name: 'Eingabe prüfen', exact: true }).click()
  await expect.poll(async () => (await stateOf(page)).settings.issuer.name).toBe('Nach Wiederholung gespeichert')
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  await page.reload()
  expect((await stateOf(page)).settings.issuer.name).toBe('Nach Wiederholung gespeichert')
})

test('P12 Browser: ausländisches Konto abweisen, DE speichern und leere Original-BIC erhalten', async ({ page }) => {
  await seed(page, saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt))
  const original = (await stateOf(page)).documentVersions[0]
  await settings(page)
  const before = await raw(page)
  await page.getByLabel('IBAN', { exact: true }).fill('GB29NWBK60161331926819')
  await page.getByRole('button', { name: 'Familien', exact: true }).first().click()
  await expect(page.locator('#iban-error')).toContainText('deutsche')
  expect(await raw(page)).toBe(before)
  await page.getByLabel('IBAN', { exact: true }).fill('de89 3704 0044 0532 0130 00')
  await page.getByLabel('BIC (für deutsche Empfängerkonten im EPC-QR optional)', { exact: true }).fill('MARKDEF1100')
  await page.getByRole('button', { name: 'Familien', exact: true }).first().click()
  await expect.poll(async () => (await stateOf(page)).settings.bic).toBe('MARKDEF1100')
  await page.reload()
  expect((await stateOf(page)).documentVersions[0]).toEqual(original)
  expect((await stateOf(page)).settings.iban).toBe('DE89370400440532013000')
  const payload = await page.evaluate(async () => {
    const storagePath = '/src/lib/storage.ts', documentPath = '/src/lib/documents.ts', utilsPath = '/src/lib/utils.ts'
    const { StorageSession } = await import(storagePath)
    const { selectInvoice } = await import(documentPath)
    const { buildEpcPayload, invoiceTotal } = await import(utilsPath)
    const state = new StorageSession().state
    const invoice = selectInvoice(state, state.invoices[0])
    return buildEpcPayload(invoice, state.settings, invoiceTotal(invoice))
  })
  expect(payload.split('\n').slice(4, 8)).toEqual(['', 'Studio', 'DE02120300000000202051', 'EUR7.58'])
})

test('P12 Browser: unterbrochene Migration erhält Rohdaten und lässt sich nach Reload fortsetzen', async ({ page }) => {
  const source = JSON.stringify(legacyFixture(saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt))) + '\r\n'
  await page.goto('/')
  await page.evaluate(({ key, source }) => localStorage.setItem(key, source), { key: LEGACY_STORAGE_KEY, source })
  await page.reload()
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Migration unterbrochen', 'QuotaExceededError')
      return original.call(this, name, value)
    }
  }, STORAGE_KEY)
  await confirmMigration(page)
  await expect(page.locator('.toast').filter({ hasText: 'Migration unterbrochen' })).toBeVisible()
  expect(await raw(page)).toBeNull()
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_STORAGE_KEY)).toBe(source)
  await page.reload()
  await confirmMigration(page)
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
  const committed = await raw(page)
  const archives = () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('-recovery-')).map((key) => localStorage.getItem(key)))
  const savedArchives = await archives()
  expect(savedArchives.every((entry) => JSON.parse(entry!).legacyRaw === source)).toBe(true)
  await page.reload()
  expect(await raw(page)).toBe(committed)
  expect(await archives()).toEqual(savedArchives)
  expect((await stateOf(page)).documentVersions).toHaveLength(1)
})

test('P12 Browser: unbekanntes neueres Format bleibt auch bei Wiederherstellungsversuch bytegleich', async ({ page }) => {
  const future = JSON.stringify({ schemaVersion: 8, data: 'Synthetisches unbekanntes Format' })
  await page.goto('/')
  await page.evaluate(({ key, future }) => localStorage.setItem(key, future), { key: STORAGE_KEY, future })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokale Daten benötigen Wiederherstellung' })).toBeVisible()
  const error = await page.evaluate(async (source) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    try { await new StorageSession().restore(source); return null } catch (error) { return String(error) }
  }, serializeBackup(documentFamily()))
  expect(error).toContain('schreibgeschützt')
  expect(await raw(page)).toBe(future)
  await page.reload()
  expect(await raw(page)).toBe(future)
})

test('P12 Browser: unabhängige Originaldatei kehrt mit echtem alten Code in getrenntem Profil zurück', async ({ page, browser }, testInfo) => {
  const legacy = { ...legacyFixture(saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)), schemaVersion: 2 }
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
    await rollback.locator('input[type=file]').setInputFiles({ name: 'original.json', mimeType: 'application/json', buffer: independentBackup })
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
    await expect(rollback.locator('.invoice-list-table')).toContainText('2026-a-0001')
  } finally { await isolated.close() }
})

test('P12 Browser ergänzt Quellmuster: Footer-Submit, Kindaktivierung und Rechnungsentwurf', async ({ page }) => {
  await seed(page, documentFamily())
  await page.getByRole('button', { name: 'Familien', exact: true }).first().click()
  await page.getByRole('button', { name: 'Elternteil hinzufügen', exact: true }).click()
  const guardian = page.getByRole('dialog', { name: 'Elternteil anlegen', exact: true })
  await guardian.getByLabel('Name *', { exact: true }).fill('Zusätzliche Testperson')
  await guardian.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(guardian).not.toBeVisible()
  expect((await stateOf(page)).guardians.some((entry) => entry.name === 'Zusätzliche Testperson')).toBe(true)
  const card = page.locator('.student-card').filter({ hasText: 'Testkind A' })
  await card.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const student = page.getByRole('dialog', { name: 'Kind bearbeiten', exact: true })
  await student.getByRole('checkbox', { name: /^Aktiv/ }).uncheck()
  await student.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: /Nur aktive Kinder anzeigen/ })).toBeChecked()
  await page.getByRole('checkbox', { name: /Nur aktive Kinder anzeigen/ }).uncheck()
  await expect(card).toBeVisible()
  await page.getByRole('button', { name: 'Neue Rechnung erstellen', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
  await editor.getByLabel('Freitext / Hinweis', { exact: true }).fill('Zeile eins\nZeile zwei')
  await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await page.reload()
  const state = await stateOf(page)
  expect(state.invoices[0].freeText).toBe('Zeile eins\nZeile zwei')
  expect(state.students.find((entry) => entry.id === 's-a')!.active).toBe(false)
})

test('P12 Browser: lokale Mitternacht in Berlin erzeugt den richtigen Rechnungstag', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', timezoneId: 'Europe/Berlin' })
  try {
    const page = await context.newPage()
    await page.clock.install({ time: new Date('2026-08-31T22:30:00.000Z') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Neue Rechnung erstellen', exact: true }).click()
    await expect(page.getByRole('dialog').getByLabel('Rechnungsdatum', { exact: true })).toHaveValue('2026-09-01')
  } finally { await context.close() }
})

test('P12 echter OPFS: leerer Bestand liest vorhandenes Backup; Restore und parallele Sicherungen erhalten Dateien', async ({ playwright }, testInfo) => {
  // Real Chromium file APIs in a synthetic persistent profile. This does not
  // exercise the OS picker/permission UI or cross-device synchronization.
  const context = await playwright.chromium.launchPersistentContext(testInfo.outputPath('opfs-profile'), { channel: 'chromium', headless: true, baseURL: 'http://127.0.0.1:4173' })
  try {
    const page = await context.newPage()
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const storagePath = '/src/lib/storage.ts', defaultsPath = '/src/lib/defaults.ts'
      const { StorageSession, STORAGE_KEY, LEGACY_GUARD_KEY, PREVIOUS_STORAGE_KEY, inspectBackupDirectory } = await import(storagePath)
      const { emptyState } = await import(defaultsPath)
      const source = new StorageSession()
      await source.restore(JSON.stringify(emptyState()))
      const handle = await (await navigator.storage.getDirectory()).getDirectoryHandle('p12-synthetic-backup', { create: true })
      const binding = { handle, datasetId: source.revision.datasetId, legacyFiles: [] }
      await source.connect(binding)
      await source.backup()
      const before = await inspectBackupDirectory(handle)
      for (const key of [STORAGE_KEY, LEGACY_GUARD_KEY, PREVIOUS_STORAGE_KEY]) localStorage.removeItem(key)
      const empty = new StorageSession()
      let blocked = ''
      try { await empty.connect(binding) } catch (error) { blocked = String(error) }
      const inspected = await inspectBackupDirectory(handle)
      await empty.restore(inspected.entries[0].raw)
      await empty.connect(binding)
      await Promise.all([empty.backup(), empty.backup()])
      const after = await inspectBackupDirectory(handle)
      return { blocked, before: before.entries.map((entry: { name: string; raw: string }) => [entry.name, entry.raw]), inspected: inspected.entries.map((entry: { name: string; raw: string }) => [entry.name, entry.raw]), after: after.entries.map((entry: { name: string; raw: string }) => [entry.name, entry.raw]), conflict: after.conflict, state: empty.state, revision: empty.revision.revision }
    })
    expect(result.blocked).toContain('Zuerst den lokalen Bestand speichern')
    expect(result.inspected).toEqual(result.before)
    expect(result.after).toHaveLength(2)
    for (const entry of result.before) expect(result.after).toContainEqual(entry)
    expect(result.conflict).toBeNull()
    expect(result.revision).toBe(2)
    await page.reload()
    expect(await stateOf(page)).toEqual(result.state)
  } finally { await context.close() }
})
