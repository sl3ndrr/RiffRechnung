import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppState, InvoiceDraft, RecipientRef, Student } from '../src/types'
import { documentAt, documentDraft, documentFamily, editable } from './documentFixtures'
import { saveStudentState } from '../src/lib/commands'
import { requireSuccess } from '../src/lib/result'
import { guardianIdsFor } from '../src/lib/recipients'
import { saveInvoiceDraft, changeInvoiceStatus } from '../src/lib/invoiceActions'
import { createCorrectionDraft, selectInvoice } from '../src/lib/documents'
import { invoiceFinalizationErrors, nextInvoiceAllocation } from '../src/lib/utils'
import { inspectImport, parseBackup, serializeMigrationReport } from '../src/lib/importState'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { StorageSession, serializeBackup, loadState } from '../src/lib/storage'
import { memoryStorage, sharedLock } from './storageHarness'
import { validateBackupState, validateLegacyV7Structure } from '../src/lib/validation'

const contact = { email: 'eva@example.org', phone: '', address: { street: 'Testallee 8', postalCode: '12345', city: 'Teststadt' } }
function adultState(): AppState {
  const state = documentFamily()
  const adult: Student = { id: 's-adult', name: 'Eva Beispiel', billingCode: '', guardianIds: [], selfPayer: true, contact,
    note: '', active: true, createdAt: documentAt, updatedAt: documentAt }
  return requireSuccess(saveStudentState(state, adult))
}
function draft(state: AppState, studentIds: string[], recipients: RecipientRef[]): InvoiceDraft {
  return { ...documentDraft(), studentIds, recipients, guardianIds: guardianIdsFor(recipients),
    items: studentIds.map((studentId) => ({ ...documentDraft().items[0], id: `position-${studentId}`, studentId, description: `Unterricht ${state.students.find((student) => student.id === studentId)!.name}` })) }
}
function pdfHtml(state: AppState, id: string): string {
  const invoice = selectInvoice(state, state.invoices.find((entry) => entry.id === id)!)
  return renderToStaticMarkup(createElement(InvoicePrint, { invoice, guardians: state.guardians, students: state.students, settings: state.settings, includeGiroCode: false }))
}
async function roundtrip(state: AppState): Promise<void> {
  const raw = serializeBackup(state)
  assert.deepEqual(parseBackup(raw), state)
  const storage = memoryStorage()
  const session = new StorageSession({ storage, lock: sharedLock() })
  assert.deepEqual(await session.restore(raw), state)
  const loaded = loadState(storage)
  assert.equal(loaded.status, 'ready')
  if (loaded.status === 'ready') assert.deepEqual(loaded.state, state)
}

test('AP5: Selbstzahlerin – Anlage, Entwurf, Finalisierung, Zahlung, Druck und JSON/Reload ohne Personenkopie', async () => {
  let state = adultState()
  assert.equal(state.guardians.length, 2)
  assert.equal(state.students.find((student) => student.id === 's-adult')?.billingCode, 'c')
  const next = draft(state, ['s-adult'], [{ type: 'student', id: 's-adult' }])
  state = saveInvoiceDraft(state, next, false, documentAt)
  assert.deepEqual(state.invoices[0].recipients, [{ type: 'student', id: 's-adult' }])
  state = saveInvoiceDraft(state, editable(state.invoices[0]), true, documentAt)
  const original = structuredClone(state.documentVersions[0])
  assert.equal(state.invoices[0].number, '2026-c-0001')
  assert.deepEqual(state.invoices[0].snapshot?.guardians, [])
  assert.equal(state.invoices[0].snapshot?.recipients?.[0].street, 'Testallee 8')
  state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-12')
  assert.equal(state.payments[0].amountCents, 758)
  assert.deepEqual(state.documentVersions[0], original)
  assert.match(pdfHtml(state, state.invoices[0].id), /Sehr geehrte\/r Eva Beispiel/)
  assert.match(pdfHtml(state, state.invoices[0].id), /Testallee 8/)
  await roundtrip(state)
})

test('AP5: zwei Erziehungsberechtigte bleiben als typisierte Empfänger ein gemeinsamer Beleg', async () => {
  let state = documentFamily()
  const refs: RecipientRef[] = [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }]
  state = saveInvoiceDraft(state, draft(state, ['s-a'], refs), false, documentAt)
  state = saveInvoiceDraft(state, editable(state.invoices[0]), true, documentAt)
  assert.deepEqual(state.invoices[0].guardianIds, ['g-a', 'g-b'])
  assert.deepEqual(state.invoices[0].snapshot?.recipients?.map((entry) => entry.id), ['g-a', 'g-b'])
  assert.equal(state.documentVersions.length, 1)
  state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-12')
  assert.match(pdfHtml(state, state.invoices[0].id), /Sehr geehrte\/r Empfaenger A und Empfaenger B/)
  assert.equal(state.payments.length, 1)
  await roundtrip(state)
})

test('AP5: Moduswechsel erhält Kennzeichen, Altsnapshot, Korrekturkette und reservierte Nummern', async () => {
  let state = documentFamily()
  state = saveInvoiceDraft(state, documentDraft(), true, documentAt)
  const original = structuredClone(state.documentVersions[0])
  const learner = state.students.find((student) => student.id === 's-a')!
  state = requireSuccess(saveStudentState(state, { ...learner, selfPayer: true, guardianIds: [], contact }))
  assert.equal(state.students[0].billingCode, 'a')
  assert.deepEqual(state.documentVersions[0], original)
  assert.match(pdfHtml(state, state.invoices[0].id), /Empfaenger A/)
  assert.equal(nextInvoiceAllocation(state, '2026-09-01', ['s-a']).sequence, 2)
  state = createCorrectionDraft(state, state.invoices[0].id, 'Empfängerwechsel', documentAt)
  const correction = editable(state.invoices[1])
  correction.recipients = [{ type: 'student', id: 's-a' }]
  correction.guardianIds = []
  state = saveInvoiceDraft(state, correction, true, documentAt)
  assert.equal(state.invoices[1].number, '2026-a-0002')
  assert.equal(state.documentVersions[1].replacesId, original.id)
  assert.deepEqual(state.documentVersions[0], original)
  await roundtrip(state)
})

test('AP5: gemischte Kombination und gleichlautende Student-/Guardian-ID sind eindeutig', async () => {
  let state = adultState()
  const refs: RecipientRef[] = [{ type: 'student', id: 's-adult' }, { type: 'guardian', id: 'g-a' }]
  state = saveInvoiceDraft(state, draft(state, ['s-a', 's-adult'], refs), true, documentAt)
  assert.equal(state.invoices[0].number, '2026-a+c-0001')
  assert.deepEqual(state.invoices[0].snapshot?.recipients?.map((entry) => entry.type), ['student', 'guardian'])
  assert.match(pdfHtml(state, state.invoices[0].id), /Eva Beispiel und Empfaenger A/)
  assert.deepEqual(invoiceFinalizationErrors(state, { ...draft(state, ['s-a', 's-adult'], [{ type: 'student', id: 's-adult' }]) }).some((error) => /jeder Lernende/i.test(error)), true)
  const collision = structuredClone(state)
  collision.students.find((entry) => entry.id === 's-adult')!.id = 'g-a'
  collision.invoices = []; collision.documentVersions = []; collision.invoiceAdministration = []; collision.counters = {}
  validateBackupState(collision)
  const sameIdRefs: RecipientRef[] = [{ type: 'student', id: 'g-a' }, { type: 'guardian', id: 'g-a' }]
  const sameId = saveInvoiceDraft(collision, draft(collision, ['g-a', 's-a'], sameIdRefs), true, documentAt)
  assert.deepEqual(sameId.invoices[0].snapshot?.recipients?.map((entry) => `${entry.type}:${entry.id}`), ['student:g-a', 'guardian:g-a'])
  await roundtrip(state)
})

test('AP5: Kombinationszähler beachtet Legacy-Schlüssel, Reservierungen und eigenständiges ab', () => {
  const state = adultState()
  state.counters['2026:a+c'] = 4
  state.counters['2026:ac'] = 8
  state.voidedInvoiceNumbers.push({ number: '2026-a+c-0008', sequence: 8, year: 2026, invoiceDate: '2026-09-01', deletedAt: documentAt, amount: 7.58, recipient: 'Synthetisch' })
  const combo = nextInvoiceAllocation(state, '2026-09-01', ['s-a', 's-adult'])
  assert.equal(combo.sequence, 9)
  assert.equal(combo.number, '2026-a+c-0009')
  state.students.push({ ...state.students[0], id: 's-ac', billingCode: 'ac' })
  validateBackupState(state)
  assert.equal(nextInvoiceAllocation(state, '2026-09-01', ['s-ac']).number, '2026-ac-0008')
})

test('AP5: Schema 7→8 ist additiv, idempotent, berichtet und archiviert Rohdaten', async () => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  const old = { ...structuredClone(state), schemaVersion: 7 }
  validateLegacyV7Structure(old)
  const raw = JSON.stringify(old)
  const preview = requireSuccess(inspectImport(raw))
  assert.equal(preview.report?.fromSchema, 7)
  assert.equal(preview.report?.toSchema, 8)
  assert.deepEqual(preview.state.documentVersions, state.documentVersions)
  assert.deepEqual(preview.state.invoices[0].snapshot, state.invoices[0].snapshot)
  assert.equal(preview.state.invoices[0].recipients, undefined)
  assert.match(serializeMigrationReport(preview), /riffrechnung-to-v8/)
  const repeat = requireSuccess(inspectImport(serializeBackup(preview.state)))
  assert.equal(repeat.report, null)
  const storage = memoryStorage()
  const session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(raw)
  assert.match(session.exportRecoveryArchive(), /riffrechnung-to-v8/)
  assert.match(session.exportRecoveryArchive(), /schemaVersion/)
  assert.equal(loadState(storage).status, 'ready')
  assert.equal(inspectImport(JSON.stringify({ ...old, recipients: [] })).ok, false)
  assert.equal(inspectImport(JSON.stringify({ ...old, schemaVersion: 9 })).ok, false)
})
