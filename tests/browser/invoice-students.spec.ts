import { test, expect, type Locator, type Page } from '@playwright/test'
import type { AppState, InvoiceItem } from '../../src/types'
import { documentAt, documentDraft, documentFamily } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { saveStudentState } from '../../src/lib/commands'
import { requireSuccess } from '../../src/lib/result'
import { invoiceTotal } from '../../src/lib/money'
import { parseBackup, serializeBackup, STORAGE_KEY } from '../../src/lib/storage'
import { navigateToInvoices } from './navigation'

async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
  await navigateToInvoices(page)
}

async function stateOf(page: Page): Promise<AppState> {
  return parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
}

async function itemValues(editor: Locator) {
  return editor.locator('.editor-item').evaluateAll((items) => items.map((item) =>
    Array.from(item.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
      .filter((input) => !input.closest('.field--student')).map((input) => input.value)))
}

const commercialFields = (item: InvoiceItem) => ({ description: item.description, quantity: item.quantity,
  unit: item.unit, unitPrice: item.unitPrice, lessonType: item.lessonType })

for (const newFirst of [false, true]) test(`Kopie: ${newFirst ? 'neue Person zuerst' : 'alte Person zuerst'}, alle Positionen erhalten, speichern, erneut öffnen und finalisieren`, async ({ page }) => {
  const family = documentFamily()
  family.students[0].guardianIds = ['g-a']
  family.students[1].guardianIds = ['g-b']
  await seed(page, family)
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  let editor = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
  await editor.getByRole('group', { name: 'Lernende', exact: true }).locator('label.choice-chip').filter({ hasText: 'Testkind A' }).click()
  await editor.getByLabel('Rechnungsdatum', { exact: true }).fill('2026-09-01')
  const first = editor.locator('.editor-item').first()
  await first.getByLabel('Datum', { exact: true }).fill('2026-08-15')
  await first.getByLabel('Beschreibung', { exact: true }).fill('Individueller Solo-Unterricht')
  await first.getByLabel('Menge', { exact: true }).fill('0,75')
  await first.getByLabel('Einzelpreis €', { exact: true }).fill('10,10')
  await editor.getByRole('button', { name: 'Position', exact: true }).click()
  const second = editor.locator('.editor-item').nth(1)
  await second.getByLabel('Art', { exact: true }).selectOption('duo')
  await second.getByLabel('Datum', { exact: true }).fill('2026-08-22')
  await second.getByLabel('Beschreibung', { exact: true }).fill('Individuelle Duo-Pauschale')
  await second.getByLabel('Menge', { exact: true }).fill('1,25')
  await second.getByLabel('Einheit', { exact: true }).selectOption('Pauschale')
  await second.getByLabel('Einzelpreis €', { exact: true }).fill('17,35')
  await editor.getByLabel('Freitext / Hinweis', { exact: true }).fill('Hinweis der Quelle')
  await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  await expect(editor).not.toBeVisible()
  const source = structuredClone((await stateOf(page)).invoices[0])
  await page.locator('.invoice-detail').getByRole('button', { name: 'Duplizieren', exact: true }).click()
  editor = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
  const values = await itemValues(editor)
  await expect(editor.locator('.modal-total')).toContainText('29,27')
  const learners = editor.getByRole('group', { name: 'Lernende', exact: true })
  if (newFirst) {
    await learners.locator('label.choice-chip').filter({ hasText: 'Testkind B' }).click()
    await expect(editor.getByRole('status').filter({ hasText: 'Rechnungsempfänger entfernt' })).toBeVisible()
    await learners.locator('label.choice-chip').filter({ hasText: 'Testkind A' }).click()
  } else {
    await learners.locator('label.choice-chip').filter({ hasText: 'Testkind A' }).click()
    expect(await itemValues(editor)).toEqual(values)
    await expect(editor.getByRole('status').filter({ hasText: 'Alle Positionen bleiben erhalten' })).toBeVisible()
    await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
    await expect(editor.getByRole('alert')).toContainText('erhaltenen Positionen')
    await learners.locator('label.choice-chip').filter({ hasText: 'Testkind B' }).click()
  }
  expect(await itemValues(editor)).toEqual(values)
  await expect(editor.locator('.modal-total')).toContainText('29,27')
  const audience = editor.getByRole('group', { name: 'Rechnungsempfänger', exact: true })
  await expect(audience.getByRole('checkbox', { name: /Empfaenger B/ })).toBeChecked()
  await expect(audience.getByRole('checkbox', { name: /Empfaenger A/ })).toHaveCount(0)
  await expect(editor.getByRole('status').filter({ hasText: 'Rechnungsempfänger ergänzt' })).toBeVisible()
  await editor.getByLabel('Rechnungsdatum', { exact: true }).fill('2026-10-10')
  await expect(editor.getByLabel('Fällig am', { exact: true })).toHaveValue('2026-10-24')
  await editor.getByLabel('Freitext / Hinweis', { exact: true }).fill('Geänderter Hinweis der Kopie')
  expect(await itemValues(editor)).toEqual(values)
  await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  await expect(editor).not.toBeVisible()
  const saved = await stateOf(page)
  const copy = saved.invoices.find((invoice) => invoice.id !== source.id)!
  expect(copy.items).toHaveLength(2)
  expect(copy.items.every((item) => item.studentId === 's-b')).toBe(true)
  expect(copy.items.map(commercialFields)).toEqual(source.items.map(commercialFields))
  expect(saved.invoices.find((invoice) => invoice.id === source.id)).toEqual(source)
  await page.reload()
  await navigateToInvoices(page)
  await page.locator('.invoice-list-table tbody tr').filter({ hasText: 'Testkind B' }).getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const reopened = page.getByRole('dialog', { name: 'Entwurf bearbeiten', exact: true })
  expect(await itemValues(reopened)).toEqual(values)
  await expect(reopened.getByLabel('Freitext / Hinweis', { exact: true })).toHaveValue('Geänderter Hinweis der Kopie')
  await expect(reopened.getByLabel('Rechnungsdatum', { exact: true })).toHaveValue('2026-10-10')
  await reopened.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(reopened).not.toBeVisible()
  const final = await stateOf(page)
  expect(final.documentVersions.at(-1)!.amounts.totalCents).toBe(2927)
  expect(invoiceTotal(final.invoices.find((invoice) => invoice.id === copy.id)!)).toBe(invoiceTotal(source))
  expect(final.invoices.find((invoice) => invoice.id === copy.id)!.number).toBe('2026-0001-b')
  expect(final.invoices.find((invoice) => invoice.id === source.id)).toEqual(source)
})

for (const newFirst of [false, true]) test(`Duo: Austausch ${newFirst ? 'neu zuerst' : 'alt zuerst'}, Positionsauswahl und Hinzufügen`, async ({ page }) => {
  let state = documentFamily()
  state = requireSuccess(saveStudentState(state, { ...state.students[1], id: 's-c', billingCode: '', name: 'Testkind C' }))
  const draft = documentDraft()
  const second: InvoiceItem = { ...draft.items[0], id: 'second-position', studentId: 's-b', lessonType: 'duo', quantity: 1.25, unitPrice: 17.35 }
  await seed(page, saveInvoiceDraft(state, { ...draft, studentIds: ['s-a', 's-b'], items: [...draft.items, second] }, false, documentAt))
  await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail').getByRole('button', { name: 'Duplizieren', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
  const values = await itemValues(editor)
  const learners = editor.getByRole('group', { name: 'Lernende', exact: true })
  if (newFirst) await learners.locator('label.choice-chip').filter({ hasText: 'Testkind C' }).click()
  await learners.locator('label.choice-chip').filter({ hasText: 'Testkind A' }).click()
  if (!newFirst) {
    await expect(editor.locator('.editor-item').first().getByLabel('Lernende Person', { exact: true })).toHaveValue('s-a')
    await learners.locator('label.choice-chip').filter({ hasText: 'Testkind C' }).click()
  }
  expect(await itemValues(editor)).toEqual(values)
  await expect(editor.locator('.editor-item').first().getByLabel('Lernende Person', { exact: true })).toHaveValue('s-c')
  await expect(editor.locator('.editor-item').nth(1).getByLabel('Lernende Person', { exact: true })).toHaveValue('s-b')
  await editor.locator('.editor-item').first().getByLabel('Lernende Person', { exact: true }).selectOption('s-b')
  await editor.locator('.editor-item').first().getByLabel('Lernende Person', { exact: true }).selectOption('s-c')
  await editor.getByRole('button', { name: 'Position', exact: true }).click()
  await expect(editor.locator('.editor-item').nth(2).getByLabel('Lernende Person', { exact: true })).toHaveValue('s-b')
  await editor.getByRole('button', { name: 'Position 3 löschen', exact: true }).click()
  await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  await expect(editor).not.toBeVisible()
  const copy = (await stateOf(page)).invoices.at(-1)!
  expect(copy.items.map((item) => item.studentId)).toEqual(['s-c', 's-b'])
})

test('Duo: Abwählen ohne Ersatz erhält Positionen bis zur ausdrücklichen Einzelzuordnung', async ({ page }) => {
  const draft = { ...documentDraft(), studentIds: ['s-a', 's-b'] }
  await seed(page, saveInvoiceDraft(documentFamily(), draft, false, documentAt))
  await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten', exact: true })
  const values = await itemValues(editor)
  await editor.getByRole('group', { name: 'Lernende', exact: true }).locator('label.choice-chip').filter({ hasText: 'Testkind A' }).click()
  expect(await itemValues(editor)).toEqual(values)
  await editor.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('erhaltenen Positionen')
  await editor.getByLabel('Lernende Person', { exact: true }).selectOption('s-b')
  expect(await itemValues(editor)).toEqual(values)
  await editor.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(editor).not.toBeVisible()
  expect((await stateOf(page)).invoices[0].items[0]).toEqual({ ...draft.items[0], studentId: 's-b' })
})

test('Bestehender Entwurf: nach Stammdatenänderung ungültige Empfänger sichtbar abwählen', async ({ page }) => {
  let state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  state = requireSuccess(saveStudentState(state, { ...state.students[0], guardianIds: ['g-b'] }))
  await seed(page, state)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten', exact: true })
  const audience = editor.getByRole('group', { name: 'Rechnungsempfänger', exact: true })
  await expect(audience.getByRole('checkbox', { name: /Empfaenger A/ })).toBeChecked()
  await audience.locator('label.choice-chip').filter({ hasText: 'Empfaenger A' }).click()
  await audience.locator('label.choice-chip').filter({ hasText: 'Empfaenger B' }).click()
  await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  await expect(editor).not.toBeVisible()
  const saved = (await stateOf(page)).invoices[0]
  expect(saved.recipients).toEqual([{ type: 'guardian', id: 'g-b' }])
  expect(saved.items).toEqual(state.invoices[0].items)
})
