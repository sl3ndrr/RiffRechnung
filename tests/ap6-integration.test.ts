import { expectedTextless } from './documentFixtures'
import { expectedConsolidatedVersions } from './documentFixtures'
import { cleanLegacyContacts, normalizeLegacyRecipients } from '../src/lib/legacyContactsRecipients'
import { cleanRecoveryFields } from '../src/lib/recoveryContactCleanup'
import { stripLegacyTaxFields } from '../src/lib/legacyTaxFields'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AppState } from '../src/types'
import { inspectImport, serializeMigrationReport } from '../src/lib/importState'
import { loadState, serializeBackup, StorageSession, STORAGE_KEY } from '../src/lib/storage'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { createCorrectionDraft } from '../src/lib/documents'
import { validateBackupState } from '../src/lib/validation'
import { validateLegacyV7Structure } from '../src/lib/legacyValidation'
import { requireSuccess } from '../src/lib/result'
import { memoryStorage, sharedLock } from './storageHarness'

// Frozen output of scripts/generate-schema7-gold.mjs against the unmodified
// audited commit. Never reconstruct expected historical values from new defaults.
const fixture = JSON.parse(readFileSync('tests/fixtures/schema7-audit.json', 'utf8')) as {
  sourceCommit: string
  issuedCorrected: AppState
  oldestSeparate: AppState
}

function migrated(original: AppState) {
  const raw = JSON.stringify(original)
  validateLegacyV7Structure(original)
  return { raw, preview: requireSuccess(inspectImport(raw)) }
}

test('AP6: eingefrorene Schema-7-Originale und Verwaltungsdaten bleiben bei 7→8 bis auf benannte Steuerfelder gleich', () => {
  assert.equal(fixture.sourceCommit, '1449d596e6538d32f4c22ef3a0b2f845ef1aed71')
  for (const original of [fixture.issuedCorrected, fixture.oldestSeparate]) {
    const { preview } = migrated(original)
    assert.equal(preview.report?.fromSchema, 7)
    assert.equal(preview.report?.toSchema, 15)
    assert.ok(preview.report?.changes.some((entry) => entry.path === 'schemaVersion'))
    assert.equal(preview.state.schemaVersion, 15)
    const expected = expectedTextless(normalizeLegacyRecipients(cleanLegacyContacts(stripLegacyTaxFields(original).value)))
    expected.documentVersions = expectedConsolidatedVersions(expected.documentVersions)
    const { schemaVersion: _oldSchema, counters: oldCounters, settings: oldSettings, ...oldContent } = expected
    const { schemaVersion: _newSchema, counters: newCounters, settings: newSettings, ...newContent } = preview.state
    void _oldSchema; void _newSchema;
    assert.deepEqual(newContent, oldContent)
    const retainedSettings = { ...oldSettings }
    Reflect.deleteProperty(retainedSettings, 'numberPattern'); Reflect.deleteProperty(retainedSettings, 'resetNumberAnnually')
    assert.deepEqual(newSettings, retainedSettings)
    for (const [key, count] of Object.entries(oldCounters)) assert.ok(newCounters[key] >= count)
    for (const key of ['guardians', 'students', 'invoices', 'documentVersions', 'invoiceAdministration', 'payments', 'voidedInvoiceNumbers', 'audit', 'historicalSnapshotCorrections'] as const) {
      assert.deepEqual(preview.state[key], expected[key], key)
    }
    assert.equal(Reflect.get(preview.state, 'duoGroups'), undefined)
    for (const invoice of preview.state.invoices) {
      assert.ok(Array.isArray(invoice.recipients))
      assert.equal(Reflect.get(invoice, 'invoiceKind'), undefined)
      assert.equal(Reflect.get(invoice, 'taxPresentation'), undefined)
      assert.equal(invoice.snapshot && Reflect.get(invoice.snapshot, 'taxOutput'), undefined)
    }
    const exported = serializeBackup(preview.state)
    const second = inspectImport(exported)
    assert.equal(second.ok, true)
    if (second.ok) {
      assert.equal(second.value.report, null)
      assert.deepEqual(second.value.state, preview.state)
      assert.equal(second.value.rawData, exported)
    }
    validateBackupState(JSON.parse(JSON.stringify(preview.state)))
  }
  assert.equal(fixture.issuedCorrected.payments.length, 1)
  assert.equal(fixture.issuedCorrected.documentVersions.filter((entry) => entry.provenance === 'issued').length, 3)
  assert.equal(fixture.oldestSeparate.documentVersions[0].provenance, 'oldest-available')
})

test('AP6: Vorschau, bereinigtes Archiv, Import und Reload erhalten beide Goldbestände', async () => {
  for (const original of [fixture.issuedCorrected, fixture.oldestSeparate]) {
    const storage = memoryStorage()
    const session = new StorageSession({ storage, lock: sharedLock() })
    const { raw, preview } = migrated(original)
    assert.equal(storage.length, 0, 'Vorschau darf noch nicht schreiben')
    assert.match(serializeMigrationReport(preview), /riffrechnung-to-v15/)
    const next = await session.restore(raw)
    assert.deepEqual(next, preview.state)
    const archive = JSON.parse(session.exportRecoveryArchive()) as { recoveries: Array<{ raw: string }> }
    assert.equal(archive.recoveries.length, 1)
    const recovery = JSON.parse(archive.recoveries[0].raw) as { version: number; sourceRaw: string; report: unknown }
    assert.equal(recovery.version, 1)
    assert.equal(recovery.sourceRaw, cleanRecoveryFields(raw))
    assert.deepEqual(recovery.report, preview.report)
    const loaded = loadState(storage)
    assert.equal(loaded.status, 'ready')
    if (loaded.status === 'ready') assert.deepEqual(loaded.state, next)
    assert.equal(inspectImport(session.export()).ok, true)
    assert.deepEqual(JSON.parse(JSON.stringify(next)), next)
  }
})

test('AP6: abgebrochene oder fehlerhafte Migration überschreibt keinen Bestand', async () => {
  const original = fixture.issuedCorrected
  const { raw } = migrated(original)
  const storage = memoryStorage()
  const first = new StorageSession({ storage, lock: sharedLock() })
  const stale = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(inspectImport(raw).ok, true)
  assert.equal(storage.length, 0)
  const invalid = JSON.stringify({ ...original, invoices: [{ ...original.invoices[0], number: 'Kollision' }, ...original.invoices.slice(1)] })
  await assert.rejects(() => first.restore(invalid))
  assert.equal(storage.getItem(STORAGE_KEY), null)
  storage.fail = STORAGE_KEY
  await assert.rejects(() => first.restore(raw))
  assert.equal(storage.getItem(STORAGE_KEY), null)
  storage.fail = null
  await first.restore(raw)
  const saved = storage.getItem(STORAGE_KEY)
  await assert.rejects(() => stale.restore(raw), /anderen Tab/)
  assert.equal(storage.getItem(STORAGE_KEY), saved)
  const future = JSON.stringify({ ...original, schemaVersion: 99 })
  assert.equal(inspectImport(future).ok, false)
  const futureStorage = memoryStorage()
  futureStorage.setItem(STORAGE_KEY, future)
  const newer = new StorageSession({ storage: futureStorage, lock: sharedLock() })
  assert.equal(newer.initial.status, 'recovery')
  if (newer.initial.status === 'recovery') assert.equal(newer.initial.readOnly, true)
  await assert.rejects(() => newer.restore(raw), /schreibgeschützt/)
  assert.equal(futureStorage.getItem(STORAGE_KEY), future)
})

test('AP6: Datenschutzsperre gilt nach Migration und Import; historische separate-Belege bleiben lesbar', async () => {
  for (const original of [fixture.issuedCorrected, fixture.oldestSeparate]) {
    const storage = memoryStorage()
    const session = new StorageSession({ storage, lock: sharedLock() })
    const migratedState = await session.restore(JSON.stringify(original))
    const historical = migratedState.invoices.find((entry) => entry.recipientStrategy === 'separate')!
    const originalVersion = migratedState.documentVersions.find((entry) => entry.id === historical.versionId)!
    assert.equal(originalVersion.content.recipientStrategy, 'separate')
    assert.equal(originalVersion.provenance, original === fixture.oldestSeparate ? 'oldest-available' : 'issued')
    const newDraft = { ...historical, id: undefined, number: null, sequence: null, status: 'draft' as const, versionId: undefined, snapshot: undefined, correction: undefined }
    assert.throws(() => saveInvoiceDraft(migratedState, newDraft, true), /getrennte|separate|Empfänger/i)
    const correction = createCorrectionDraft(migratedState, historical.id, 'Synthetische Berichtigung')
    assert.deepEqual(correction.documentVersions.find((entry) => entry.id === originalVersion.id), originalVersion)
    assert.deepEqual(loadState(storage).status, 'ready')
  }
})


