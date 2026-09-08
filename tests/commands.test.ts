import { legacyFixture } from './documentFixtures'
import { seedState, sharedLock } from './storageHarness'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppState, Invoice, InvoiceDraft } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { prepareInvoiceCopy, prepareNewInvoice, saveGuardianState, saveInvoiceState, saveSettingsState, saveStudentState } from '../src/lib/commands'
import { changeInvoiceStatus, invoiceDraftErrors, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { copyItemsWithFreshIds } from '../src/lib/identities'
import { inspectImport, inspectImportBytes, serializeMigrationReport } from '../src/lib/importState'
import { buildMailto, mailboxError } from '../src/lib/mailbox'
import { requireSuccess } from '../src/lib/result'
import { applyStandardRateInput, parseStandardRate } from '../src/lib/settings'
import { applyItemNumberInput, adjustQuantity, itemNumberInput, MAX_PRICE, parsePaymentTermInput, validId } from '../src/lib/values'
import { StorageSession, loadState, parseBackup, serializeBackup, STORAGE_KEY, validateBackupState } from '../src/lib/storage'
import { createLessonItem, invoiceTotal, mailtoUrl, nextInvoiceAllocation } from '../src/lib/utils'
import { ImportReviewContent } from '../src/views/ImportReview'

const at = '2026-09-06T12:00:00.000Z'

function family(count = 1): AppState {
  let state = emptyState()
  state.updatedAt = at
  state = requireSuccess(saveSettingsState(state, { ...state.settings, issuer: { ...state.settings.issuer, name: 'Synthetisches Teststudio', street: 'Testweg 1', postalCode: '12345', city: 'Teststadt', email: 'studio+test@example.org' }, accountHolder: 'Teststudio', iban: 'DE02120300000000202051', invoiceProfile: 'small-business', taxIdentifier: { kind: 'tax-number', value: '12/345/67890' } }))
  for (let index = 0; index < count; index++) state = requireSuccess(saveGuardianState(state, {
    id: `g${index}`, name: `Testperson ${index}`, email: `test${index}@example.org`, phone: '', address: { street: 'Testweg 1', postalCode: '12345', city: 'Teststadt' }, iban: '', paymentNote: '', createdAt: at, updatedAt: at,
  }))
  return requireSuccess(saveStudentState(state, { id: 's0', name: 'Testkind', billingCode: '', guardianIds: state.guardians.map((guardian) => guardian.id), note: '', active: true, createdAt: at, updatedAt: at }))
}

function draft(state: AppState): InvoiceDraft {
  return { invoiceDate: '2026-08-15', dueDate: '2026-08-29', period: 'August 2026', guardianIds: ['g0'], studentIds: ['s0'], recipientStrategy: 'joint', items: [createLessonItem('s0', '2026-08-05', state.settings, 'original-item')], introText: 'Einleitung', freeText: 'Hinweis\nZweite Zeile', legalText: 'Historischer Text' }
}

async function withStorage(run: (entries: Map<string, string>) => void | Promise<void>): Promise<void> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const entries = new Map<string, string>()
  const storage: Storage = {
    get length() { return entries.size }, clear: () => entries.clear(), getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null, removeItem: (key) => entries.delete(key), setItem: (key, value) => { entries.set(key, value) },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  try { await run(entries) } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

function roundTrip(state: AppState): AppState {
  validateBackupState(state)
  const imported = parseBackup(serializeBackup(state))
  assert.deepEqual(imported, state, 'kein neuer Zeitstempel und keine passive Normalisierung')
  assert.deepEqual(parseBackup(JSON.stringify(imported)), state)
  seedState(imported)
  const loaded = loadState()
  if (loaded.status !== 'ready') assert.fail(loaded.error)
  assert.deepEqual(loaded.state, state)
  return loaded.state
}

function legacyCopies(count: number, finalized: boolean) {
  const state = family(count)
  const candidate = draft(state)
  candidate.items[0].unitPrice = 0.67
  candidate.items[0].quantity = 1.5
  const saved = saveInvoiceDraft(state, candidate, finalized, at).invoices[0]
  state.invoices = state.guardians.map((guardian, index): Invoice => ({
    ...structuredClone(saved), id: `old-copy-${index}`, guardianIds: [guardian.id], recipientStrategy: 'separate',
    number: finalized ? `2026-a-${String(index + 1).padStart(4, '0')}` : null, sequence: finalized ? index + 1 : null,
    ...(saved.snapshot ? { snapshot: { ...structuredClone(saved.snapshot), guardians: [{ id: guardian.id, name: guardian.name, email: guardian.email, ...guardian.address }] } } : {}),
  }))
  state.counters = { '2026:a': count + 1 }
  state.voidedInvoiceNumbers = [{ number: '2026-a-0099', sequence: 99, year: 2026, invoiceDate: '2026-08-15', deletedAt: at, reason: 'deleted', amount: 30, recipient: 'Testperson' }]
  return { ...legacyFixture(state), schemaVersion: 2 }
}

function legacyRaw(data: unknown, app = 'riffrechnung'): string {
  return '\uFEFF  ' + JSON.stringify({ app, exportedAt: at, schemaVersion: 2, data }, null, 2) + '\r\n'
}

test('P02: unvollständiger Entwurf bleibt nach Erzeugen, Export–Import und Reload gültig', async () => withStorage(() => {
  const initial = emptyState()
  const prepared = requireSuccess(prepareNewInvoice(initial))
  assert.deepEqual(invoiceDraftErrors(initial, prepared), [])
  const saved = requireSuccess(saveInvoiceState(initial, prepared, false, at))
  assert.equal(saved.invoices.length, 1)
  assert.equal(saved.invoices[0].number, null)
  assert.deepEqual(saved.invoices[0].items, [])
  assert.deepEqual(saved.invoices[0].guardianIds, [])
  assert.deepEqual(saved.counters, {})
  roundTrip(saved)
  assert.throws(() => changeInvoiceStatus(saved, saved.invoices[0].id, 'sent', at), /Finalisieren nicht möglich/)
  assert.deepEqual(initial.invoices, [])
}))

test('P02: Personen, Kinder und Einstellungen liefern echte Ergebniszustände oder strukturierte Fehler', async () => withStorage(() => {
  let state = roundTrip(family())
  const original = structuredClone(state)
  const invalid = saveGuardianState(state, { ...state.guardians[0], email: 'a@example.org?bcc=b@example.org' })
  assert.equal(invalid.ok, false)
  if (invalid.ok) assert.fail('Ungültige E-Mail gespeichert')
  assert.equal(invalid.errors[0].path, 'guardians[0].email')
  assert.equal(invalid.errors[0].code, 'INVALID_STATE')
  assert.deepEqual(state, original)
  assert.equal(saveStudentState(state, { ...state.students[0], guardianIds: ['missing'] }).ok, false)
  state = roundTrip(requireSuccess(saveStudentState(state, { ...state.students[0], name: 'Umbenannt', billingCode: 'z' })))
  assert.equal(state.students[0].billingCode, 'a')
  const another = requireSuccess(saveStudentState({ ...state, nextStudentCodeIndex: 0 }, { ...state.students[0], id: 's1', billingCode: '' }))
  assert.deepEqual(another.students.map((student) => student.billingCode), ['a', 'b'])
  roundTrip(another)
  for (const id of ['', ' ', '\n', 'a?b', 'a/b', 'ä', 'x'.repeat(201)]) assert.equal(saveGuardianState(state, { ...state.guardians[0], id }).ok, false)
}))

test('P02: Kopierbefehl erhält Inhalte und Originale mit neuen global eindeutigen Positions-IDs', async () => withStorage(() => {
  const initial = family()
  let state = saveInvoiceDraft(initial, draft(initial), true, at)
  const original = structuredClone(state.invoices[0])
  for (let index = 0; index < 3; index++) {
    const copied = requireSuccess(prepareInvoiceCopy(state, original.id, new Date('2026-09-15T12:00:00.000Z')))
    assert.equal(copied.items[0].serviceDate, '2026-09-05')
    assert.equal(copied.freeText, original.freeText)
    assert.equal(copied.legalText, original.legalText)
    assert.equal(invoiceTotal(copied), invoiceTotal(original))
    state = roundTrip(requireSuccess(saveInvoiceState(state, copied, false, at)))
  }
  const ids = state.invoices.flatMap((invoice) => invoice.items.map((item) => item.id))
  assert.equal(new Set(ids).size, 4)
  assert.ok(ids.every(validId))
  assert.deepEqual(state.invoices[0], original)
  assert.deepEqual(state.counters, { '2026:a': 2 })
  assert.equal(state.invoices.filter((invoice) => invoice.number).length, 1)
}))

test('P02: Kopieren entfernt keine historischen Referenzen oder Positionen', () => {
  const initial = family()
  const state = saveInvoiceDraft(initial, draft(initial), true, at)
  state.students = []
  state.guardians = []
  const before = structuredClone(state)
  const copy = prepareInvoiceCopy(state, state.invoices[0].id)
  assert.equal(copy.ok, false)
  if (!copy.ok) assert.match(copy.errors[0].message, /keine Position oder Referenz wurde entfernt/)
  assert.deepEqual(state, before)
  assert.deepEqual(parseBackup(serializeBackup(state)), state)
})

test('P02: gemeinsame ID-Funktion erkennt Generatorfehler und Kollisionen auch für spätere Teilung', () => {
  const items = draft(family()).items
  const queue = ['original-item', 'already-used', 'fresh-item']
  const copies = copyItemsWithFreshIds(items, new Set(['already-used']), () => queue.shift()!)
  assert.equal(copies[0].id, 'fresh-item')
  assert.deepEqual({ ...copies[0], id: items[0].id }, items[0])
  assert.throws(() => copyItemsWithFreshIds(items, new Set(), () => 'original-item'), /keine eindeutige Identität/)
  assert.throws(() => copyItemsWithFreshIds(items, new Set(), () => ''), /ungültige Identität/)
  assert.throws(() => createLessonItem('s0', '2026-09-01', family().settings, ''), /gültige Positions/)
})

for (const count of [2, 3]) for (const finalized of [false, true]) test(`P02: ${count} bekannte ${finalized ? 'finalisierte' : 'Entwurfs-'}Empfängerkopien werden verlustfrei und idempotent repariert`, async () => withStorage(async (entries) => {
  const legacy = legacyCopies(count, finalized)
  const before = structuredClone(legacy)
  const raw = legacyRaw(legacy)
  entries.set(STORAGE_KEY, raw)
  const loaded = loadState()
  assert.equal(loaded.status, 'recovery')
  assert.equal(entries.get(STORAGE_KEY), raw)
  const preview = requireSuccess(inspectImportBytes(new TextEncoder().encode(raw)))
  assert.equal(preview.rawData, raw)
  assert.equal(preview.report?.version, 1)
  assert.equal(preview.report?.idMappings.length, count - 1)
  assert.deepEqual(preview.state.invoices.map(invoiceTotal), before.invoices.map(invoiceTotal))
  assert.deepEqual(preview.state.invoices.map((invoice) => invoice.number), before.invoices.map((invoice) => invoice.number))
  assert.deepEqual(preview.state.invoices.map((invoice) => invoice.snapshot), before.invoices.map((invoice) => invoice.snapshot))
  assert.deepEqual(preview.state.counters, before.counters)
  assert.deepEqual(preview.state.voidedInvoiceNumbers, before.voidedInvoiceNumbers)
  preview.state.invoices.forEach((invoice, index) => assert.deepEqual({ ...invoice, versionId: undefined, items: invoice.items.map((item, itemIndex) => ({ ...item, id: before.invoices[index].items[itemIndex].id })) }, { ...before.invoices[index], versionId: undefined }))
  assert.deepEqual(legacy, before)
  const report = JSON.parse(serializeMigrationReport(preview))
  assert.deepEqual(new TextEncoder().encode(report.originalUtf8), new TextEncoder().encode(raw))
  assert.deepEqual(requireSuccess(inspectImport(raw)), preview, 'deterministische Wiederholung am gleichen Altbestand')
  const again = requireSuccess(inspectImport(serializeBackup(preview.state)))
  assert.equal(again.report, null)
  assert.deepEqual(again.state, preview.state)
  const recoverySession = new StorageSession({ lock: sharedLock() })
  await assert.rejects(recoverySession.change(() => preview.state), /Rohdaten/)
  assert.equal(entries.get(STORAGE_KEY), raw)
  // Package 03: confirmed repair now traverses the production write service.
  assert.deepEqual(await recoverySession.restore(raw), preview.state)
  const archive = JSON.parse(JSON.parse(recoverySession.exportRecoveryArchive()).recoveries[0].raw)
  assert.equal(archive.previousRaw, raw)
  assert.equal(archive.sourceRaw, raw)
  assert.deepEqual(archive.report, preview.report)
  const reloaded = new StorageSession({ lock: sharedLock() })
  assert.deepEqual(reloaded.state, preview.state)
  assert.equal(requireSuccess(inspectImport(reloaded.export())).report, null)
  await reloaded.restore(raw)
  assert.deepEqual(reloaded.state, preview.state, 'erneute bestätigte Übernahme repariert keine weiteren IDs')
  assert.equal(reloaded.revision?.revision, 2)
  // Only the synthetic destination is cleared, modeling an empty browser profile.
  entries.clear()
  const destination = new StorageSession({ lock: sharedLock() })
  roundTrip(await destination.restore(serializeBackup(again.state)))
}))

test('P02: Reparatur verweigert unklare Herkunft, lokale Kollisionen und andere Schäden', () => {
  const mutations: Array<(data: ReturnType<typeof legacyCopies>) => void> = [
    (data) => { data.invoices[1].items[0].unitPrice = -1 },
    (data) => { data.settings.privateRate = -1 },
    (data) => { data.invoices[1].items[0].unitPrice = 17 },
    (data) => { data.invoices[1].createdAt = '2026-09-07T12:00:00.000Z' },
    (data) => { data.invoices[1].recipientStrategy = 'joint' },
    (data) => { data.invoices[1].guardianIds = ['g0'] },
    (data) => { data.invoices[1].studentIds = ['missing'] },
    (data) => { data.invoices[1].items.push(structuredClone(data.invoices[1].items[0])) },
    (data) => { Object.assign(data.invoices[1], { itemReferences: ['original-item'] }) },
    (data) => { data.invoices[1].number = data.invoices[0].number },
    (data) => { data.guardians[0].email = 'a@example.org\r\nbcc:b@example.org' },
  ]
  for (const mutate of mutations) {
    const data = legacyCopies(2, true)
    mutate(data)
    const raw = legacyRaw(data)
    assert.equal(inspectImport(raw).ok, false, raw)
    assert.equal(legacyRaw(data), raw)
  }
  assert.equal(inspectImport(legacyRaw(legacyCopies(2, true), 'fremde-app')).ok, false)
  const future = { ...legacyCopies(2, true), schemaVersion: 99 }
  assert.equal(inspectImport(JSON.stringify(future)).ok, false)
  assert.equal(inspectImport(JSON.stringify({ app: 'riffrechnung', exportedAt: at, schemaVersion: 2, data: { ...future, schemaVersion: 3 } })).ok, false)
  assert.equal(inspectImportBytes(Uint8Array.from([0xc3, 0x28])).ok, false)
})

test('P02: Reparatur wählt kollisionsfreie IDs und berührt Snapshot-Referenzbereiche nicht', () => {
  const data = legacyCopies(3, true)
  const unrelated = { ...structuredClone(data.invoices[0]), id: 'unrelated', number: '2026-a-0100', sequence: 100, items: [{ ...data.invoices[0].items[0], id: 'item-v3-1-0' }] }
  data.invoices.push(unrelated)
  const preview = requireSuccess(inspectImport(legacyRaw(data)))
  assert.equal(preview.state.invoices[1].items[0].id, 'item-v3-1-0-1')
  assert.equal(preview.state.invoices[3].items[0].id, 'item-v3-1-0')
  assert.deepEqual(preview.state.invoices.map((invoice) => invoice.snapshot), data.invoices.map((invoice) => invoice.snapshot))
  const currentCollision = { ...data, schemaVersion: 3 }
  assert.equal(inspectImport(JSON.stringify(currentCollision)).ok, false, 'strenger aktueller Import bleibt strikt')
})

test('P02: Schema-2-Normalisierungen sind versioniert; vorhandene Typen, Nummern und Zeitstempel bleiben', () => {
  const state = family()
  const saved = saveInvoiceDraft(state, draft(state), true, at)
  saved.invoices[0].items[0].description = 'Alttext (Duo)'
  saved.invoices[0].items[0].lessonType = 'solo'
  const legacy = JSON.parse(JSON.stringify({ ...legacyFixture(saved), schemaVersion: 2 }))
  delete legacy.students[0].billingCode
  delete legacy.nextStudentCodeIndex
  legacy.settings.numberPattern = '{YYYY}-{NNNN}'
  const preview = requireSuccess(inspectImport(JSON.stringify(legacy)))
  assert.equal(preview.state.invoices[0].items[0].lessonType, 'solo')
  assert.equal(preview.state.invoices[0].number, saved.invoices[0].number)
  assert.equal(preview.state.updatedAt, saved.updatedAt)
  assert.equal(preview.state.students[0].billingCode, 'a')
  assert.ok(preview.report?.changes.some((entry) => entry.path === 'students[0].billingCode'))
  assert.equal(requireSuccess(inspectImport(JSON.stringify(preview.state))).report, null)
  const unsupported = structuredClone(preview.state)
  Reflect.deleteProperty(unsupported.invoices[0].items[0], 'lessonType')
  assert.equal(inspectImport(JSON.stringify(unsupported)).ok, false, 'fehlende aktuelle Pflichtfelder werden nicht normalisiert')
})

test('P02: ungültige Formularzahlen überschreiben weder Preise noch Mengen', async () => withStorage(() => {
  const state = family()
  const item = draft(state).items[0]
  for (const raw of ['', ' ', '-', '-1', 'NaN', 'Infinity', '1e309', '0x10', '1.', '1,', '9'.repeat(400), '0.' + '0'.repeat(400) + '1']) {
    assert.equal(parseStandardRate(raw), null)
    assert.equal(itemNumberInput(raw, 'unitPrice'), null)
    assert.equal(applyItemNumberInput(item, 'unitPrice', raw), item)
    assert.equal(applyStandardRateInput(state.settings, 'privateRate', raw), state.settings)
  }
  for (const raw of ['0', '0.001', '100', '1.005', '99.999', '', '-0.01', 'NaN']) assert.equal(applyItemNumberInput(item, 'quantity', raw), item)
  assert.equal(adjustQuantity(0.01, -1), 0.01)
  assert.equal(adjustQuantity(99.99, 1), 99.99)
  assert.equal(adjustQuantity(0.75, 1), 1)
  for (const quantity of [0.01, 0.25, 1.5, 99.99]) {
    const candidate = draft(state)
    candidate.items[0] = applyItemNumberInput(candidate.items[0], 'quantity', String(quantity))
    candidate.items[0] = applyItemNumberInput(candidate.items[0], 'unitPrice', '0,005')
    const saved = roundTrip(requireSuccess(saveInvoiceState(state, candidate, false, at)))
    assert.equal(saved.invoices[0].items[0].quantity, quantity)
    assert.equal(saved.invoices[0].items[0].unitPrice, 0.005, 'keine vorgezogene Geldmigration')
  }
  for (const raw of ['', '-1', '1.5', 'NaN', 'Infinity']) assert.equal(parsePaymentTermInput(raw), null)
  assert.equal(parsePaymentTermInput('0'), 0)
}))

test('P02: Preis-, Mengen-, Datums- und Referenzfehler werden in Befehlen und Import gleich abgewiesen', () => {
  const state = family()
  for (const value of [-1, NaN, Infinity, -Infinity, '', null, undefined, MAX_PRICE * 2]) {
    assert.equal(saveSettingsState(state, { ...state.settings, privateRate: value as number }).ok, false)
    const candidate = draft(state)
    candidate.items[0].unitPrice = value as number
    assert.equal(saveInvoiceState(state, candidate, false, at).ok, false)
    const data = saveInvoiceDraft(state, draft(state), false, at)
    data.invoices[0].items[0].unitPrice = value as number
    assert.throws(() => validateBackupState(data))
    assert.equal(inspectImport(JSON.stringify(data)).ok, false)
  }
  for (const field of ['invoiceDate', 'dueDate'] as const) {
    const candidate = { ...draft(state), [field]: '2026-02-30' }
    assert.equal(saveInvoiceState(state, candidate, false, at).ok, false)
  }
  const candidate = draft(state)
  candidate.items[0].unitPrice = MAX_PRICE
  candidate.items[0].quantity = 99.99
  assert.equal(saveInvoiceState(state, candidate, false, at).ok, false, 'Gesamtbetrag darf nicht überlaufen')
  for (const mutate of [
    (value: InvoiceDraft) => { value.items[0].studentId = 'missing' },
    (value: InvoiceDraft) => { value.guardianIds = ['missing'] },
    (value: InvoiceDraft) => { value.studentIds = [] },
    (value: InvoiceDraft) => { value.items[0].id = 'bad id' },
    (value: InvoiceDraft) => { value.items.push(structuredClone(value.items[0])) },
  ]) { const value = draft(state); mutate(value); assert.equal(saveInvoiceState(state, value, false, at).ok, false) }
})

test('P02: Mailbox-Regel und mailto-Kodierung erhalten Sonderzeichen ohne zusätzliche Parameter', () => {
  const valid = ["o'hara+unterricht@example.org", 'a?b&c#d@example.org', "a!$%*+-/=?^_`{|}~@sub.example.org", 'first.last@example.org']
  for (const recipient of valid) {
    assert.equal(mailboxError(recipient), null)
    const url = new URL(buildMailto([recipient, 'second@example.org'], 'Betreff ? & #', 'Hallo\r\nText ? & #'))
    assert.deepEqual([...url.searchParams.keys()], ['subject', 'body'])
    assert.equal(decodeURIComponent(url.pathname), `${recipient},second@example.org`)
    assert.equal(url.hash, '')
    assert.equal(url.searchParams.get('subject'), 'Betreff ? & #')
    assert.equal(url.searchParams.get('body'), 'Hallo\r\nText ? & #')
    const state = family()
    assert.equal(saveGuardianState(state, { ...state.guardians[0], email: recipient }).ok, true)
    const imported = { ...state, guardians: [{ ...state.guardians[0], email: recipient }] }
    assert.equal(inspectImport(JSON.stringify(imported)).ok, true)
  }
  for (const recipient of ['a@example.org?bcc=b@example.org', 'a@example.org&cc=b@example.org', 'a@example.org#x', 'a@example.org\r\nbcc:b@example.org', 'a\n@example.org', 'a@example.org,b@example.org', 'a@example.org;b@example.org', 'Name <a@example.org>', 'a..b@example.org', '.a@example.org', ' a@example.org', 'a@-example.org', 'a@localhost', 'ä@example.org']) {
    assert.ok(mailboxError(recipient), recipient)
    assert.throws(() => buildMailto([recipient], 'Betreff', 'Text'))
    const state = family()
    assert.equal(saveGuardianState(state, { ...state.guardians[0], email: recipient }).ok, false)
    assert.equal(inspectImport(JSON.stringify({ ...state, guardians: [{ ...state.guardians[0], email: recipient }] })).ok, false)
  }
  assert.throws(() => buildMailto(['ok@example.org'], 'Hallo\r\nBcc: b@example.org', ''), /Steuerzeichen/)
})

test('P02: fehlerhafte importierte Mailboxen sind sichtbar, historische Werte bleiben originalgetreu', () => {
  const state = family()
  const raw = JSON.stringify({ ...state, guardians: [{ ...state.guardians[0], email: 'bad@example.org?bcc=x@example.org' }] })
  const review = { bytes: new TextEncoder().encode(raw), result: inspectImport(raw) }
  const markup = renderToStaticMarkup(createElement(ImportReviewContent, { review }))
  assert.match(markup, /Keine Übernahme möglich/)
  assert.match(markup, /guardians\[0\]\.email/)
  assert.match(markup, /Originaldatei exportieren/)
  const historical = saveInvoiceDraft(state, draft(state), true, at)
  historical.invoices[0].snapshot!.guardians[0].email = 'bad@example.org?bcc=x@example.org'
  historical.invoices[0].snapshot!.iban = 'FR1420041010050500013M02606'
  const preview = requireSuccess(inspectImport(JSON.stringify(legacyFixture(historical))))
  assert.equal(preview.warnings.length, 1)
  assert.deepEqual(preview.state.invoices[0].snapshot, historical.invoices[0].snapshot)
  assert.throws(() => mailtoUrl(preview.state.invoices[0], state.guardians, state.students), /ungültige Empfängeradresse/)
  const emptySnapshot = structuredClone(historical.invoices[0])
  emptySnapshot.snapshot!.guardians[0].email = ''
  assert.equal(new URL(mailtoUrl(emptySnapshot, state.guardians, state.students)).pathname, '', 'kein stiller Wechsel auf eine heutige Adresse')
})

test('P03: Import prüft den aktuellen Zielzustand erneut und erhält Nummernreservierungen', async () => withStorage(async () => {
  const initial = family()
  const saved = saveInvoiceDraft(initial, draft(initial), true, at)
  saved.voidedInvoiceNumbers.push({ number: '2026-a-0002', sequence: 2, year: 2026, invoiceDate: '2026-08-15', deletedAt: at, amount: 30, recipient: 'Test', reason: 'deleted' })
  const preview = requireSuccess(inspectImport(serializeBackup(saved)))
  const session = new StorageSession({ lock: sharedLock() })
  const imported = await session.restore(preview.rawData)
  assert.equal(nextInvoiceAllocation(imported, '2026-08-15', ['s0']).number, '2026-a-0003')
  await assert.rejects(session.restore(serializeBackup(emptyState())), /Finalisierte/)
  preview.state = emptyState()
  assert.deepEqual(await session.restore(preview.rawData), saved, 'Vorschau ersetzt nicht die erneut geprüften Eingangsbytes')
  assert.deepEqual(loadState().status === 'ready', true)
}))

test('P02: ältere, beschädigte und unbekannte neuere lokale Daten können auch erzwungen nicht überschrieben werden', async () => withStorage(async (entries) => {
  for (const raw of [legacyRaw(legacyCopies(2, true)), '{bad json', '{"schemaVersion":99}', JSON.stringify({ ...family(), settings: { ...family().settings, privateRate: -1 } })]) {
    entries.set(STORAGE_KEY, raw)
    assert.equal(loadState().status, 'recovery')
    const session = new StorageSession({ lock: sharedLock() })
    await assert.rejects(session.change(() => emptyState()))
    assert.equal(entries.get(STORAGE_KEY), raw)
  }
}))
