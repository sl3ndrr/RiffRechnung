import test from 'node:test'
import assert from 'node:assert/strict'
import { StorageSession, STORAGE_KEY, LEGACY_STORAGE_KEY, PREVIOUS_STORAGE_KEY, serializeBackup } from '../src/lib/storage'
import { emptyState } from '../src/lib/defaults'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { documentFamily, documentDraft, documentAt, legacyFixture, editable } from './documentFixtures'
import { memoryStorage, sharedLock } from './storageHarness'
import { inspectImport, parseBackup } from '../src/lib/importState'
import { requireSuccess } from '../src/lib/result'
import { deleteGuardianState, deleteStudentState, deleteInvoiceDraftState, prepareInvoiceCopy, recordActivity, resetUnissuedState, saveGuardianState, saveSettingsState, saveStudentState } from '../src/lib/commands'
import { activeInvoices, allocatePayment, archiveInvoice, createCorrectionDraft, reassignCorrectionStudent, resolveDocumentConflicts, selectInvoice } from '../src/lib/documents'
import { validateBackupState } from '../src/lib/validation'
import type { AppState } from '../src/types'
import { invoiceTotalCents } from '../src/lib/money'

test('P12: Recovery schützt bekannte Originale auch im bisherigen Speicherschlüssel', async () => {
  const storage = memoryStorage()
  const original = legacyFixture(saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt))
  const raw = JSON.stringify(original, null, 2) + '\r\n'
  storage.setItem(LEGACY_STORAGE_KEY, raw)
  const session = new StorageSession({ storage, lock: sharedLock() })
  await assert.rejects(session.restore(serializeBackup(emptyState())), /Finalisierte|Belegversionen/)
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), raw)
  assert.equal(storage.getItem(STORAGE_KEY), null)
  await session.restore(raw)
  assert.deepEqual(session.state, requireSuccess(inspectImport(raw)).state)
  assert.equal(new StorageSession({ storage, lock: sharedLock() }).initial.status, 'ready')
})

test('P12: beschädigter Hauptschlüssel verdeckt keinen gültigen lokalen Rückfallstand', async () => {
  for (const fallbackKey of [PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    const storage = memoryStorage()
    const issued = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
    const source = new StorageSession({ storage: memoryStorage(), lock: sharedLock() })
    await source.restore(serializeBackup(issued))
    const known = fallbackKey === PREVIOUS_STORAGE_KEY ? source.export() : JSON.stringify(legacyFixture(issued))
    const damaged = '{"unterbrochener synthetischer Hauptstand":'
    storage.setItem(fallbackKey, known)
    storage.setItem(STORAGE_KEY, damaged)
    const session = new StorageSession({ storage, lock: sharedLock() })
    await assert.rejects(session.restore(serializeBackup(emptyState())), /Finalisierte|Belegversionen/)
    assert.equal(storage.getItem(STORAGE_KEY), damaged)
    assert.equal(storage.getItem(fallbackKey), known)
    await session.restore(known)
    assert.equal(storage.getItem(fallbackKey), known)
    assert.deepEqual(session.state, requireSuccess(inspectImport(known)).state)
    if (fallbackKey === PREVIOUS_STORAGE_KEY) {
      assert.equal(session.revision!.datasetId, source.revision!.datasetId)
      assert.equal(session.revision!.revision, source.revision!.revision + 1)
    }
    const archive = JSON.parse(JSON.parse(session.exportRecoveryArchive()).recoveries.at(-1).raw)
    assert.equal(archive.previousRaw, damaged)
    const reloaded = new StorageSession({ storage, lock: sharedLock() })
    assert.equal(reloaded.initial.status, 'ready')
    assert.deepEqual(reloaded.state, session.state)
  }
})

for (const key of [LEGACY_STORAGE_KEY, STORAGE_KEY]) test(`P12: Recovery erhält Reservierungen und Bestandsidentität aus ${key}`, async () => {
  const storage = memoryStorage()
  const legacy = legacyFixture(documentFamily())
  legacy.counters['2026-a'] = 50
  legacy.nextStudentCodeIndex = 50
  legacy.voidedInvoiceNumbers = [{ number: '2026-a-0049', year: 2026, sequence: 49, invoiceDate: '2026-09-01', deletedAt: documentAt, amount: 30, recipient: 'Synthetisch', reason: 'deleted' }]
  const previous = { app: 'riffrechnung', storageVersion: 4, schemaVersion: 3, datasetId: 'known-local-dataset', commitId: 'known-local-commit', revision: 17, savedAt: documentAt, operation: 'edit', ancestors: [], source: null, data: legacy }
  const raw = JSON.stringify(key === STORAGE_KEY ? previous : legacy)
  storage.setItem(key, raw)
  const session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(serializeBackup(documentFamily()))
  assert.equal(session.state.counters['2026-a'], 50)
  assert.equal(session.state.nextStudentCodeIndex, 50)
  assert.deepEqual(session.state.voidedInvoiceNumbers, legacy.voidedInvoiceNumbers)
  if (key === STORAGE_KEY) {
    assert.equal(session.revision!.datasetId, previous.datasetId)
    assert.equal(session.revision!.revision, 18)
    assert.equal(session.revision!.ancestors.at(-1)!.commitId, previous.commitId)
  } else assert.equal(storage.getItem(key), raw)
  const archive = JSON.parse(JSON.parse(session.exportRecoveryArchive()).recoveries.at(-1).raw)
  assert.equal(key === STORAGE_KEY ? archive.previousRaw : archive.legacyRaw, raw)
  const reloaded = new StorageSession({ storage, lock: sharedLock() })
  assert.deepEqual(reloaded.state, parseBackup(session.export()))
  assert.equal(requireSuccess(inspectImport(reloaded.export())).report, null)
})

test('P12: Fachbefehle bleiben nach jedem Übergang speicherbar, exportierbar, importierbar und ladbar', async () => {
  const storage = memoryStorage()
  let session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(serializeBackup(documentFamily()))
  let step = 0
  const apply = async (producer: (state: AppState) => AppState) => {
    const before = session.state
    const input = structuredClone(before)
    const next = producer(input)
    assert.deepEqual(input, before, 'Fachbefehle verändern ihren Eingang nicht')
    validateBackupState(next)
    const saved = await session.change(() => recordActivity(next, { id: `p12-step-${++step}`, at: documentAt, label: `Prüfschritt ${step}`, entityType: 'settings' }))
    assert.deepEqual(parseBackup(serializeBackup(saved)), saved)
    const independent = new StorageSession({ storage: memoryStorage(), lock: sharedLock() })
    await independent.restore(session.export())
    assert.deepEqual(independent.state, saved)
    session = new StorageSession({ storage, lock: sharedLock() })
    assert.equal(session.initial.status, 'ready')
    assert.deepEqual(session.state, saved)
    assert.equal(requireSuccess(inspectImport(session.export())).report, null)
  }
  await apply((s) => requireSuccess(saveSettingsState(s, { ...s.settings, privateRate: 10.10 })))
  await apply((s) => requireSuccess(saveGuardianState(s, { ...s.guardians[0], name: 'Synthetische Familie A' })))
  await apply((s) => requireSuccess(saveStudentState(s, { ...s.students[0], active: false })))
  await apply((s) => requireSuccess(saveStudentState(s, { ...s.students[0], active: true })))
  await apply((s) => saveInvoiceDraft(s, documentDraft(), false, documentAt))
  const originalId = session.state.invoices[0].id
  await apply((s) => saveInvoiceDraft(s, requireSuccess(prepareInvoiceCopy(s, originalId, new Date(2027, 0, 31))), false, documentAt))
  await apply((s) => requireSuccess(deleteInvoiceDraftState(s, s.invoices.at(-1)!.id)))
  await apply((s) => changeInvoiceStatus(s, originalId, 'sent', documentAt))
  const original = session.state.documentVersions[0]
  await apply((s) => changeInvoiceStatus(s, originalId, 'overdue', documentAt))
  await apply((s) => changeInvoiceStatus(s, originalId, 'paid', documentAt, '2026-09-03'))
  await apply((s) => changeInvoiceStatus(s, originalId, 'paid', documentAt, '2026-09-04'))
  await apply((s) => changeInvoiceStatus(s, originalId, 'sent', documentAt))
  await apply((s) => changeInvoiceStatus(s, originalId, 'paid', documentAt, '2026-09-04'))
  assert.equal(session.state.payments.length, 1)
  await apply((s) => archiveInvoice(s, originalId))
  await apply((s) => archiveInvoice(s, originalId, false))
  await apply((s) => requireSuccess(deleteStudentState(s, 's-a')))
  await apply((s) => requireSuccess(deleteGuardianState(s, 'g-a')))
  await apply((s) => createCorrectionDraft(s, originalId, 'Neue Zuordnung', documentAt))
  await apply((s) => requireSuccess(deleteInvoiceDraftState(s, s.invoices.at(-1)!.id)))
  await apply((s) => createCorrectionDraft(s, originalId, 'Neue Zuordnung', documentAt))
  await apply((s) => saveInvoiceDraft(s, { ...reassignCorrectionStudent(editable(s.invoices.at(-1)!), 's-a', 's-b'), guardianIds: ['g-b'] }, true, documentAt))
  const correctedId = session.state.documentVersions.at(-1)!.id
  await apply((s) => allocatePayment(s, s.payments[0].id, correctedId, 'Auf Korrektur übertragen', documentAt))
  await apply((s) => resolveDocumentConflicts(s, correctedId, 'Zuordnung geprüft', documentAt))
  assert.deepEqual(session.state.documentVersions[0], original)
  assert.equal(activeInvoices(session.state).length, 1)
  assert.equal(invoiceTotalCents(selectInvoice(session.state, session.state.invoices.at(-1)!)), 758)
  assert.equal(session.state.payments.length, 1)
  assert.notEqual(session.state.invoices[0].number, session.state.invoices[1].number)
  assert.equal(resetUnissuedState(session.state).ok, false)
  assert.equal(deleteInvoiceDraftState(session.state, originalId).ok, false)
  const reset = requireSuccess(resetUnissuedState(saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)))
  validateBackupState(reset)
  assert.deepEqual(parseBackup(serializeBackup(reset)), reset)
  assert.equal(reset.invoices.length, 0)
  assert.throws(() => resolveDocumentConflicts(session.state, correctedId, 'Ungültiges Datum', 'kein Datum'), /ungültig/)
})

for (const failure of ['write', STORAGE_KEY]) test(`P12: unterbrochene Migration (${failure}) bleibt nach Neustart sicher fortsetzbar`, async () => {
  const storage = memoryStorage()
  const raw = JSON.stringify(legacyFixture(saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt))) + '\r\n'
  storage.setItem(LEGACY_STORAGE_KEY, raw)
  const preview = requireSuccess(inspectImport(raw))
  storage.fail = failure
  await assert.rejects(new StorageSession({ storage, lock: sharedLock() }).restore(raw), /Speicherplatz/)
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), raw)
  assert.equal(storage.getItem(STORAGE_KEY), null)
  storage.fail = null
  const restarted = new StorageSession({ storage, lock: sharedLock() })
  await restarted.restore(raw)
  assert.deepEqual(restarted.state, preview.state)
  const committedRaw = storage.getItem(STORAGE_KEY)
  const archiveCount = JSON.parse(restarted.exportRecoveryArchive()).recoveries.length
  for (let i = 0; i < 3; i++) {
    const reloaded = new StorageSession({ storage, lock: sharedLock() })
    assert.equal(reloaded.initial.status, 'ready')
    assert.deepEqual(reloaded.state, preview.state)
    assert.equal(requireSuccess(inspectImport(reloaded.export())).report, null)
    assert.equal(storage.getItem(STORAGE_KEY), committedRaw)
    assert.equal(JSON.parse(reloaded.exportRecoveryArchive()).recoveries.length, archiveCount)
  }
})
