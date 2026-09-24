import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { documentAt, documentDraft, documentFamily, editable } from './documentFixtures'
import { saveInvoiceDraft, changeInvoiceStatus } from '../src/lib/invoiceActions'
import { convertLegacyDraftState, prepareInvoiceCopy, saveInvoiceState, LEGACY_REVIEW_FIELDS } from '../src/lib/commands'
import { createCorrectionDraft, activeInvoices, selectInvoice } from '../src/lib/documents'
import { needsHistoricalSplitReview } from '../src/lib/historicalSplit'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { parseBackup, serializeBackup, loadState } from '../src/lib/storage'
import { seedState, memoryStorage } from './storageHarness'
import { requireSuccess } from '../src/lib/result'
import type { AppState, Invoice, InvoiceDraft } from '../src/types'

const resultDraft = (): InvoiceDraft => ({ ...documentDraft(), recipientStrategy: 'separate', introText: 'Gemeinsame Einleitung', freeText: 'Text aus Aufteilung', items: [{ ...documentDraft().items[0], description: 'Unterricht (bestätigter Teilbetrag 5,00 € von 10,00 €)', quantity: 1, unit: 'Pauschale', unitPrice: 5 }] })
const legacy = (draft: InvoiceDraft, id: string): Invoice => ({ ...draft, id, number: null, sequence: null, year: 2026, status: 'draft', calculation: 'decimal-v1', createdAt: documentAt, updatedAt: documentAt })
function reload(state: AppState) {
  const imported = parseBackup(serializeBackup(state))
  const storage = memoryStorage()
  seedState(imported, storage)
  const loaded = loadState(storage)
  assert.equal(loaded.status, 'ready')
  if (loaded.status === 'ready') assert.deepEqual(loaded.state, state)
  return imported
}

test('AP1: frühere Ergebnisrechnung mit einem oder mehreren Empfängern erreicht weder Entwurf noch Forderung', () => {
  for (const guardianIds of [['g-a'], ['g-a', 'g-b']]) {
    const state = documentFamily()
    const draft = { ...resultDraft(), guardianIds }
    const before = structuredClone(state)
    for (const finalize of [false, true]) {
      assert.throws(() => saveInvoiceDraft(state, draft, finalize, documentAt), /Getrennte Rechnungen/)
      assert.equal(saveInvoiceState(state, draft, finalize, documentAt).ok, false)
    }
    const old = { ...state, invoices: [legacy(draft, 'old-draft')] }
    assert.throws(() => changeInvoiceStatus(old, 'old-draft', 'sent', documentAt), /Historische getrennte Entwürfe/)
    assert.deepEqual(state, before)
    assert.deepEqual(state.counters, {})
    assert.equal(activeInvoices(state).length, 0)
  }
})

test('AP1: gemeinsame Rechnung für eine oder mehrere berechtigte Personen bleibt je eine Forderung mit einer Nummer', () => {
  for (const guardianIds of [['g-a'], ['g-a', 'g-b']]) {
    let state = documentFamily()
    const draft = { ...documentDraft(), guardianIds }
    state = saveInvoiceDraft(state, draft, true, documentAt)
    assert.equal(state.invoices.length, 1)
    assert.equal(activeInvoices(state).length, 1)
    assert.equal(state.documentVersions.length, 1)
    assert.equal(state.invoices[0].number, '2026-a-0001')
    assert.equal(state.documentVersions[0].amounts.totalCents, 758)
    assert.deepEqual(state.invoices[0].snapshot?.guardians.map((guardian) => guardian.id), guardianIds)
    reload(state)
  }
})

test('AP1: historische Ausgabe beider Provenienzen behält Original, Druck, Zahlung und Korrektur', () => {
  for (const provenance of ['issued', 'oldest-available'] as const) {
    let state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
    state = structuredClone(state)
    state.invoices[0].recipientStrategy = 'separate'
    state.documentVersions[0].content.recipientStrategy = 'separate'
    state.documentVersions[0].provenance = provenance
    const original = structuredClone(state.documentVersions[0])
    state = reload(state)
    assert.equal(needsHistoricalSplitReview(state, state.invoices[0]), provenance === 'oldest-available')
    const html = renderToStaticMarkup(createElement(InvoicePrint, { invoice: selectInvoice(state, state.invoices[0]), guardians: state.guardians, students: state.students, settings: state.settings, includeGiroCode: false }))
    assert.match(html, /Originaler Unterricht/)
    state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-08')
    assert.equal(state.payments.length, 1)
    state = createCorrectionDraft(state, state.invoices[0].id, 'Synthetische Korrektur', documentAt)
    assert.equal(state.invoices[1].recipientStrategy, 'separate')
    state = saveInvoiceDraft(state, editable(state.invoices[1]), true, documentAt)
    assert.equal(state.invoices[1].recipientStrategy, 'separate')
    assert.equal(state.documentVersions.length, 2)
    assert.deepEqual(state.documentVersions[0], original)
    reload(state)
  }
})

test('AP1: beide Altentwurfsformen bleiben bis zur bestätigten atomaren Umwandlung bestehen', () => {
  const one = documentFamily()
  one.invoices = [legacy(resultDraft(), 'legacy-one')]
  const two = documentFamily()
  two.invoices = [legacy({ ...resultDraft(), guardianIds: ['g-a', 'g-b'] }, 'legacy-two')]
  for (const [state, id, guardians] of [[one, 'legacy-one', ['g-a']], [two, 'legacy-two', ['g-a', 'g-b']]] as const) {
    const before = structuredClone(reload(state))
    const draft = editable(state.invoices[0])
    assert.equal(convertLegacyDraftState(state, id, [], [...guardians], draft, documentAt).ok, false)
    assert.equal(convertLegacyDraftState(state, id, LEGACY_REVIEW_FIELDS, [], draft, documentAt).ok, false)
    assert.deepEqual(state, before)
    const result = requireSuccess(convertLegacyDraftState(state, id, LEGACY_REVIEW_FIELDS, [...guardians], draft, documentAt))
    assert.equal(result.invoices.length, 1)
    assert.equal(result.invoices[0].recipientStrategy, 'joint')
    assert.deepEqual(result.invoices[0].guardianIds, guardians)
    assert.equal(result.invoices[0].number, null)
    assert.deepEqual(result.counters, state.counters)
    assert.equal(result.invoices[0].introText, draft.introText)
    assert.equal(result.invoices[0].freeText, draft.freeText)
    assert.equal(result.invoices[0].items[0].description, draft.items[0].description)
    if (guardians.length > 1) assert.notEqual(result.invoices[0].id, id)
    reload(result)
  }
  const invalid = documentFamily()
  invalid.students[0].guardianIds = ['g-a']
  invalid.invoices = [legacy({ ...resultDraft(), guardianIds: ['g-a', 'g-b'] }, 'legacy-mixed')]
  assert.equal(convertLegacyDraftState(invalid, 'legacy-mixed', LEGACY_REVIEW_FIELDS, ['g-a', 'g-b'], editable(invalid.invoices[0]), documentAt).ok, false)
  assert.equal(invalid.invoices[0].recipientStrategy, 'separate')
})

test('AP1: Kopie eines historischen aufgeteilten Belegs ist gesperrt', () => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  state.invoices[0].recipientStrategy = 'separate'
  state.documentVersions[0].content.recipientStrategy = 'separate'
  const result = prepareInvoiceCopy(state, state.invoices[0].id)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.errors[0].message, /Teilbetragspositionen/)
})
