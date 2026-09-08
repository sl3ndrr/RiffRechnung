import type { AppState, Invoice, InvoiceDraft } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { saveGuardianState, saveStudentState } from '../src/lib/commands'
import { requireSuccess } from '../src/lib/result'
import type { LegacyState } from '../src/lib/importState'

export const documentAt = '2026-09-07T12:00:00.000Z'
export function documentFamily(): AppState {
  let state = emptyState()
  state.updatedAt = documentAt
  state.settings = { ...state.settings, issuer: { name: 'Synthetisches Studio', street: 'Testweg 1', postalCode: '12345', city: 'Teststadt', phone: '', email: 'studio@example.org' }, accountHolder: 'Studio', iban: 'DE02120300000000202051' }
  for (const id of ['a', 'b']) state = requireSuccess(saveGuardianState(state, { id: `g-${id}`, name: `Empfaenger ${id.toUpperCase()}`, email: `${id}@example.org`, phone: '', address: { street: `Testweg ${id === 'a' ? 2 : 3}`, postalCode: '12345', city: 'Teststadt' }, iban: '', paymentNote: '', createdAt: documentAt, updatedAt: documentAt }))
  for (const id of ['a', 'b']) state = requireSuccess(saveStudentState(state, { id: `s-${id}`, name: `Testkind ${id.toUpperCase()}`, billingCode: '', guardianIds: ['g-a', 'g-b'], note: '', active: true, createdAt: documentAt, updatedAt: documentAt }))
  return state
}
export function documentDraft(): InvoiceDraft {
  return { invoiceDate: '2026-09-01', dueDate: '2026-09-15', period: 'September 2026', guardianIds: ['g-a'], studentIds: ['s-a'], recipientStrategy: 'joint', items: [{ id: 'original-position', studentId: 's-a', serviceDate: '2026-08-15', lessonType: 'solo', description: 'Originaler Unterricht', quantity: .75, unit: 'Std.', unitPrice: 10.10 }], introText: 'Originale Einleitung', freeText: 'Originaler Hinweis', legalText: '' }
}
/** Explicit legacy fixture construction. Never normalize test results with this helper. */
export function legacyFixture(state: AppState): LegacyState {
  const copy = structuredClone(state)
  for (const key of ['documentVersions', 'invoiceAdministration', 'payments', 'historicalSnapshotCorrections']) Reflect.deleteProperty(copy, key)
  for (const invoice of copy.invoices) for (const key of ['calculation', 'versionId', 'correction', 'issuedAmounts', 'claimState', 'archived']) Reflect.deleteProperty(invoice, key)
  return { ...copy, schemaVersion: 3 }

}
export function editable(invoice: Invoice): InvoiceDraft {
  return { id: invoice.id, correction: invoice.correction, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, period: invoice.period, guardianIds: [...invoice.guardianIds], studentIds: [...invoice.studentIds], recipientStrategy: invoice.recipientStrategy, items: structuredClone(invoice.items), introText: invoice.introText, freeText: invoice.freeText, legalText: invoice.legalText }
}

