import { test, expect } from '@playwright/test'
import { documentFamily, documentDraft, documentAt, legacyVersionedFixture } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { parseBackup, STORAGE_KEY } from '../../src/lib/storage'

test('P06 Browser: geschützter Schema-11-Umstieg, festes Format, gemeinsame Empfänger, Kombination und Reload', async ({ page }) => {
  const issued = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  const old = legacyVersionedFixture(issued, 11)
  old.counters = { '2026:a': 7, '2026:a+b': 3 }
  const raw = JSON.stringify(old)
  await page.goto('/')
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokale Daten benötigen Wiederherstellung' })).toBeVisible()
  await page.getByRole('button', { name: 'Altformat und Reparatur prüfen' }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten' }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen' }).click()
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).first().click()
  await expect(page.getByLabel('Nummernmuster')).toHaveCount(0)
  await expect(page.getByText('Jährlich neu zählen', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Platzhalter:/)).toHaveCount(0)
  await expect(page.locator('.number-preview')).toContainText('-0023-a')
  const result = await page.evaluate(async () => {
    const storagePath = '/src/lib/storage.ts', actionsPath = '/src/lib/invoiceActions.ts'
    const { StorageSession } = await import(storagePath)
    const { saveInvoiceDraft } = await import(actionsPath)
    const paymentPath = '/src/lib/paymentData.ts', numberingPath = '/src/lib/invoiceNumbering.ts'
    const { buildEpcPayload } = await import(paymentPath)
    const { nextInvoiceAllocation } = await import(numberingPath)
    const session = new StorageSession()
    const base = session.state.invoices[0]
    const draft = { invoiceDate: base.invoiceDate, dueDate: base.dueDate, period: base.period, studentIds: base.studentIds, recipientStrategy: 'joint', freeText: base.freeText, recipients: [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }], items: base.items.map((item: { id: string }) => ({ ...item, id: 'p06-single-item' })) }
    await session.change((state: Parameters<typeof saveInvoiceDraft>[0]) => saveInvoiceDraft(state, draft, true))
    const single = session.state.invoices.at(-1)
    const reverse = nextInvoiceAllocation(session.state, base.invoiceDate, ['s-b', 's-a'])
    const forward = nextInvoiceAllocation(session.state, base.invoiceDate, ['s-a', 's-b'])
    await session.change((state: Parameters<typeof saveInvoiceDraft>[0]) => saveInvoiceDraft(state, { ...draft, studentIds: ['s-b', 's-a'], items: draft.items.map((item: { id: string }) => ({ ...item, id: 'p06-combo-item' })) }, true))
    const combo = session.state.invoices.at(-1)
    return { single: single.number, combo: combo.number, reverse, forward, counters: session.state.counters, payload: buildEpcPayload(combo, session.state.settings, 7.58) }
  })
  expect(result.single).toBe('2026-0007-a')
  expect(result.combo).toBe('2026-0003-a+b')
  expect(result.reverse).toEqual(result.forward)
  expect(result.counters['2026:a']).toBe(8)
  expect(result.counters['2026:b']).toBeUndefined()
  expect(result.payload).toContain('Rechnung 2026-0003-a+b')
  await page.reload()
  const state = parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
  expect(state.schemaVersion).toBe(15)
  expect(state.invoices[0]).toEqual(legacyVersionedFixture(issued, 13).invoices[0])
  expect(state.documentVersions[0]).toEqual(legacyVersionedFixture(issued, 13).documentVersions[0])
  expect(state.students.map((person) => person.billingCode)).toEqual(['a', 'b'])
})

