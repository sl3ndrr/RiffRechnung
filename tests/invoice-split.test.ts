import test from 'node:test'
import assert from 'node:assert/strict'
import type { AppState, Guardian, InvoiceDraft, InvoiceItemAllocation, Student } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { activeInvoices, selectedInvoices } from '../src/lib/documents'
import { allocationCentsFromInput, needsHistoricalSplitReview, previewInvoiceSplit, splitInvoiceDraft } from '../src/lib/invoiceSplit'
import { changeInvoiceStatus } from '../src/lib/invoiceActions'
import { invoiceTotalCents, sumCents } from '../src/lib/money'
import { loadState, parseBackup, serializeBackup } from '../src/lib/storage'
import { memoryStorage, seedState } from './storageHarness'

const at = '2026-09-08T12:00:00.000Z'
const guardian = (id: string, name: string): Guardian => ({ id, name, email: `${id}@example.de`, phone: '', address: { street: `${name} Straße 1`, postalCode: '50667', city: 'Köln' }, iban: '', paymentNote: '', createdAt: at, updatedAt: at })
const student = (id: string, name: string, billingCode: string, guardianIds: string[]): Student => ({ id, name, billingCode, guardianIds, note: '', active: true, createdAt: at, updatedAt: at })

function familyState(): AppState {
  const state = emptyState()
  state.updatedAt = at
  state.settings = { ...state.settings, issuer: { name: 'Testunterricht', street: 'Musikweg 1', postalCode: '50667', city: 'Köln', email: 'rechnung@example.de', phone: '' }, accountHolder: 'Testunterricht', iban: 'DE89370400440532013000' }
  state.guardians = [guardian('g-a', 'Familie A'), guardian('g-b', 'Familie B'), guardian('g-c', 'Zweiter Haushalt A')]
  state.students = [
    student('s-a1', 'Kind A Eins', 'a', ['g-a', 'g-c']),
    student('s-a2', 'Kind A Zwei', 'b', ['g-a', 'g-c']),
    student('s-b', 'Kind B', 'c', ['g-b']),
  ]
  state.nextStudentCodeIndex = 3
  return state
}

function splitDraft(state: AppState, three = false): InvoiceDraft {
  const students = three ? ['s-a1', 's-b', 's-a2'] : ['s-a1', 's-b']
  const guardians = three ? ['g-a', 'g-b', 'g-c'] : ['g-a', 'g-b']
  return {
    invoiceDate: '2026-09-08', dueDate: '2026-09-22', period: 'September 2026', guardianIds: guardians, studentIds: students, recipientStrategy: 'separate',
    items: students.map((studentId, index) => ({ id: `source-${index + 1}`, studentId, serviceDate: `2026-09-${String(index + 1).padStart(2, '0')}`, lessonType: 'solo', description: `Unterricht ${index + 1}`, quantity: 1, unit: 'Std.', unitPrice: 30 })),
    introText: 'Hiermit stelle ich die zugeordneten Unterrichtseinheiten in Rechnung.', freeText: '', legalText: state.settings.defaultLegalText,
  }
}

function deterministicIds() {
  let index = 0
  return (prefix: string) => `${prefix}-split-${++index}`
}

test('P06/R02: zwei Familien erhalten je 30 EUR und ausschließlich ihr Kind; Gesamtforderung bleibt 60 EUR', () => {
  const state = familyState()
  const draft = splitDraft(state)
  const allocations: InvoiceItemAllocation[] = [
    { itemId: 'source-1', parts: [{ guardianId: 'g-a', amountCents: 3000 }] },
    { itemId: 'source-2', parts: [{ guardianId: 'g-b', amountCents: 3000 }] },
  ]
  const preview = previewInvoiceSplit(state, draft, allocations)
  assert.deepEqual(preview.results.map((result) => [result.guardianId, result.studentIds, result.totalCents]), [
    ['g-a', ['s-a1'], 3000], ['g-b', ['s-b'], 3000],
  ])
  assert.equal(preview.totalCents, 6000)
  const result = splitInvoiceDraft(state, draft, allocations, true, at, deterministicIds())
  assert.equal(result.state.invoices.length, 2)
  assert.equal(sumCents(activeInvoices(result.state).map(invoiceTotalCents)), 6000)
  assert.deepEqual(result.state.invoices.map((invoice) => invoice.snapshot!.guardians.map((entry) => entry.id)), [['g-a'], ['g-b']])
  assert.deepEqual(result.state.invoices.map((invoice) => invoice.snapshot!.students.map((entry) => entry.id)), [['s-a1'], ['s-b']])
  assert.deepEqual(result.state.invoices.map((invoice) => invoice.number), ['2026-a-0001', '2026-c-0001'])
  assert.equal(new Set(result.state.invoices.flatMap((invoice) => [invoice.id, ...invoice.items.map((item) => item.id)])).size, 4)
})

test('P06: gemeinsame Eltern, getrennte Haushalte, Geschwister und drei Empfänger werden je Position ausdrücklich aufgelöst', () => {
  const state = familyState()
  const draft = splitDraft(state, true)
  assert.throws(() => previewInvoiceSplit(state, draft, draft.items.map((item) => ({ itemId: item.id, parts: [] }))), /noch keine bestätigte Zuordnung/)
  const preview = previewInvoiceSplit(state, draft, [
    { itemId: 'source-1', parts: [{ guardianId: 'g-c', amountCents: 3000 }] },
    { itemId: 'source-2', parts: [{ guardianId: 'g-b', amountCents: 3000 }] },
    { itemId: 'source-3', parts: [{ guardianId: 'g-a', amountCents: 3000 }] },
  ])
  assert.deepEqual(preview.results.map((result) => [result.guardianId, result.studentIds]), [['g-a', ['s-a2']], ['g-b', ['s-b']], ['g-c', ['s-a1']]])
  assert.throws(() => previewInvoiceSplit(state, draft, [
    { itemId: 'source-1', parts: [{ guardianId: 'g-b', amountCents: 3000 }] },
    { itemId: 'source-2', parts: [{ guardianId: 'g-b', amountCents: 3000 }] },
    { itemId: 'source-3', parts: [{ guardianId: 'g-a', amountCents: 3000 }] },
  ]), /darf nur einer für Kind A Eins hinterlegten Person/)
})

test('P06: bestätigte Teilbeträge sind centgenau, sichtbar und ergeben exakt den ursprünglichen Betrag', () => {
  const state = familyState()
  const draft = splitDraft(state)
  draft.guardianIds = ['g-a', 'g-c']
  draft.studentIds = ['s-a1']
  draft.items = [{ ...draft.items[0], unitPrice: 10.01 }]
  const allocations = [{ itemId: 'source-1', parts: [{ guardianId: 'g-a', amountCents: 500 }, { guardianId: 'g-c', amountCents: 501 }] }]
  const preview = previewInvoiceSplit(state, draft, allocations)
  assert.deepEqual(preview.results.map((result) => result.totalCents), [500, 501])
  assert.equal(preview.totalCents, 1001)
  assert.match(preview.results[0].items[0].description, /5,00.*10,01/)
  assert.match(preview.results[1].items[0].description, /5,01.*10,01/)
  assert.throws(() => previewInvoiceSplit(state, draft, [{ itemId: 'source-1', parts: [{ guardianId: 'g-a', amountCents: 500 }, { guardianId: 'g-c', amountCents: 500 }] }]), /10,00.*10,01/)
  assert.equal(allocationCentsFromInput('5,01'), 501)
  assert.equal(allocationCentsFromInput('5.01'), 501)
  assert.equal(allocationCentsFromInput('5.001'), null)
})

test('P06: fremde Kindnamen in Kopf-/Hinweistexten sperren die empfängerbezogene Ausgabe', () => {
  const state = familyState()
  const draft = { ...splitDraft(state), freeText: 'Hinweis zu Kind B' }
  assert.throws(() => previewInvoiceSplit(state, draft, [
    { itemId: 'source-1', parts: [{ guardianId: 'g-a', amountCents: 3000 }] },
    { itemId: 'source-2', parts: [{ guardianId: 'g-b', amountCents: 3000 }] },
  ]), /Ausgabetext für Familie A.*Kind B/)
})

test('P06/R01: Entwurfsanlage und Finalisierung bleiben nach Export–Import und Speichern–Reload gültig', () => {
  const state = familyState()
  const draft = splitDraft(state)
  const allocations = [
    { itemId: 'source-1', parts: [{ guardianId: 'g-a', amountCents: 3000 }] },
    { itemId: 'source-2', parts: [{ guardianId: 'g-b', amountCents: 3000 }] },
  ]
  const drafts = splitInvoiceDraft(state, draft, allocations, false, at, deterministicIds()).state
  const importedDrafts = parseBackup(serializeBackup(drafts))
  assert.deepEqual(importedDrafts.invoices.map((invoice) => invoice.items.map((item) => item.id)), drafts.invoices.map((invoice) => invoice.items.map((item) => item.id)))
  let finalized = importedDrafts
  for (const invoice of [...finalized.invoices]) finalized = changeInvoiceStatus(finalized, invoice.id, 'sent', at)
  assert.equal(new Set(finalized.invoices.map((invoice) => invoice.number)).size, 2)
  assert.equal(new Set(finalized.invoices.flatMap((invoice) => invoice.items.map((item) => item.id))).size, 2)
  const importedFinalized = parseBackup(serializeBackup(finalized))
  assert.deepEqual(importedFinalized, finalized)
  const storage = memoryStorage()
  seedState(finalized, storage)
  const loaded = loadState(storage)
  assert.equal(loaded.status, 'ready')
  if (loaded.status === 'ready') assert.deepEqual(loaded.state, finalized)
})

test('P06: der gesamte Übergang scheitert ohne Teilanlage oder Nummernverbrauch', () => {
  const state = familyState()
  const before = structuredClone(state)
  const draft = splitDraft(state)
  const allocations = [
    { itemId: 'source-1', parts: [{ guardianId: 'g-a', amountCents: 3000 }] },
    { itemId: 'source-2', parts: [{ guardianId: 'g-b', amountCents: 3000 }] },
  ]
  assert.throws(() => splitInvoiceDraft(state, draft, allocations, true, at, () => 'same-id'), /eindeutige Identität/)
  assert.deepEqual(state, before)
  assert.deepEqual(state.counters, {})
})

test('P06: wiederholte Belegausgabe bleibt dieselbe Forderung; historische Aufteilungen werden nur markiert', () => {
  const state = familyState()
  const draft = splitDraft(state)
  const allocations = [
    { itemId: 'source-1', parts: [{ guardianId: 'g-a', amountCents: 3000 }] },
    { itemId: 'source-2', parts: [{ guardianId: 'g-b', amountCents: 3000 }] },
  ]
  const finalized = splitInvoiceDraft(state, draft, allocations, true, at, deterministicIds()).state
  const beforeClaims = activeInvoices(finalized).map((invoice) => invoice.id)
  selectedInvoices(finalized)
  selectedInvoices(finalized)
  assert.deepEqual(activeInvoices(finalized).map((invoice) => invoice.id), beforeClaims)
  assert.equal(needsHistoricalSplitReview(finalized, finalized.invoices[0]), false)
  const historical = structuredClone(finalized)
  historical.documentVersions[0].provenance = 'oldest-available'
  assert.equal(needsHistoricalSplitReview(historical, historical.invoices[0]), true)
  assert.equal(invoiceTotalCents(historical.invoices[0]), 3000)
})
