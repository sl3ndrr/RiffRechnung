import { validId } from './values'
import { freshId } from './identities'
import { commandResult } from './result'
import type { AppState, Invoice, InvoiceDraft, InvoiceSnapshot, InvoiceStatus } from '../types'
import { assertInvoiceEditable, assertOriginalsPreserved, SPLIT_INVOICE_BLOCKED } from './safety'
import { validateBackupState } from './validation'
import { billingPeriodFromItems, germanIbanError, invoiceFinalizationErrors, nextInvoiceAllocation, parseDate, reopenInvoiceAsDraft, uid } from './utils'

function snapshotFor(state: AppState, invoice: Invoice): InvoiceSnapshot {
  return {
    issuer: structuredClone(state.settings.issuer),
    guardians: invoice.guardianIds.map((id) => {
      const guardian = state.guardians.find((entry) => entry.id === id)!
      return { id, name: guardian.name, email: guardian.email, ...guardian.address }
    }),
    students: invoice.studentIds.map((id) => ({ id, name: state.students.find((entry) => entry.id === id)!.name })),
    accountHolder: state.settings.accountHolder,
    iban: state.settings.iban,
    bic: state.settings.bic,
    bankName: state.settings.bankName,
    legalText: invoice.legalText,
  }
}

function finalizeInvoice(state: AppState, invoice: Invoice, status: InvoiceStatus, at: string): AppState {
  const errors = invoiceFinalizationErrors(state, invoice)
  const ibanError = germanIbanError(state.settings.iban)
  if (ibanError) errors.push(ibanError)
  if (errors.length) throw new Error(`Finalisieren nicht möglich: ${errors.join(' ')}`)
  const allocation = nextInvoiceAllocation(state, invoice.invoiceDate, invoice.studentIds)
  const finalized: Invoice = {
    ...invoice, number: allocation.number, sequence: allocation.sequence, status,
    snapshot: snapshotFor(state, invoice), sentAt: at, updatedAt: at,
    ...(status === 'paid' ? { paidAt: at } : {}),
  }
  return {
    ...state,
    invoices: state.invoices.map((entry) => entry.id === invoice.id ? finalized : entry),
    counters: { ...state.counters, [allocation.counterKey]: allocation.sequence + 1 },
  }
}

export function saveInvoiceDraft(state: AppState, draft: InvoiceDraft, finalize: boolean, at = new Date().toISOString()): AppState {
  validateBackupState(state)
  if (draft.id !== undefined && !validId(draft.id)) throw new Error('Der Entwurf hat eine ungültige ID.')
  const existing = draft.id ? state.invoices.find((invoice) => invoice.id === draft.id) : undefined
  if (draft.id && !existing) throw new Error('Der Entwurf ist nicht mehr vorhanden. Bitte neu laden.')
  assertInvoiceEditable(existing)
  const errors = finalize ? invoiceFinalizationErrors(state, draft) : draftAudienceErrors(state, draft)
  if (errors.length) throw new Error(errors.join(' '))
  const saved: Invoice = {
    ...structuredClone(draft), id: existing?.id ?? freshId('invoice', new Set(state.invoices.map((invoice) => invoice.id)), uid), number: null, sequence: null,
    year: parseDate(draft.invoiceDate).getFullYear(), period: billingPeriodFromItems(draft.items, draft.invoiceDate),
    status: 'draft', recipientStrategy: 'joint', createdAt: existing?.createdAt ?? at, updatedAt: at,
  }
  let next = { ...state, invoices: [...state.invoices.filter((invoice) => invoice.id !== saved.id), saved] }
  validateBackupState(next)
  if (finalize) next = finalizeInvoice(next, saved, 'sent', at)
  validateBackupState(next)
  return next
}

export function changeInvoiceStatus(state: AppState, invoiceId: string, status: InvoiceStatus, at = new Date().toISOString()): AppState {
  validateBackupState(state)
  const invoice = state.invoices.find((entry) => entry.id === invoiceId)
  if (!invoice) throw new Error('Die Rechnung ist nicht mehr vorhanden. Bitte neu laden.')
  if (status === 'draft') return reopenInvoiceAsDraft(state, invoiceId)
  const next = invoice.status === 'draft' ? finalizeInvoice(state, invoice, status, at) : {
    ...state,
    invoices: state.invoices.map((entry) => entry.id === invoiceId ? {
      ...entry, status, paidAt: status === 'paid' ? at : undefined, sentAt: entry.sentAt ?? at, updatedAt: at,
    } : entry),
  }
  assertOriginalsPreserved(state, next)
  validateBackupState(next)
  return next
}

function draftAudienceErrors(state: AppState, draft: InvoiceDraft): string[] {
  if (draft.recipientStrategy === 'separate' && draft.guardianIds.length > 1) return [SPLIT_INVOICE_BLOCKED]
  if (draft.studentIds.length && draft.guardianIds.some((id) => draft.studentIds.some((studentId) => {
    const student = state.students.find((entry) => entry.id === studentId)
    return student && !student.guardianIds.includes(id)
  }))) return ['Alle empfangenden Personen müssen jedem ausgewählten Kind zugeordnet sein.']
  return []
}

export function invoiceDraftErrors(state: AppState, draft: InvoiceDraft): string[] {
  const result = commandResult(() => saveInvoiceDraft(state, draft, false))
  return result.ok ? [] : result.errors.map((error) => error.message)
}
