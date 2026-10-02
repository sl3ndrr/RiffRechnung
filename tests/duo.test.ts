import test from 'node:test'
import assert from 'node:assert/strict'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { createCorrectionDraft, activeInvoices, archiveInvoice } from '../src/lib/documents'
import { deleteInvoiceDraftState } from '../src/lib/commands'
import { requireSuccess } from '../src/lib/result'
import { inspectImport } from '../src/lib/importState'
import { invoiceTotalCents } from '../src/lib/money'
import { applyLessonType, buildEpcPayload } from '../src/lib/utils'
import { validateBackupState } from '../src/lib/validation'
import { serializeBackup, parseBackup, StorageSession, STORAGE_KEY, PREVIOUS_STORAGE_KEY, loadState } from '../src/lib/storage'
import { documentAt, documentDraft, documentFamily, editable } from './documentFixtures'
import { duoDrafts, legacyDuoState, legacyDuoSource } from './duoFixtures'
import { memoryStorage, seedState, sharedLock } from './storageHarness'

function migrated(raw: string) { return requireSuccess(inspectImport(raw)) }

test('P03: Schema 8/9 löst nur Gruppenmetadaten; Preise, Empfänger und alle Entwürfe bleiben unverändert', async () => {
  assert.equal(legacyDuoSource, '83c747488f643dc6d1416319c8a1d594e9ae4305')
  for (const schema of [8, 9] as const) {
    const legacy = legacyDuoState(schema), before = structuredClone(legacy)
    const raw = '\uFEFF' + JSON.stringify(legacy, null, 2) + '\r\n'
    const preview = migrated(raw)
    assert.deepEqual(legacy, before)
    assert.equal(preview.state.schemaVersion, 10)
    assert.equal('duoGroups' in preview.state, false)
    assert.equal(preview.report?.migration, 'riffrechnung-to-v10')
    assert.equal(preview.report?.fromSchema, schema)
    assert.deepEqual(preview.report?.changes.find((change) => change.path === 'duoGroups')?.before, legacy.duoGroups)
    assert.deepEqual(preview.state.invoices, before.invoices)
    assert.deepEqual(preview.state.invoices.map(invoiceTotalCents), [758, 1502])
    assert.equal(preview.rawData, raw)
    const storage = memoryStorage(), session = new StorageSession({ storage, lock: sharedLock() })
    await session.restore(raw)
    const archive = JSON.parse(session.exportRecoveryArchive()) as { recoveries: { raw: string }[] }
    assert.equal(JSON.parse(archive.recoveries[0].raw).sourceRaw, raw)
    assert.deepEqual(parseBackup(session.export()), preview.state)
    assert.equal(migrated(session.export()).report, null)
    const loaded = loadState(storage)
    assert.equal(loaded.status, 'ready')
    if (loaded.status === 'ready') assert.deepEqual(loaded.state, preview.state)
  }
})

test('P03: lokaler Schema-9-Stand wartet ohne Schreibverlust auf kontrollierte Übernahme', async () => {
  const storage = memoryStorage(), old = legacyDuoState()
  seedState(duoDrafts(), storage)
  const envelope = JSON.parse(storage.getItem(STORAGE_KEY)!)
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...envelope, schemaVersion: 9, data: old }))
  const raw = storage.getItem(STORAGE_KEY)!
  const loaded = loadState(storage)
  assert.equal(loaded.status, 'recovery')
  assert.equal(storage.getItem(STORAGE_KEY), raw)
  const session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(raw)
  assert.deepEqual(session.state.invoices, old.invoices)
  assert.equal(loadState(storage).status, 'ready')
})

test('P03: historische finale Duo-Belege, Nummern, Originalversionen und Verwaltungsdaten bleiben gleich', async () => {
  for (const schema of [8, 9] as const) {
    const old = legacyDuoState(schema, true), preview = migrated(JSON.stringify(old))
    for (const key of ['invoices', 'documentVersions', 'invoiceAdministration', 'payments', 'counters', 'voidedInvoiceNumbers'] as const) assert.deepEqual(preview.state[key], old[key])
    assert.deepEqual(preview.state.invoices.map((invoice) => invoice.number), ['2026-aur-0001', '2026-bas-0001'])
    assert.deepEqual(parseBackup(serializeBackup(preview.state)), preview.state)
    const storage = memoryStorage(), session = new StorageSession({ storage, lock: sharedLock() })
    await session.restore(JSON.stringify(old))
    assert.deepEqual(new StorageSession({ storage, lock: sharedLock() }).state.documentVersions, old.documentVersions)
  }
})

test('P03: fehlende Partner oder Positionen erzeugen keine Ersatzdaten; übrige Entwürfe bleiben unabhängig', () => {
  for (const missing of ['invoice', 'item'] as const) {
    const old = legacyDuoState()
    if (missing === 'invoice') old.invoices.pop()
    else old.invoices[1].items = []
    const preview = migrated(JSON.stringify(old))
    assert.deepEqual(preview.state.invoices, old.invoices)
    assert.deepEqual(preview.report?.changes.find((change) => change.path === 'duoGroups')?.before, old.duoGroups)
    const next = changeInvoiceStatus(preview.state, old.invoices[0].id, 'sent', documentAt)
    assert.equal(next.documentVersions.length, 1)
    assert.deepEqual(next.invoices.slice(1), old.invoices.slice(1))
  }
})

test('P03: mehrdeutiger oder ungültiger Altbestand bleibt im Rohdaten-/Klärungspfad', async () => {
  for (const kind of ['duplicate-target', 'unknown-field', 'fractional-total', 'duplicate-item', 'invalid-recipient'] as const) {
    const old = legacyDuoState()
    if (kind === 'duplicate-target') old.duoGroups[0].targets[1].invoiceId = old.duoGroups[0].targets[0].invoiceId
    if (kind === 'unknown-field') Object.assign(old.duoGroups[0], { unrecognized: 'erhalten' })
    if (kind === 'fractional-total') old.duoGroups[0].totalCents = .1
    if (kind === 'duplicate-item') old.invoices[1].items[0].id = old.invoices[0].items[0].id
    if (kind === 'invalid-recipient') old.invoices[0].guardianIds = ['missing']
    const raw = JSON.stringify(old), storage = memoryStorage()
    storage.setItem(STORAGE_KEY, raw)
    assert.equal(inspectImport(raw).ok, false)
    const loaded = loadState(storage)
    assert.equal(loaded.status, 'recovery')
    if (loaded.status === 'recovery') assert.equal(loaded.rawData, raw)
    const session = new StorageSession({ storage, lock: sharedLock() })
    await assert.rejects(session.restore(raw))
    assert.equal(storage.getItem(STORAGE_KEY), raw)
  }
})

test('P03: aktuelles Schema akzeptiert keine neuen Gruppen; Altadapter ist auf 8/9 begrenzt', () => {
  for (const schemaVersion of [7, 10, 11]) {
    const old = { ...legacyDuoState(), schemaVersion }
    assert.equal(inspectImport(JSON.stringify(old)).ok, false)
  }
  assert.throws(() => validateBackupState({ ...duoDrafts(), duoGroups: [] }), /duoGroups/)
  const old = legacyDuoState(); Reflect.deleteProperty(old, 'duoGroups')
  assert.equal(migrated(JSON.stringify(old)).state.invoices.length, 2)
})

test('P03: gemeinsame Empfänger sind ein Beleg; Duo-Preis bleibt ohne Gruppenverwaltung', () => {
  const state = documentFamily(), draft = documentDraft()
  draft.guardianIds = ['g-a', 'g-b']
  draft.items = [applyLessonType(draft.items[0], 'duo', state.settings)]
  const next = saveInvoiceDraft(state, draft, true, documentAt)
  assert.equal(next.invoices.length, 1)
  assert.equal(next.documentVersions.length, 1)
  assert.equal(activeInvoices(next).length, 1)
  assert.equal(next.invoices[0].items[0].unitPrice, state.settings.duoRate)
  assert.deepEqual(next.invoices[0].snapshot?.guardians.map((guardian) => guardian.id), ['g-a', 'g-b'])
  assert.equal(next.invoices[0].number, '2026-a-0001')
  assert.equal('duoGroups' in next, false)
})

test('P03: Einzelabschluss und Bearbeitung benötigen keinen gültigen Partner oder Gruppenbetrag', () => {
  let state = migrated(JSON.stringify(legacyDuoState())).state
  state.invoices[1].guardianIds = []
  const partner = structuredClone(state.invoices[1])
  state = saveInvoiceDraft(state, { ...editable(state.invoices[0]), freeText: 'Unabhängig bearbeitet' }, true, documentAt)
  assert.equal(state.documentVersions.length, 1)
  assert.deepEqual(state.invoices.find((invoice) => invoice.id === partner.id), partner)
  const deleted = requireSuccess(deleteInvoiceDraftState(state, partner.id))
  assert.equal(deleted.invoices.length, 1)
})

test('P03: Zahlung und Korrektur einer unabhängigen Duo-Rechnung ändern keinen anderen Beleg', () => {
  let state = migrated(JSON.stringify(legacyDuoState(9, true))).state
  const [a, b] = state.invoices, originalB = structuredClone(state.documentVersions[1])
  state = changeInvoiceStatus(state, a.id, 'paid', documentAt, '2026-09-25')
  assert.equal(state.payments.length, 1)
  assert.deepEqual(state.documentVersions[1], originalB)
  state = createCorrectionDraft(state, a.id, 'Preis berichtigt', documentAt)
  state = saveInvoiceDraft(state, editable(state.invoices.at(-1)!), true, documentAt)
  state = archiveInvoice(state, b.id)
  assert.deepEqual(state.documentVersions[1], originalB)
  assert.equal(activeInvoices(state).length, 2)
})

test('P03: Quota, Validierungsfehler und veralteter Tab hinterlassen keinen halben Einzelbeleg', async () => {
  for (const failure of [PREVIOUS_STORAGE_KEY, STORAGE_KEY]) {
    const state = duoDrafts(), storage = memoryStorage(), lock = sharedLock()
    seedState(state, storage)
    const a = new StorageSession({ storage, lock }), b = new StorageSession({ storage, lock }), before = storage.getItem(STORAGE_KEY)
    storage.fail = failure
    await assert.rejects(a.change((current) => changeInvoiceStatus(current, current.invoices[0].id, 'sent')))
    assert.equal(storage.getItem(STORAGE_KEY), before)
    assert.deepEqual(a.state, state)
    storage.fail = null
    await a.change((current) => changeInvoiceStatus(current, current.invoices[0].id, 'sent'))
    await assert.rejects(b.change((current) => changeInvoiceStatus(current, current.invoices[1].id, 'sent')), /anderen Tab/)
    assert.equal(a.state.documentVersions.length, 1)
    assert.deepEqual(a.state.invoices[1], state.invoices[1])
  }
})

test('P03: Selbstzahler nutzt Duo-Preis, GiroCode und denselben Personenbuchstaben ohne Gruppe', () => {
  const state = documentFamily(), student = state.students[0]
  student.selfPayer = true
  student.guardianIds = []
  const draft = documentDraft()
  draft.guardianIds = []
  draft.recipients = [{ type: 'student', id: student.id }]
  draft.items = [applyLessonType(draft.items[0], 'duo', state.settings)]
  const next = saveInvoiceDraft(state, draft, true, documentAt)
  assert.equal(next.invoices[0].number, '2026-a-0001')
  assert.deepEqual(next.invoices[0].snapshot?.recipients?.map((recipient) => recipient.id), [student.id])
  assert.equal(next.invoices[0].items[0].unitPrice, state.settings.duoRate)
  assert.match(buildEpcPayload(next.invoices[0], state.settings, invoiceTotalCents(next.invoices[0]) / 100), /2026-a-0001/)
  assert.equal('duoGroups' in next, false)
})
