import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import type { AppState } from '../../src/types'
import { documentDraft, documentFamily, documentAt, legacyFixture } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
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
async function invoices(page: Page) { await page.getByRole('button', { name: /^Rechnungen(?:\s*\d+)?$/ }).first().click() }
async function pdfText(page: Page, state: AppState, invoiceId: string): Promise<{ text: string; pdf: Buffer }> {
  const rendering = await page.context().newPage()
  try {
    await rendering.goto('/')
    await rendering.evaluate(async ({ state, invoiceId }) => {
      const path = '/tests/browser/documentPrintHarness.tsx'
      const { mountDocument } = await import(path)
      mountDocument(state, invoiceId)
      await document.fonts.ready
    }, { state, invoiceId })
    await expect.poll(() => rendering.evaluate(() => document.documentElement.dataset.documentReady)).toBe(invoiceId)
    const pdf = await rendering.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    const text = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf, encoding: 'utf8' })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    return { text, pdf }
  } finally { await rendering.close() }
}

test('P04 Browser/PDF: finalisieren, Personen löschen, Original drucken, korrigieren, neu zuordnen und reload', async ({ page }, testInfo) => {
  await seed(page, saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt))
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(page.locator('.invoice-detail h2')).toHaveText('2026-a-0001')
  const originalState = await stateOf(page)
  const original = originalState.invoices[0]
  const first = await pdfText(page, originalState, original.id)
  expect(first.text).toContain('Empfaenger A')
  expect(first.text).toContain('7,58')
  await testInfo.attach('original.pdf', { body: first.pdf, contentType: 'application/pdf' })
  await page.getByRole('button', { name: 'Familien', exact: true }).first().click()
  await page.getByRole('button', { name: 'Testkind A löschen', exact: true }).click()
  await page.getByRole('button', { name: 'Kind löschen', exact: true }).click()
  await page.getByRole('button', { name: 'Empfaenger A löschen', exact: true }).click()
  await page.getByRole('button', { name: 'Kontakt löschen', exact: true }).click()
  await invoices(page)
  await page.getByRole('button', { name: original.number!, exact: true }).click()
  await page.evaluate(() => window.addEventListener('beforeprint', () => { document.documentElement.dataset.nativePrintStarted = 'yes' }, { once: true }))
  await page.getByRole('button', { name: 'PDF / Drucken', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.nativePrintStarted)).toBe('yes')
  const afterDelete = await pdfText(page, await stateOf(page), original.id)
  expect(afterDelete.text).toBe(first.text)
  await page.getByLabel('Korrekturgrund', { exact: true }).fill('Gelöschte Stammdaten ausdrücklich durch B ersetzen')
  await page.getByRole('button', { name: 'Korrekturentwurf erzeugen', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Korrekturentwurf bearbeiten' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Finalisieren', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  await page.reload()
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await dialog.getByLabel(/Kind neu zuordnen/).selectOption('s-b')
  await dialog.getByLabel(/Gelöschte empfangende Person/).selectOption('g-b')
  await dialog.getByLabel(/Einzelpreis/).fill('20')
  await dialog.getByLabel('Datum', { exact: true }).fill('2026-09-02')
  await dialog.getByLabel('Freitext / Hinweis', { exact: true }).fill('Korrigierter Hinweis')
  await expect(dialog.getByRole('button', { name: 'Finalisieren', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.reload()
  const correctedState = await stateOf(page)
  expect(correctedState.documentVersions[0]).toEqual(originalState.documentVersions[0])
  expect(correctedState.documentVersions).toHaveLength(2)
  const corrected = correctedState.invoices[1]
  const correctedPdf = await pdfText(page, correctedState, corrected.id)
  expect(correctedPdf.text).toContain('Empfaenger B')
  expect(correctedPdf.text).toContain('Korrigierter Hinweis')
  expect(correctedPdf.text).toContain('15,00')
  expect(correctedPdf.text).toContain('02.09.')
  expect(correctedPdf.text).not.toContain('Empfaenger A')
  expect((await pdfText(page, correctedState, original.id)).text).toBe(first.text)
  await testInfo.attach('korrektur.pdf', { body: correctedPdf.pdf, contentType: 'application/pdf' })
})

test('P04 Browser: Zahlungen manuell zuordnen, archivieren und vollständiges Backup nach Import neu laden', async ({ page, context }) => {
  await seed(page, saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt))
  await invoices(page)
  await page.getByRole('button', { name: '2026-a-0001', exact: true }).click()
  await page.locator('.status-editor select').selectOption('paid')
  await expect.poll(async () => (await stateOf(page)).payments.length).toBe(1)
  await page.getByLabel('Korrekturgrund', { exact: true }).fill('Textkorrektur nach Zahlung')
  await page.getByRole('button', { name: 'Korrekturentwurf erzeugen', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Korrekturentwurf bearbeiten' })
  await dialog.getByLabel('Einleitung', { exact: true }).fill('Präzisierte Einleitung')
  await dialog.getByLabel('Rechnungsdatum', { exact: true }).fill('2027-01-02')
  await dialog.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  const replacement = (await stateOf(page)).documentVersions[1]
  await page.getByRole('combobox', { name: 'Zahlung zuordnen', exact: true }).selectOption(replacement.id)
  await page.getByLabel('Zuordnungsgrund', { exact: true }).fill('Erfasste Zahlung auf den korrigierten Beleg übertragen')
  await page.getByRole('button', { name: 'Zuordnung speichern', exact: true }).click()
  await expect.poll(async () => (await stateOf(page)).payments[0].allocations.at(-1)?.versionId).toBe(replacement.id)
  await page.locator('.invoice-detail__footer').getByRole('button', { name: 'Archivieren', exact: true }).click()
  await page.getByLabel('Archivierte anzeigen', { exact: true }).check()
  const before = await stateOf(page)
  expect(before.payments).toHaveLength(1)
  expect(before.payments[0].allocations).toHaveLength(2)
  expect(before.invoiceAdministration[1].archived).toBe(true)
  await page.getByRole('button', { name: 'Auswertung', exact: true }).click()
  await page.getByRole('combobox', { name: 'Jahr wählen', exact: true }).selectOption('2026')
  const csvDownloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV exportieren', exact: true }).click()
  const csvFile = await csvDownloading
  const oldYearCsv = await readFile((await csvFile.path())!, 'utf8')
  expect(oldYearCsv).toContain('2026-a-0001')
  expect(oldYearCsv).toContain('Ersetzt – keine zusätzliche Forderung')
  expect(oldYearCsv).not.toContain('2027-a-0001')
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: /JSON.*exportieren|Backup exportieren|JSON-Backup/i }).first().click()
  const download = await downloading
  const buffer = await readFile((await download.path())!)
  expect(parseBackup(buffer.toString())).toEqual(before)
  // Fresh origin storage in a separate browser context, synthetic backup only.
  const destination = await context.browser()!.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    const next = await destination.newPage()
    await next.goto('/')
    await next.getByRole('button', { name: 'Einstellungen', exact: true }).click()
    await next.locator('#backup input[type=file]').setInputFiles({ name: 'synthetische-versionen.json', mimeType: 'application/json', buffer })
    await next.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
    await next.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
    await expect(next.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
    await next.reload()
    expect(await stateOf(next)).toEqual(before)
  } finally { await destination.close() }
})

test('P04 Browser: Schema-3-Umstieg zeigt Konflikte und behält die unveränderten Eingangsbytes', async ({ page }, testInfo) => {
  await page.goto('/')
  const legacy = legacyFixture(saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt))
  legacy.invoices[0].guardianIds = ['g-b']
  Object.assign(legacy.invoices[0].snapshot!, { accountHolder: '', iban: '', bic: '', bankName: '' })
  Object.assign(legacy.settings, { accountHolder: 'HEUTIGES KONTO', bic: 'MARKDEF1100', bankName: 'HEUTIGE BANK' })
  const raw = JSON.stringify({ app: 'riffrechnung', storageVersion: 4, schemaVersion: 3, datasetId: 'legacy-dataset', commitId: 'legacy-commit', revision: 8, savedAt: documentAt, operation: 'edit', ancestors: [], source: null, data: legacy }, null, 2)
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokale Daten benötigen Wiederherstellung' })).toBeVisible()
  await page.getByRole('button', { name: 'Altformat und Reparatur prüfen', exact: true }).click()
  await expect(page.getByText(/Zuordnung und Snapshot-Empfänger widersprechen/)).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
  await page.reload()
  const state = await stateOf(page)
  expect(state.schemaVersion).toBe(5)
  expect(state.documentVersions[0].provenance).toBe('oldest-available')
  await invoices(page)
  await page.getByRole('button', { name: '2026-a-0001', exact: true }).click()
  await expect(page.getByText('Historische Abweichungen', { exact: true })).toBeVisible()
  await page.getByText('Gesicherte Ausgabeangaben', { exact: true }).click()
  await expect(page.locator('.document-history dd').filter({ hasText: /^Leer$/ })).toHaveCount(4)
  await expect(page.locator('.invoice-detail__header')).toContainText('Empfaenger A')
  const reminder = decodeURIComponent((await page.getByRole('link', { name: 'E-Mail öffnen', exact: true }).getAttribute('href'))!)
  expect(reminder).toContain('mailto:a@example.org')
  expect(reminder).toContain('Empfaenger A')
  expect(reminder).not.toContain('Empfaenger B')
  const printed = await pdfText(page, state, state.invoices[0].id)
  expect(printed.text).toContain('Empfaenger A')
  expect(printed.text).not.toMatch(/Empfaenger B|HEUTIGES KONTO|HEUTIGE BANK|MARKDEF1100|DE02/)
  expect(state.documentVersions[0].outputSnapshot.iban).toBe('')
  await testInfo.attach('historische-leere-kontofelder.pdf', { body: printed.pdf, contentType: 'application/pdf' })
  const archives = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('-recovery-')).map((key) => JSON.parse(localStorage.getItem(key)!)))
  expect(archives[0].sourceRaw).toBe(raw)
  expect(archives[0].previousRaw).toBe(raw)
})

