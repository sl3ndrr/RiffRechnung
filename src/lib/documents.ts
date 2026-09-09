import { invoiceTotalCents, itemTotalCents, legacyItemCents } from './money'
import type { AppState, DocumentContent, DocumentVersion, Invoice, InvoiceDraft, InvoiceSnapshot } from '../types'
import { canonical } from './envelope'
import { copyItemsWithFreshIds, freshId } from './identities'
import { billingPeriodFromItems, guardianName, uid } from './utils'
import { validateBackupState } from './validation'
import { snapshotTaxData } from './invoiceProfile'

export function documentContent(invoice: Invoice): DocumentContent {
  const content = structuredClone(invoice)
  const administrationKeys = ['status', 'paidAt', 'sentAt', 'updatedAt', 'versionId', 'correction', 'issuedAmounts', 'claimState', 'archived']
  for (const key of administrationKeys) Reflect.deleteProperty(content, key)
  return content

}

export function snapshotFor(state: Pick<AppState, 'guardians' | 'students' | 'settings'>, invoice: Invoice): InvoiceSnapshot {
  return {
    issuer: structuredClone(state.settings.issuer),
    guardians: invoice.guardianIds.flatMap((id) => {
      const person = state.guardians.find((entry) => entry.id === id)
      return person ? [{ id, name: person.name, email: person.email, ...person.address }] : []
    }),
    students: invoice.studentIds.flatMap((id) => {
      const student = state.students.find((entry) => entry.id === id)
      return student ? [{ id, name: student.name }] : []
    }),
    accountHolder: state.settings.accountHolder, iban: state.settings.iban,
    bic: state.settings.bic, bankName: state.settings.bankName, legalText: invoice.legalText,
    ...snapshotTaxData(state.settings),
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
  if (canonical(invoice.guardianIds) !== canonical(snapshot.guardians.map((person) => person.id))) conflict('guardianIds', 'Zuordnung und Snapshot-Empfänger widersprechen sich. Die Ausgabe verwendet den gesicherten Snapshot.', invoice.guardianIds, snapshot.guardians)
  if (canonical(invoice.studentIds) !== canonical(snapshot.students.map((student) => student.id))) conflict('studentIds', 'Zuordnung und Snapshot-Kinder widersprechen sich.', invoice.studentIds, snapshot.students)
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

/** One projection for view, print, reminders, EPC and CSV. Empty snapshot values are authoritative. */
export function selectInvoice(state: AppState, invoice: Invoice): Invoice {
  const version = versionFor(state, invoice)
  if (!version) return invoice
  return {
    ...structuredClone(version.content), status: invoice.status, updatedAt: invoice.updatedAt,
    paidAt: invoice.paidAt, sentAt: invoice.sentAt, versionId: version.id, correction: invoice.correction,
    snapshot: structuredClone(version.outputSnapshot), period: version.outputPeriod, legalText: version.outputLegalText,
    issuedAmounts: structuredClone(version.amounts), claimState: isActiveClaim(state, invoice) ? 'active' : 'replaced',
    archived: state.invoiceAdministration.find((admin) => admin.versionId === version.id)?.archived ?? false,
  }
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
    number: null, sequence: null, status: 'draft', snapshot: undefined,
    items: copyItemsWithFreshIds(parent.content.items, new Set(state.invoices.flatMap((entry) => entry.items.map((item) => item.id))), uid),
    correction: { replacesId: parent.id, reason: reason.trim() }, createdAt: at, updatedAt: at,
  }
  const next = { ...state, invoices: [...state.invoices, persistentInvoice(draft)] }
  validateBackupState(next)
  return next
}

export function reassignCorrectionStudent(draft: InvoiceDraft, oldId: string, newId: string): InvoiceDraft {
  if (!draft.correction) throw new Error('Die Neuzuordnung benötigt einen Korrekturentwurf.')
  return { ...draft, studentIds: [...new Set(draft.studentIds.map((id) => id === oldId ? newId : id))], items: draft.items.map((item) => item.studentId === oldId ? { ...item, studentId: newId } : item) }
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

export function syncPaymentStatus(state: AppState, versionId: string, at: string, reason: string): AppState {
  const version = state.documentVersions.find((entry) => entry.id === versionId)!
  const paid = allocatedCents(state, versionId) >= version.amounts.totalCents
  const payment = state.payments.find((entry) => entry.allocations.at(-1)?.versionId === versionId && entry.paymentDayStatus === 'confirmed')
  const status = paid ? 'paid' as const : 'sent' as const
  return {
    ...state,
    invoices: state.invoices.map((invoice) => invoice.versionId === versionId ? persistentInvoice({ ...invoice, status, paidAt: paid ? payment?.paidAt ?? undefined : undefined, updatedAt: at }) : invoice),
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
  for (const id of new Set([previousId, versionId])) if (id) next = syncPaymentStatus(next, id, at, reason)
  validateBackupState(next)
  return next
}

export function recordedPayments(state: AppState, year?: number) {
  return state.payments.filter((payment) => year === undefined || state.documentVersions.find((version) => version.id === payment.sourceVersionId)?.content.year === year)
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
