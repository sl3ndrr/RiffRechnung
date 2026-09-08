import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEpcPayload } from '../src/lib/utils'
import { bicError, cleanIban, germanIbanError, isValidGermanIban, normalizeBic, paymentDataErrors, paymentDataForInvoice } from '../src/lib/paymentData'
import { defaultSettings } from '../src/lib/defaults'
import type { Invoice, InvoiceSnapshot } from '../src/types'

const snapshot = (overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot => ({
  issuer: { name: 'Studio Alt', street: 'Altweg 1', postalCode: '12345', city: 'Altstadt', email: '', phone: '' },
  guardians: [], students: [], accountHolder: 'Historisches Studio', iban: 'DE89370400440532013000', bic: '', bankName: 'Historische Bank', legalText: '', ...overrides,
})
const invoice = (outputSnapshot?: InvoiceSnapshot): Invoice => ({
  id: 'invoice-payment', number: '2026-a-0001', sequence: 1, year: 2026, invoiceDate: '2026-09-01', dueDate: '2026-09-15', period: 'September 2026', status: 'sent', guardianIds: [], studentIds: [], recipientStrategy: 'joint', items: [], introText: '', freeText: '', legalText: '', snapshot: outputSnapshot, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
})

test('deutsche IBANs werden normalisiert und nach Format sowie MOD-97 geprüft', () => {
  assert.equal(cleanIban(' de89 3704\u00a00044 0532 0130 00 '), 'DE89370400440532013000')
  assert.equal(isValidGermanIban('de89 3704 0044 0532 0130 00'), true)
  assert.equal(germanIbanError('DE89 3704 0044 0532 0130'), 'Bitte eine deutsche IBAN im Format DE plus 20 Ziffern (insgesamt 22 Zeichen) eingeben.')
  assert.equal(germanIbanError('DE88 3704 0044 0532 0130 00'), 'Die Prüfsumme der deutschen IBAN ist nicht korrekt.')
  assert.equal(germanIbanError('GB29 NWBK 6016 1331 9268 19'), 'Es werden nur deutsche IBANs unterstützt.')
})

test('BIC wird früh normalisiert und nach ISO-9362-Struktur geprüft', () => {
  assert.equal(normalizeBic(' byla de m1 001 '), 'BYLADEM1001')
  assert.equal(bicError('BYLADEM1'), null)
  assert.equal(bicError('BYLADEM1001'), null)
  assert.match(bicError('12LADEM1') ?? '', /4 Buchstaben/)
  assert.match(bicError('BYL1DEM1') ?? '', /4 Buchstaben/)
})

test('Finalisierungs-Zahlungsdaten melden Felder einzeln', () => {
  assert.deepEqual(paymentDataErrors({ accountHolder: '', iban: '', bic: 'INVALID!' }).map((error) => error.field), ['accountHolder', 'iban', 'bic'])
})

test('leere Snapshot-BIC bleibt gegenüber heutigen Einstellungen autoritativ', () => {
  const current = { ...defaultSettings, accountHolder: 'Heutiges Studio', iban: 'DE02120300000000202051', bic: 'BYLADEM1001', bankName: 'Heutige Bank' }
  const historic = invoice(snapshot())
  assert.deepEqual(paymentDataForInvoice(historic, current), { accountHolder: 'Historisches Studio', iban: 'DE89370400440532013000', bic: '', bankName: 'Historische Bank' })
  const fields = buildEpcPayload(historic, current, 30).split('\n')
  assert.equal(fields[4], '')
  assert.equal(fields[5], 'Historisches Studio')
  assert.equal(fields[6], 'DE89370400440532013000')
  assert.equal(fields[7], 'EUR30.00')
})
