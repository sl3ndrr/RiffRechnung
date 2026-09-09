import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { serializeBackup, parseBackup, STORAGE_KEY } from '../../src/lib/storage'
import { documentDraft, documentFamily, documentAt } from '../documentFixtures'
import { splitInvoiceDraft } from '../../src/lib/invoiceSplit'
import { invoiceTotalCents } from '../../src/lib/money'

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

test('P12 Fallback: zwei Familien als JSON exportieren, in leerem Profil importieren und reload', async ({ page, context, browser, browserName }, testInfo) => {
  console.log(`P12 JSON-Fallback: ${browserName} ${browser.version()}; Node ${process.version}; ${process.platform}`)
  await testInfo.attach('browser-version.txt', { body: `${browserName} ${browser.version()} / ${process.platform} / Node ${process.version}`, contentType: 'text/plain' })
  await withoutFolder(context, browserName)
  const state = documentFamily()
  state.students = state.students.map((student, index) => ({ ...student, guardianIds: [state.guardians[index].id] }))
  const draft = { ...documentDraft(), guardianIds: ['g-a', 'g-b'], studentIds: ['s-a', 's-b'], recipientStrategy: 'separate' as const,
    items: ['a', 'b'].map((id) => ({ ...documentDraft().items[0], id: `position-${id}`, studentId: `s-${id}`, quantity: 1, unitPrice: 30 })) }
  const result = splitInvoiceDraft(state, draft, draft.items.map((item, index) => ({ itemId: item.id, parts: [{ guardianId: state.guardians[index].id, amountCents: 3000 }] })), true, documentAt)
  await page.goto('/')
  expect(await page.evaluate(() => typeof window.showDirectoryPicker)).toBe('undefined')
  expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(true)
  await restore(page, Buffer.from(serializeBackup(result.state)))
  await settings(page)
  await expect(page.getByText('Dieser Browser unterstützt die Ordnerauswahl nicht.', { exact: true })).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON exportieren', exact: true }).click()
  const buffer = await readFile((await (await downloading).path())!)
  expect(parseBackup(buffer.toString())).toEqual(result.state)
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
    expect(saved).toEqual(result.state)
    expect(saved.invoices.map((invoice) => invoice.snapshot!.students.map((student) => student.id))).toEqual([['s-a'], ['s-b']])
    expect(saved.invoices.map((invoice) => invoice.snapshot!.guardians.map((guardian) => guardian.id))).toEqual([['g-a'], ['g-b']])
    expect(saved.invoices.reduce((sum, invoice) => sum + invoiceTotalCents(invoice), 0)).toBe(6000)
    expect(new Set(saved.invoices.flatMap((invoice) => invoice.items.map((item) => item.id))).size).toBe(2)
  } finally { await destination.close() }
})
