import test from 'node:test'
import assert from 'node:assert/strict'
import { documentAt, documentDraft, documentFamily, editable, legacyVersionedFixture } from './documentFixtures'
import { inspectImport, parseBackup, serializeMigrationReport } from '../src/lib/importState'
import { saveGuardianState, saveStudentState } from '../src/lib/commands'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { requireSuccess } from '../src/lib/result'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { validateBackupState } from '../src/lib/validation'
import { StorageSession, STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_GUARD_KEY, loadState, serializeBackup } from '../src/lib/storage'
import { memoryStorage, sharedLock } from './storageHarness'
import { canonical } from '../src/lib/envelope'
import type { AppState, RecipientRef } from '../src/types'

const both: RecipientRef[] = [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }]
function issued() { return saveInvoiceDraft(documentFamily(), { ...documentDraft(), recipients: both }, true, documentAt) }
function oldStock() {
  const old = legacyVersionedFixture(issued(), 10)
  old.guardians[0].name = 'Familie Müller, Dr. Anna'
  old.guardians[0].firstName = 'Andere'
  old.guardians[0].lastName = 'Darstellung'
  old.guardians[0].iban = 'P05-PAYER-SECRET'
  old.guardians[0].paymentNote = 'P05-PAYMENT-SECRET'
  old.students[0].note = 'P05-PERSON-SECRET'
  return old
}
function cleanPeople(state: AppState) {
  for (const guardian of state.guardians) for (const field of ['iban', 'paymentNote', 'firstName', 'lastName']) assert.equal(Object.hasOwn(guardian, field), false)
  for (const student of state.students) assert.equal(Object.hasOwn(student, 'note'), false)
}
function onlyRecipients(state: AppState) {
  const inspect = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(inspect); return }
    const obj = value as Record<string, unknown>
    assert.equal(Object.hasOwn(obj, 'guardianIds'), false)
    assert.equal(Object.hasOwn(obj, 'guardians'), false)
    Object.values(obj).forEach(inspect)
  }
  inspect(state.invoices); inspect(state.documentVersions); inspect(state.historicalSnapshotCorrections); inspect(state.audit)
}

test('P05: Schema 10→11 entfernt ausschließlich Kontaktfelder und bewahrt den sichtbaren Namen und eingefrorene Konten', () => {
  const old = oldStock(), raw = JSON.stringify(old), frozen = structuredClone(old.invoices[0].snapshot)
  const preview = requireSuccess(inspectImport(raw))
  assert.equal(preview.state.schemaVersion, 11)
  assert.equal(preview.report?.fromSchema, 10)
  assert.equal(preview.report?.toSchema, 11)
  assert.equal(preview.state.guardians[0].name, 'Familie Müller, Dr. Anna')
  assert.equal(JSON.stringify(old), raw, 'Die Vorschau verändert keinen Eingang')
  assert.deepEqual(preview.state.students[0].guardianIds, ['g-a', 'g-b'])
  assert.deepEqual(preview.state.invoices[0].recipients, both)
  assert.deepEqual(preview.state.invoices[0].snapshot!.recipients.map((person) => ({ id: person.id, name: person.name, email: person.email, street: person.street, postalCode: person.postalCode, city: person.city })), frozen.guardians)
  assert.equal(preview.state.settings.iban, old.settings.iban)
  assert.equal(preview.state.invoices[0].snapshot!.iban, frozen.iban)
  assert.equal(preview.state.invoices[0].freeText, 'Originaler Hinweis')
  cleanPeople(preview.state); onlyRecipients(preview.state)
  assert.doesNotMatch(serializeMigrationReport(preview), /P05-(?:PAYER|PAYMENT|PERSON)-SECRET/)
  const exported = serializeBackup(preview.state)
  assert.equal(requireSuccess(inspectImport(exported)).report, null)
  assert.deepEqual(parseBackup(exported), preview.state)
})

test('P05: fehlender Name übernimmt vorhandene Teile; Namen werden weder zerlegt noch synchronisiert', () => {
  const old = oldStock()
  old.guardians[0].name = '  '
  old.guardians[0].firstName = '  Anna Maria  '
  old.guardians[0].lastName = 'von Weber'
  assert.equal(requireSuccess(inspectImport(JSON.stringify(old))).state.guardians[0].name, 'Anna Maria von Weber')
  delete old.guardians[0].name
  assert.equal(requireSuccess(inspectImport(JSON.stringify(old))).state.guardians[0].name, 'Anna Maria von Weber')
  old.guardians[0].name = null
  assert.equal(requireSuccess(inspectImport(JSON.stringify(old))).state.guardians[0].name, 'Anna Maria von Weber')
  delete old.guardians[0].lastName
  assert.equal(requireSuccess(inspectImport(JSON.stringify(old))).state.guardians[0].name, 'Anna Maria')
  old.guardians[0].firstName = ''
  assert.equal(inspectImport(JSON.stringify(old)).ok, false)
  const state = documentFamily()
  const longLegacyName = 'A'.repeat(300)
  const legacyNameState = { ...state, guardians: [{ ...state.guardians[0], name: longLegacyName }, state.guardians[1]] }
  assert.equal(requireSuccess(saveGuardianState(legacyNameState, { ...legacyNameState.guardians[0], email: 'neu@example.org' })).guardians[0].name, longLegacyName)
  const renamed = requireSuccess(saveGuardianState(state, { ...state.guardians[0], name: 'Madonna' }))
  assert.equal(renamed.guardians[0].name, 'Madonna')
  cleanPeople(renamed)
  assert.equal(saveGuardianState(state, { ...state.guardians[0], name: '' }).ok, false)
  assert.equal(saveGuardianState(state, { ...state.guardians[0], name: 'Anna\nMüller' }).ok, false)
})

test('P05: erfolgreiche Übernahme bereinigt Haupt-/Vorgänger-/Legacy- und Archivkopien; Reload und Exporte bleiben sauber', async () => {
  const old = oldStock(), raw = JSON.stringify(old), storage = memoryStorage()
  storage.setItem(STORAGE_KEY, raw)
  storage.setItem(PREVIOUS_STORAGE_KEY, raw)
  storage.setItem(LEGACY_STORAGE_KEY, raw)
  storage.setItem(`${STORAGE_KEY}-recovery-old`, JSON.stringify({ version: 1, sourceRaw: raw, report: { changes: [{ path: 'guardians[0].paymentNote', before: 'P05-PAYMENT-SECRET', after: null }, { path: 'students[0]', before: old.students[0], after: old.students[0] }] } }))
  const session = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(session.initial.status, 'recovery')
  await session.restore(raw)
  for (const value of storage.entries.values()) assert.doesNotMatch(value, /P05-(?:PAYER|PAYMENT|PERSON)-SECRET/)
  assert.doesNotMatch(session.export(), /"(?:paymentNote|note|firstName|lastName)"/)
  assert.doesNotMatch(session.exportRecoveryArchive(), /P05-(?:PAYER|PAYMENT|PERSON)-SECRET/)
  assert.equal(storage.getItem(LEGACY_GUARD_KEY), JSON.stringify(storage.getItem(LEGACY_STORAGE_KEY)))
  assert.equal(loadState(storage).status, 'ready')
  assert.deepEqual(new StorageSession({ storage, lock: sharedLock() }).state, session.state)
  cleanPeople(session.state); onlyRecipients(session.state)
  await session.restore(session.export())
  assert.equal(loadState(storage).status, 'ready')
})

for (const failure of ['main', 'previous', 'archive', 'unreadable', 'invalid'] as const) test(`P05: fehlgeschlagener Umstieg (${failure}) bewahrt sämtliche Ausgangskopien`, async () => {
  const raw = JSON.stringify(oldStock()), storage = memoryStorage()
  storage.setItem(STORAGE_KEY, raw); storage.setItem(PREVIOUS_STORAGE_KEY, raw)
  storage.setItem(LEGACY_STORAGE_KEY, raw)
  const key = `${STORAGE_KEY}-recovery-broken`
  if (failure === 'unreadable') storage.setItem(key, '{"guardians":[{"payment\\u004eote":"P05-PAYMENT-SECRET"')
  const before = new Map(storage.entries)
  const session = new StorageSession({ storage, lock: sharedLock() })
  if (failure === 'main') storage.fail = STORAGE_KEY
  if (failure === 'previous') storage.fail = PREVIOUS_STORAGE_KEY
  const setItem = storage.setItem.bind(storage)
  if (failure === 'archive') storage.setItem = (key, value) => { if (key.startsWith(`${STORAGE_KEY}-recovery-`)) throw new DOMException('Speicherplatz erschöpft', 'QuotaExceededError'); setItem(key, value) }
  const source = failure === 'invalid' ? raw.replace('"quantity":0.75', '"quantity":-1') : raw
  await assert.rejects(session.restore(source))
  assert.deepEqual(storage.entries, before)
  storage.fail = null
  storage.setItem = setItem
  if (failure === 'unreadable') storage.removeItem(key)
  await new StorageSession({ storage, lock: sharedLock() }).restore(raw)
  assert.equal(loadState(storage).status, 'ready')
})

test('P05: beide Anschriften frieren ein, optionale Anschriften und Selbstzahler funktionieren; finale Originale bleiben geschützt', () => {
  let state = issued(), original = structuredClone(state)
  assert.deepEqual(state.invoices[0].snapshot!.recipients.map((entry) => entry.street), ['Testweg 2', 'Testweg 3'])
  state = requireSuccess(saveGuardianState(state, { ...state.guardians[0], name: 'Später geändert', address: { street: '', postalCode: '', city: '' } }))
  assert.deepEqual(state.documentVersions, original.documentVersions)
  assert.deepEqual(state.invoices, original.invoices)
  assertOriginalsPreserved(original, state)
  for (const mutate of [
    (s: AppState) => { s.invoices[0].recipients.pop() },
    (s: AppState) => { s.invoices[0].snapshot!.recipients[0].street = 'Anders' },
    (s: AppState) => { s.documentVersions[0].outputSnapshot.recipients[0].name = 'Anders' },
    (s: AppState) => { s.documentVersions[0].content.freeText = 'Anders' },
  ]) { const changed = structuredClone(state); mutate(changed); assert.throws(() => assertOriginalsPreserved(state, changed)) }
  const missing = documentFamily(); missing.guardians.forEach((guardian) => { guardian.address = { street: '', postalCode: '', city: '' } })
  assert.equal(saveInvoiceDraft(missing, { ...documentDraft(), recipients: both }, true, documentAt).documentVersions.length, 1)
  let adult = documentFamily()
  adult = requireSuccess(saveStudentState(adult, { ...adult.students[0], selfPayer: true, guardianIds: [] }))
  adult = saveInvoiceDraft(adult, { ...documentDraft(), recipients: [{ type: 'student', id: 's-a' }] }, false, documentAt)
  adult = saveInvoiceDraft(adult, editable(adult.invoices[0]), true, documentAt)
  assert.deepEqual(adult.invoices[0].snapshot!.recipients.map((entry) => entry.type), ['student'])
})

test('P05: typisierte Empfänger dürfen keine fremden Lernendendaten erhalten', () => {
  const state = documentFamily(), before = canonical(state)
  state.students[1].guardianIds = ['g-b']
  const draft = { ...documentDraft(), recipients: both, studentIds: ['s-a', 's-b'], items: documentDraft().items }
  for (const finalize of [false, true]) assert.throws(() => saveInvoiceDraft(state, draft, finalize, documentAt), /jedem ausgewählten Lernenden/)
  assert.notEqual(canonical(state), before)
  const retained = canonical(state)
  assert.throws(() => saveInvoiceDraft(state, draft, true, documentAt))
  assert.equal(canonical(state), retained)
})

test('P05: widersprüchliche eingefrorene Empfängerwerte bleiben im Klärungspfad; keine Rekonstruktion aus Stammdaten', () => {
  const old = oldStock()
  old.invoices[0].snapshot.guardians[1].street = 'Abweichender historischer Weg'
  old.documentVersions[0].content.snapshot = structuredClone(old.invoices[0].snapshot)
  old.documentVersions[0].outputSnapshot = structuredClone(old.invoices[0].snapshot)
  old.guardians[1].address.street = 'Heute anders'
  const state = requireSuccess(inspectImport(JSON.stringify(old))).state
  assert.equal(state.documentVersions[0].outputSnapshot.recipients[1].street, 'Testweg 3')
  assert.ok(state.documentVersions[0].conflicts.some((conflict) => conflict.path.startsWith('legacyRecipients.') && conflict.values.some((value) => value.includes('Abweichender historischer Weg'))))
  const again = parseBackup(serializeBackup(state))
  assert.deepEqual(again, state)
  const malformed = oldStock(); malformed.invoices[0].guardianIds = ['g-a']
  assert.equal(inspectImport(JSON.stringify(malformed)).ok, false, 'Mehrdeutige Zuordnung wird nicht erraten')
})

test('P05: aktuelle Formate und normale Writes akzeptieren keine entfernten Felder oder Rechnungsprojektionen', () => {
  const state = issued()
  for (const mutate of [
    (s: AppState) => Reflect.set(s.guardians[0], 'iban', 'P05-PAYER-SECRET'),
    (s: AppState) => Reflect.set(s.guardians[0], 'paymentNote', ''),
    (s: AppState) => Reflect.set(s.students[0], 'note', ''),
    (s: AppState) => Reflect.set(s.guardians[0], 'firstName', 'Anna'),
    (s: AppState) => Reflect.set(s.invoices[0], 'guardianIds', ['g-a']),
    (s: AppState) => Reflect.set(s.invoices[0].snapshot!, 'guardians', []),
  ]) { const copy = structuredClone(state); mutate(copy); assert.throws(() => validateBackupState(copy)); assert.equal(inspectImport(JSON.stringify(copy)).ok, false) }
})


test('P05: Wiederherstellung normalisiert Altbezüge, erlaubt aber keine Änderung bekannter Originalinhalte', async () => {
  const state = issued(), storage = memoryStorage(), session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(serializeBackup(state))
  const old = legacyVersionedFixture(state, 10)
  old.invoices[0].freeText = 'Geänderter Rechnungshinweis'
  old.documentVersions[0].content.freeText = old.invoices[0].freeText
  const before = new Map(storage.entries)
  assert.equal(inspectImport(JSON.stringify(old)).ok, true)
  await assert.rejects(session.restore(JSON.stringify(old)), /Finalisierte Belege/)
  assert.deepEqual(storage.entries, before)
  assert.deepEqual(session.state, state)
})

test('P05: widersprüchliche eingefrorene Entwürfe ohne Klärungshistorie werden geschützt abgewiesen', () => {
  const draft = saveInvoiceDraft(documentFamily(), { ...documentDraft(), recipients: both }, false, documentAt)
  const old = legacyVersionedFixture(draft, 10)
  old.invoices[0].draftPrintSnapshot.guardians[1].street = 'Ungeklärter Weg'
  const raw = JSON.stringify(old)
  const result = inspectImport(raw)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.errors[0].message, /Widersprüchliche eingefrorene Empfänger/)
  assert.equal(JSON.stringify(old), raw)
})
