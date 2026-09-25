import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { serializeBackup, parseBackup, STORAGE_KEY } from '../../src/lib/storage'
import { documentDraft, documentFamily, documentAt } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { invoiceTotalCents } from '../../src/lib/money'
import { duoDrafts } from '../duoFixtures'
import { previewDuo } from '../../src/lib/duoModel'
import { finalizeDuoGroup } from '../../src/lib/invoiceActions'

async function withoutFolder(context: BrowserContext, browserName: string) {
  // Firefox/WebKit run with their native absence of the picker; Chromium tests
  // the deliberately disabled capability. No storage or locking APIs are mocked.
  if (browserName === 'chromium') await context.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }))
}
async function settings(page: Page) { await page.getByRole('button', { name: 'Einstellungen', exact: true }).click() }
async function restore(page: Page, buffer: Buffer) {
  await settings(page)
  await page.locator('#backup input[type=file]').setInputFiles({ name: 'synthetisch.json', mimeType: 'application/json', buffer })
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
}

test('AP2 Fallback: vollständige Duo-Gruppe als JSON exportieren, importieren und reload', async ({ page, context, browser, browserName }) => {
  await withoutFolder(context, browserName)
  const drafts = duoDrafts(), group = drafts.duoGroups![0], preview = previewDuo(drafts, group.id)
  const state = finalizeDuoGroup(drafts, group.id, preview.token, preview.invoices.map((invoice) => invoice.id))
  await page.goto('/')
  await restore(page, Buffer.from(serializeBackup(state)))
  // The fixed sidebar uses the same export handler without racing WebKit's
  // smooth scroll to the settings card. The AP1 test covers that second entry.
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Backup exportieren', exact: true }).click()
  const buffer = await readFile((await (await downloading).path())!)
  expect(parseBackup(buffer.toString())).toEqual(state)
  const destination = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    await withoutFolder(destination, browserName)
    const imported = await destination.newPage()
    await imported.goto('/')
    await restore(imported, buffer)
    const raw = await imported.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    await imported.reload()
    expect(await imported.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
    expect(parseBackup(raw!)).toEqual(state)
    expect(parseBackup(raw!).duoGroups).toEqual(state.duoGroups)
  } finally { await destination.close() }
})

test('AP1 Fallback: gemeinsame Rechnung an zwei Personen als JSON exportieren, importieren und reload', async ({ page, context, browser, browserName }, testInfo) => {
  const flowStarted = Date.now()
  console.log(`P12 JSON-Fallback: ${browserName} ${browser.version()}; Node ${process.version}; ${process.platform}`)
  await testInfo.attach('browser-version.txt', { body: `${browserName} ${browser.version()} / ${process.platform} / Node ${process.version}`, contentType: 'text/plain' })
  await withoutFolder(context, browserName)
  const state = documentFamily()
  const draft = { ...documentDraft(), guardianIds: ['g-a', 'g-b'], studentIds: ['s-a', 's-b'], recipientStrategy: 'joint' as const,
    items: ['a', 'b'].map((id) => ({ ...documentDraft().items[0], id: `position-${id}`, studentId: `s-${id}`, quantity: 1, unitPrice: 30 })) }
  const result = saveInvoiceDraft(state, draft, true, documentAt)
  await page.goto('/')
  expect(await page.evaluate(() => typeof window.showDirectoryPicker)).toBe('undefined')
  expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(true)
  await restore(page, Buffer.from(serializeBackup(result)))
  await settings(page)
  await expect(page.getByText('Dieser Browser unterstützt die Ordnerauswahl nicht.', { exact: true })).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON exportieren', exact: true }).click()
  const buffer = await readFile((await (await downloading).path())!)
  expect(parseBackup(buffer.toString())).toEqual(result)
  const destination = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
  try {
    await withoutFolder(destination, browserName)
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
