import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { emptyState } from '../../src/lib/defaults'
import { serializeBackup, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../../src/lib/storage'

async function settings(page: Page) {
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
}
async function stored(page: Page) { return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY) }

test('echter Browser: Einstellung, sofortiger Ansichtswechsel, Schließen und erneutes Öffnen', async ({ page, context, browser }) => {
  console.log(`Browser: ${browser.version()}; Node: ${process.version}; Plattform: ${process.platform}`)
  await page.goto('/')
  await settings(page)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Synthetischer bestätigter Stand')
  await page.getByRole('button', { name: 'Familien', exact: true }).first().click()
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  const raw = await stored(page)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/')
  await settings(reopened)
  await expect(reopened.getByLabel('Name / Geschäftsbezeichnung', { exact: true })).toHaveValue('Synthetischer bestätigter Stand')
  expect(await stored(reopened)).toBe(raw)
})

test('zwei echte Tabs: native Web Locks verhindern das Überschreiben durch einen veralteten Tab', async ({ page, context }) => {
  await page.goto('/')
  await settings(page)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Basis')
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  const second = await context.newPage()
  await second.goto('/')
  await settings(second)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Erster Tab gewinnt')
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  await second.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Veralteter Tab')
  await expect(second.locator('.external-update')).toBeVisible()
  expect(JSON.parse((await stored(second))!).data.settings.issuer.name).toBe('Erster Tab gewinnt')
  await second.reload()
  await settings(second)
  await expect(second.getByLabel('Name / Geschäftsbezeichnung', { exact: true })).toHaveValue('Erster Tab gewinnt')
})

test('echter Browser: beschädigte Rohdaten exportieren, Backup bestätigen, persistieren und neu laden', async ({ page }) => {
  await page.goto('/')
  const corrupt = '{synthetisch\r\nkaputt'
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw: corrupt })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokale Daten benötigen Wiederherstellung' })).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Beschädigte Rohdaten exportieren', exact: true }).click()
  const download = await downloading
  expect(await readFile((await download.path())!, 'utf8')).toBe(corrupt)
  const next = emptyState()
  next.settings.issuer.name = 'Aus Backup wiederhergestellt'
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetisch.json', mimeType: 'application/json', buffer: Buffer.from(serializeBackup(next)) })
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
  await expect(page.getByText(/Wiederherstellung lokal gespeichert, Revision/)).toBeVisible()
  const raw = await stored(page)
  await page.reload()
  await settings(page)
  await expect(page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })).toHaveValue('Aus Backup wiederhergestellt')
  expect(await stored(page)).toBe(raw)
  const archives = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('-recovery-')).map((key) => JSON.parse(localStorage.getItem(key)!)))
  expect(archives[0].previousRaw).toBe(corrupt)
})

test('echter Browser: isolierte Demo mit realem OPFS-Handle und IndexedDB erhält Echtbestand und Dateien', async ({ playwright }, testInfo) => {
  // Chromium 153 crashes when deserializing OPFS handles in an incognito context.
  // The isolated probe in CI 34086399032 reproduces this without application code.
  // A persistent synthetic profile also allows a full browser restart below.
  const profile = testInfo.outputPath('synthetic-profile')
  let context = await playwright.chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, baseURL: 'http://127.0.0.1:4173' })
  let page = await context.newPage()
  try {
  await page.goto('/')
  // Synthetic OPFS fixture: real file/IndexedDB APIs, no native picker or OS permission UI proof.
  await page.evaluate(async () => {
    const modulePath = '/src/lib/storage.ts'
    const { StorageSession, storeDirectoryHandle } = await import(modulePath)
    const session = new StorageSession()
    await session.change((state: ReturnType<typeof emptyState>) => ({ ...state, settings: { ...state.settings, issuer: { ...state.settings.issuer, name: 'Echter synthetischer Bestand' } } }))
    const root = await navigator.storage.getDirectory()
    const handle = await root.getDirectoryHandle('paket-03-synthetisch', { create: true })
    const binding = { handle, datasetId: session.revision.datasetId, legacyFiles: [] }
    await session.connect(binding)
    await storeDirectoryHandle(binding)
    await Promise.all([session.backup(), session.backup()])
  })
  await page.reload()
  const before = await stored(page)
  const readFiles = () => page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getDirectoryHandle('paket-03-synthetisch')
    const files: Array<[string, string]> = []
    for await (const entry of handle.values()) if (entry.kind === 'file') files.push([entry.name, await (await (entry as FileSystemFileHandle).getFile()).text()])
    return files.sort()
  })
  const filesBefore = await readFiles()
  await page.getByRole('button', { name: /Lieber erst mit Beispieldaten testen/ }).click()
  await expect(page.getByRole('button', { name: 'Demo verlassen', exact: true })).toBeVisible()
  await settings(page)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Demo überschreibt nichts')
  await page.getByRole('button', { name: 'Demo verlassen', exact: true }).click()
  expect(await stored(page)).toBe(before)
  expect(await readFiles()).toEqual(filesBefore)
  await context.close()
  context = await playwright.chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, baseURL: 'http://127.0.0.1:4173' })
  page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('.backup-indicator')).toContainText('paket-03-synthetisch')
  expect(await stored(page)).toBe(before)
  expect(await readFiles()).toEqual(filesBefore)
  await settings(page)
  await expect(page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })).toHaveValue('Echter synthetischer Bestand')
  } finally { await context.close() }
})

test('Fehler-Injektion im echten Browser: Picker-Abbruch verändert keine Daten', async ({ page }) => {
  await page.addInitScript(() => { window.showDirectoryPicker = async () => { throw new DOMException('Abgebrochen', 'AbortError') } })
  await page.goto('/')
  await settings(page)
  const before = await stored(page)
  await page.getByRole('button', { name: 'Ordner wählen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Backup-Ordner prüfen' })).toHaveCount(0)
  expect(await stored(page)).toBe(before)
})

test('mobil: wesentlicher Speicherstatus bleibt bei 390 Pixeln sichtbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.save-indicator')).toBeVisible()
  await expect(page.locator('.backup-indicator')).toBeVisible()
  const box = await page.locator('.topbar__storage-status').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
})


test('zwei echte Tabs: zeitgleich gestartete Einstellungen erzeugen nur einen gültigen Folgestand', async ({ page, context }) => {
  await page.goto('/')
  await settings(page)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Gemeinsame Basis')
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  const second = await context.newPage()
  await second.goto('/')
  await settings(second)
  await Promise.all([
    page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Parallel A'),
    second.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Parallel B'),
  ])
  await expect.poll(async () => (await page.locator('.external-update').count()) + (await second.locator('.external-update').count())).toBeGreaterThan(0)
  const envelope = JSON.parse((await stored(page))!)
  expect(['Parallel A', 'Parallel B']).toContain(envelope.data.settings.issuer.name)
  expect(envelope.revision).toBe(2)
  expect(await stored(second)).toBe(await stored(page))
})

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
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_STORAGE_KEY)).toBe(original)
  // Deliberately keep the genuine historical app open and let ITS autosave run.
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Alter Tab schreibt nach Umstieg')
  await expect(current.locator('.external-update')).toBeVisible()
  expect(await stored(current)).toBe(migrated)
  await current.reload()
  await expect(current.locator('.external-update')).toBeVisible()
  await settings(current)
  await current.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Darf keinen der Stände überschreiben')
  await expect(current.locator('.persistence-error')).toContainText('alte Anwendungsversion')
  expect(await stored(current)).toBe(migrated)
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).settings.issuer.name, LEGACY_STORAGE_KEY)).toBe('Alter Tab schreibt nach Umstieg')
})
