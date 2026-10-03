import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareInvoiceCopy, prepareNewInvoice } from '../src/lib/commands'
import { createCorrectionDraft } from '../src/lib/documents'
import { invoiceDraftFields } from '../src/lib/invoiceDrafts'
import { invoiceFinalizationErrors } from '../src/lib/invoiceRules'
import { changeInvoiceStatus, invoiceDraftErrors, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { parseBackup } from '../src/lib/importState'
import { requireSuccess } from '../src/lib/result'
import { serializeBackup } from '../src/lib/storage'
import { documentAt, documentDraft, documentFamily } from './documentFixtures'

test('P09: neue Rechnung, Kopie und Korrektur teilen nur bearbeitbare Felder; Identitäten und Belege bleiben getrennt', () => {
  const initial = documentFamily(), empty = requireSuccess(prepareNewInvoice(initial))
  assert.deepEqual(Object.keys(empty).sort(), ['invoiceDate', 'dueDate', 'recipients', 'studentIds', 'recipientStrategy', 'items', 'freeText'].sort())
  let state = saveInvoiceDraft(initial, { ...documentDraft(), freeText: '  Hinweis § 19\nOriginal  ' }, true, documentAt)
  state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-05')
  const original = structuredClone(state), invoice = state.invoices[0]
  const copy = requireSuccess(prepareInvoiceCopy(state, invoice.id, new Date('2026-10-15T12:00:00Z')))
  assert.equal(copy.id, undefined); assert.equal(copy.correction, undefined)
  assert.equal(copy.invoiceDate, '2026-10-15'); assert.equal(copy.dueDate, '2026-10-29')
  assert.equal(copy.items[0].serviceDate, '2026-09-15')
  assert.notEqual(copy.items[0].id, invoice.items[0].id)
  assert.equal(copy.freeText, invoice.freeText)
  for (const key of ['number', 'sequence', 'versionId', 'snapshot', 'draftPrintSnapshot', 'paidAt', 'sentAt', 'issuedAmounts']) assert.equal(Object.hasOwn(copy, key), false)
  const corrected = createCorrectionDraft(state, invoice.id, 'Korrekturgrund', documentAt), correction = corrected.invoices.at(-1)!
  assert.notEqual(correction.id, invoice.id); assert.notEqual(correction.items[0].id, invoice.items[0].id)
  assert.equal(correction.number, null); assert.equal(correction.sequence, null)
  assert.equal(correction.invoiceDate, invoice.invoiceDate); assert.equal(correction.dueDate, invoice.dueDate)
  assert.equal(correction.calculation, invoice.calculation)
  assert.deepEqual(correction.correction, { replacesId: invoice.versionId, reason: 'Korrekturgrund' })
  assert.deepEqual(correction.draftPrintSnapshot, state.documentVersions[0].outputSnapshot)
  assert.equal(correction.versionId, undefined); assert.equal(correction.paidAt, undefined)
  assert.deepEqual(corrected.payments, state.payments); assert.deepEqual(corrected.counters, state.counters)
  const finalizedCorrection = changeInvoiceStatus(corrected, correction.id, 'sent', documentAt)
  assert.notEqual(finalizedCorrection.invoices.at(-1)!.number, invoice.number)
  assert.deepEqual(state, original)
  assert.deepEqual(parseBackup(serializeBackup(finalizedCorrection)).documentVersions[0], original.documentVersions[0])
  const fields = invoiceDraftFields(invoice)
  fields.items[0].description = 'Kopie bearbeitet'; fields.recipients.pop()
  assert.deepEqual(state, original, 'gemeinsame Basis besitzt unabhängige Arrays')
})

test('P09: Vorschau und beide Abschlusswege nutzen dieselben Regeln ohne doppelte Geldfehler', () => {
  const state = documentFamily(), valid = documentDraft(), before = structuredClone(state)
  for (const invalid of [
    { ...valid, items: [] },
    { ...valid, recipients: [] },
    { ...valid, items: [{ ...valid.items[0], description: ' ' }] },
    { ...valid, items: [{ ...valid.items[0], unitPrice: 999_999_999.99, quantity: 2 }] },
    { ...valid, correction: { replacesId: 'missing-original', reason: 'Grund' } },
  ]) {
    const errors = invoiceFinalizationErrors(state, invalid)
    assert.ok(errors.length)
    assert.deepEqual(invoiceDraftErrors(state, invalid, true), errors)
    assert.equal(new Set(errors).size, errors.length)
    let ids = 0
    assert.throws(() => saveInvoiceDraft(state, invalid, true, documentAt, () => { ids++; return 'new-invoice' }), (error: unknown) => error instanceof Error && error.message === errors.join(' '))
    assert.equal(ids, 0, 'Fachprüfung liegt vor Identitäts- und Nummernvergabe')
    // Invalid but structurally saveable drafts remain editable; finalization adds the full rules.
    if (!invalid.correction && invalid.items[0]?.unitPrice !== 999_999_999.99) {
      const saved = saveInvoiceDraft(state, invalid, false, documentAt)
      assert.throws(() => changeInvoiceStatus(saved, saved.invoices[0].id, 'sent', documentAt), (error: unknown) => error instanceof Error && error.message === `Finalisieren nicht möglich: ${errors.join(' ')}`)
    }
    assert.deepEqual(state, before)
  }
})

test('P09: pure Vorschau vergibt keine Identität; Original-, Import- und Bestandsgrenzen bleiben strikt', () => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt), before = structuredClone(state)
  assert.match(invoiceDraftErrors(state, { ...invoiceDraftFields(state.invoices[0]), id: state.invoices[0].id }).join(' '), /Finalisierte/)
  const damaged = structuredClone(state); damaged.documentVersions[0].content.freeText = 'manipuliert'
  assert.throws(() => saveInvoiceDraft(damaged, documentDraft(), false), /Beleginhalt/)
  assert.throws(() => serializeBackup(damaged), /Beleginhalt/)
  assert.throws(() => parseBackup(JSON.stringify(damaged)), /Beleginhalt/)
  assert.deepEqual(state, before)
})
