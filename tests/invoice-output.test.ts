import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { defaultSettings } from '../src/lib/defaults'
import { createLessonItem } from '../src/lib/invoiceDrafts'
import { billingPeriodFromItems, buildInvoicePrintPageStyle, invoicePdfTitle } from '../src/lib/invoiceOutput'
import { buildEpcPayload } from '../src/lib/paymentData'
import { calculateDueDate } from '../src/lib/calendar'
import { formatDateLong } from '../src/lib/utils'
import { invoiceTotal, itemTotal } from '../src/lib/money'
import { student, invoice } from './invoiceFixtures'

test('EPC-Payload enthält Version, Betrag und Rechnungsnummer', () => {
  const settings = { ...defaultSettings, accountHolder: 'Mara Beispiel', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' }
  const payload = buildEpcPayload(invoice(), settings, 125.5)
  assert.deepEqual(payload.split('\n').slice(0, 4), ['BCD', '002', '1', 'SCT'])
  assert.match(payload, /EUR125\.50/)
  assert.match(payload, /Rechnung 2026-a-0001/)
  assert.doesNotMatch(payload, /\n$/)
})


test('EPC-Payload lehnt ungültige Beträge, BICs und überlange UTF-8-Daten ab', () => {
  const settings = { ...defaultSettings, accountHolder: 'Mara Beispiel', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' }
  assert.throws(() => buildEpcPayload(invoice(), settings, 0), /Betrag.*0,01/)
  assert.throws(() => buildEpcPayload(invoice(), settings, 1_000_000_000), /Betrag.*999\.999\.999,99/)
  assert.throws(() => buildEpcPayload(invoice(), { ...settings, bic: 'INVALID!' }, 125.5), /BIC.*8.*11/)
  assert.doesNotThrow(() => buildEpcPayload(invoice(), { ...settings, bic: '' }, 125.5))
  assert.throws(() => buildEpcPayload(
    invoice({ number: '€'.repeat(140) }),
    { ...settings, accountHolder: 'ä'.repeat(70) },
    125.5,
  ), /331 Byte/)
})


test('Geldbeträge werden positionsweise kaufmännisch auf Cent gerundet', () => {
  const items = [
    { ...createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-rounding-1'), quantity: 1.5, unitPrice: 0.67 },
    { ...createLessonItem('student-a', '2026-08-12', defaultSettings, 'item-rounding-2'), quantity: 1.5, unitPrice: 0.67 },
  ]
  const testInvoice = invoice({ items })
  const settings = { ...defaultSettings, accountHolder: 'Mara Beispiel', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' }

  assert.equal(itemTotal(items[0]), 1.01)
  assert.equal(invoiceTotal(testInvoice), 2.02)
  assert.match(buildEpcPayload(testInvoice, settings, invoiceTotal(testInvoice)), /EUR2\.02/)
  assert.match(renderToStaticMarkup(createElement(InvoicePrint, { invoice: testInvoice, guardians: [], students: [student('student-a', 'Anna', 'a')], settings })), /2,02\s€/)
})


test('Rechnungsdokument druckt automatisch berechneten Zeitraum und Fälligkeit', () => {
  const item = createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-print')
  const testInvoice = invoice({
    dueDate: calculateDueDate('2026-08-01', defaultSettings.paymentTermDays),
    period: 'Nicht verwenden',
    items: [item],
  })
  assert.equal(billingPeriodFromItems(testInvoice.items, testInvoice.invoiceDate), 'August 2026')
  assert.equal(formatDateLong(testInvoice.dueDate), '15. August 2026')
})


test('PDF-Titel enthält Rechnungsnummer und dateisicheren Kindesnamen', () => {
  const testInvoice = invoice({ number: '2026/b:0002', studentIds: ['student-a'] })
  assert.equal(invoicePdfTitle(testInvoice, [student('student-a', 'Lina / Winter', 'a')]), 'Rechnung 2026-b-0002 - Lina - Winter')
})


test('P09: Feste Einleitung, Privatzeile und unveränderter mehrzeiliger Hinweis', () => {

  const longFreeText = ['Erste wichtige Zeile', 'Zweite wichtige Zeile', 'Eine sehr lange ungetrennte Kontoreferenz '.repeat(8)].join('\n')
  const markup = renderToStaticMarkup(createElement(InvoicePrint, {
    invoice: invoice({ freeText: longFreeText, }),
    guardians: [],
    students: [student('student-a', 'Anna', 'a')],
    settings: defaultSettings,
    includeGiroCode: false,
  }))
  assert.match(markup, /Hiermit stelle ich die folgenden Leistungen in Rechnung/); assert.match(markup, /Privatrechnung/)
  assert.match(markup, /Erste wichtige Zeile/)
  assert.match(markup, /Zweite wichtige Zeile/)
  assert.match(markup, /class="invoice-footer"/)
  assert.doesNotMatch(markup, /Seitenzahl im Seitenrand|GiroCode gedruckt|Kein GiroCode/)

  const pageStyle = buildInvoicePrintPageStyle('2026-a-0001')
  assert.match(pageStyle, /@bottom-right \{[\s\S]*Seite " counter\(page\) " von " counter\(pages\)/)
  assert.match(pageStyle, /@top-right \{[\s\S]*Rechnung 2026-a-0001/)
  assert.match(pageStyle, /@bottom-left \{[\s\S]*Rechnung 2026-a-0001/)
  assert.match(buildInvoicePrintPageStyle(null), /@bottom-left \{[\s\S]*Rechnung Entwurf/)
  assert.doesNotMatch(pageStyle, /<\/style>/)
})


test('Nur Entwurfsdrucke tragen ein Wasserzeichen', () => {
  const props = {
    guardians: [],
    students: [student('student-a', 'Anna', 'a')],
    settings: defaultSettings,
  }
  const draftMarkup = renderToStaticMarkup(createElement(InvoicePrint, { ...props, invoice: invoice({ number: null, sequence: null, status: 'draft' }) }))
  const finalMarkup = renderToStaticMarkup(createElement(InvoicePrint, { ...props, invoice: invoice() }))
  assert.match(draftMarkup, /class="invoice-draft-watermark"[^>]*>ENTWURF</)
  assert.doesNotMatch(finalMarkup, /invoice-draft-watermark/)

})
