import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { selectInvoice } from '../src/lib/documents'
import { invoicePdfTitle } from '../src/lib/utils'
import { buildEpcPayload } from '../src/lib/utils'
import { invoiceTotalCents } from '../src/lib/money'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { editable } from './documentFixtures'
import { duoDrafts, duoIssued, households } from './duoFixtures'

test('P03 Datenschutz: gewöhnliche Empfängerberechtigung und private Ausgabe bleiben geschützt', () => {
  const draftState = duoDrafts()
  const wrong = { ...editable(draftState.invoices[0]), recipients: (['g-b']).map((id) => ({ type: 'guardian' as const, id })) }
  assert.throws(() => saveInvoiceDraft(draftState, wrong, false), /zugeordnet/)
  assert.throws(() => saveInvoiceDraft(draftState, wrong, true), /zugeordnet/)
  const state = duoIssued()
  state.invoices.forEach((raw, i) => {
    const invoice = selectInvoice(state, raw), own = households[i], foreign = households[1 - i]
    const html = renderToStaticMarkup(createElement(InvoicePrint, { invoice, guardians: state.guardians, students: state.students, settings: state.settings, includeGiroCode: false }))
    assert.ok(html.includes(own.student) && html.includes(own.guardian))
    for (const output of [html, invoicePdfTitle(invoice, state.students), buildEpcPayload(invoice, state.settings, invoiceTotalCents(invoice) / 100), JSON.stringify(raw.snapshot), JSON.stringify(state.documentVersions[i])]) {
      for (const marker of [foreign.student, foreign.guardian, foreign.note, own.note, 'GEHEIM_', 'legacy-duo-group']) assert.ok(!output.includes(marker), marker)
    }
  })
})


