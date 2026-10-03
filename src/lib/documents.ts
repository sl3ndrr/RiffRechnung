import { assertOriginalsPreserved } from './safety'
import { documentContent } from './documentProjection'
export { documentContent } from './documentProjection'
import { invoiceTotalCents, itemTotalCents, legacyItemCents } from './money'
import type { AppState, DocumentVersion, Invoice, InvoiceDraft, InvoiceSnapshot, InvoicePayment } from '../types'
import { canonical } from './canonical'
import { copyItemsWithFreshIds, freshId } from './identities'
import { billingPeriodFromItems, guardianName, uid } from './utils'
import { validateBackupState } from './validation'
import { liveRecipient } from './recipients'

export function snapshotFor(state: Pick<AppState, 'guardians' | 'students' | 'settings'>, invoice: Invoice): InvoiceSnapshot {
  const recipients = invoice.recipients.flatMap((ref) => {
    const person = liveRecipient(ref, state.guardians, state.students)
    return person ? [person] : []
  })
  return {
    issuer: structuredClone(state.settings.issuer),
    recipients,
    students: invoice.studentIds.flatMap((id) => {
      const student = state.students.find((entry) => entry.id === id)
      return student ? [{ id, name: student.name }] : []
    }),
    accountHolder: state.settings.accountHolder, iban: state.settings.iban,
    bic: state.settings.bic, bankName: state.settings.bankName, legalText: invoice.legalText,
  }
}

// Historical imports use the frozen pre-P05 algorithm; new versions use exact cents.
// The raw inputs, calculated output and any register evidence remain distinct.
export function captureDocument(state: AppState, invoice: Invoice, id: string, historical: boolean): DocumentVersion {
  const snapshot = structuredClone(invoice.snapshot ?? snapshotFor(state, invoice))
  const registerEntries = state.voidedInvoiceNumbers.filter((entry) => entry.number === invoice.number)
  const itemCents = invoice.items.map(historical ? legacyItemCents : itemTotalCents)
  const legacyCalculatedTotalCents = historical ? itemCents.reduce((sum, value) => sum + value, 0) : invoiceTotalCents(invoice)
  const totalCents = registerEntries.length ? Math.round(registerEntries[0].amount * 100) : legacyCalculatedTotalCents
  const parent = invoice.correction && state.documentVersions.find((version) => version.id === invoice.correction?.replacesId)
  const version: DocumentVersion = {
    id, invoiceId: invoice.id, originalId: parent?.originalId ?? id,
    replacesId: parent?.id ?? null, cancelsId: null, reason: invoice.correction?.reason ?? '',
    provenance: historical ? 'oldest-available' : 'issued', sourceUpdatedAt: invoice.updatedAt,
    content: documentContent(invoice), outputSnapshot: snapshot,
    outputPeriod: billingPeriodFromItems(invoice.items, invoice.invoiceDate),
    outputLegalText: historical ? invoice.legalText || invoice.snapshot?.legalText || state.settings.defaultLegalText : invoice.legalText,
    amounts: { itemCents, totalCents, legacyCalculatedTotalCents, source: historical ? registerEntries.length ? 'number-register' : 'legacy-output' : 'decimal-output', calculation: historical ? 'legacy-v1' : 'decimal-v1' },
    conflicts: [], snapshotHistory: structuredClone(state.historicalSnapshotCorrections.filter((event) => event.entityType === 'invoice' && event.entityId === invoice.id && event.snapshotCorrection)),
    registerEntries: structuredClone(registerEntries),
  }
  const conflict = (path: string, message: string, ...values: unknown[]) => version.conflicts.push({ path, message, values: values.map((value) => JSON.stringify(value)) })
  if (!invoice.snapshot) conflict('snapshot', 'Kein historischer Snapshot vorhanden. Nur der jetzt verfügbare Ausgabestand konnte gesichert werden.', null, snapshot)
  if (canonical(invoice.recipients) !== canonical(snapshot.recipients.map(({ type, id }) => ({ type, id })))) conflict('recipients', 'Zuordnung und Snapshot-Empfänger widersprechen sich. Die Ausgabe verwendet den gesicherten Snapshot.', invoice.recipients, snapshot.recipients)
  if (canonical(invoice.studentIds) !== canonical(snapshot.students.map((student) => student.id))) conflict('studentIds', 'Zuordnung und Lernenden-Snapshot widersprechen sich.', invoice.studentIds, snapshot.students)
  if (invoice.snapshot && invoice.legalText !== invoice.snapshot.legalText) conflict('legalText', 'Rechnung und Snapshot enthalten verschiedene Rechtstexte.', invoice.legalText, invoice.snapshot.legalText)
  if (totalCents !== legacyCalculatedTotalCents) conflict('amounts', 'Historischer Registerbetrag und bisherige Rechnungsausgabe weichen ab. Beide Beträge bleiben erhalten; Registerbetrag hat Vorrang.', totalCents, legacyCalculatedTotalCents)
  if (historical && invoice.period !== version.outputPeriod) conflict('period', 'Gespeicherter Zeitraum und bisherige Druckausgabe weichen ab. Beide Angaben bleiben erhalten.', invoice.period, version.outputPeriod)
  for (const entry of registerEntries) {
    const recipient = guardianName({ ...invoice, snapshot }, [])
    if (entry.recipient !== recipient) conflict('numberRegister.recipient', 'Registerempfänger und ausgegebener Snapshot-Empfänger widersprechen sich.', entry.recipient, recipient)
    if (entry.invoiceDate !== invoice.invoiceDate || entry.sequence !== invoice.sequence || entry.year !== invoice.year) conflict('numberRegister', 'Nummernregister und Rechnung widersprechen sich.', entry, { invoiceDate: invoice.invoiceDate, sequence: invoice.sequence, year: invoice.year })
  }
  return version
}

export function versionFor(state: AppState, invoice: Invoice): DocumentVersion | undefined {
  return state.documentVersions.find((version) => version.id === invoice.versionId)
}

/** One projection for view, print and EPC. Empty snapshot values are authoritative. */
export function selectInvoice(state: AppState, invoice: Invoice): Invoice {
  const version = versionFor(state, invoice)
  if (!version) return { ...invoice, year: invoiceYear(invoice), period: billingPeriodFromItems(invoice.items, invoice.invoiceDate) }
  return persistentInvoice({
    ...structuredClone(version.content), year: invoiceYear(version.content), status: paymentStatus(state, version.id), updatedAt: invoice.updatedAt,
    paidAt: confirmedPaymentDay(state, version.id), sentAt: invoice.sentAt, versionId: version.id, correction: invoice.correction,
    openAmountCents: openCents(state, invoice),
    snapshot: structuredClone(version.outputSnapshot), period: version.outputPeriod, legalText: version.outputLegalText,
    issuedAmounts: structuredClone(version.amounts), claimState: isActiveClaim(state, invoice) ? 'active' : 'replaced',
    archived: state.invoiceAdministration.find((admin) => admin.versionId === version.id)?.archived ?? false,
  })
}

export function selectedInvoices(state: AppState): Invoice[] {
  return state.invoices.map((invoice) => selectInvoice(state, invoice))
}

export function isActiveClaim(state: AppState, invoice: Invoice): boolean {
  return Boolean(invoice.versionId) && !state.documentVersions.some((version) => version.replacesId === invoice.versionId || version.cancelsId === invoice.versionId)
}

export function activeInvoices(state: AppState): Invoice[] {
  return selectedInvoices(state).filter((invoice) => isActiveClaim(state, invoice))
}

/** An old stored year remains evidence; new records use the invoice calendar day. */
export function invoiceYear(invoice: Pick<Invoice, 'year' | 'invoiceDate'>): number {
  return invoice.year ?? Number(invoice.invoiceDate.slice(0, 4))
}

export function paymentStatus(state: AppState, versionId: string): 'paid' | 'sent' {
  const version = state.documentVersions.find((entry) => entry.id === versionId)!
  return allocatedCents(state, versionId) >= version.amounts.totalCents ? 'paid' : 'sent'
}

/** No settlement day is inferred while any allocated payment has an unknown day. */
export function confirmedPaymentDay(state: AppState, versionId: string): string | undefined {
  const payments = state.payments.filter((payment) => payment.allocations.at(-1)?.versionId === versionId)
  if (!payments.length || paymentStatus(state, versionId) !== 'paid'
    || payments.some((payment) => payment.paymentDayStatus !== 'confirmed' || !payment.paidAt)) return undefined
  return payments.map((payment) => payment.paidAt!).sort().at(-1)
}

export function allocatedCents(state: AppState, versionId: string): number {
  return state.payments.filter((payment) => payment.allocations.at(-1)?.versionId === versionId).reduce((sum, payment) => sum + payment.amountCents, 0)
}

export function openCents(state: AppState, invoice: Invoice): number {
  if (!isActiveClaim(state, invoice)) return 0
  return Math.max(0, (versionFor(state, invoice)?.amounts.totalCents ?? 0) - allocatedCents(state, invoice.versionId!))
}

export function correctionErrors(state: AppState, draft: InvoiceDraft): string[] {
  if (!draft.correction) return []
  const parent = state.documentVersions.find((version) => version.id === draft.correction?.replacesId)
  if (!parent) return ['Der Originalbeleg der Korrektur fehlt.']
  const errors = []
  if (!draft.correction.reason.trim()) errors.push('Bitte einen Korrekturgrund angeben.')
  if (state.documentVersions.some((version) => version.replacesId === parent.id || version.cancelsId === parent.id)) errors.push('Dieser Beleg ist bereits ersetzt. Bitte die neueste Version korrigieren.')
  if (parent.conflicts.length && !state.invoiceAdministration.find((admin) => admin.versionId === parent.id)?.resolutions.length) errors.push('Die historischen Abweichungen müssen zuerst mit einer Begründung geklärt werden.')
  return errors
}

export function createCorrectionDraft(state: AppState, invoiceId: string, reason: string, at = new Date().toISOString()): AppState {
  validateBackupState(state)
  const invoice = state.invoices.find((entry) => entry.id === invoiceId)
  const parent = invoice && versionFor(state, invoice)
  if (!invoice || !parent) throw new Error('Eine Korrektur benötigt einen finalisierten Originalbeleg.')
  if (!reason.trim()) throw new Error('Bitte einen Korrekturgrund angeben.')
  if (!isActiveClaim(state, invoice)) throw new Error('Bitte die neueste Version korrigieren.')
  if (state.invoices.some((entry) => entry.status === 'draft' && entry.correction?.replacesId === parent.id)) throw new Error('Für diesen Beleg gibt es bereits einen Korrekturentwurf.')
  const draft: Invoice = {
    ...structuredClone(parent.content), id: freshId('invoice', new Set(state.invoices.map((entry) => entry.id)), uid),
    number: null, sequence: null, stateModel: 'derived-v1', status: 'draft', legalText: parent.outputLegalText, draftPrintSnapshot: structuredClone(parent.outputSnapshot),
    items: copyItemsWithFreshIds(parent.content.items, new Set(state.invoices.flatMap((entry) => entry.items.map((item) => item.id))), uid),
    correction: { replacesId: parent.id, reason: reason.trim() }, createdAt: at, updatedAt: at,
  }
  for (const field of ['year', 'period', 'paidAt']) Reflect.deleteProperty(draft, field)
  const next = { ...state, invoices: [...state.invoices, persistentInvoice(draft)] }
  validateBackupState(next)
  return next
}

export function reassignCorrectionStudent(draft: InvoiceDraft, oldId: string, newId: string): InvoiceDraft {
  if (!draft.correction) throw new Error('Die Neuzuordnung benötigt einen Korrekturentwurf.')
  return { ...draft, studentIds: [...new Set(draft.studentIds.map((id) => id === oldId ? newId : id))], items: draft.items.map((item) => item.studentId === oldId ? { ...item, studentId: newId } : item),
    recipients: draft.recipients.map((ref) => ref.type === 'student' && ref.id === oldId ? { ...ref, id: newId } : ref) }
}

export function archiveInvoice(state: AppState, invoiceId: string, archived = true): AppState {
  validateBackupState(state)
  const invoice = state.invoices.find((entry) => entry.id === invoiceId)
  if (!invoice?.versionId) throw new Error('Nur finalisierte Belege können archiviert werden.')
  const next = { ...state, invoiceAdministration: state.invoiceAdministration.map((admin) => admin.versionId === invoice.versionId ? { ...admin, archived } : admin) }
  validateBackupState(next)
  return next
}

export function resolveDocumentConflicts(state: AppState, versionId: string, reason: string, at = new Date().toISOString()): AppState {
  validateBackupState(state)
  if (!reason.trim()) throw new Error('Bitte das Ergebnis der Klärung dokumentieren. Die gesicherten Angaben bleiben unverändert.')
  if (!state.documentVersions.some((version) => version.id === versionId)) throw new Error('Der Beleg fehlt.')
  const next = { ...state, invoiceAdministration: state.invoiceAdministration.map((admin) => admin.versionId === versionId ? { ...admin, resolutions: [...admin.resolutions, { at, reason: reason.trim() }] } : admin) }
  validateBackupState(next)
  return next
}

/** Keep the administration trail; the current payment state is always projected. */
export function recordPaymentChange(state: AppState, versionId: string, at: string, reason: string): AppState {
  const status = paymentStatus(state, versionId)
  return {
    ...state,
    invoices: state.invoices.map((invoice) => invoice.versionId === versionId ? { ...invoice, updatedAt: at } : invoice),
    invoiceAdministration: state.invoiceAdministration.map((admin) => admin.versionId === versionId ? { ...admin, events: [...admin.events, { at, kind: 'status', status, reason }] } : admin),
  }
}

export function allocatePayment(state: AppState, paymentId: string, versionId: string | null, reason: string, at = new Date().toISOString()): AppState {
  validateBackupState(state)
  const payment = state.payments.find((entry) => entry.id === paymentId)
  if (!payment || !reason.trim()) throw new Error('Eine vorhandene Zahlung und ein Zuordnungsgrund werden benötigt.')
  const source = state.documentVersions.find((version) => version.id === payment.sourceVersionId)!
  const target = state.documentVersions.find((version) => version.id === versionId)
  if (versionId && (!target || target.originalId !== source.originalId)) throw new Error('Zahlungen dürfen nur innerhalb derselben Korrekturbeziehung zugeordnet werden.')
  const previousId = payment.allocations.at(-1)?.versionId
  let next = { ...state, payments: state.payments.map((entry) => entry.id === paymentId ? { ...entry, allocations: [...entry.allocations, { versionId, at, reason: reason.trim() }] } : entry) }
  for (const id of new Set([previousId, versionId])) if (id) next = recordPaymentChange(next, id, at, reason)
  assertOriginalsPreserved(state, next)
  validateBackupState(next)
  return next
}

export function snapshotDifferences(before: unknown, after: unknown, path = ''): { path: string; before: string; after: string }[] {
  if (canonical(before) === canonical(after)) return []
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const a = before as Record<string, unknown>; const b = after as Record<string, unknown>
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) => snapshotDifferences(a[key], b[key], path ? `${path}.${key}` : key))
  }
  return [{ path, before: JSON.stringify(before) ?? 'Nicht vorhanden', after: JSON.stringify(after) ?? 'Nicht vorhanden' }]
}


/** Optional fields use absence in both memory and JSON, never explicit undefined. */
export function persistentInvoice(invoice: Invoice): Invoice {
  const result = { ...invoice }
  for (const [key, value] of Object.entries(result)) if (value === undefined) Reflect.deleteProperty(result, key)
  return result
}

export function unknownPaymentDayLabel(payment: InvoicePayment): string {
  return payment.legacyPaymentDay
    ? `Zahlungsdatum unbekannt (bisheriger unbestätigter Wert: ${payment.legacyPaymentDay})`
    : 'Zahlungsdatum unbekannt'
}
