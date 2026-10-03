import { selectInvoice } from '../src/lib/documents'
import { documentContent } from '../src/lib/documentProjection'
import type { AppState, Invoice, InvoiceDraft, InvoiceSnapshot, AuditEvent } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { saveGuardianState, saveStudentState } from '../src/lib/commands'
import { requireSuccess } from '../src/lib/result'
import type { LegacyState } from '../src/lib/importState'

export const documentAt = '2026-09-07T12:00:00.000Z'
export function documentFamily(): AppState {
  let state = emptyState()
  state.updatedAt = documentAt
  state.settings = { ...state.settings, issuer: { name: 'Synthetisches Studio', street: 'Testweg 1', postalCode: '12345', city: 'Teststadt', phone: '', email: 'studio@example.org' }, accountHolder: 'Studio', iban: 'DE02120300000000202051' }
  for (const id of ['a', 'b']) state = requireSuccess(saveGuardianState(state, { id: `g-${id}`,   name: `Empfaenger ${id.toUpperCase()}`, email: `${id}@example.org`, phone: '', address: { street: `Testweg ${id === 'a' ? 2 : 3}`, postalCode: '12345', city: 'Teststadt' },   createdAt: documentAt, updatedAt: documentAt }))
  for (const id of ['a', 'b']) state = requireSuccess(saveStudentState(state, { id: `s-${id}`, name: `Testkind ${id.toUpperCase()}`, billingCode: '', guardianIds: ['g-a', 'g-b'],  active: true, createdAt: documentAt, updatedAt: documentAt }))
  return state
}
export function documentDraft(): InvoiceDraft {
  return { invoiceDate: '2026-09-01', dueDate: '2026-09-15', period: 'September 2026', recipients: (['g-a']).map((id) => ({ type: 'guardian' as const, id })), studentIds: ['s-a'], recipientStrategy: 'joint', items: [{ id: 'original-position', studentId: 's-a', serviceDate: '2026-08-15', lessonType: 'solo', description: 'Originaler Unterricht', quantity: .75, unit: 'Std.', unitPrice: 10.10 }], introText: 'Originale Einleitung', freeText: 'Originaler Hinweis', legalText: '' }
}
/** Explicit legacy fixture construction. Never normalize test results with this helper. */
export function legacyFixture(state: AppState): LegacyState {
  const copy = legacyVersionedFixture(state, 3)
  for (const key of ['documentVersions', 'invoiceAdministration', 'payments', 'historicalSnapshotCorrections']) Reflect.deleteProperty(copy, key)
  for (const invoice of copy.invoices) {
    for (const key of ['calculation', 'versionId', 'correction', 'issuedAmounts', 'claimState', 'archived', 'invoiceKind', 'draftPrintSnapshot']) Reflect.deleteProperty(invoice, key)
    if (invoice.status === 'draft') Reflect.deleteProperty(invoice, 'snapshot')
    if (invoice.snapshot) { Reflect.deleteProperty(invoice.snapshot, 'invoiceProfile'); Reflect.deleteProperty(invoice.snapshot, 'taxIdentifier'); Reflect.deleteProperty(invoice.snapshot, 'invoiceKind') }
  }
  for (const guardian of copy.guardians) { Reflect.deleteProperty(guardian, 'firstName'); Reflect.deleteProperty(guardian, 'lastName') }
  Reflect.deleteProperty(copy.settings, 'invoiceProfile')
  Reflect.deleteProperty(copy.settings, 'taxIdentifier')
  return { ...copy, schemaVersion: 3 }

}
/** Build source representations explicitly; never normalize an actual result. */
export function legacyVersionedFixture(state: AppState, schemaVersion: number) {
  const copy = JSON.parse(JSON.stringify(state))
  copy.schemaVersion = schemaVersion
  if (schemaVersion < 14) {
    for (const raw of copy.invoices) {
      const selected = selectInvoice(state, state.invoices.find((entry) => entry.id === raw.id)!)
      raw.year ??= selected.year
      raw.period ??= selected.period
      raw.status = selected.status
      if (selected.paidAt) raw.paidAt = selected.paidAt
      Reflect.deleteProperty(raw, 'stateModel')
    }
    for (const version of copy.documentVersions) {
      const raw = copy.invoices.find((entry: Invoice) => entry.id === version.invoiceId)
      version.content.year = raw.year
      Reflect.deleteProperty(version.content, 'stateModel')
    }
  }
  if (schemaVersion < 13) for (const version of copy.documentVersions) {
    const raw = copy.invoices.find((entry: Invoice) => entry.id === version.invoiceId)
    for (const field of ['snapshot', 'draftPrintSnapshot', 'period', 'legalText']) if (Object.hasOwn(raw, field)) version.content[field] = structuredClone(raw[field])
  }
  if (schemaVersion < 12) Object.assign(copy.settings, { numberPattern: '{YYYY}-{K}-{NNNN}', resetNumberAnnually: true })
  const snapshot = (value: InvoiceSnapshot | undefined | null) => {
    if (!value || schemaVersion >= 11) return
    Reflect.set(value, 'guardians', value.recipients.filter((entry) => entry.type === 'guardian').map((entry) => { const person = { ...entry }; Reflect.deleteProperty(person, 'type'); return person }))
    if (schemaVersion < 8) Reflect.deleteProperty(value, 'recipients')
  }
  const invoice = (value: Pick<Invoice, 'recipients' | 'snapshot' | 'draftPrintSnapshot'>) => {
    if (schemaVersion >= 11) return
    Reflect.set(value, 'guardianIds', value.recipients.filter((entry) => entry.type === 'guardian').map((entry) => entry.id))
    if (schemaVersion < 8) Reflect.deleteProperty(value, 'recipients')
    snapshot(value.snapshot); snapshot(value.draftPrintSnapshot)
  }
  const events = (values: AuditEvent[]) => values.forEach((event) => {
    snapshot(event.snapshotCorrection?.oldValue); snapshot(event.snapshotCorrection?.newValue)
  })
  copy.invoices.forEach(invoice)
  copy.documentVersions.forEach((version: AppState['documentVersions'][number]) => { invoice(version.content); snapshot(version.outputSnapshot); events(version.snapshotHistory) })
  events(copy.audit); events(copy.historicalSnapshotCorrections)
  return copy
}

export function editable(invoice: Invoice): InvoiceDraft {
  return { id: invoice.id, correction: invoice.correction, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, period: invoice.period, recipients: structuredClone(invoice.recipients), studentIds: [...invoice.studentIds], recipientStrategy: invoice.recipientStrategy, items: structuredClone(invoice.items), introText: invoice.introText, freeText: invoice.freeText, legalText: invoice.legalText }
}


/** Expected schema-13 representation only: no repair, migration, or value normalization. */
export function expectedConsolidatedVersions(versions: AppState['documentVersions']): AppState['documentVersions'] {
  return versions.map((version) => {
    const content = { ...version.content }
    for (const key of ['snapshot', 'draftPrintSnapshot', 'period', 'legalText']) Reflect.deleteProperty(content, key)
    return { ...version, content }
  })
}

export function historicalOutputFixture(state: AppState) {
  const old = legacyVersionedFixture(state, 12)
  const invoice = old.invoices[0], version = old.documentVersions[0]
  version.provenance = 'oldest-available'
  invoice.period = 'Abweichender gespeicherter Zeitraum'
  invoice.snapshot.recipients[0].name = 'Abweichender Roh-Empfänger'
  invoice.snapshot.iban = 'DE89370400440532013000'
  invoice.snapshot.students[0].name = 'Abweichender Roh-Leistungsname'
  invoice.legalText = 'P09: vorhandener Rohtext'
  delete invoice.calculation
  version.content = documentContent(invoice, true)
  version.conflicts = [
    { path: 'period', message: 'Historischer Zeitraumkonflikt', values: [JSON.stringify(invoice.period), JSON.stringify(version.outputPeriod)] },
    { path: 'snapshot', message: 'Historische Empfänger-, Konto- und Leistungsdaten', values: [JSON.stringify(invoice.snapshot), JSON.stringify(version.outputSnapshot)] },
    { path: 'amounts', message: 'Register und Ausgabe weichen ab', values: ['900', '757'] },
  ]
  const register = { number: invoice.number, sequence: invoice.sequence, year: invoice.year, invoiceDate: invoice.invoiceDate, deletedAt: documentAt, amount: 9, recipient: 'Abweichender Registerempfänger', reason: 'reopened' }
  old.voidedInvoiceNumbers = [register]
  version.registerEntries = [structuredClone(register)]
  version.amounts = { itemCents: [757], legacyCalculatedTotalCents: 757, totalCents: 900, source: 'number-register', calculation: 'legacy-v1' }
  const event = { id: 'p07-historical-snapshot', at: documentAt, label: 'Vorhandener historischer Nachweis', entityType: 'invoice', entityId: invoice.id,
    snapshotCorrection: { oldValue: structuredClone(invoice.snapshot), newValue: structuredClone(version.outputSnapshot) } }
  old.historicalSnapshotCorrections = [event]
  version.snapshotHistory = [structuredClone(event)]
  return old
}

