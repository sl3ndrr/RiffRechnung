import { duoAudienceErrors, duoForInvoice, duoInvoices, previewDuo } from './duoModel'
import { calendarParts } from './calendar'
import { draftAmountChange, moneyErrors } from './money'
import { allocatedCents, captureDocument, correctionErrors, snapshotFor, persistentInvoice } from './documents'
import { validId } from './values'
import { freshId } from './identities'
import { commandResult } from './result'
import type { AppState, Invoice, InvoiceDraft, InvoiceStatus } from '../types'
import { assertInvoiceEditable, assertOriginalsPreserved } from './safety'
import { validateBackupState } from './validation'
import { billingPeriodFromItems, invoiceFinalizationErrors, nextInvoiceAllocation, parseDate, uid } from './utils'

function requiredPaymentDay(value: string | undefined): string {
  if (!value) throw new Error('Bitte den tatsächlichen Zahlungstag eingeben.')
  try { calendarParts(value) } catch { throw new Error('Bitte einen gültigen tatsächlichen Zahlungstag eingeben.') }
  return value
}

function paymentForFullClaim(state: AppState, versionId: string): { id: string; amountCents: number } | null {
  const version = state.documentVersions.find((entry) => entry.id === versionId)
  const candidates = state.payments.filter((payment) => payment.allocations.at(-1)?.versionId === versionId && payment.amountCents === version?.amounts.totalCents)
  return candidates.length === 1 ? candidates[0] : null
}

function finalizeInvoice(state: AppState, invoice: Invoice, status: InvoiceStatus, at: string, createId: (prefix: string) => string, paymentDay?: string, duoGroupId?: string): AppState {
  const group = duoForInvoice(state, invoice.id)
  if (group && duoInvoices(state, group).length === 2 && group.id !== duoGroupId) throw new Error('Bitte beide Duo-Rechnungen in der gemeinsamen Vorschau abschließen.')
  if (invoice.recipientStrategy === 'separate' && (!invoice.correction ||
    state.documentVersions.find((version) => version.id === invoice.correction?.replacesId)?.content.recipientStrategy !== 'separate')) {
    throw new Error('Historische getrennte Entwürfe dürfen nicht finalisiert werden. Bitte ausdrücklich in einen gemeinsamen Entwurf umwandeln.')
  }
  const errors = [...invoiceFinalizationErrors(state, invoice), ...correctionErrors(state, invoice)]
  if (errors.length) throw new Error(`Finalisieren nicht möglich: ${errors.join(' ')}`)
  if (status === 'paid' && invoice.correction && state.payments.some((payment) => state.documentVersions.find((entry) => entry.id === payment.sourceVersionId)?.originalId === state.documentVersions.find((entry) => entry.id === invoice.correction?.replacesId)?.originalId)) throw new Error('Vorhandene Zahlungen müssen nach der Korrektur manuell zugeordnet werden; eine neue Vollzahlung wird nicht erzeugt.')
  if (!invoice.calculation && draftAmountChange(invoice).changed) throw new Error('Die Betragsberechnung hat sich geändert. Bitte den Entwurf im Editor prüfen und speichern.')
  const confirmedPaymentDay = status === 'paid' ? requiredPaymentDay(paymentDay) : undefined
  const allocation = nextInvoiceAllocation(state, invoice.invoiceDate, invoice.studentIds)
  const finalized: Invoice = {
    ...invoice, calculation: 'decimal-v1', number: allocation.number, sequence: allocation.sequence, status,
    snapshot: snapshotFor(state, invoice), sentAt: at, updatedAt: at,
    ...(confirmedPaymentDay ? { paidAt: confirmedPaymentDay } : {}),
  }
  const version = captureDocument(state, finalized, freshId('version', new Set(state.documentVersions.map((entry) => entry.id)), createId), false)
  finalized.versionId = version.id
  return {
    ...state,
    invoices: state.invoices.map((entry) => entry.id === invoice.id ? finalized : entry),
    counters: { ...state.counters, [allocation.counterKey]: allocation.sequence + 1 },
    documentVersions: [...state.documentVersions, version],
    invoiceAdministration: [...state.invoiceAdministration, { versionId: version.id, archived: false, events: [{ at, status: status as Exclude<InvoiceStatus, 'draft'>, kind: 'status', reason: 'Beleg finalisiert.' }], resolutions: [] }],
    payments: status === 'paid' ? [...state.payments, {
      id: freshId('payment', new Set(state.payments.map((entry) => entry.id)), createId), sourceVersionId: version.id, amountCents: version.amounts.totalCents,
      paidAt: confirmedPaymentDay!, paymentDayStatus: 'confirmed', recordedAt: at, provenance: 'recorded', allocations: [{ versionId: version.id, at, reason: 'Bei Finalisierung als vollständig bezahlt und mit tatsächlichem Zahlungstag erfasst.' }],
    }] : state.payments,
  }
}

export function saveInvoiceDraft(state: AppState, draft: InvoiceDraft, finalize: boolean, at = new Date().toISOString(), createId: (prefix: string) => string = uid): AppState {
  validateBackupState(state)
  if (draft.id !== undefined && !validId(draft.id)) throw new Error('Der Entwurf hat eine ungültige ID.')
  const existing = draft.id ? state.invoices.find((invoice) => invoice.id === draft.id) : undefined
  if (draft.id && !existing) throw new Error('Der Entwurf ist nicht mehr vorhanden. Bitte neu laden.')
  assertInvoiceEditable(existing)
  if (existing?.correction?.replacesId !== draft.correction?.replacesId && existing) throw new Error('Der Korrekturverweis eines gespeicherten Entwurfs bleibt erhalten.')
  if (draft.recipientStrategy === 'separate' && (!existing?.correction || !draft.correction ||
    state.documentVersions.find((version) => version.id === draft.correction?.replacesId)?.content.recipientStrategy !== 'separate')) {
    throw new Error('Getrennte Rechnungen sind nur als Korrektur eines historischen aufgeteilten Belegs zulässig. Bitte den Altentwurf ausdrücklich in einen gemeinsamen Entwurf umwandeln.')
  }
  const errors = [...moneyErrors(draft), ...(finalize ? invoiceFinalizationErrors(state, draft) : draftAudienceErrors(state, draft))]
  if (errors.length) throw new Error(errors.join(' '))
  const saved: Invoice = {
    ...structuredClone(draft), id: existing?.id ?? freshId('invoice', new Set(state.invoices.map((invoice) => invoice.id)), createId), number: null, sequence: null,
    year: parseDate(draft.invoiceDate).getFullYear(), period: billingPeriodFromItems(draft.items, draft.invoiceDate),
    status: 'draft', calculation: 'decimal-v1', createdAt: existing?.createdAt ?? at, updatedAt: at,
  }
  let next = { ...state, invoices: [...state.invoices.filter((invoice) => invoice.id !== saved.id), persistentInvoice(saved)] }
  validateBackupState(next)
  const group = duoForInvoice(next, saved.id)
  if (group && duoInvoices(next, group).length === 2) {
    const errors = duoAudienceErrors(next, duoInvoices(next, group))
    if (errors.length) throw new Error(errors.join(' '))
  }
  if (finalize) next = finalizeInvoice(next, saved, 'sent', at, createId)
  validateBackupState(next)
  return next
}

export function changeInvoiceStatus(state: AppState, invoiceId: string, status: InvoiceStatus, at = new Date().toISOString(), paymentDay?: string): AppState {
  validateBackupState(state)
  const invoice = state.invoices.find((entry) => entry.id === invoiceId)
  if (!invoice) throw new Error('Die Rechnung ist nicht mehr vorhanden. Bitte neu laden.')
  if (status === 'draft') throw new Error('Bitte einen Korrekturentwurf mit Korrekturgrund anlegen. Der Originalbeleg bleibt erhalten.')
  let next: AppState
  if (invoice.status === 'draft') next = finalizeInvoice(state, invoice, status, at, uid, paymentDay)
  else {
    const versionId = invoice.versionId!
    const version = state.documentVersions.find((entry) => entry.id === versionId)!
    let payments = state.payments
    if (invoice.status === status) {
      if (status !== 'paid' || paymentDay === undefined) return state
      const confirmedPaymentDay = requiredPaymentDay(paymentDay)
      const payment = paymentForFullClaim(state, versionId)
      if (!payment) throw new Error('Der Zahlungstag kann nur für eine einzelne Vollzahlung korrigiert werden. Teilzahlungen folgen in Paket 14.')
      payments = payments.map((entry) => entry.id === payment.id ? { ...entry, paidAt: confirmedPaymentDay, paymentDayStatus: 'confirmed' as const } : entry)
      next = {
        ...state,
        payments,
        invoices: state.invoices.map((entry) => entry.id === invoiceId ? persistentInvoice({ ...entry, paidAt: confirmedPaymentDay, updatedAt: at }) : entry),
        invoiceAdministration: state.invoiceAdministration.map((admin) => admin.versionId === versionId ? { ...admin, events: [...admin.events, { at, status: 'paid', kind: 'status', reason: 'Tatsächlichen Zahlungstag nachgepflegt oder korrigiert.' }] } : admin),
      }
      assertOriginalsPreserved(state, next)
      validateBackupState(next)
      return next
    }
    if (status === 'paid') {
      const related = payments.filter((payment) => state.documentVersions.find((entry) => entry.id === payment.sourceVersionId)?.originalId === version.originalId)
      const confirmedPaymentDay = requiredPaymentDay(paymentDay)
      const reusable = related.filter((payment) => payment.allocations.at(-1)?.versionId === null && payment.amountCents === version.amounts.totalCents)
      if (related.length && allocatedCents(state, versionId) < version.amounts.totalCents && reusable.length !== 1) throw new Error('Es gibt bereits Zahlungen zu diesem Vorgang. Bitte diese ausdrücklich zuordnen und eine Betragsdifferenz prüfen; es wird keine Zahlung kopiert.')
      if (reusable.length === 1) {
        payments = payments.map((payment) => payment.id === reusable[0].id ? {
          ...payment, paidAt: confirmedPaymentDay, paymentDayStatus: 'confirmed' as const,
          allocations: [...payment.allocations, { versionId, at, reason: 'Nach Statusrücknahme wieder als Vollzahlung zugeordnet; tatsächlicher Zahlungstag bestätigt.' }],
        } : payment)
      } else if (!related.length) payments = [...payments, {
        id: freshId('payment', new Set(payments.map((entry) => entry.id)), uid), sourceVersionId: versionId, amountCents: version.amounts.totalCents,
        paidAt: confirmedPaymentDay, paymentDayStatus: 'confirmed', recordedAt: at, provenance: 'recorded', allocations: [{ versionId, at, reason: 'Vollzahlung ausdrücklich mit tatsächlichem Zahlungstag erfasst.' }],
      }]
    } else if (invoice.status === 'paid') {
      payments = payments.map((payment) => payment.allocations.at(-1)?.versionId === versionId ? { ...payment, allocations: [...payment.allocations, { versionId: null, at, reason: 'Zahlungsstatus ausdrücklich zurückgenommen; Zahlung zur manuellen Klärung erhalten.' }] } : payment)
    }
    next = {
      ...state, payments,
      invoices: state.invoices.map((entry) => entry.id === invoiceId ? persistentInvoice({ ...entry, status, paidAt: status === 'paid' ? payments.find((payment) => payment.allocations.at(-1)?.versionId === versionId && payment.paymentDayStatus === 'confirmed')?.paidAt ?? undefined : undefined, sentAt: entry.sentAt ?? at, updatedAt: at }) : entry),
      invoiceAdministration: state.invoiceAdministration.map((admin) => admin.versionId === versionId ? { ...admin, events: [...admin.events, { at, status, kind: 'status', reason: 'Verwaltungsstatus ausdrücklich geändert.' }] } : admin),
    }
  }
  assertOriginalsPreserved(state, next)
  validateBackupState(next)
  return next
}

function draftAudienceErrors(state: AppState, draft: InvoiceDraft): string[] {
  if (draft.studentIds.length && draft.guardianIds.some((id) => draft.studentIds.some((studentId) => {
    if (draft.correction && !state.guardians.some((guardian) => guardian.id === id)) return false
    const student = state.students.find((entry) => entry.id === studentId)
    return student && !student.guardianIds.includes(id)
  }))) return ['Alle empfangenden Personen müssen jedem ausgewählten Kind zugeordnet sein.']
  return []
}

export function invoiceDraftErrors(state: AppState, draft: InvoiceDraft): string[] {
  const result = commandResult(() => saveInvoiceDraft(state, draft, false))
  return result.ok ? [] : result.errors.map((error) => error.message)
}

/** A pure transition: the caller persists both results with ONE StorageSession.change. */
export function finalizeDuoGroup(state: AppState, groupId: string, token: string, confirmedInvoiceIds: string[], at = new Date().toISOString(), createId = uid): AppState {
  const preview = previewDuo(state, groupId)
  if (preview.token !== token) throw new Error('Die Vorschau ist nicht mehr aktuell. Bitte beide Rechnungen erneut prüfen.')
  if (preview.errors.length) throw new Error(preview.errors.join(' '))
  if (confirmedInvoiceIds.length !== 2 || !preview.invoices.every((invoice) => confirmedInvoiceIds.includes(invoice.id))) throw new Error('Bitte den eigenen Preis und die vollständige Ausgabe jeder Zielrechnung ausdrücklich bestätigen.')
  // All validation precedes even the first in-memory allocation. No storage side effects here.
  let next = state
  for (const invoice of preview.invoices) next = finalizeInvoice(next, state.invoices.find((entry) => entry.id === invoice.id)!, 'sent', at, createId, undefined, groupId)
  validateBackupState(next)
  assertOriginalsPreserved(state, next)
  return next
}
