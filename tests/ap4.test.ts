import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { selectInvoice } from '../src/lib/documents'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { documentAt, documentDraft, documentFamily } from './documentFixtures'

test('AP4 Charakterisierung vor dem Umbau: Altbeleg ohne Ausgabeoptionen behält Kennung, Hinweis und Rechtstext in Druckreihenfolge', () => {
  const state = saveInvoiceDraft(documentFamily(), { ...documentDraft(), legalText: 'Historischer Rechtstext' }, true, documentAt)
  const invoice = selectInvoice(state, state.invoices[0])
  assert.equal(invoice.invoiceKind, undefined)
  const markup = renderToStaticMarkup(createElement(InvoicePrint, {
    invoice, guardians: state.guardians, students: state.students, settings: state.settings,
  }))
  assert.match(markup, /<section class="invoice-tax-data" aria-label="Steuerliche Angaben"><p><strong>Steuernummer:<\/strong> 12\/345\/67890<\/p><p>Steuerbefreiung für Kleinunternehmer \(§ 19 UStG\)\.<\/p><\/section>/)
  const renderedText = markup.replace(/<style[^>]*>[\s\S]*?<\/style>/gu, '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ')
  assert.match(renderedText, /Summe .*7,58.*Steuernummer: 12\/345\/67890 Steuerbefreiung für Kleinunternehmer \(§ 19 UStG\)\. Bitte überweisen Sie/)
  assert.match(renderedText, /Historischer Rechtstext Rechnung /)
  assert.equal(renderedText.split('Steuerbefreiung für Kleinunternehmer (§ 19 UStG).').length - 1, 1)
})
