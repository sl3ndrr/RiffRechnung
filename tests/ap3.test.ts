import { legacyVersionedFixture } from './documentFixtures'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { saveGuardianState } from '../src/lib/commands'
import { emptyState } from '../src/lib/defaults'
import { inspectImport } from '../src/lib/importState'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { requireSuccess } from '../src/lib/result'
import type { AppState, Guardian, InvoiceDraft } from '../src/types'

const at = '2026-09-25T12:00:00.000Z'
function family(): AppState {
  const state = emptyState()
  state.settings = { ...state.settings, issuer: { ...state.settings.issuer, name: 'Synthetisches Studio', street: 'Testweg 1', postalCode: '12345', city: 'Testort' }, accountHolder: 'Synthetisches Studio', iban: 'DE89370400440532013000' }
  state.guardians = [{ id: 'contact',   name: 'Anna Beispiel', email: '', phone: '', address: { street: '', postalCode: '', city: '' },   createdAt: at, updatedAt: at }]
  state.students = [{ id: 'child', name: 'Kind', billingCode: 'a', guardianIds: ['contact'],  active: true, createdAt: at, updatedAt: at }]
  return state
}
function draft(price: number): InvoiceDraft {
  return { invoiceDate: '2026-09-25', dueDate: '2026-10-09', period: 'September 2026', recipients: (['contact']).map((id) => ({ type: 'guardian' as const, id })), studentIds: ['child'], recipientStrategy: 'joint', items: [{ id: 'item-1', studentId: 'child', serviceDate: '2026-09-25', lessonType: 'solo', description: 'Unterricht', quantity: 1, unit: 'Std.', unitPrice: price }], freeText: '', }
}
function print(state: AppState): string {
  return renderToStaticMarkup(createElement(InvoicePrint, { invoice: state.invoices[0], guardians: state.guardians, students: state.students, settings: state.settings }))
}

test('AP3: neuer Kontakt verlangt einen Namen ohne Leer- und Steuerzeichen; Rest ist optional', () => {
  const state = family(), contact = state.guardians[0]
  const newFamily = { ...state, guardians: [], students: [] }
  for (const value of ['', '   ', '\n']) {
    assert.equal(saveGuardianState(newFamily, { ...contact, name: value }).ok, false)
  }
  assert.equal(saveGuardianState(newFamily, { ...contact, name: 'A'.repeat(242) }).ok, false)
  assert.deepEqual(requireSuccess(saveGuardianState(newFamily, contact)).guardians[0], contact)
})

test('AP3: fünf mehrteilige Altnamen bleiben nach 7→9, Export und Import unverändert', () => {
  const state = emptyState()
  const names = ['Anna Maria von Weber', 'Familie Müller', 'Müller-Lüdenscheidt, Anna', 'Dr. Ali Yılmaz', 'Madonna']
  state.guardians = names.map((name, i): Guardian => ({ id: `legacy-${i}`, name, email: '', phone: '', address: { street: '', postalCode: '', city: '' },   createdAt: at, updatedAt: at }))
  const legacy = legacyVersionedFixture(state, 7)
  const before = JSON.stringify(legacy)
  const preview = requireSuccess(inspectImport(before))
  assert.equal(preview.report?.fromSchema, 7)
  assert.equal(preview.report?.toSchema, 15)
  assert.deepEqual(preview.state.guardians.map(({ name }) => name), names)
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
  state.guardians[0].name = 'Später geändert'
  state.guardians[0].address.street = 'Späterweg 7'
  state.settings.issuer.name = 'Späteres Studio'
  assert.equal(print(state), initial)
})

test('AP3: Altentwurf ohne damals gesicherte Druckdaten übernimmt keine heutigen Namen oder Kontodaten', () => {
  const state = saveInvoiceDraft(family(), draft(30), false, at)
  delete state.invoices[0].draftPrintSnapshot
  state.guardians[0].name = 'Heutiger Kontakt'
  state.settings.issuer.name = 'Heutiger Aussteller'
  const output = print(state)
  assert.match(output, /ENTWURF/)
  assert.doesNotMatch(output, /Heutiger Kontakt|Heutiger Aussteller|Heutiger Rechtstext/)
  assert.doesNotMatch(output, /<dt>Straße:<\/dt>|<dt>PLZ\/Ort:<\/dt>|<p class="invoice-senderline"><\/p>/)
})


