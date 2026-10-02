import test from 'node:test'
import assert from 'node:assert/strict'
import { documentAt, documentDraft, documentFamily, editable, legacyVersionedFixture } from './documentFixtures'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { saveStudentState } from '../src/lib/commands'
import { createCorrectionDraft } from '../src/lib/documents'
import { inspectImport, parseBackup } from '../src/lib/importState'
import { StorageSession, STORAGE_KEY, loadState, serializeBackup } from '../src/lib/storage'
import { memoryStorage, sharedLock } from './storageHarness'
import { requireSuccess } from '../src/lib/result'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { buildEpcPayload, formatInvoiceNumber, invoiceStudentCode, nextInvoiceAllocation, sortPeople } from '../src/lib/utils'
import { migrateInvoiceNumbering } from '../src/lib/legacyInvoiceNumbering'
import type { AppState } from '../src/types'

const allocation = (state: AppState, ids = ['s-a'], year = 2026) => nextInvoiceAllocation(state, `${year}-09-01`, ids)
const oldV11 = (state = documentFamily()) => legacyVersionedFixture(state, 11)

test('P06: festes Format, getrennte Jahreskreise und zwei Erziehungsberechtigte', () => {
  assert.equal(formatInvoiceNumber(10000, 2026, 'aa+b'), '2026-10000-aa+b')
  const state = documentFamily()
  state.counters = { '2026:a': 7, '2026:b': 4, '2026:a+b': 3, '2026:ab': 100 }
  assert.deepEqual(allocation(state, ['s-b', 's-a']), allocation(state, ['s-a', 's-b']))
  const both = [{ type: 'guardian' as const, id: 'g-a' }, { type: 'guardian' as const, id: 'g-b' }]
  const single = saveInvoiceDraft(state, { ...documentDraft(), recipients: both }, true, documentAt)
  assert.equal(single.invoices[0].number, '2026-0007-a')
  const combo = saveInvoiceDraft(single, { ...documentDraft(), studentIds: ['s-b', 's-a'], items: [{ ...documentDraft().items[0], id: 'combo-item' }] }, true, documentAt)
  assert.equal(combo.invoices[1].number, '2026-0003-a+b')
  assert.equal(combo.counters['2026:a'], 8)
  assert.equal(combo.counters['2026:b'], 4)
  assert.equal(combo.counters['2026:a+b'], 4)
  assert.equal(allocation(combo, ['s-a'], 2027).number, '2027-0001-a')
  assert.match(buildEpcPayload(combo.invoices[1], combo.settings, 7.58), /Rechnung 2026-0003-a\+b/)
})

test('P06: mehrstellige Kennungen behalten Vergabereihenfolge unabhängig von Namen, Aktivierung und Sortierung', async () => {
  let state = documentFamily()
  state.students[0].billingCode = 'z'; state.students[1].billingCode = 'aa'; state.nextStudentCodeIndex = 27
  const renamed = requireSuccess(saveStudentState(state, { ...state.students[0], name: 'Anderer Name', active: false, billingCode: 'b', guardianIds: ['g-b'] }))
  assert.equal(renamed.students[0].billingCode, 'z')
  state = { ...renamed, students: sortPeople(renamed.students, 'name-desc') }
  assert.equal(invoiceStudentCode(state, ['s-b', 's-a']), 'z+aa')
  const session = new StorageSession({ storage: memoryStorage(), lock: sharedLock() })
  await session.restore(serializeBackup(state))
  assert.equal(invoiceStudentCode(parseBackup(session.export()), ['s-a', 's-b']), 'z+aa')
  assert.equal(allocation(session.state, ['s-b', 's-a']).number, '2026-0001-z+aa')
})

test('P06: Schema 11 migriert geschützt, behält Originale und Reservierungen exakt und ist idempotent', async () => {
  const issued = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  const old = oldV11(issued)
  old.invoices[0].number = '2026-a-0001'; old.documentVersions[0].content.number = '2026-a-0001'
  old.counters = { '2026:a': 7, '2026:b+a': 4, '2026:ab': 9 }
  old.voidedInvoiceNumbers.push({ number: '2026-a-0011', sequence: 11, year: 2026, invoiceDate: '2026-09-01', deletedAt: documentAt, amount: 30, recipient: 'Synthetisch' })
  const raw = JSON.stringify(old), before = structuredClone(old)
  const preview = requireSuccess(inspectImport(raw))
  assert.equal(preview.report?.fromSchema, 11); assert.equal(preview.report?.toSchema, 12)
  assert.equal(preview.state.schemaVersion, 12)
  assert.deepEqual(preview.state.documentVersions, before.documentVersions)
  assert.deepEqual(preview.state.invoices, before.invoices)
  assert.deepEqual(preview.state.voidedInvoiceNumbers, before.voidedInvoiceNumbers)
  assert.deepEqual(preview.state.students, before.students)
  assert.equal(JSON.stringify(old), raw)
  assert.equal(allocation(preview.state).number, '2026-0012-a')
  assert.equal(allocation(preview.state, ['s-b', 's-a']).number, '2026-0009-a+b')
  assert.equal(preview.state.counters['2026:ab'], 9)
  assert.equal(Reflect.has(preview.state.settings, 'numberPattern'), false)
  assert.equal(Reflect.has(preview.state.settings, 'resetNumberAnnually'), false)
  const storage = memoryStorage(); storage.setItem(STORAGE_KEY, raw)
  assert.equal(loadState(storage).status, 'recovery')
  const session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(raw)
  assert.equal(new StorageSession({ storage, lock: sharedLock() }).initial.status, 'ready')
  assert.deepEqual(parseBackup(session.export()), session.state)
  assert.equal(requireSuccess(inspectImport(session.export())).report, null)
  assertOriginalsPreserved(preview.state, session.state)
})

test('P06: globale und unbekannte Altzähler werden als konservative Jahres-Mindeststände übernommen', () => {
  const old = oldV11()
  old.settings.resetNumberAnnually = false
  old.counters = { 'global:a': 23, global: 12, '2025': 8, 'unbekannt': 15 }
  old.voidedInvoiceNumbers = [{ number: 'ALT-22', sequence: 22, year: 2024, invoiceDate: '2024-09-01', deletedAt: documentAt, amount: 1, recipient: 'Synthetisch' }]
  const state = migrateInvoiceNumbering(old, [], 2026)
  assert.equal(allocation(state).sequence, 23)
  assert.equal(allocation(state, ['s-b']).sequence, 23)
  assert.equal(allocation(state, ['s-a', 's-b']).sequence, 23)
  assert.equal(allocation(state, ['s-b'], 2024).sequence, 23)
  assert.equal(allocation(state, ['s-a'], 2025).sequence, 23)
  assert.equal(allocation(state, ['s-a'], 2027).sequence, 1)
  assert.deepEqual(Object.fromEntries(Object.keys(old.counters).map((key) => [key, state.counters[key]])), old.counters)
})

test('P06: alte freie Muster dienen nur zur Zuordnung reservierter Folgen', () => {
  const old = oldV11()
  old.settings.numberPattern = 'RG/{YY}/{NNNN}/{K}'
  old.voidedInvoiceNumbers = [{ number: 'RG/26/0031/b+a', sequence: null, year: 2026, invoiceDate: '2026-09-01', deletedAt: documentAt, amount: 1, recipient: 'Synthetisch' }]
  const state = parseBackup(JSON.stringify(old))
  assert.equal(allocation(state, ['s-a', 's-b']).number, '2026-0032-a+b')
  assert.equal(allocation(state).sequence, 1)
  assert.equal(state.voidedInvoiceNumbers[0].number, 'RG/26/0031/b+a')
})

test('P06: niedrigere Zähler, alte und feste Reservierungen sowie Korrekturen kollidieren nicht', () => {
  let state = documentFamily()
  state.voidedInvoiceNumbers = [{ number: '2026-0001-a', sequence: 1, year: 2026, invoiceDate: '2026-09-01', deletedAt: documentAt, amount: 1, recipient: 'Synthetisch' }]
  state = saveInvoiceDraft(state, documentDraft(), true, documentAt)
  assert.equal(state.invoices[0].number, '2026-0002-a')
  state = createCorrectionDraft(state, state.invoices[0].id, 'Leistung berichtigt', documentAt)
  state = saveInvoiceDraft(state, editable(state.invoices[1]), true, documentAt)
  assert.equal(state.invoices[1].number, '2026-0003-a')
  state.counters['2026:a'] = 1
  assert.equal(allocation(state).number, '2026-0004-a')
  assert.equal(state.documentVersions[0].content.number, '2026-0002-a')
})

test('P06: Restore bewahrt höhere Folgen und sperrt geänderte Kennungen', async () => {
  const storage = memoryStorage(), session = new StorageSession({ storage, lock: sharedLock() })
  const state = documentFamily(); state.counters['2026:a+b'] = 40
  await session.restore(serializeBackup(state))
  await session.restore(JSON.stringify(oldV11()))
  assert.equal(allocation(session.state, ['s-b', 's-a']).sequence, 40)
  const changed = session.state; changed.students[0].billingCode = 'z'
  const raw = storage.getItem(STORAGE_KEY)
  await assert.rejects(session.restore(serializeBackup(changed)), /Personenkennung/)
  assert.equal(storage.getItem(STORAGE_KEY), raw)
})

test('P06: fehlgeschlagene Migration verändert den gespeicherten Bestand nicht; Schema 12 lehnt Altoptionen ab', async () => {
  const raw = JSON.stringify(oldV11()), storage = memoryStorage(); storage.setItem(STORAGE_KEY, raw)
  const before = new Map(storage.entries)
  storage.fail = STORAGE_KEY
  await assert.rejects(new StorageSession({ storage, lock: sharedLock() }).restore(raw))
  assert.deepEqual(storage.entries, before)
  const invalid = documentFamily(); Reflect.set(invalid.settings, 'numberPattern', '{NNNN}')
  assert.equal(inspectImport(JSON.stringify(invalid)).ok, false)
})


test('P06: nichtjährliche Konfiguration schützt bekannte Folgen auch ohne globalen Zählerschlüssel', () => {
  const draft = documentDraft()
  const issued = saveInvoiceDraft(documentFamily(), { ...draft, invoiceDate: '2025-09-01', dueDate: '2025-09-15', items: draft.items.map((item) => ({ ...item, serviceDate: '2025-08-15' })) }, true, documentAt)
  const old = oldV11(issued)
  old.settings.resetNumberAnnually = false; old.counters = {}
  for (const invoice of [old.invoices[0], old.documentVersions[0].content]) { invoice.number = '2025-a-0017'; invoice.sequence = 17 }
  old.voidedInvoiceNumbers.push({ number: 'ALT-19', sequence: 19, year: 2025, invoiceDate: '2025-09-01', deletedAt: documentAt, amount: 1, recipient: 'Synthetisch' })
  const state = migrateInvoiceNumbering(old, [], 2026)
  assert.equal(allocation(state).sequence, 20)
  assert.equal(allocation(state, ['s-b']).sequence, 20)
  assert.equal(allocation(state, ['s-a', 's-b']).sequence, 20)
  assert.equal(allocation(state, ['s-a'], 2027).sequence, 1)
  assert.equal(state.invoices[0].number, '2025-a-0017')
  assert.deepEqual(state.voidedInvoiceNumbers, old.voidedInvoiceNumbers)
})
