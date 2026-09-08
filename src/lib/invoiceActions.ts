import { localToday } from './calendar'
import { draftAmountChange, moneyErrors } from './money'
import { allocatedCents, captureDocument, correctionErrors, snapshotFor, persistentInvoice } from './documents'
import { validId } from './values'
import { freshId } from './identities'
import { commandResult } from './result'
import type { AppState, Invoice, InvoiceDraft, InvoiceStatus } from '../types'
import { assertInvoiceEditable, assertOriginalsPreserved, SPLIT_INVOICE_BLOCKED } from './safety'
import { validateBackupState } from './validation'
import { billingPeriodFromItems, germanIbanError, invoiceFinalizationErrors, nextInvoiceAllocation, parseDate, uid } from './utils'

function finalizeInvoice(state: AppState, invoice: Invoice, status: InvoiceStatus, at: string): AppState {
  const errors = [...invoiceFinalizationErrors(state, invoice), ...correctionErrors(state, invoice)]
  const ibanError = germanIbanError(state.settings.iban)
  if (ibanError) errors.push(ibanError)
  if (errors.length) throw new Error(`Finalisieren nicht möglich: ${errors.join(' ')}`)
  if (status === 'paid' && invoice.correction && state.payments.some((payment) => state.documentVersions.find((entry) => entry.id === payment.sourceVersionId)?.originalId === state.documentVersions.find((entry) => entry.id === invoice.correction?.replacesId)?.originalId)) throw new Error('Vorhandene Zahlungen müssen nach der Korrektur manuell zugeordnet werden; eine neue Vollzahlung wird nicht erzeugt.')
  if (!invoice.calculation && draftAmountChange(invoice).changed) throw new Error('Die Betragsberechnung hat sich geändert. Bitte den Entwurf im Editor prüfen und speichern.')
  const allocation = nextInvoiceAllocation(state, invoice.invoiceDate, invoice.studentIds)
  const finalized: Invoice = {
    ...invoice, number: allocation.number, sequence: allocation.sequence, status,
    snapshot: snapshotFor(state, invoice), sentAt: at, updatedAt: at,
    ...(status === 'paid' ? { paidAt: localToday(new Date(at)) } : {}),
  }
  const version = captureDocument(state, finalized, freshId('version', new Set(state.documentVersions.map((entry) => entry.id)), uid), false)
  finalized.versionId = version.id
  return {
    ...state,
    invoices: state.invoices.map((entry) => entry.id === invoice.id ? finalized : entry),
    counters: { ...state.counters, [allocation.counterKey]: allocation.sequence + 1 },
    documentVersions: [...state.documentVersions, version],
    invoiceAdministration: [...state.invoiceAdministration, { versionId: version.id, archived: false, events: [{ at, status: status as Exclude<InvoiceStatus, 'draft'>, kind: 'status', reason: 'Beleg finalisiert.' }], resolutions: [] }],
    payments: status === 'paid' ? [...state.payments, {
      id: freshId('payment', new Set(state.payments.map((entry) => entry.id)), uid), sourceVersionId: version.id, amountCents: version.amounts.totalCents,
      paidAt: localToday(new Date(at)), recordedAt: at, provenance: 'recorded', allocations: [{ versionId: version.id, at, reason: 'Bei Finalisierung als vollständig bezahlt erfasst.' }],
    }] : state.payments,
  }
}

export function saveInvoiceDraft(state: AppState, draft: InvoiceDraft, finalize: boolean, at = new Date().toISOString()): AppState {
  validateBackupState(state)
  if (draft.id !== undefined && !validId(draft.id)) throw new Error('Der Entwurf hat eine ungültige ID.')
  const existing = draft.id ? state.invoices.find((invoice) => invoice.id === draft.id) : undefined
  if (draft.id && !existing) throw new Error('Der Entwurf ist nicht mehr vorhanden. Bitte neu laden.')
  assertInvoiceEditable(existing)
  if (existing?.correction?.replacesId !== draft.correction?.replacesId && existing) throw new Error('Der Korrekturverweis eines gespeicherten Entwurfs bleibt erhalten.')
  const errors = [...moneyErrors(draft), ...(finalize ? invoiceFinalizationErrors(state, draft) : draftAudienceErrors(state, draft))]
  if (errors.length) throw new Error(errors.join(' '))
  const saved: Invoice = {
    ...structuredClone(draft), id: existing?.id ?? freshId('invoice', new Set(state.invoices.map((invoice) => invoice.id)), uid), number: null, sequence: null,
    year: parseDate(draft.invoiceDate).getFullYear(), period: billingPeriodFromItems(draft.items, draft.invoiceDate),
    status: 'draft', calculation: 'decimal-v1', recipientStrategy: 'joint', createdAt: existing?.createdAt ?? at, updatedAt: at,
  }
  let next = { ...state, invoices: [...state.invoices.filter((invoice) => invoice.id !== saved.id), persistentInvoice(saved)] }
  validateBackupState(next)
  if (finalize) next = finalizeInvoice(next, saved, 'sent', at)
  validateBackupState(next)
  return next
}

export function changeInvoiceStatus(state: AppState, invoiceId: string, status: InvoiceStatus, at = new Date().toISOString()): AppState {
  validateBackupState(state)
  const invoice = state.invoices.find((entry) => entry.id === invoiceId)
  if (!invoice) throw new Error('Die Rechnung ist nicht mehr vorhanden. Bitte neu laden.')
  if (status === 'draft') throw new Error('Bitte einen Korrekturentwurf mit Korrekturgrund anlegen. Der Originalbeleg bleibt erhalten.')
  let next: AppState
  if (invoice.status === 'draft') next = finalizeInvoice(state, invoice, status, at)
  else {
    if (invoice.status === status) return state
    const versionId = invoice.versionId!
    const version = state.documentVersions.find((entry) => entry.id === versionId)!
    let payments = state.payments
    if (status === 'paid') {
      const related = payments.filter((payment) => state.documentVersions.find((entry) => entry.id === payment.sourceVersionId)?.originalId === version.originalId)
      if (related.length && allocatedCents(state, versionId) < version.amounts.totalCents) throw new Error('Es gibt bereits Zahlungen zu diesem Vorgang. Bitte diese ausdrücklich zuordnen und eine Betragsdifferenz prüfen; es wird keine Zahlung kopiert.')
      if (!related.length) payments = [...payments, {
        id: freshId('payment', new Set(payments.map((entry) => entry.id)), uid), sourceVersionId: versionId, amountCents: version.amounts.totalCents,
        paidAt: localToday(new Date(at)), recordedAt: at, provenance: 'recorded', allocations: [{ versionId, at, reason: 'Vollzahlung ausdrücklich erfasst.' }],
      }]
    } else if (invoice.status === 'paid') {
      payments = payments.map((payment) => payment.allocations.at(-1)?.versionId === versionId ? { ...payment, allocations: [...payment.allocations, { versionId: null, at, reason: 'Zahlungsstatus ausdrücklich zurückgenommen; Zahlung zur manuellen Klärung erhalten.' }] } : payment)
    }
    next = {
      ...state, payments,
      invoices: state.invoices.map((entry) => entry.id === invoiceId ? persistentInvoice({ ...entry, status, paidAt: status === 'paid' ? payments.find((payment) => payment.allocations.at(-1)?.versionId === versionId)?.paidAt ?? undefined : undefined, sentAt: entry.sentAt ?? at, updatedAt: at }) : entry),
      invoiceAdministration: state.invoiceAdministration.map((admin) => admin.versionId === versionId ? { ...admin, events: [...admin.events, { at, status, kind: 'status', reason: 'Verwaltungsstatus ausdrücklich geändert.' }] } : admin),
    }
  }
  assertOriginalsPreserved(state, next)
  validateBackupState(next)
  return next
}

function draftAudienceErrors(state: AppState, draft: InvoiceDraft): string[] {
  if (draft.recipientStrategy === 'separate' && draft.guardianIds.length > 1) return [SPLIT_INVOICE_BLOCKED]
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

