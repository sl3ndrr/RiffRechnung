import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { createCorrectionDraft, selectInvoice } from '../src/lib/documents'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { inspectImport, parseBackup, serializeMigrationReport } from '../src/lib/importState'
import { requireSuccess } from '../src/lib/result'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { StorageSession, STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_GUARD_KEY, PREVIOUS_STORAGE_KEY, serializeBackup } from '../src/lib/storage'
import { validateBackupState } from '../src/lib/validation'
import { documentAt, documentDraft, documentFamily, expectedTextless, legacyVersionedFixture } from './documentFixtures'
import { memoryStorage, sharedLock } from './storageHarness'

const removed = 'P09-REMOVED-SECRET'
const note = '  § 19 UStG: vorhandener eigener Hinweis\nNicht zusammenführen.  '
function oldTextStock() {
  let state = saveInvoiceDraft(documentFamily(), { ...documentDraft(), freeText: note, recipients: [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }] }, true, documentAt)
  state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-05')
  state = createCorrectionDraft(state, state.invoices[0].id, 'Vorhandene Beziehung', documentAt)
  const old = legacyVersionedFixture(state, 14)
  old.settings.defaultLegalText = removed
  for (const invoice of old.invoices) {
    invoice.introText = removed; invoice.legalText = removed
    if (invoice.snapshot) invoice.snapshot.legalText = removed
    if (invoice.draftPrintSnapshot) invoice.draftPrintSnapshot.legalText = removed
  }
  const version = old.documentVersions[0]
  version.content.introText = removed; version.outputLegalText = removed; version.outputSnapshot.legalText = removed
  const event = { id: 'p09-snapshot-history', at: documentAt, label: 'Vorhandener Snapshot-Nachweis', entityType: 'invoice', entityId: old.invoices[0].id,
    snapshotCorrection: { oldValue: structuredClone(version.outputSnapshot), newValue: structuredClone(version.outputSnapshot) } }
  old.audit.push(event); old.historicalSnapshotCorrections.push(event); version.snapshotHistory.push(event)
  version.conflicts = [
    { path: 'legalText', message: removed, values: [JSON.stringify(removed)] },
    { path: 'outputSnapshot.legalText', message: removed, values: [JSON.stringify(removed)] },
    { path: 'snapshot', message: 'Vorhandener Snapshot-Konflikt', values: [JSON.stringify(version.outputSnapshot)] },
  ]
  return old
}

test('P09: Schema 14 entfernt alle Textkopien, bewahrt jede andere Beleginformation und die Quelle', () => {
  const old = oldTextStock(), raw = JSON.stringify(old), preview = requireSuccess(inspectImport(raw))
  const expected = expectedTextless(old)
  expected.schemaVersion = 15
  expected.documentVersions[0].conflicts = [expected.documentVersions[0].conflicts[2]]
  expected.documentVersions[0].conflicts[0].values = [JSON.stringify(expectedTextless(old.documentVersions[0].outputSnapshot))]
  assert.deepEqual(preview.state, expected)
  assert.equal(JSON.stringify(old), raw)
  assert.equal(preview.state.invoices[0].freeText, note)
  assert.doesNotMatch(serializeMigrationReport(preview), /P09-REMOVED-SECRET/)
  assert.doesNotMatch(serializeBackup(preview.state), /introText|legalText|defaultLegalText|outputLegalText/)
  assert.deepEqual(parseBackup(serializeBackup(preview.state)), preview.state)
  assertOriginalsPreserved(old, preview.state)
  for (const mutate of [
    (s: typeof preview.state) => { s.invoices[0].number = '2026-9999-a' },
    (s: typeof preview.state) => { s.invoices[0].snapshot!.iban = 'DE89370400440532013000' },
    (s: typeof preview.state) => { s.documentVersions[0].amounts.totalCents++ },
    (s: typeof preview.state) => { s.payments[0].amountCents++ },
    (s: typeof preview.state) => { s.invoices[0].freeText = 'verändert' },
  ]) {
    const changed = structuredClone(preview.state); mutate(changed)
    assert.throws(() => assertOriginalsPreserved(old, changed))
  }
  const selected = selectInvoice(preview.state, preview.state.invoices[0])
  const markup = renderToStaticMarkup(createElement(InvoicePrint, { invoice: selected, guardians: [], students: [], settings: preview.state.settings, includeGiroCode: false }))
  assert.match(markup, /Hiermit stelle ich die folgenden Leistungen in Rechnung\./)
  assert.equal((markup.match(/Privatrechnung/g) ?? []).length, 1)
  assert.match(markup, /§ 19 UStG: vorhandener eigener Hinweis/)
  assert.doesNotMatch(markup, /P09-REMOVED-SECRET/)
})

test('P09: aktuelle Schemas und neue Exporte weisen entfernte Textfelder zurück', () => {
  const state = requireSuccess(inspectImport(JSON.stringify(oldTextStock()))).state
  for (const mutate of [
    (s: typeof state) => Reflect.set(s.settings, 'defaultLegalText', ''),
    (s: typeof state) => Reflect.set(s.invoices[0], 'introText', ''),
    (s: typeof state) => Reflect.set(s.invoices[0], 'legalText', ''),
    (s: typeof state) => Reflect.set(s.invoices[0].snapshot!, 'legalText', ''),
    (s: typeof state) => Reflect.set(s.documentVersions[0], 'outputLegalText', ''),
    (s: typeof state) => { s.documentVersions[0].conflicts.push({ path: 'snapshot.legalText', message: 'Alttext', values: ['"Alttext"'] }) },
  ]) {
    const changed = structuredClone(state); mutate(changed)
    assert.throws(() => validateBackupState(changed))
    assert.throws(() => serializeBackup(changed))
  }
  const invalid = oldTextStock(); invalid.invoices[0].items[0].unitPrice = -1
  assert.equal(inspectImport(JSON.stringify(invalid)).ok, false)
})

for (const failure of ['main', 'previous', 'archive', 'unreadable'] as const) test(`P09: ${failure}-Fehler schützt alle Ausgangskopien; erfolgreicher Umstieg entfernt die Texte dauerhaft`, async () => {
  const storage = memoryStorage(), lock = sharedLock(), raw = JSON.stringify(oldTextStock())
  storage.setItem(STORAGE_KEY, raw); storage.setItem(PREVIOUS_STORAGE_KEY, raw); storage.setItem(LEGACY_STORAGE_KEY, raw)
  storage.setItem(LEGACY_GUARD_KEY, JSON.stringify(raw))
  const archiveKey = `${STORAGE_KEY}-recovery-old`
  storage.setItem(archiveKey, failure === 'unreadable' ? '{"introText":"P09-REMOVED-SECRET"' : JSON.stringify({ previousRaw: raw, sourceRaw: raw, report: { changes: [{ path: 'invoices[0].legalText', before: removed, after: removed }, { path: 'invoices', before: JSON.parse(raw).invoices, after: JSON.parse(raw).invoices }] } }))
  const before = new Map(storage.entries), session = new StorageSession({ storage, lock })
  if (failure !== 'unreadable') storage.fail = failure === 'main' ? STORAGE_KEY : failure === 'previous' ? PREVIOUS_STORAGE_KEY : archiveKey
  await assert.rejects(session.restore(raw))
  assert.deepEqual(storage.entries, before)
  assert.equal(session.initial.status, 'recovery')
  storage.fail = null
  if (failure === 'unreadable') storage.setItem(archiveKey, JSON.stringify({ sourceRaw: raw }))
  await session.restore(raw)
  for (const value of storage.entries.values()) assert.doesNotMatch(value, /P09-REMOVED-SECRET|introText|legalText|defaultLegalText|outputLegalText/)
  assert.doesNotMatch(session.exportRecoveryArchive(), /P09-REMOVED-SECRET/)
  assert.equal(new StorageSession({ storage, lock }).initial.status, 'ready')
  assert.deepEqual(parseBackup(session.export()), session.state)
})
