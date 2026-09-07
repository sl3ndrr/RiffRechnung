import { legacyFixture } from './documentFixtures'
import { validateLegacyV3Structure } from '../src/lib/validation'
import { captureLegacyDocuments } from '../src/lib/importState'
import { seedState, sharedLock, fakeDirectory } from './storageHarness'
import { ValidationError } from '../src/lib/result'
import test from 'node:test'
import assert from 'node:assert/strict'
import type { AppState, Invoice, InvoiceDraft } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { assertOriginalsPreserved, assertReplacementAllowed } from '../src/lib/safety'
import { applyStandardRateInput, parseStandardRate, updateSettings } from '../src/lib/settings'
import { inspectBackupDirectory, StorageSession, loadState, parseBackup, serializeBackup, STORAGE_KEY, validateBackupState } from '../src/lib/storage'
import { createLessonItem, germanIbanError, invoiceTotal, nextInvoiceAllocation, reopenInvoiceAsDraft } from '../src/lib/utils'

const at = '2026-08-20T12:00:00.000Z'
function families(count = 2): AppState {
  const state = emptyState()
  state.settings.issuer.name = 'Synthetisches Teststudio'
  state.settings.iban = 'DE02120300000000202051'
  for (let index = 0; index < count; index++) {
    state.guardians.push({ id: `g${index}`, name: `Testfamilie ${index}`, email: `test${index}@example.org`, phone: '', address: { street: 'Testweg 1', postalCode: '12345', city: 'Teststadt' }, iban: '', paymentNote: '', createdAt: at, updatedAt: at })
    state.students.push({ id: `s${index}`, name: `Testkind ${index}`, billingCode: String.fromCharCode(97 + index), guardianIds: [`g${index}`], note: '', active: true, createdAt: at, updatedAt: at })
  }
  state.nextStudentCodeIndex = count
  return state
}

function draftFor(state: AppState, ids = ['s0']): InvoiceDraft {
  return {
    invoiceDate: '2026-08-01', dueDate: '2026-08-15', period: 'August 2026',
    guardianIds: [...new Set(ids.flatMap((id) => state.students.find((student) => student.id === id)!.guardianIds))],
    studentIds: ids, recipientStrategy: 'joint',
    items: ids.map((id) => createLessonItem(id, '2026-08-05', state.settings, `item-${id}`)),
    introText: '', freeText: '', legalText: '',
  }
}

async function withStorage(run: () => void | Promise<void>): Promise<void> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const entries = new Map<string, string>()
  const storage: Storage = {
    get length() { return entries.size }, clear: () => entries.clear(), getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null, removeItem: (key) => entries.delete(key), setItem: (key, value) => { entries.set(key, value) },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  try { await run() } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

function roundTrip(state: AppState): AppState {
  validateBackupState(state)
  const imported = parseBackup(serializeBackup(state))
  const again = parseBackup(serializeBackup(imported))
  // Current-format reads preserve the complete state, including updatedAt.
  assert.deepEqual(again, imported)
  seedState(imported)
  const loaded = loadState()
  if (loaded.status !== 'ready') assert.fail(`Unerwarteter Recovery-Zustand: ${loaded.error}`)
  assert.deepEqual(loaded.state, imported)
  return loaded.state
}

test('P01: zwei und drei Familien können weder getrennt noch verdeckt gemeinsam vervielfältigt werden', async () => withStorage(() => {
  for (const count of [2, 3]) {
    const state = families(count)
    const draft = draftFor(state, state.students.map((student) => student.id))
    const original = structuredClone(state)
    for (const finalize of [false, true]) {
      assert.throws(() => saveInvoiceDraft(state, { ...draft, recipientStrategy: 'separate' }, finalize), /Getrennte Rechnungen/)
      assert.throws(() => saveInvoiceDraft(state, draft, finalize), /jedem ausgewählten Kind/)
    }
    // An imported legacy draft cannot bypass the editor guard via its status menu.
    const legacy: Invoice = { ...draft, id: 'legacy', number: null, sequence: null, year: 2026, status: 'draft', recipientStrategy: 'separate', createdAt: at, updatedAt: at }
    assert.throws(() => changeInvoiceStatus({ ...state, invoices: [legacy] }, legacy.id, 'sent'), /Getrennte Rechnungen/)
    assert.deepEqual(state, original)
    assert.equal(roundTrip(state).invoices.length, 0)
    assert.deepEqual(state.counters, {})
  }
}))

test('P01: eindeutige Einzel- und Geschwisterrechnungen bestehen Entwurf, Finalisierung, Import und Reload', async () => withStorage(() => {
  let state = families()
  state = saveInvoiceDraft(state, draftFor(state), false, at)
  assert.equal(state.invoices.length, 1)
  assert.equal(state.invoices[0].number, null)
  state = roundTrip(state)
  state = changeInvoiceStatus(state, state.invoices[0].id, 'sent', at)
  assert.equal(invoiceTotal(state.invoices[0]), 30)
  assert.deepEqual(state.invoices[0].snapshot?.students.map((student) => student.id), ['s0'])
  state = roundTrip(state)
  assert.equal(state.invoices[0].number, '2026-a-0001')
  const next = saveInvoiceDraft(state, draftFor(state, ['s1']), true, at)
  assert.equal(next.invoices[1].number, '2026-b-0001')
  assert.equal(next.invoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0), 60)
  roundTrip(next)

  const siblings = families()
  siblings.students.forEach((student) => { student.guardianIds = ['g0', 'g1'] })
  const joint = roundTrip(saveInvoiceDraft(siblings, draftFor(siblings, ['s0', 's1']), true, at))
  assert.equal(joint.invoices.length, 1)
  assert.equal(invoiceTotal(joint.invoices[0]), 60)
  assert.equal(joint.invoices[0].number, '2026-a+b-0001')
  assert.deepEqual(joint.invoices[0].snapshot?.guardians.map((guardian) => guardian.id), ['g0', 'g1'])
}))

test('P01: fehlende Referenzen und doppelte Positions-IDs werden vor Übernahme abgewiesen', () => {
  const state = families()
  const saved = saveInvoiceDraft(state, draftFor(state), false, at)
  assert.throws(() => saveInvoiceDraft(saved, draftFor(state), false, at), /id ist doppelt/)
  assert.throws(() => saveInvoiceDraft(saved, { ...draftFor(state), studentIds: ['missing'] }, false, at), (error: unknown) => error instanceof ValidationError && error.code === 'INVALID_STATE' && error.path === 'invoices[1].studentIds[0]')
  assert.throws(() => saveInvoiceDraft(saved, { ...draftFor(state), id: 'missing' }, false, at), /nicht mehr vorhanden/)
  assert.equal(saved.invoices.length, 1)
  assert.deepEqual(saved.counters, {})
})

test('P01: ungültige Preise bleiben bei Formular-, direkter Einstellungs- und Reload-Prüfung wirkungslos', async () => withStorage(() => {
  const state = emptyState()
  for (const field of ['privateRate', 'duoRate'] as const) {
    const valid = applyStandardRateInput(state.settings, field, '34,50')
    for (const raw of ['', ' ', '-', '-1', '-0.01', 'NaN', 'Infinity', '1e309', '1.', '1,', '0x10', '9'.repeat(400)]) {
      assert.equal(parseStandardRate(raw), null, raw)
      assert.equal(applyStandardRateInput(valid, field, raw), valid, raw)
      const persisted = { ...state, settings: updateSettings(state.settings, applyStandardRateInput(valid, field, raw)) }
      assert.equal(roundTrip(persisted).settings[field], 34.5, raw)
    }
    for (const value of [-1, NaN, Infinity, -Infinity, '', null, undefined]) {
      assert.throws(() => updateSettings(state.settings, { ...state.settings, [field]: value as number }), /gültige Preis/)
    }
    for (const [raw, expected] of [['0', 0], ['0,01', 0.01], ['34.50', 34.5], [' 12,345 ', 12.345]] as const) {
      assert.equal(roundTrip({ ...state, settings: applyStandardRateInput(state.settings, field, raw) }).settings[field], expected)
    }
  }
}))

test('P01: historische Belege ohne Stammdaten bleiben samt Betrag, Snapshot und Nummer unverändert', async () => withStorage(() => {
  const initial = families(1)
  let state = saveInvoiceDraft(initial, draftFor(initial), true, at)
  state.guardians = []
  state.students = []
  state = roundTrip(state)
  const original = structuredClone(state)
  const invoice = state.invoices[0]
  assert.throws(() => reopenInvoiceAsDraft(state, invoice.id), /Finalisierte Belege/)
  assert.throws(() => changeInvoiceStatus(state, invoice.id, 'draft'), /Korrekturentwurf/)
  for (const patch of [{ guardianIds: [] }, { items: [] }, { freeText: 'Geändert' }, { invoiceDate: '2026-09-01' }]) {
    assert.throws(() => saveInvoiceDraft(state, { ...invoice, ...patch }, false), /Finalisierte Belege/)
    const altered = { ...state, invoices: [{ ...invoice, ...patch }] }
    assert.throws(() => assertOriginalsPreserved(state, altered), /Finalisierte Belege/)
  }
  assert.throws(() => assertOriginalsPreserved(state, { ...state, invoices: [] }), /Finalisierte Belege/)
  assert.throws(() => assertReplacementAllowed(state), /Austausch/)
  assert.deepEqual(state, original)
  for (const status of ['paid', 'sent', 'overdue'] as const) {
    state = roundTrip(changeInvoiceStatus(state, invoice.id, status, at))
    assert.equal(state.invoices[0].status, status)
    assert.equal(state.invoices[0].number, invoice.number)
    assert.deepEqual(state.invoices[0].items, invoice.items)
    assert.deepEqual(state.invoices[0].snapshot, invoice.snapshot)
    assert.equal(invoiceTotal(state.invoices[0]), 30)
  }
}))

test('P01: verdeckte Empfängerabweichungen und Verlust ungesicherter historischer Referenzen sind gesperrt', () => {
  const state = families()
  const finalized = saveInvoiceDraft(state, draftFor(state), true, at)
  const changed = structuredClone(finalized)
  changed.invoices[0].guardianIds = ['g1']
  assert.throws(() => assertOriginalsPreserved(finalized, changed), /Finalisierte Belege/)
  changed.invoices[0].snapshot!.guardians = [{ ...changed.guardians[1].address, id: 'g1', name: 'Andere Familie', email: '' }]
  assert.throws(() => assertOriginalsPreserved(finalized, changed), /Finalisierte Belege/)
  const historicalSource = legacyFixture(finalized)
  delete historicalSource.invoices[0].snapshot
  const historical = captureLegacyDocuments(historicalSource)
  validateBackupState(historical)
  assert.doesNotThrow(() => validateBackupState({ ...historical, guardians: [], students: [] }), 'P04: gesicherte Version besitzt ihren eigenen historischen Referenzbereich')
  assert.throws(() => validateLegacyV3Structure({ ...historicalSource, guardians: [], students: [] }), /unbekannte Person|unbekanntes Kind/, 'Ungesicherte Alt-Referenzen bleiben geschützt')
})

test('P01: reservierte Nummern bleiben nach abgewiesenem Austausch und Reload belegt', async () => withStorage(() => {
  const state = families(1)
  state.voidedInvoiceNumbers = [{ number: '2026-a-0001', sequence: 1, year: 2026, invoiceDate: '2026-08-01', deletedAt: at, reason: 'reopened', amount: 30, recipient: 'Historische Testfamilie' }]
  assert.throws(() => assertReplacementAllowed(state), /reservierte Nummern/)
  assert.equal(nextInvoiceAllocation(roundTrip(state), '2026-08-01', ['s0']).number, '2026-a-0002')
  assert.doesNotThrow(() => assertReplacementAllowed(emptyState()))
}))

test('P03 ersetzt P01: leerer Browser liest vorhandene/beschädigte/neue Sicherungen und schreibt nicht', async () => {
  for (const raw of [serializeBackup(families()), '{beschädigt', JSON.stringify({ schemaVersion: 99 })]) {
    const directory = fakeDirectory({ 'riffrechnung-backup.json': raw })
    const inspected = await inspectBackupDirectory(directory.handle)
    assert.equal(inspected.entries[0].raw, raw)
    assert.equal(directory.controls.writes, 0)
    assert.equal(directory.files.get('riffrechnung-backup.json'), raw)
  }
  assert.equal((await inspectBackupDirectory(fakeDirectory().handle)).entries.length, 0)
  const denied = fakeDirectory({ 'backup.json': serializeBackup(emptyState()) })
  denied.controls.fail = 'stale'
  await assert.rejects(inspectBackupDirectory(denied.handle), /veraltet/)
})

test('P03 ersetzt P01: veralteter Tab darf auch manuelles und automatisches Backup nicht schreiben', async () => withStorage(async () => {
  seedState(families(1))
  const lock = sharedLock()
  const current = new StorageSession({ lock })
  const stale = new StorageSession({ lock })
  const directory = fakeDirectory()
  const binding = { handle: directory.handle, datasetId: current.revision!.datasetId, legacyFiles: [] }
  await current.connect(binding)
  await stale.connect(binding)
  await current.backup()
  await current.change((state) => ({ ...state, settings: { ...state.settings, accountHolder: 'Neu' } }))
  const before = [...directory.files]
  await Promise.all([assert.rejects(stale.backup(), /anderen Tab/), assert.rejects(stale.backup(), /anderen Tab/)])
  assert.deepEqual([...directory.files], before)
}))

test('P03 ersetzt P01: Demo erhält jede begonnene Einstellung, Nutzerdaten und Ordnerkonfiguration', async () => withStorage(async () => {
  for (const initial of [emptyState(), families(), { ...emptyState(), settings: { ...emptyState().settings, issuer: { ...emptyState().settings.issuer, name: 'Begonnen' } } }]) {
    seedState(initial)
    const before = localStorage.getItem(STORAGE_KEY)
    const directory = fakeDirectory({ 'bestehend.json': serializeBackup(initial) })
    const demo = new StorageSession({ mode: 'demo', storage: { getItem: () => { throw new Error('Demo greift auf realen Speicher zu') } } as unknown as Storage, lock: async () => { throw new Error('Demo greift auf reale Sperre zu') } })
    await demo.change((state) => ({ ...state, settings: { ...state.settings, issuer: { ...state.settings.issuer, name: 'Demo verändert' } } }))
    await assert.rejects(demo.connect({ handle: directory.handle, datasetId: 'demo', legacyFiles: [] }), /keine Backup-Ordner/)
    await assert.rejects(demo.backup(), /keine Backup-Ordner/)
    assert.equal(localStorage.getItem(STORAGE_KEY), before)
    assert.equal(directory.controls.writes, 0)
    assert.deepEqual(new StorageSession({ lock: sharedLock() }).state, initial)
  }
}))

test('P01: nur deutsche Konten für Änderungen und Finalisierung; fremde historische Snapshots bleiben original', async () => withStorage(() => {
  assert.equal(germanIbanError('de02 1203 0000 0000 2020 51'), null)
  assert.match(germanIbanError('GB29 NWBK 6016 1331 9268 19') ?? '', /nur deutsche/)
  for (const iban of ['', 'DE02120300000000202052', 'DE0212030000000020205']) assert.match(germanIbanError(iban) ?? '', /gültige deutsche/)
  const state = families(1)
  assert.throws(() => updateSettings(state.settings, { ...state.settings, iban: 'GB29NWBK60161331926819' }), /nur deutsche/)
  let historical = saveInvoiceDraft(state, draftFor(state), true, at)
  historical.settings.iban = 'GB29NWBK60161331926819'
  historical.invoices[0].snapshot!.iban = 'GB29NWBK60161331926819'
  historical = roundTrip(captureLegacyDocuments(legacyFixture(historical)))
  assert.throws(() => updateSettings(historical.settings, { ...historical.settings, accountHolder: 'Neuer Name' }), /nur deutsche/)
  assert.equal(updateSettings(historical.settings, { ...historical.settings, theme: 'dark' }).iban, historical.settings.iban)
  assert.throws(() => saveInvoiceDraft(historical, { ...draftFor(state), items: [createLessonItem('s0', '2026-08-12', state.settings, 'new-item')] }, true), /nur deutsche/)
  const paid = roundTrip(changeInvoiceStatus(historical, historical.invoices[0].id, 'paid', at))
  assert.deepEqual(paid.invoices[0].snapshot, historical.invoices[0].snapshot)
}))
