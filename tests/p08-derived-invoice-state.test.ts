import test from 'node:test'
import assert from 'node:assert/strict'
import { canonical } from '../src/lib/canonical'
import { allocatePayment, createCorrectionDraft, openCents, selectInvoice } from '../src/lib/documents'
import { saveInvoiceDraft, changeInvoiceStatus } from '../src/lib/invoiceActions'
import { inspectImport, parseBackup } from '../src/lib/importState'
import { effectiveStatus } from '../src/lib/utils'
import { nextInvoiceAllocation } from '../src/lib/utils'
import { validateBackupState } from '../src/lib/validation'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { serializeBackup, StorageSession, STORAGE_KEY } from '../src/lib/storage'
import { requireSuccess } from '../src/lib/result'
import { documentAt, documentDraft, documentFamily, editable, legacyVersionedFixture } from './documentFixtures'
import { memoryStorage, sharedLock } from './storageHarness'

const issued = () => saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
const reload = (state: ReturnType<typeof issued>) => parseBackup(serializeBackup(state))
const status = (state: ReturnType<typeof issued>, id = state.invoices[0].id, at = '2026-09-16T12:00:00.000Z') =>
  effectiveStatus(selectInvoice(state, state.invoices.find((invoice) => invoice.id === id)!), new Date(at))

function assertDerived(state: ReturnType<typeof issued>) {
  for (const invoice of state.invoices) {
    assert.equal(invoice.stateModel, 'derived-v1')
    for (const field of ['year', 'period', 'paidAt', 'openAmountCents', 'claimState']) assert.equal(Object.hasOwn(invoice, field), false, field)
    assert.ok(invoice.status === 'draft' || invoice.status === 'sent')
  }
  for (const version of state.documentVersions) assert.equal(Object.hasOwn(version.content, 'year'), false)
}

test('P08: Jahr und Zeitraum entstehen aus Kalenderdaten; einzig die Belegausgabe friert den Zeitraum ein', () => {
  let state = saveInvoiceDraft(documentFamily(), { ...documentDraft(), period: 'Veralteter Arbeitswert' }, false, documentAt)
  assertDerived(state)
  let projected = selectInvoice(state, state.invoices[0])
  assert.equal(projected.year, 2026)
  assert.equal(projected.period, 'August 2026')
  const draft = editable(state.invoices[0])
  draft.invoiceDate = '2027-01-01'; draft.dueDate = '2027-01-15'; draft.items[0].serviceDate = '2026-12-31'
  state = saveInvoiceDraft(state, draft, true, documentAt)
  assertDerived(state)
  projected = selectInvoice(state, state.invoices[0])
  assert.equal(projected.year, 2027)
  assert.equal(projected.period, 'Dezember 2026')
  assert.equal(state.documentVersions[0].outputPeriod, 'Dezember 2026')
  assert.equal(state.invoices[0].number, '2027-0001-a')
  assert.deepEqual(reload(state), state)
  assert.throws(() => changeInvoiceStatus(state, state.invoices[0].id, 'overdue', documentAt), /Überfälligkeit wird/)
  for (const [field, value] of [['year', 2027], ['period', 'Dezember 2026'], ['paidAt', '2027-01-03'], ['status', 'overdue'], ['status', 'paid'], ['openAmountCents', 0]] as const) {
    const corrupt = structuredClone(state); Reflect.set(corrupt.invoices[0], field, value)
    assert.equal(inspectImport(JSON.stringify(corrupt)).ok, false, field)
  }
})

test('P08: Überfälligkeit folgt lokalen Kalendertagen, aktivem Anspruch und Centrest, auch nach Reload', () => {
  const previous = process.env.TZ
  try {
    for (const zone of ['Europe/Berlin', 'UTC']) {
      process.env.TZ = zone
      let state = issued()
      assert.equal(status(state, undefined, '2026-09-15T12:00:00.000Z'), 'sent')
      assert.equal(status(state, undefined, '2026-09-15T22:30:00Z'), zone === 'Europe/Berlin' ? 'overdue' : 'sent')
      assert.equal(status(state), 'overdue')
      const zero = documentDraft(); zero.items[0].unitPrice = 0
      const zeroState = saveInvoiceDraft(documentFamily(), zero, true, documentAt)
      assert.equal(openCents(zeroState, zeroState.invoices[0]), 0)
      assert.notEqual(status(zeroState), 'overdue')
      state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-14')
      assert.equal(status(reload(state)), 'paid')
      state = changeInvoiceStatus(state, state.invoices[0].id, 'sent', documentAt)
      assert.equal(status(reload(state)), 'overdue')
      assertDerived(state)
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})

test('P08: bestätigter Zahlungstag ist die einzige aktuelle Quelle; Nachpflege und Rücknahme schreiben keinen Rechnungswert', () => {
  let state = issued(); const id = state.invoices[0].id
  assert.throws(() => changeInvoiceStatus(state, id, 'paid', '2027-01-02T12:00:00.000Z'), /tatsächlichen Zahlungstag/)
  assert.throws(() => changeInvoiceStatus(state, id, 'paid', documentAt, '2025-02-29'), /gültigen tatsächlichen Zahlungstag/)
  const original = canonical(state.documentVersions)
  state = changeInvoiceStatus(state, id, 'paid', '2027-01-02T12:00:00.000Z', '2026-12-31')
  assertDerived(state)
  assert.equal(selectInvoice(reload(state), state.invoices[0]).paidAt, '2026-12-31')
  state = changeInvoiceStatus(state, id, 'paid', '2027-01-04T12:00:00.000Z', '2027-01-03')
  assert.equal(selectInvoice(reload(state), state.invoices[0]).paidAt, '2027-01-03')
  assert.equal(state.payments[0].recordedAt, '2027-01-02T12:00:00.000Z')
  const paid = state
  state = changeInvoiceStatus(state, id, 'sent', documentAt)
  assert.equal(selectInvoice(reload(state), state.invoices[0]).paidAt, undefined)
  assert.equal(state.payments[0].paidAt, '2027-01-03')
  assertOriginalsPreserved(paid, state)
  state = changeInvoiceStatus(state, id, 'paid', documentAt, '2027-01-03')
  assert.equal(state.payments.length, 1)
  assert.equal(status(state), 'paid')
  assert.equal(canonical(state.documentVersions), original)
})

test('P08: Schema 13→14 bewahrt Originale und Rohstatus; unbekannter historischer Zahlungstag bleibt unbekannt', async () => {
  let paid = issued(); paid = changeInvoiceStatus(paid, paid.invoices[0].id, 'paid', documentAt, '2026-09-05')
  const old = legacyVersionedFixture(paid, 13)
  old.payments[0].legacyPaymentDay = old.payments[0].paidAt
  old.payments[0].paidAt = null; old.payments[0].paymentDayStatus = 'unknown'
  // The old raw calendar day is valid evidence, but never a confirmed bank day.
  const raw = JSON.stringify(old), preview = requireSuccess(inspectImport(raw))
  assert.equal(preview.report?.fromSchema, 13); assert.equal(preview.report?.toSchema, 15)
  assert.equal(JSON.stringify(old), raw)
  assert.deepEqual({ ...preview.state, schemaVersion: 13 }, old)
  const state = preview.state
  assert.equal(status(state), 'paid')
  assert.equal(selectInvoice(state, state.invoices[0]).paidAt, undefined)
  const before = structuredClone(state)
  const changed = changeInvoiceStatus(state, state.invoices[0].id, 'paid', '2026-10-01T12:00:00.000Z', '2026-09-04')
  assertOriginalsPreserved(before, changed)
  assert.equal(changed.invoices[0].paidAt, old.invoices[0].paidAt)
  assert.equal(selectInvoice(reload(changed), changed.invoices[0]).paidAt, '2026-09-04')
  const released = changeInvoiceStatus(changed, changed.invoices[0].id, 'sent', documentAt)
  assert.equal(released.invoices[0].status, 'paid', 'historischer Rohstatus bleibt Nachweis')
  assert.equal(status(reload(released)), 'overdue')
  assert.equal(selectInvoice(released, released.invoices[0]).paidAt, undefined)
  const storage = memoryStorage(); storage.setItem(STORAGE_KEY, raw)
  const session = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(session.initial.status, 'recovery')
  assert.equal(storage.getItem(STORAGE_KEY), raw)
  await session.restore(raw)
  assert.equal(new StorageSession({ storage, lock: sharedLock() }).initial.status, 'ready')
  assert.deepEqual(parseBackup(session.export()), state)
  const invalid = structuredClone(old); invalid.payments = []
  assert.equal(inspectImport(JSON.stringify(invalid)).ok, false, 'Schema 13 wird vor Migration streng geprüft')
  assert.equal(inspectImport(JSON.stringify({ ...old, schemaVersion: 16 })).ok, false)
})

test('P08: historisch manuelles Überfällig ist Nachweis; aktuelle Anzeige folgt der tatsächlichen Fälligkeit', () => {
  const old = legacyVersionedFixture(issued(), 13)
  old.invoices[0].status = 'overdue'; old.invoiceAdministration[0].events[0].status = 'overdue'
  const state = parseBackup(JSON.stringify(old))
  assert.equal(state.invoices[0].status, 'overdue')
  assert.equal(status(state, undefined, '2026-09-15T12:00:00.000Z'), 'sent')
  assert.equal(status(state), 'overdue')
})

test('P08: Teilzahlungen, Überzahlung, Korrekturzuordnung und unbekannte Tage werden ohne Statuscache projiziert', () => {
  let state = issued(); const first = state.invoices[0]
  state.payments = [
    { id: 'partial-a', sourceVersionId: first.versionId!, amountCents: 300, paidAt: '2026-09-04', paymentDayStatus: 'confirmed', recordedAt: documentAt, provenance: 'recorded', allocations: [{ versionId: first.versionId!, at: documentAt, reason: 'Bestehende Teilzahlung' }] },
    { id: 'partial-b', sourceVersionId: first.versionId!, amountCents: 458, paidAt: null, paymentDayStatus: 'unknown', recordedAt: documentAt, provenance: 'legacy-status', allocations: [{ versionId: null, at: documentAt, reason: 'Bestehende Zuordnung zur Klärung' }] },
  ]
  validateBackupState(state)
  assert.equal(openCents(state, first), 458)
  assert.equal(status(reload(state)), 'overdue')
  assert.throws(() => changeInvoiceStatus(state, first.id, 'paid', documentAt, '2026-09-04'), /bereits Zahlungen/)
  state = allocatePayment(state, 'partial-b', first.versionId!, 'Restzahlung zuordnen', documentAt)
  assert.equal(status(reload(state)), 'paid')
  assert.equal(selectInvoice(state, first).paidAt, undefined)
  assert.throws(() => changeInvoiceStatus(state, first.id, 'paid', documentAt, '2026-09-04'), /einzelne Vollzahlung/)
  const original = structuredClone(state), version = canonical(state.documentVersions[0]), counters = canonical(state.counters)
  state = createCorrectionDraft(state, first.id, 'Betrag berichtigen', documentAt)
  const corrected = editable(state.invoices.at(-1)!); corrected.items[0].unitPrice = 20
  state = saveInvoiceDraft(state, corrected, true, documentAt)
  const last = state.invoices.at(-1)!
  assert.equal(status(state, first.id), 'paid')
  assert.equal(openCents(state, first), 0)
  for (const payment of state.payments) state = allocatePayment(state, payment.id, last.versionId!, 'Auf Korrektur anrechnen', documentAt)
  assert.equal(status(reload(state), first.id), 'sent', 'ersetzter Originalanspruch wird nicht überfällig')
  assert.equal(status(reload(state), last.id), 'overdue')
  assert.equal(openCents(state, last), 742)
  assert.equal(state.payments.length, 2)
  assert.equal(canonical(state.documentVersions[0]), version)
  assertOriginalsPreserved(original, state)
  assert.notEqual(canonical(state.counters), counters, 'nur die neue Korrektur reserviert eine Nummer')
  assert.equal(nextInvoiceAllocation(state, first.invoiceDate, first.studentIds).sequence, 3)
  // Unchanged old allocations can overpay a lower correction without copying money.
  state = createCorrectionDraft(state, last.id, 'Niedrigerer Betrag', documentAt)
  const lower = editable(state.invoices.at(-1)!); lower.items[0].unitPrice = 5
  state = saveInvoiceDraft(state, lower, true, documentAt)
  const low = state.invoices.at(-1)!
  for (const payment of state.payments) state = allocatePayment(state, payment.id, low.versionId!, 'Bestehende Überzahlung erhalten', documentAt)
  assert.equal(status(reload(state), low.id), 'paid')
  assert.equal(openCents(state, low), 0)
  assert.equal(selectInvoice(state, low).paidAt, undefined)
  assertDerived(state)
})

