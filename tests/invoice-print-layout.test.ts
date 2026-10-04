import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppState } from '../src/types'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { selectInvoice } from '../src/lib/documents'
import { monthlyPrintState } from './invoicePrintFixtures'

const markup = (state: AppState) => renderToStaticMarkup(createElement(InvoicePrint, {
  invoice: selectInvoice(state, state.invoices[0]), settings: state.settings, guardians: state.guardians,
  students: state.students, includeGiroCode: false,
}))

test('AP4: zwei Monate erhalten Zwischensummen; ein Monat erhält nur die Endsumme und eine normale Privatzeile', () => {
  const two = markup(monthlyPrintState()), one = markup(monthlyPrintState(false))
  assert.match(two, /Zwischensumme August:<\/th><td>20,00/)
  assert.match(two, /Zwischensumme September:<\/th><td>60,00/)
  assert.match(two, /class="invoice-total-row"><span>Summe<\/span><strong>80,00/)
  assert.match(one, /August|September 2026/)
  assert.doesNotMatch(one, /Zwischensumme/)
  assert.match(one, /<p class="invoice-private-row">Privatrechnung<\/p>/)
  assert.doesNotMatch(one, /<tr[^>]*>[^]*?Privatrechnung[^]*?<\/tr>/)
})

test('AP4: Legacy-Ausgabe fällt bei abweichender Gesamtsumme ohne Neuberechnung auf flache Originalreihenfolge zurück', () => {
  const state = monthlyPrintState(), amounts = state.documentVersions[0].amounts
  Object.assign(amounts, { calculation: 'legacy-v1', source: 'legacy-output', itemCents: [1999, 2000, 2000, 2000], totalCents: 8000 })
  const before = structuredClone(state), output = markup(state)
  assert.match(output, /class="invoice-flat-items"/)
  assert.doesNotMatch(output, /invoice-month-group|Zwischensumme/)
  assert.match(output, /19,99/); assert.match(output, /<strong>80,00/)
  assert.deepEqual(state, before)
})
