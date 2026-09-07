import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { activeInvoices, allocatedCents, allocatePayment, archiveInvoice, createCorrectionDraft, openCents, reassignCorrectionStudent, resolveDocumentConflicts, selectInvoice, selectedInvoices, snapshotDifferences } from '../src/lib/documents'
import { deleteGuardianState, deleteStudentState, recordActivity } from '../src/lib/commands'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { inspectImport, parseBackup, serializeMigrationReport } from '../src/lib/importState'
import { canonical } from '../src/lib/envelope'
import { requireSuccess } from '../src/lib/result'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { StorageSession, STORAGE_KEY, loadState, serializeBackup } from '../src/lib/storage'
import { validateBackupState } from '../src/lib/validation'
import { buildEpcPayload, createReminder, guardianName, invoiceTotal, invoicesToCsv, nextInvoiceAllocation, outputItemTotal } from '../src/lib/utils'
import { documentAt as at, documentDraft, documentFamily, editable, legacyFixture } from './documentFixtures'
import { memoryStorage, sharedLock } from './storageHarness'
import type { AppState, Invoice } from '../src/types'

function issued(): AppState { return saveInvoiceDraft(documentFamily(), documentDraft(), true, at) }
function printContent(state: AppState, invoice: Invoice): string {
  return renderToStaticMarkup(createElement(InvoicePrint, { invoice: selectInvoice(state, invoice), settings: state.settings, guardians: state.guardians, students: state.students }))
}
async function persistReload(state: AppState): Promise<AppState> {
  const storage = memoryStorage()
  const session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(serializeBackup(state))
  const loaded = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(loaded.initial.status, 'ready')
  assert.deepEqual(loaded.state, state)
  assert.deepEqual(parseBackup(loaded.export()), state)
  assert.equal(requireSuccess(inspectImport(loaded.export())).report, null)
  return loaded.state
}

test('P04: finalisieren, Stammdaten löschen, Original ausgeben, Korrektur speichern, zuordnen und reload', async () => {
  let state = issued()
  const original = state.invoices[0]
  const bytes = canonical(state.documentVersions[0])
  const output = printContent(state, original)
  state = requireSuccess(deleteStudentState(state, 's-a'))
  state = requireSuccess(deleteGuardianState(state, 'g-a'))
  assert.equal(printContent(state, original), output)
  state = createCorrectionDraft(state, original.id, 'Kind und Empfaenger neu zuordnen', at)
  const correctionId = state.invoices.at(-1)!.id
  state = saveInvoiceDraft(state, editable(state.invoices.at(-1)!), false, at)
  state = await persistReload(state)
  assert.equal(state.invoices.at(-1)!.items.length, original.items.length)
  assert.throws(() => changeInvoiceStatus(state, correctionId, 'sent', at), /Stammdaten|zugeordnet/)
  let draft = reassignCorrectionStudent(editable(state.invoices.at(-1)!), 's-a', 's-b')
  draft = { ...draft, guardianIds: ['g-b'], freeText: 'Korrigierter Hinweis', invoiceDate: '2026-09-02', items: draft.items.map((item) => ({ ...item, serviceDate: '2026-09-01', unitPrice: 20 })) }
  state = saveInvoiceDraft(state, draft, true, at)
  state = await persistReload(state)
  assert.equal(canonical(state.documentVersions[0]), bytes)
  assert.equal(printContent(state, original), output)
  assert.equal(state.documentVersions.length, 2)
  assert.equal(state.documentVersions[1].replacesId, state.documentVersions[0].id)
  assert.notEqual(state.invoices[1].number, original.number)
  assert.equal(state.invoices[1].snapshot!.guardians[0].id, 'g-b')
  assert.equal(activeInvoices(state).length, 1)
  assertOriginalsPreserved(issuedFromOriginal(state), state)
})
function issuedFromOriginal(state: AppState): AppState {
  return { ...state, invoices: [state.invoices[0]], documentVersions: [state.documentVersions[0]], invoiceAdministration: [state.invoiceAdministration[0]], payments: [] }
}

test('P04: Betrag, Datum, Texte und Empfaenger dürfen keine ausgestellte Version überschreiben', () => {
  const state = issued(); const original = state.invoices[0]
  for (const field of [{ freeText: 'geändert' }, { introText: '' }, { invoiceDate: '2026-10-01' }, { guardianIds: ['g-b'] }, { items: [{ ...original.items[0], unitPrice: 99 }] }]) {
    assert.throws(() => saveInvoiceDraft(state, { ...editable(original), ...field }, false, at), /Finalisierte/)
    assert.throws(() => assertOriginalsPreserved(state, { ...state, invoices: [{ ...original, ...field }] }), /Finalisierte/)
  }
  const altered = structuredClone(state)
  altered.documentVersions[0].amounts.totalCents++
  assert.throws(() => assertOriginalsPreserved(state, altered), /Belegversionen/)
  assert.throws(() => validateBackupState(altered), /Betragsquelle/)
})

test('P04: Empfaenger A/B und leere historische Kontofelder sind für alle Ausgaben identisch', async () => {
  const raw = legacyFixture(issued())
  raw.invoices[0].guardianIds = ['g-b']
  Object.assign(raw.invoices[0].snapshot!, { accountHolder: '', iban: '', bic: '', bankName: '' })
  raw.settings.bic = 'MARKDEF1100'; raw.settings.accountHolder = 'HEUTIGES KONTO'; raw.settings.defaultLegalText = 'HEUTIGER RECHTSTEXT'
  let state = requireSuccess(inspectImport(JSON.stringify(raw))).state
  const version = state.documentVersions[0]
  assert.ok(version.conflicts.some((conflict) => conflict.path === 'guardianIds'))
  const invoice = selectInvoice(state, state.invoices[0])
  assert.equal(guardianName(invoice, state.guardians), 'Empfaenger A')
  const reminder = createReminder(invoice, state.guardians, state.students)
  assert.deepEqual(reminder.recipients, ['a@example.org'])
  assert.match(reminder.body, /Empfaenger A/)
  assert.match(invoicesToCsv([invoice], state.guardians, state.students), /Empfaenger A/)
  const markup = printContent(state, state.invoices[0])
  assert.match(markup, /Empfaenger A/); assert.doesNotMatch(markup, /HEUTIGES KONTO|MARKDEF1100/)
  const epc = buildEpcPayload(invoice, state.settings, invoiceTotal(invoice)).split('\n')
  assert.equal(epc[4], ''); assert.equal(epc[5], ''); assert.equal(epc[6], '')
  state = createCorrectionDraft(state, invoice.id, 'Empfaenger B bestätigen', at)
  assert.throws(() => changeInvoiceStatus(state, state.invoices.at(-1)!.id, 'sent', at), /Abweichungen/)
  state = resolveDocumentConflicts(state, version.id, 'Snapshot zeigt A. Neue Rechnung ausdrücklich an B; keine Änderung des alten Snapshots.', at)
  state = saveInvoiceDraft(state, editable(state.invoices.at(-1)!), true, at)
  state = await persistReload(state)
  const corrected = selectInvoice(state, state.invoices.at(-1)!)
  assert.equal(guardianName(corrected, state.guardians), 'Empfaenger B')
  assert.deepEqual(createReminder(corrected, state.guardians, state.students).recipients, ['b@example.org'])
  assert.match(printContent(state, state.invoices.at(-1)!), /Empfaenger B/)
  assert.equal(canonical(state.documentVersions[0]), canonical(version))
})

test('P04: alte Ausgabebeträge und vorrangige Registerwerte werden ohne Rechenumstellung gesichert', async () => {
  const legacy = legacyFixture(issued())
  const invoice = legacy.invoices[0]
  legacy.voidedInvoiceNumbers = [{ number: invoice.number!, sequence: invoice.sequence, year: invoice.year, invoiceDate: invoice.invoiceDate, deletedAt: at, amount: 9, recipient: 'Anderer Registerempfaenger', reason: 'reopened' }]
  const raw = '\uFEFF ' + JSON.stringify(legacy) + '\r\n'
  const preview = requireSuccess(inspectImport(raw))
  assert.equal(preview.state.documentVersions[0].amounts.totalCents, 900)
  assert.equal(preview.state.documentVersions[0].amounts.legacyCalculatedTotalCents, 757, 'bisheriger Halbcentfehler wird gesichert, erst Paket 05 ändert neue Berechnung')
  assert.equal(outputItemTotal(selectInvoice(preview.state, preview.state.invoices[0]), invoice.items[0]), 7.57)
  assert.equal(invoiceTotal(selectInvoice(preview.state, preview.state.invoices[0])), 9)
  assert.ok(preview.state.documentVersions[0].conflicts.some((conflict) => conflict.path === 'amounts'))
  assert.equal(preview.state.documentVersions[0].provenance, 'oldest-available')
  assert.equal(JSON.parse(serializeMigrationReport(preview)).originalUtf8, raw)
  assert.deepEqual(requireSuccess(inspectImport(raw)), preview)
  await persistReload(preview.state)
})

test('P04: kontrollierte Migration eines Protokoll-4/Schema-3-Bestands bewahrt Rohtext und Revision', async () => {
  const storage = memoryStorage()
  const old = { app: 'riffrechnung', storageVersion: 4, schemaVersion: 3, datasetId: 'synthetic-dataset', commitId: 'old-commit', revision: 7, savedAt: at, operation: 'edit', ancestors: [], source: null, data: legacyFixture(issued()) }
  const raw = JSON.stringify(old, null, 2)
  storage.setItem(STORAGE_KEY, raw)
  assert.equal(loadState(storage).status, 'recovery')
  assert.equal(storage.getItem(STORAGE_KEY), raw)
  const session = new StorageSession({ storage, lock: sharedLock() })
  await assert.rejects(session.change((state) => state), /Rohdaten/)
  await session.restore(raw)
  assert.equal(session.revision!.revision, 8)
  assert.equal(session.revision!.datasetId, old.datasetId)
  const archive = JSON.parse(JSON.parse(session.exportRecoveryArchive()).recoveries[0].raw)
  assert.equal(archive.previousRaw, raw); assert.equal(archive.sourceRaw, raw)
  assert.equal(archive.report.toSchema, 4)
  assert.equal(new StorageSession({ storage, lock: sharedLock() }).initial.status, 'ready')
  const future = JSON.stringify({ ...old, schemaVersion: 5, data: { ...old.data, schemaVersion: 5 } })
  storage.setItem(STORAGE_KEY, future)
  await assert.rejects(new StorageSession({ storage, lock: sharedLock() }).restore(session.export()), /neuere Formate/)
  assert.equal(storage.getItem(STORAGE_KEY), future)
})

test('P04: mehr als 200 Aktivitäten, Archivierung und Export–Import erhalten Versionen und Nummern', async () => {
  let state = issued()
  const original = state.invoices[0]
  state = createCorrectionDraft(state, original.id, 'Text präzisieren', at)
  state = saveInvoiceDraft(state, { ...editable(state.invoices.at(-1)!), freeText: '=CSV Test' }, true, at)
  const savedVersions = canonical(state.documentVersions)
  const savedCounters = canonical(state.counters)
  const storage = memoryStorage(); const session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(serializeBackup(state))
  for (let i = 0; i < 205; i++) await session.change((current) => recordActivity(changeInvoiceStatus(current, original.id, i % 2 ? 'sent' : 'overdue', at), { id: `action-${i}`, at, label: `Verwaltung ${i}`, entityType: 'invoice', entityId: original.id }))
  state = await session.change((current) => archiveInvoice(archiveInvoice(current, original.id), current.invoices[1].id))
  assert.equal(state.audit.length, 200)
  assert.equal(canonical(state.documentVersions), savedVersions)
  assert.equal(canonical(state.counters), savedCounters)
  state = await persistReload(state)
  assert.equal(activeInvoices(state).length, 1, 'Archivieren storniert keine Forderung')
  assert.equal(openCents(state, original), 0)
  assert.ok(nextInvoiceAllocation(state, '2026-09-01', ['s-a']).sequence > state.invoices[1].sequence!)
  assert.match(invoicesToCsv(selectedInvoices(state), state.guardians, state.students), /Ersetzt – keine zusätzliche Forderung/)
  const before = session.export()
  await assert.rejects(session.restore(serializeBackup(issued())), /Finalisierte|Belegversionen/)
  assert.equal(session.export(), before)
})

test('P04: bezahlte Korrekturen zählen genau einmal; Zahlungen werden nur manuell zugeordnet', async () => {
  let state = issued(); const first = state.invoices[0]
  state = changeInvoiceStatus(state, first.id, 'paid', at)
  const originalPayment = structuredClone(state.payments[0])
  state = createCorrectionDraft(state, first.id, 'Textkorrektur nach Zahlung', at)
  state = saveInvoiceDraft(state, { ...editable(state.invoices.at(-1)!), introText: 'Korrigiert' }, true, at)
  const replacement = state.invoices.at(-1)!
  assert.equal(state.payments.length, 1)
  assert.deepEqual(state.payments[0], originalPayment)
  assert.equal(activeInvoices(state).length, 1)
  assert.equal(openCents(state, first), 0)
  assert.equal(openCents(state, replacement), 757)
  assert.throws(() => changeInvoiceStatus(state, replacement.id, 'paid', at), /zuordnen/)
  const before = state
  const another = createCorrectionDraft(state, replacement.id, 'Weitere Korrektur', at)
  assert.throws(() => changeInvoiceStatus(another, another.invoices.at(-1)!.id, 'paid', at), /manuell zugeordnet/)
  state = allocatePayment(state, originalPayment.id, replacement.versionId!, 'Zahlung gehört zur ersetzenden Rechnung', at)
  assertOriginalsPreserved(before, state)
  assert.equal(allocatedCents(state, first.versionId!), 0)
  assert.equal(openCents(state, replacement), 0)
  assert.equal(state.payments.length, 1)
  assert.equal(state.payments[0].amountCents, 757)
  assert.equal(state.payments[0].sourceVersionId, first.versionId)
  assert.equal(state.payments[0].allocations.length, 2)
  state = await persistReload(state)
  const released = allocatePayment(state, originalPayment.id, null, 'Zuordnung zur manuellen Klärung gelöst', at)
  assert.equal(released.payments.length, 1)
  assert.equal(openCents(released, replacement), 757)
  assertOriginalsPreserved(state, released)
})

test('P04: Betragsdifferenz bleibt als Restforderung oder Überzahlung sichtbar, ohne Zahlungen zu kopieren', async () => {
  for (const price of [5, 20]) {
    let state = issued(); const first = state.invoices[0]
    state = changeInvoiceStatus(state, first.id, 'paid', at)
    state = createCorrectionDraft(state, first.id, 'Betrag berichtigen', at)
    const draft = editable(state.invoices.at(-1)!); draft.items[0].unitPrice = price
    state = saveInvoiceDraft(state, draft, true, at)
    const last = state.invoices.at(-1)!
    state = allocatePayment(state, state.payments[0].id, last.versionId!, 'Alte Vollzahlung auf Korrektur anrechnen; Differenz separat klären', at)
    assert.equal(state.payments.length, 1)
    assert.equal(openCents(state, last), price === 20 ? 743 : 0)
    assert.equal(state.documentVersions.at(-1)!.amounts.totalCents - allocatedCents(state, last.versionId!), price === 20 ? 743 : -382)
    await persistReload(state)
  }
})

test('P04: dauerhafte Snapshot-Differenzen überleben das Abschneiden der Aktivitätsliste', async () => {
  const legacy = legacyFixture(issued()); const snapshot = legacy.invoices[0].snapshot!
  legacy.audit = [{ id: 'old-snapshot-change', at, label: 'Empfaengerkorrektur', entityType: 'invoice', entityId: legacy.invoices[0].id, snapshotCorrection: { oldValue: { ...snapshot, bic: 'MARKDEF1100' }, newValue: snapshot } }]
  let state = parseBackup(JSON.stringify(legacy))
  const evidence = canonical(state.documentVersions[0].snapshotHistory)
  for (let i = 0; i < 201; i++) state = recordActivity(state, { id: `later-${i}`, at, label: 'Spätere Aktion', entityType: 'system' })
  assert.equal(state.audit.some((event) => event.id === 'old-snapshot-change'), false)
  assert.equal(canonical((await persistReload(state)).documentVersions[0].snapshotHistory), evidence)
  assert.deepEqual(snapshotDifferences({ bic: 'MARKDEF1100' }, { bic: '' }), [{ path: 'bic', before: '"MARKDEF1100"', after: '""' }])
})

test('P04: Validatoren schützen Graph, Identitäten, Verwaltungsreferenzen und vollständige Versionen', () => {
  const state = issued()
  for (const mutate of [
    (s: AppState) => { s.documentVersions.push(structuredClone(s.documentVersions[0])) },
    (s: AppState) => { s.documentVersions[0].replacesId = s.documentVersions[0].id },
    (s: AppState) => { s.invoiceAdministration[0].versionId = 'missing' },
    (s: AppState) => { s.documentVersions = [] },
    (s: AppState) => { s.invoices[0].snapshot!.guardians[0].id = 'g-b' },
  ]) { const altered = structuredClone(state); mutate(altered); assert.equal(inspectImport(JSON.stringify(altered)).ok, false) }
  const corrected = createCorrectionDraft(state, state.invoices[0].id, 'Referenzprüfung', at)
  corrected.invoices.at(-1)!.items[0].studentId = 'invented-student'
  assert.throws(() => validateBackupState(corrected), /unbekanntes Kind|zugeordnet/)
  assert.throws(() => createCorrectionDraft(state, state.invoices[0].id, '', at), /Korrekturgrund/)
})

test('P04: zwei schreibende Sitzungen verlieren keine Belegversion oder Zahlung', async () => {
  const storage = memoryStorage(); const lock = sharedLock()
  const first = new StorageSession({ storage, lock }); await first.restore(serializeBackup(issued()))
  const stale = new StorageSession({ storage, lock })
  await first.change((state) => createCorrectionDraft(state, state.invoices[0].id, 'Erste Sitzung', at))
  const before = storage.getItem(STORAGE_KEY)
  await assert.rejects(stale.change((state) => changeInvoiceStatus(state, state.invoices[0].id, 'paid', at)), /anderen Tab/)
  assert.equal(storage.getItem(STORAGE_KEY), before)
})
