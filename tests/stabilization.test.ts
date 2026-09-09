import test from 'node:test'
import assert from 'node:assert/strict'
import { StorageSession, STORAGE_KEY, LEGACY_STORAGE_KEY, serializeBackup } from '../src/lib/storage'
import { emptyState } from '../src/lib/defaults'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { documentFamily, documentDraft, documentAt, legacyFixture } from './documentFixtures'
import { memoryStorage, sharedLock } from './storageHarness'
import { inspectImport, parseBackup } from '../src/lib/importState'
import { requireSuccess } from '../src/lib/result'

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
