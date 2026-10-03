import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { emptyState } from '../../src/lib/defaults'
import { serializeBackup, STORAGE_KEY } from '../../src/lib/storage'

async function settings(page: Page) {
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
}
async function save(page: Page) { await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click(); await expect(page.getByRole('button', { name: 'Lokal gespeichert', exact: true })).toBeDisabled() }
async function stored(page: Page) { return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY) }

test('echter Browser: Einstellung, sofortiger Ansichtswechsel, Schließen und erneutes Öffnen', async ({ page, context, browser }) => {
  console.log(`Browser: ${browser.version()}; Node: ${process.version}; Plattform: ${process.platform}`)
  await page.goto('/')
  await settings(page)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Synthetischer bestätigter Stand')
  expect(await stored(page)).toBeNull()
  await page.getByRole('button', { name: 'Personen', exact: true }).first().click()
  const confirmation = page.getByRole('alertdialog', { name: 'Ungespeicherte Einstellungen verwerfen?' })
  await confirmation.getByRole('button', { name: 'Weiter bearbeiten' }).click()
  await expect(page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })).toHaveValue('Synthetischer bestätigter Stand')
  await save(page)
  await page.getByRole('button', { name: 'Personen', exact: true }).first().click()
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
  await save(page)
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  const second = await context.newPage()
  await second.goto('/')
  await settings(second)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Erster Tab gewinnt')
  await save(page)
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  await second.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Veralteter Tab')
  await second.getByRole('button', { name: 'Jetzt speichern', exact: true }).click()
  await expect(second.getByLabel('Name / Geschäftsbezeichnung', { exact: true })).toHaveValue('Veralteter Tab')
  await expect(second.locator('.persistence-error')).toContainText('anderen Tab')
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
    const { StorageSession } = await import(modulePath)
    const session = new StorageSession()
    await session.change((state: ReturnType<typeof emptyState>) => ({ ...state, settings: { ...state.settings, issuer: { ...state.settings.issuer, name: 'Echter synthetischer Bestand' } } }))
    const root = await navigator.storage.getDirectory()
    const handle = await root.getDirectoryHandle('paket-03-synthetisch', { create: true })
    const binding = { handle, datasetId: session.revision.datasetId, legacyFiles: [] }
    const file = await handle.getFileHandle('bestehend.json', { create: true })
    const stream = await file.createWritable()
    await stream.write(session.export())
    await stream.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('riffrechnung-handles-v4', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('handles')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('handles', 'readwrite')
        tx.objectStore('handles').put(binding, 'backup-directory')
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
    })
  })
  await page.reload()
  const before = await stored(page)
  const readFiles = () => page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getDirectoryHandle('paket-03-synthetisch')
    const files: Array<[string, string]> = []
    for await (const entry of (handle as FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> }).values()) if (entry.kind === 'file') files.push([entry.name, await (await (entry as FileSystemFileHandle).getFile()).text()])
    return files.sort()
  })
  const filesBefore = await readFiles()
  const readOldBinding = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('riffrechnung-handles-v4', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('handles', 'readonly')
      const entry = tx.objectStore('handles').get('backup-directory')
      entry.onsuccess = () => {
        const binding = entry.result
        resolve({ datasetId: binding.datasetId, name: binding.handle.name, legacyFiles: binding.legacyFiles })
      }
      tx.oncomplete = () => db.close()
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  }))
  const oldBinding = await readOldBinding()
  await page.getByRole('button', { name: 'Mit Beispieldaten testen' }).click()
  await expect(page.getByRole('button', { name: 'Demo verlassen', exact: true })).toBeVisible()
  await settings(page)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Demo überschreibt nichts')
  await save(page)
  await page.getByRole('button', { name: 'Demo verlassen', exact: true }).click()
  expect(await stored(page)).toBe(before)
  expect(await readFiles()).toEqual(filesBefore)
  expect(await readOldBinding()).toEqual(oldBinding)
  await context.close()
  context = await playwright.chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, baseURL: 'http://127.0.0.1:4173' })
  page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Ordner wählen', exact: true })).toHaveCount(0)
  expect(await stored(page)).toBe(before)
  expect(await readFiles()).toEqual(filesBefore)
  await settings(page)
  await expect(page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })).toHaveValue('Echter synthetischer Bestand')
  } finally { await context.close() }
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
  await save(page)
  await expect(page.locator('.save-indicator')).toContainText('Lokal gespeichert')
  const second = await context.newPage()
  await second.goto('/')
  await settings(second)
  await Promise.all([
    page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Parallel A'),
    second.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Parallel B'),
  ])
  await Promise.all([page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click(), second.getByRole('button', { name: 'Jetzt speichern', exact: true }).click()])
  await expect.poll(async () => (await page.locator('.external-update').count()) + (await second.locator('.external-update').count())).toBeGreaterThan(0)
  const envelope = JSON.parse((await stored(page))!)
  expect(['Parallel A', 'Parallel B']).toContain(envelope.data.settings.issuer.name)
  expect(envelope.revision).toBe(2)
  expect(await stored(second)).toBe(await stored(page))
})

test('P04: Verwerfen speichert nichts; Darstellung und Demo-Wechsel respektieren ungespeicherte Einstellungen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mit Beispieldaten testen', exact: true }).click()
  await settings(page)
  const before = await stored(page)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Nicht speichern')
  await page.locator('.theme-picker label').filter({ hasText: 'Dunkel' }).click()
  await page.locator('label.switch-row').filter({ hasText: 'Bewegungen reduzieren' }).click()
  expect(await stored(page)).toBe(before)
  await page.getByRole('button', { name: 'Demo verlassen', exact: true }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Ungespeicherte Einstellungen verwerfen?' })
  await confirmation.getByRole('button', { name: 'Weiter bearbeiten' }).click()
  await expect(page.getByRole('radio', { name: 'Dunkel', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Personen', exact: true }).first().click()
  await confirmation.getByRole('button', { name: 'Verwerfen' }).click()
  expect(await stored(page)).toBe(before)
  await settings(page)
  await expect(page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })).not.toHaveValue('Nicht speichern')
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked()
})

test('P04: weder Echtmodus noch Demo benutzen Picker, IndexedDB oder Datei-APIs', async ({ page }) => {
  await page.addInitScript(() => {
    const forbidden = () => { throw new Error('P04 darf Ordner-APIs nicht verwenden') }
    Reflect.set(window, 'showDirectoryPicker', forbidden)
    indexedDB.open = forbidden
    navigator.storage.getDirectory = forbidden
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await settings(page)
  await expect(page.getByRole('button', { name: 'Ordner wählen', exact: true })).toHaveCount(0)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Lokal')
  await save(page)
  const before = await stored(page)
  await page.getByRole('button', { name: 'Rechnungen', exact: true }).first().click()
  await page.getByRole('button', { name: 'Mit Beispieldaten testen', exact: true }).click()
  await settings(page)
  await page.getByLabel('Name / Geschäftsbezeichnung', { exact: true }).fill('Demo')
  await save(page)
  await page.getByRole('button', { name: 'Demo verlassen', exact: true }).click()
  expect(await stored(page)).toBe(before)
  expect(errors).toEqual([])
})

test('P04: genau ein ausdrücklicher Speicherversuch; Änderungen während einer laufenden Speicherung bleiben offen', async ({ page }) => {
  await page.goto('/')
  await settings(page)
  await page.evaluate(() => {
    const request = navigator.locks.request.bind(navigator.locks)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    Reflect.set(window, 'p04ReleaseWrite', release)
    navigator.locks.request = ((name: string, action: () => Promise<unknown>) => request(name, async () => { await gate; return action() })) as typeof navigator.locks.request
  })
  const name = page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })
  await name.fill('Ausdrücklich speichern')
  await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Speichern …', exact: true })).toBeDisabled()
  await name.fill('Spätere Eingabe')
  await page.evaluate(() => Reflect.get(window, 'p04ReleaseWrite')())
  await expect.poll(async () => JSON.parse((await stored(page))!).data.settings.issuer.name).toBe('Ausdrücklich speichern')
  await expect(name).toHaveValue('Spätere Eingabe')
  await expect(page.getByRole('button', { name: 'Jetzt speichern', exact: true })).toBeEnabled()
  expect(JSON.parse((await stored(page))!).revision).toBe(1)
  await save(page)
  expect(JSON.parse((await stored(page))!).data.settings.issuer.name).toBe('Spätere Eingabe')
  expect(JSON.parse((await stored(page))!).revision).toBe(2)
})
