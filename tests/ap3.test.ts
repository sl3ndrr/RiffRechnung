import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { prepareInvoiceCopy, saveGuardianState } from '../src/lib/commands'
import { createCorrectionDraft } from '../src/lib/documents'
import { emptyState } from '../src/lib/defaults'
import { inspectImport } from '../src/lib/importState'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { invoiceFinalizationErrors } from '../src/lib/utils'
import { validateBackupState } from '../src/lib/validation'
import { requireSuccess } from '../src/lib/result'
import type { AppState, Guardian, InvoiceDraft } from '../src/types'

const at = '2026-09-25T12:00:00.000Z'
function family(): AppState {
  const state = emptyState()
  state.settings = { ...state.settings, issuer: { ...state.settings.issuer, name: 'Synthetisches Studio', street: 'Testweg 1', postalCode: '12345', city: 'Testort' }, accountHolder: 'Synthetisches Studio', iban: 'DE89370400440532013000', taxIdentifier: { kind: 'tax-number', value: '12/345/67890' } }
  state.guardians = [{ id: 'contact', firstName: 'Anna', lastName: 'Beispiel', name: 'Anna Beispiel', email: '', phone: '', address: { street: '', postalCode: '', city: '' }, iban: '', paymentNote: '', createdAt: at, updatedAt: at }]
  state.students = [{ id: 'child', name: 'Kind', billingCode: 'a', guardianIds: ['contact'], note: '', active: true, createdAt: at, updatedAt: at }]
  return state
}
function draft(price: number, kind: 'standard' | 'small-amount' = 'standard'): InvoiceDraft {
  return { invoiceKind: kind, invoiceDate: '2026-09-25', dueDate: '2026-10-09', period: 'September 2026', guardianIds: ['contact'], studentIds: ['child'], recipientStrategy: 'joint', items: [{ id: 'item-1', studentId: 'child', serviceDate: '2026-09-25', lessonType: 'solo', description: 'Unterricht', quantity: 1, unit: 'Std.', unitPrice: price }], introText: 'Unterricht', freeText: '', legalText: 'Steuerbefreiung für Kleinunternehmer (§ 19 UStG).' }
}
function print(state: AppState): string {
  return renderToStaticMarkup(createElement(InvoicePrint, { invoice: state.invoices[0], guardians: state.guardians, students: state.students, settings: state.settings }))
}

test('AP3: neuer Kontakt verlangt getrennte Namen ohne Leer- und Steuerzeichen; Rest ist optional', () => {
  const state = family(), contact = state.guardians[0]
  const newFamily = { ...state, guardians: [], students: [] }
  for (const value of ['', '   ', '\n']) {
    assert.equal(saveGuardianState(newFamily, { ...contact, firstName: value }).ok, false)
    assert.equal(saveGuardianState(newFamily, { ...contact, lastName: value }).ok, false)
  }
  assert.equal(saveGuardianState(newFamily, { ...contact, firstName: 'A'.repeat(121) }).ok, false)
  assert.deepEqual(requireSuccess(saveGuardianState(newFamily, contact)).guardians[0], contact)
})

test('AP3: fünf mehrteilige Altnamen bleiben nach 7→8, Export und Import unverändert', () => {
  const state = emptyState()
  const names = ['Anna Maria von Weber', 'Familie Müller', 'Müller-Lüdenscheidt, Anna', 'Dr. Ali Yılmaz', 'Madonna']
  state.guardians = names.map((name, i): Guardian => ({ id: `legacy-${i}`, name, email: '', phone: '', address: { street: '', postalCode: '', city: '' }, iban: '', paymentNote: '', createdAt: at, updatedAt: at }))
  const legacy = { ...state, schemaVersion: 7 }
  const before = JSON.stringify(legacy)
  const preview = requireSuccess(inspectImport(before))
  assert.equal(preview.report?.fromSchema, 7)
  assert.equal(preview.report?.toSchema, 8)
  assert.deepEqual(preview.state.guardians.map(({ name, firstName, lastName }) => ({ name, firstName, lastName })), names.map((name) => ({ name, firstName: undefined, lastName: undefined })))
  assert.deepEqual(requireSuccess(inspectImport(JSON.stringify(preview.state))).state.guardians, preview.state.guardians)
  assert.equal(preview.rawData, before)
  assert.equal(requireSuccess(inspectImport(JSON.stringify(preview.state))).report, null)
})

test('AP3: Entwurf ohne Anschrift druckt den gesicherten Namen ohne Adresslücke und ohne endgültige Nummer', () => {
  const state = saveInvoiceDraft(family(), draft(249.99), false, at)
  assert.equal(state.invoices[0].number, null)
  const initial = print(state)
  assert.match(initial, /ENTWURF/)
  assert.match(initial, /Anna Beispiel/)
  assert.match(initial, /<div class="invoice-address"><strong>Anna Beispiel<\/strong><\/div>/)
  assert.doesNotMatch(initial, /Adresse fehlt/)
  state.guardians[0].firstName = 'Später'
  state.guardians[0].lastName = 'geändert'
  state.guardians[0].name = 'Später geändert'
  state.guardians[0].address.street = 'Späterweg 7'
  state.settings.issuer.name = 'Späteres Studio'
  assert.equal(print(state), initial)
})

test('AP3: Altentwurf ohne damals gesicherte Druckdaten übernimmt keine heutigen Namen oder Kontodaten', () => {
  const state = saveInvoiceDraft(family(), draft(30), false, at)
  delete state.invoices[0].draftPrintSnapshot
  state.guardians[0].firstName = 'Heutiger'
  state.guardians[0].lastName = 'Kontakt'
  state.guardians[0].name = 'Heutiger Kontakt'
  state.settings.issuer.name = 'Heutiger Aussteller'
  state.settings.defaultLegalText = 'Heutiger Rechtstext'
  state.invoices[0].legalText = ''
  const output = print(state)
  assert.match(output, /ENTWURF/)
  assert.doesNotMatch(output, /Heutiger Kontakt|Heutiger Aussteller|Heutiger Rechtstext/)
  assert.doesNotMatch(output, /<dt>Straße:<\/dt>|<dt>PLZ\/Ort:<\/dt>|<p class="invoice-senderline"><\/p>/)
})

test('AP3: 249,99 und 250,00 als ausdrücklich gewählte Kleinbetragsrechnung ohne Anschrift; 250,01 gesperrt', () => {
  for (const price of [249.99, 250]) {
    const issued = saveInvoiceDraft(family(), draft(price, 'small-amount'), true, at)
    assert.equal(issued.documentVersions[0].amounts.totalCents, Math.round(price * 100))
    assert.equal(issued.documentVersions[0].content.invoiceKind, 'small-amount')
    assert.equal(issued.documentVersions[0].outputSnapshot.invoiceKind, 'small-amount')
    const tampered = structuredClone(issued)
    delete tampered.invoices[0].snapshot!.invoiceKind
    assert.throws(() => validateBackupState(tampered), /invoiceKind/)
    assert.match(print(issued), /Kleinbetragsrechnung nach § 33 UStDV/)
    issued.guardians[0].firstName = 'Nach'
    issued.guardians[0].lastName = 'Abschluss'
    issued.guardians[0].name = 'Nach Abschluss'
    issued.guardians[0].address.street = 'Neuer Weg 2'
    assert.doesNotMatch(print(issued), /Nach Abschluss|Neuer Weg 2/)
    validateBackupState(requireSuccess(inspectImport(JSON.stringify(issued))).state)
  }
  const errors = invoiceFinalizationErrors(family(), draft(250.01, 'small-amount')).join(' ')
  assert.match(errors, /Standardrechnung erforderlich/)
  assert.match(errors, /Straße & Hausnummer fehlt/)
  assert.throws(() => saveInvoiceDraft(family(), draft(250.01, 'small-amount'), true, at), /Standardrechnung erforderlich/)
})

test('AP3: Kopie eines Kleinbetragsbelegs beginnt als Standardrechnung', () => {
  const issued = saveInvoiceDraft(family(), draft(30, 'small-amount'), true, at)
  const copy = requireSuccess(prepareInvoiceCopy(issued, issued.invoices[0].id, new Date('2026-10-25T12:00:00.000Z')))
  assert.equal(copy.invoiceKind, 'standard')
})

test('AP3: Standardrechnung verlangt feldgenau Straße, PLZ und Ort; Korrektur über Grenze sperrt erneut', () => {
  const state = family()
  const errors = invoiceFinalizationErrors(state, draft(30)).join(' ')
  assert.match(errors, /Familien → Anna Beispiel: Straße & Hausnummer fehlt/)
  assert.match(errors, /PLZ fehlt/)
  assert.match(errors, /Ort fehlt/)
  const issued = saveInvoiceDraft(state, draft(249.99, 'small-amount'), true, at)
  const corrected = createCorrectionDraft(issued, issued.invoices[0].id, 'Synthetische Korrektur', at)
  const correction = corrected.invoices.find((entry) => entry.status === 'draft')!
  const edited = { ...draft(250.01, 'small-amount'), id: correction.id, correction: correction.correction, items: correction.items.map((item) => ({ ...item, unitPrice: 250.01 })) }
  assert.throws(() => saveInvoiceDraft(corrected, edited, true, at), /Standardrechnung erforderlich/)
  assert.equal(corrected.documentVersions.length, 1)
})
