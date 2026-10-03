import { test, expect } from '@playwright/test'
import { documentAt, documentDraft, documentFamily, expectedTextless, legacyVersionedFixture } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { parseBackup, STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_GUARD_KEY } from '../../src/lib/storage'

test('P09 Browser: Altbeleg, interne Kopien und Wiederausgabe werden textbereinigt; der eigene Hinweis bleibt exakt', async ({ page }) => {
  const note = '  § 19 UStG: eigener Hinweis\nUnverändert erhalten.  '
  const issued = saveInvoiceDraft(documentFamily(), { ...documentDraft(), freeText: note,
    recipients: [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }] }, true, documentAt)
  const old = legacyVersionedFixture(issued, 14), removed = 'P09-ALTER-TEXT'
  old.settings.defaultLegalText = removed
  old.invoices[0].introText = removed; old.invoices[0].legalText = removed; old.invoices[0].snapshot.legalText = removed
  old.documentVersions[0].content.introText = removed; old.documentVersions[0].outputLegalText = removed
  old.documentVersions[0].outputSnapshot.legalText = removed
  const raw = JSON.stringify(old), archiveKey = `${STORAGE_KEY}-recovery-p09`
  await page.goto('/')
  await page.evaluate(({ raw, keys, archiveKey }) => {
    localStorage.clear()
    for (const key of keys) localStorage.setItem(key, raw)
    localStorage.setItem(archiveKey, JSON.stringify({ sourceRaw: raw, previousRaw: raw }))
  }, { raw, keys: [STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY], archiveKey })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokale Daten benötigen Wiederherstellung' })).toBeVisible()
  await page.getByRole('button', { name: 'Altformat und Reparatur prüfen' }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten' }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen' }).click()
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
  await page.reload()
  const migrated = parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
  expect(migrated).toEqual({ ...expectedTextless(old), schemaVersion: 15 })
  expect(migrated.invoices[0].freeText).toBe(note)
  const stored = await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)).join('\n'),
    [STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_GUARD_KEY, archiveKey])
  expect(stored).not.toMatch(/P09-ALTER-TEXT|introText|legalText|defaultLegalText|outputLegalText/)
  await page.evaluate(async ({ state, invoiceId }) => {
    const path = '/tests/browser/documentPrintHarness.tsx'
    const { mountDocument } = await import(path)
    mountDocument(state, invoiceId)
  }, { state: migrated, invoiceId: migrated.invoices[0].id })
  await expect(page.locator('.invoice-paper')).toContainText('Hiermit stelle ich die folgenden Leistungen in Rechnung.')
  await expect(page.locator('.invoice-paper')).toContainText('Privatrechnung')
  await expect(page.locator('.invoice-paper')).toContainText('§ 19 UStG: eigener Hinweis')
  await expect(page.locator('.invoice-paper')).toContainText('Empfaenger A')
  await expect(page.locator('.invoice-paper')).toContainText('Empfaenger B')
  await expect(page.locator('.invoice-paper')).not.toContainText(removed)
})
