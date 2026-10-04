import test from 'node:test'
import assert from 'node:assert/strict'
import type { AppState } from '../src/types'
import { selectInvoice } from '../src/lib/documents'
import { invoicePrintGroups, invoiceServiceDate } from '../src/lib/invoiceOutput'
import { invoiceTotalCents, sumCents } from '../src/lib/money'
import { monthlyPrintState } from './invoicePrintFixtures'

const selected = (state: AppState) => selectInvoice(state, state.invoices[0])
test('AP4: Monate sind chronologisch; Positionen innerhalb des Monats behalten Reihenfolge und eingefrorene Centwerte', () => {
  const invoice = selected(monthlyPrintState()), before = structuredClone(invoice)
  invoice.items = [invoice.items[2], invoice.items[0], invoice.items[3], invoice.items[1]]
  invoice.issuedAmounts!.itemCents = [2001, 1999, 2100, 1900]
  const unchanged = structuredClone(invoice), groups = invoicePrintGroups(invoice)!
  assert.deepEqual(groups.map((group) => group.title), ['August 2026', 'September 2026'])
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.id)), [[before.items[0].id], [before.items[2].id, before.items[3].id, before.items[1].id]])
  assert.deepEqual(groups.map((group) => group.totalCents), [1999, 6001])
  assert.equal(sumCents(groups.map((group) => group.totalCents)), invoiceTotalCents(invoice))
  assert.deepEqual(invoice, unchanged)
})

test('AP4: fehlende und ungültige Kalenderdaten stehen am Ende; gleiche Monate verschiedener Jahre bleiben getrennt', () => {
  const invoice = selected(monthlyPrintState())
  invoice.items.forEach((item, i) => { item.serviceDate = ['2027-09-01', '', '2026-09-15', '2026-02-30'][i] })
  const groups = invoicePrintGroups(invoice)!
  assert.deepEqual(groups.map((group) => group.title), ['September 2026', 'September 2027', 'Ohne gültiges Leistungsdatum'])
  assert.deepEqual(groups.at(-1)!.items.map((item) => item.serviceDate), ['', '2026-02-30'])
  assert.deepEqual(groups.map((group) => group.totalCents), [2000, 2000, 4000])
  assert.equal(invoiceServiceDate('2024-02-29'), '29.02.')
  for (const value of ['', '2026-02-30', 'kein Datum', '0000-01-01']) assert.equal(invoiceServiceDate(value), value)
})

test('AP4: Legacy-Ausgabe fällt bei abweichender Gesamtsumme ohne Neuberechnung auf flache Originalreihenfolge zurück', () => {
  const state = monthlyPrintState(), amounts = state.documentVersions[0].amounts
  Object.assign(amounts, { calculation: 'legacy-v1', source: 'legacy-output', itemCents: [1999, 2000, 2000, 2000], totalCents: 8000 })
  const before = structuredClone(state), invoice = selected(state)
  assert.equal(invoicePrintGroups(invoice), null)
  assert.deepEqual(state, before)
  // A legacy source with matching sums may still use the monthly layout.
  amounts.totalCents = 7999
  assert.deepEqual(invoicePrintGroups(selected(state))!.map((group) => group.totalCents), [1999, 6000])
})

test('AP4: auch überlaufende historische Positionssummen ändern keinen eingefrorenen Betrag', () => {
  const invoice = selected(monthlyPrintState())
  Object.assign(invoice.issuedAmounts!, { calculation: 'legacy-v1', source: 'legacy-output', itemCents: [Number.MAX_SAFE_INTEGER, 1, 0, 0], totalCents: 1 })
  assert.equal(invoicePrintGroups(invoice), null)
})
