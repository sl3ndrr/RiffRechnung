import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canonical } from '../src/lib/canonical'
import { documentContent } from '../src/lib/documentProjection'
import { createCorrectionDraft, resolveDocumentConflicts, selectInvoice } from '../src/lib/documents'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { inspectImport, parseBackup } from '../src/lib/importState'
import { validateBackupState } from '../src/lib/validation'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { StorageSession, serializeBackup } from '../src/lib/storage'
import { buildEpcPayload, invoiceTotal } from '../src/lib/utils'
import { requireSuccess } from '../src/lib/result'
import { documentAt, documentDraft, documentFamily, editable, expectedConsolidatedVersions, historicalOutputFixture } from './documentFixtures'
import { memoryStorage, sharedLock } from './storageHarness'

const issued = () => saveInvoiceDraft(documentFamily(), { ...documentDraft(), recipients: [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }] }, true, documentAt)

test('P07: neue finale Versionen speichern Ausgabeinformationen nur außerhalb content; leere Werte bleiben verbindlich', () => {
  const state = issued(), before = structuredClone(state.documentVersions)
  const content = state.documentVersions[0].content
  for (const field of ['snapshot', 'draftPrintSnapshot', 'period', 'legalText']) assert.equal(Object.hasOwn(content, field), false)
  state.settings.issuer.name = 'HEUTIGER AUSSTELLER'; state.settings.bic = 'MARKDEF1100'; state.settings.bankName = 'HEUTIGE BANK'
  state.settings.defaultLegalText = 'HEUTIGER RECHTSTEXT'
  state.guardians.forEach((person) => { person.name = 'HEUTIGER EMPFÄNGER'; person.address.street = 'HEUTIGE ANSCHRIFT' })
  state.students[0].name = 'HEUTIGER LEISTUNGSNAME'
  const selected = selectInvoice(state, state.invoices[0])
  assert.deepEqual(selected.snapshot, before[0].outputSnapshot)
  assert.deepEqual(selected.snapshot!.recipients.map((entry) => entry.street), ['Testweg 2', 'Testweg 3'])
  assert.equal(selected.snapshot!.bic, ''); assert.equal(selected.snapshot!.bankName, ''); assert.equal(selected.legalText, '')
  assert.equal(selected.period, before[0].outputPeriod)
  const payload = buildEpcPayload(selected, state.settings, invoiceTotal(selected)).split('\n')
  assert.equal(payload[4], ''); assert.equal(payload[5], before[0].outputSnapshot.accountHolder)
  assert.equal(payload[6], before[0].outputSnapshot.iban); assert.equal(payload[7], 'EUR7.58')
  assert.deepEqual(state.documentVersions, before)
  const corrupt = structuredClone(state); Reflect.set(corrupt.documentVersions[0].content, 'snapshot', before[0].outputSnapshot)
  assert.throws(() => validateBackupState(corrupt), /content/)
})

test('P07: Schema 12→13 bewahrt alle geschützten Rohangaben, Ausgabe und vorhandene Konflikte ohne neue Archivkopie', async () => {
  const old = historicalOutputFixture(issued()), raw = JSON.stringify(old)
  const preview = requireSuccess(inspectImport(raw)), state = preview.state
  assert.equal(preview.report?.fromSchema, 12); assert.equal(preview.report?.toSchema, 13)
  assert.equal(JSON.stringify(old), raw)
  for (const key of ['invoices', 'invoiceAdministration', 'payments', 'historicalSnapshotCorrections', 'voidedInvoiceNumbers', 'counters', 'students', 'guardians', 'settings'] as const) assert.deepEqual(state[key], old[key], key)
  assert.deepEqual(state.documentVersions, expectedConsolidatedVersions(old.documentVersions))
  const selected = selectInvoice(state, state.invoices[0]), version = old.documentVersions[0]
  assert.deepEqual(documentContent(selected), documentContent({ ...old.invoices[0], ...version.content }, false))
  assert.deepEqual(selected.snapshot, version.outputSnapshot)
  assert.equal(selected.period, version.outputPeriod); assert.equal(selected.legalText, version.outputLegalText)
  assert.equal(invoiceTotal(selected), 9)
  assert.equal(buildEpcPayload(selected, state.settings, invoiceTotal(selected)).split('\n')[7], 'EUR9.00')
  assert.doesNotMatch(JSON.stringify(preview.report), /P09: vorhandener Rohtext|Abweichender Roh-Empfänger/)
  const session = new StorageSession({ storage: memoryStorage(), lock: sharedLock() })
  await session.restore(raw)
  assert.deepEqual(session.state, state)
  assert.deepEqual(parseBackup(session.export()), state)
  assert.equal(requireSuccess(inspectImport(serializeBackup(state))).report, null)
  assert.deepEqual(requireSuccess(inspectImport(raw)).state, state)
  const corrupt = structuredClone(old); corrupt.documentVersions[0].content.period = 'Ungeprüfte Manipulation'
  assert.equal(inspectImport(JSON.stringify(corrupt)).ok, false, 'Altformat wird vor Entfernen der Kopien streng geprüft')
})

test('P07: Korrektur verwendet die Ausgabeprojektion; historische Originale, Nummern und Nachweise bleiben erhalten', () => {
  let state = parseBackup(JSON.stringify(historicalOutputFixture(issued())))
  state = resolveDocumentConflicts(state, state.documentVersions[0].id, 'Historische Abweichungen geprüft', documentAt)
  const original = structuredClone(state)
  state = createCorrectionDraft(state, state.invoices[0].id, 'Ausgabe berichtigen', documentAt)
  const draft = state.invoices.at(-1)!
  assert.equal(draft.period, original.documentVersions[0].outputPeriod)
  assert.equal(draft.legalText, original.documentVersions[0].outputLegalText)
  assert.deepEqual(draft.draftPrintSnapshot, original.documentVersions[0].outputSnapshot)
  state = saveInvoiceDraft(state, { ...editable(draft), freeText: 'Berichtigter Hinweis' }, true, documentAt)
  assertOriginalsPreserved(original, state)
  assert.deepEqual(state.documentVersions[0], original.documentVersions[0])
  assert.notEqual(state.invoices[1].number, state.invoices[0].number)
  assert.equal(state.documentVersions[1].replacesId, state.documentVersions[0].id)
  assert.deepEqual(parseBackup(serializeBackup(state)), state)
})

test('P07: Kanonisierung behält Schlüsselordnung, undefined-Behandlung und Arraybedeutung; Validatoren erreichen die zyklischen Module nicht', () => {
  assert.equal(canonical({ z: undefined, b: [undefined, { y: 2, x: 1 }], a: null }), '{"a":null,"b":[null,{"x":1,"y":2}]}')
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }))
  assert.notEqual(canonical([1, 2]), canonical([2, 1]))
  const dependencies = (file: string): string[] => [...readFileSync(file, 'utf8').matchAll(/^(?:import(?! type)|export) .*?from ['"](.+?)['"]/gm)]
    .map((entry) => entry[1]).filter((path) => path.startsWith('.')).map((path) => resolve(file, '..', path + '.ts'))
  for (const name of ['canonical', 'documentProjection']) assert.deepEqual(dependencies(resolve('src/lib', name + '.ts')), [])
  const visited = new Set<string>()
  const visit = (file: string) => { if (visited.has(file)) return; visited.add(file); dependencies(file).forEach(visit) }
  visit(resolve('src/lib/validation.ts'))
  assert.equal(visited.has(resolve('src/lib/documents.ts')), false)
  assert.equal(visited.has(resolve('src/lib/envelope.ts')), false)
})
