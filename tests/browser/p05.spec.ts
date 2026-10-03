import { test, expect } from '@playwright/test'
import { documentAt, documentDraft, documentFamily, legacyVersionedFixture } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { parseBackup, STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY } from '../../src/lib/storage'

test('P05 Browser: kontrollierter Umstieg bereinigt Kopien; ein Namensfeld erhält finale Empfänger und beide Anschriften', async ({ page }) => {
  const issued = saveInvoiceDraft(documentFamily(), { ...documentDraft(), recipients: [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }] }, true, documentAt)
  const old = legacyVersionedFixture(issued, 10)
  old.guardians[0].name = 'Familie Müller, Dr. Anna'
  Object.assign(old.guardians[0], { firstName: 'Andere', lastName: 'Darstellung', iban: 'P05-PAYER-SECRET', paymentNote: 'P05-PAYMENT-SECRET' })
  old.students[0].note = 'P05-PERSON-SECRET'
  const raw = JSON.stringify(old)
  await page.goto('/')
  await page.evaluate(({ raw, keys }) => {
    for (const key of keys) localStorage.setItem(key, raw)
  }, { raw, keys: [STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY] })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokale Daten benötigen Wiederherstellung' })).toBeVisible()
  await page.getByRole('button', { name: 'Altformat und Reparatur prüfen' }).click()
  await expect(page.getByText(/Entfernte Kontaktfelder werden nach erfolgreicher Übernahme nicht archiviert/)).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten' }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen' }).click()
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
  await page.reload()
  const migrated = parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
  expect(migrated.schemaVersion).toBe(14)
  expect(migrated.invoices[0].snapshot?.recipients.map((person) => person.street)).toEqual(['Testweg 2', 'Testweg 3'])
  expect(migrated.documentVersions[0].outputSnapshot.iban).toBe(issued.documentVersions[0].outputSnapshot.iban)
  const copies = await page.evaluate(() => Object.keys(localStorage).map((key) => localStorage.getItem(key)).join('\n'))
  expect(copies).not.toMatch(/P05-(?:PAYER|PAYMENT|PERSON)-SECRET/)
  await page.getByRole('button', { name: 'Personen', exact: true }).first().click()
  await page.getByRole('button', { name: /Familie Müller, Dr. Anna bearbeiten/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Erziehungsberechtigte Person bearbeiten' })
  await expect(dialog.getByLabel('Name *')).toHaveValue('Familie Müller, Dr. Anna')
  await expect(dialog.getByLabel('Vorname *')).toHaveCount(0)
  await expect(dialog.getByLabel('Nachname *')).toHaveCount(0)
  await expect(dialog.getByText(/IBAN|Interne Notiz|Unverändert behalten/)).toHaveCount(0)
  await dialog.getByLabel('Name *').fill('Madonna')
  await dialog.getByRole('button', { name: 'Speichern' }).click()
  await expect(dialog).not.toBeVisible()
  await page.reload()
  const changed = parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
  expect(changed.guardians[0].name).toBe('Madonna')
  expect(changed.documentVersions).toEqual(migrated.documentVersions)
  expect(changed.invoices).toEqual(migrated.invoices)
})

