import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { serializeBackup, parseBackup, STORAGE_KEY } from '../../src/lib/storage'
import { documentDraft, documentFamily, documentAt } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { invoiceTotalCents } from '../../src/lib/money'
import { duoIssued } from '../duoFixtures'

// Real downloads start after the initiating click returns. This exposes early
// Blob revocation for both text exports and byte-preserving rescue downloads.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) window.setTimeout(() => click.call(this), 50)
      else click.call(this)
    }
  })
})

async function settings(page: Page) { await page.getByRole('button', { name: 'Einstellungen', exact: true }).click() }
async function restore(page: Page, buffer: Buffer) {
  await settings(page)
  await page.locator('#backup input[type=file]').setInputFiles({ name: 'synthetisch.json', mimeType: 'application/json', buffer })
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
}

test('P03 Fallback: zwei unabhängige Duo-Rechnungen als JSON exportieren, importieren und reload', async ({ page, browser }) => {
  const state = duoIssued()
  await page.goto('/')
  await restore(page, Buffer.from(serializeBackup(state)))
  await settings(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON exportieren', exact: true }).click()
  const buffer = await readFile((await (await downloading).path())!)
  expect(parseBackup(buffer.toString())).toEqual(state)
  const destination = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    const imported = await destination.newPage()
    await imported.goto('/')
    await restore(imported, buffer)
    const raw = await imported.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    await imported.reload()
    expect(await imported.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
    expect(parseBackup(raw!)).toEqual(state)
    expect('duoGroups' in parseBackup(raw!)).toBe(false)
  } finally { await destination.close() }
})

test('P04: asynchrone Rohdatenrettung erhält lokalen Text und unveränderte Importbytes', async ({ page }) => {
  await page.goto('/')
  const corrupt = '{synthetische Rohdaten\r\nübrig'
  await page.evaluate(({ key, corrupt }) => localStorage.setItem(key, corrupt), { key: STORAGE_KEY, corrupt })
  await page.reload()
  const textDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Beschädigte Rohdaten exportieren', exact: true }).click()
  expect(await readFile((await (await textDownload).path())!, 'utf8')).toBe(corrupt)
  const bytes = Buffer.from([0xff, 0xfe, 0, 13, 10, 123, 255])
  await page.locator('input[type=file]').setInputFiles({ name: 'unbekannt.json', mimeType: 'application/json', buffer: bytes })
  await expect(page.getByRole('alert').filter({ hasText: 'Keine Übernahme möglich' })).toBeVisible()
  const byteDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Unveränderte Originaldatei exportieren', exact: true }).click()
  expect(await readFile((await (await byteDownload).path())!)).toEqual(bytes)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(corrupt)
})

test('AP1 Fallback: gemeinsame Rechnung an zwei Personen als JSON exportieren, importieren und reload', async ({ page, browser, browserName }, testInfo) => {
  const flowStarted = Date.now()
  console.log(`P12 JSON-Fallback: ${browserName} ${browser.version()}; Node ${process.version}; ${process.platform}`)
  await testInfo.attach('browser-version.txt', { body: `${browserName} ${browser.version()} / ${process.platform} / Node ${process.version}`, contentType: 'text/plain' })
  const state = documentFamily()
  const draft = { ...documentDraft(), guardianIds: ['g-a', 'g-b'], studentIds: ['s-a', 's-b'], recipientStrategy: 'joint' as const,
    items: ['a', 'b'].map((id) => ({ ...documentDraft().items[0], id: `position-${id}`, studentId: `s-${id}`, quantity: 1, unitPrice: 30 })) }
  const result = saveInvoiceDraft(state, draft, true, documentAt)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Ordner wählen', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(true)
  await restore(page, Buffer.from(serializeBackup(result)))
  await settings(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON exportieren', exact: true }).click()
  await expect(page.getByText('JSON-Export des zuletzt bestätigten Stands gestartet.')).toBeVisible()
  const buffer = await readFile((await (await downloading).path())!)
  expect(parseBackup(buffer.toString())).toEqual(result)
  const destination = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    const imported = await destination.newPage()
    await imported.goto('/')
    expect(await imported.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await restore(imported, buffer)
    const raw = await imported.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    await imported.reload()
    expect(await imported.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
    const saved = parseBackup(raw!)
    expect(saved).toEqual(result)
    expect(saved.invoices.map((invoice) => invoice.snapshot!.students.map((student) => student.id))).toEqual([['s-a', 's-b']])
    expect(saved.invoices.map((invoice) => invoice.snapshot!.guardians.map((guardian) => guardian.id))).toEqual([['g-a', 'g-b']])
    expect(saved.invoices.reduce((sum, invoice) => sum + invoiceTotalCents(invoice), 0)).toBe(6000)
    expect(new Set(saved.invoices.flatMap((invoice) => invoice.items.map((item) => item.id))).size).toBe(2)
  } finally {
    await destination.close()
    console.log(`P12 JSON-Fallback UI-Ablauf: ${browserName} ${Date.now() - flowStarted} ms (ohne initiales Fixture-Setup)`)
  }
})
