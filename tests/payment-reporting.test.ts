import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppState, InvoiceDraft } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { createLessonItem } from '../src/lib/utils'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { createCorrectionDraft } from '../src/lib/documents'
import { financialReport, financialReportToCsv } from '../src/lib/reporting'
import { inspectImport } from '../src/lib/importState'
import { parseBackup, serializeBackup } from '../src/lib/storage'

const issuedAt = '2025-12-20T09:00:00.000Z'

function readyState(invoiceDate = '2025-12-20'): AppState {
  const state = emptyState()
  state.settings = {
    ...state.settings,
    issuer: { name: 'Synthetisches Studio', street: 'Testweg 1', postalCode: '12345', city: 'Teststadt', email: 'studio@example.de', phone: '' },
    accountHolder: 'Synthetisches Studio',
    iban: 'DE02120300000000202051',
    invoiceProfile: 'small-business',
    taxIdentifier: { kind: 'tax-number', value: '12/345/67890' },
  }
  state.guardians = [{ id: 'guardian-a', name: 'Familie Beispiel', email: 'familie@example.de', phone: '', address: { street: 'Testweg 2', postalCode: '12345', city: 'Teststadt' }, iban: '', paymentNote: '', createdAt: issuedAt, updatedAt: issuedAt }]
  state.students = [{ id: 'student-a', name: 'Anna Beispiel', billingCode: 'a', guardianIds: ['guardian-a'], note: '', active: true, createdAt: issuedAt, updatedAt: issuedAt }]
  state.nextStudentCodeIndex = 1
  const draft: InvoiceDraft = {
    invoiceDate,
    dueDate: '2026-01-03',
    period: 'Dezember 2025',
    guardianIds: ['guardian-a'],
    studentIds: ['student-a'],
    recipientStrategy: 'joint',
    items: [{ ...createLessonItem('student-a', invoiceDate, state.settings, 'item-payment-report'), quantity: 1, unitPrice: 30 }],
    introText: 'Unterricht',
    freeText: '',
    legalText: state.settings.defaultLegalText,
  }
  return saveInvoiceDraft(state, draft, true, issuedAt)
}

test('P08: Rechnungsvolumen und Zahlungseingang werden über den Jahreswechsel getrennt ausgewertet', () => {
  let state = readyState()
  const invoice = state.invoices[0]
  state = changeInvoiceStatus(state, invoice.id, 'paid', '2026-01-04T08:15:00.000Z', '2026-01-03')

  const billed2025 = financialReport(state, 2025)
  const paid2026 = financialReport(state, 2026)
  assert.equal(billed2025.invoiceVolumeCents, 3000)
  assert.equal(billed2025.paymentIncomeCents, 0)
  assert.equal(paid2026.invoiceVolumeCents, 0)
  assert.equal(paid2026.paymentIncomeCents, 3000)
  assert.equal(paid2026.months[0].paymentIncomeCents, 3000)
  assert.equal(state.payments[0].paidAt, '2026-01-03')
  assert.equal(state.payments[0].recordedAt, '2026-01-04T08:15:00.000Z')
  assert.equal(state.payments[0].paymentDayStatus, 'confirmed')

  const csv = financialReportToCsv(state, 2026)
  assert.match(csv, /"Zahlungseingang";"2025-a-0001";"2025-12-20";"2026-01-03";"Bestätigt"/)
})

test('P08: Nachpflege, Datumskorrektur und Statusrücknahme behalten den Geldfluss ohne Doppelzählung', () => {
  let state = readyState()
  const invoice = state.invoices[0]
  assert.throws(() => changeInvoiceStatus(state, invoice.id, 'paid', '2026-01-04T08:15:00.000Z'), /tatsächlichen Zahlungstag/)
  state = changeInvoiceStatus(state, invoice.id, 'paid', '2026-01-04T08:15:00.000Z', '2026-01-03')
  state = changeInvoiceStatus(state, invoice.id, 'paid', '2026-02-03T08:15:00.000Z', '2026-02-02')
  assert.equal(financialReport(state, 2026).months[0].paymentIncomeCents, 0)
  assert.equal(financialReport(state, 2026).months[1].paymentIncomeCents, 3000)

  state = changeInvoiceStatus(state, invoice.id, 'sent', '2026-02-04T08:15:00.000Z')
  assert.equal(state.invoices[0].status, 'sent')
  assert.equal(financialReport(state, 2026).paymentIncomeCents, 3000)
  assert.equal(financialReport(state, 2026).openClaimsCents, 3000)
  assert.equal(state.payments.length, 1)
  assert.equal(state.payments[0].allocations.at(-1)?.versionId, null)

  state = changeInvoiceStatus(state, invoice.id, 'paid', '2026-02-05T08:15:00.000Z', '2026-02-02')
  assert.equal(state.invoices[0].status, 'paid')
  assert.equal(state.payments.length, 1)
  assert.equal(financialReport(state, 2026).paymentIncomeCents, 3000)
  assert.equal(financialReport(state, 2026).openClaimsCents, 0)
})

test('P08: Schema 6 übernimmt Vollzahlungen mit unbekanntem Zahlungstag einmalig und verlustfrei', () => {
  let current = readyState()
  current = changeInvoiceStatus(current, current.invoices[0].id, 'paid', '2026-01-04T08:15:00.000Z', '2026-01-03')
  const legacy = structuredClone(current) as unknown as { schemaVersion: number; payments: Array<Record<string, unknown>> }
  legacy.schemaVersion = 6
  legacy.payments.forEach((payment) => {
    Reflect.deleteProperty(payment, 'paymentDayStatus')
    Reflect.deleteProperty(payment, 'legacyPaymentDay')
  })

  const preview = inspectImport(JSON.stringify(legacy))
  assert.ok(preview.ok)
  assert.equal(preview.value.report?.migration, 'riffrechnung-to-v7')
  assert.equal(preview.value.report?.fromSchema, 6)
  assert.equal(preview.value.state.payments[0].paidAt, null)
  assert.equal(preview.value.state.payments[0].paymentDayStatus, 'unknown')
  assert.equal(preview.value.state.payments[0].legacyPaymentDay, '2026-01-03')
  assert.equal(financialReport(preview.value.state, 2026).paymentIncomeCents, 0)
  assert.equal(financialReport(preview.value.state, 2026).unknownDatePayments[0].amountCents, 3000)

  const reloaded = parseBackup(serializeBackup(preview.value.state))
  assert.equal(reloaded.schemaVersion, 7)
  const repeatImport = inspectImport(serializeBackup(reloaded))
  assert.ok(repeatImport.ok)
  if (repeatImport.ok) assert.equal(repeatImport.value.report, null)
  assert.equal(reloaded.payments[0].legacyPaymentDay, '2026-01-03')
})

test('P08: korrigierte Belege ersetzen Rechnungsvolumen ohne Zahlungseingänge zu verdoppeln; CSV bleibt formelsicher', () => {
  let state = readyState()
  const original = state.invoices[0]
  state = changeInvoiceStatus(state, original.id, 'paid', '2026-01-04T08:15:00.000Z', '2026-01-03')
  state = createCorrectionDraft(state, original.id, 'Textkorrektur', '2026-02-01T09:00:00.000Z')
  const correction = state.invoices.at(-1)!
  state = saveInvoiceDraft(state, { ...correction, freeText: 'Berichtigter Text' }, true, '2026-02-01T09:00:00.000Z')
  assert.equal(financialReport(state, 2025).invoiceVolumeCents, 3000)
  assert.equal(financialReport(state, 2025).invoices.length, 1)
  assert.equal(financialReport(state, 2026).paymentIncomeCents, 3000)
  assert.equal(state.payments.length, 1)

  state.documentVersions[0].outputSnapshot.guardians[0].name = '=FORMEL'
  const csv = financialReportToCsv(state, 2026)
  assert.ok(csv.includes('"\'=FORMEL"'))
})
