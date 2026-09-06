import type { AppState, Guardian, InvoiceDraft, Settings, Student } from '../types'
import { createEmptyInvoiceDraft } from './defaults'
import { saveInvoiceDraft } from './invoiceActions'
import { copyItemsWithFreshIds } from './identities'
import { commandResult, type CommandResult } from './result'
import { validateBackupState } from './validation'
import { updateSettings } from './settings'
import { billingPeriodFromItems, calculateDueDate, parseDate, studentCodeForIndex, uid } from './utils'

export function saveSettingsState(state: AppState, settings: Settings): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    const next = { ...state, settings: updateSettings(state.settings, structuredClone(settings)) }
    validateBackupState(next)
    return next
  })
}

export function saveGuardianState(state: AppState, guardian: Guardian): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    const existing = state.guardians.some((entry) => entry.id === guardian.id)
    const saved = structuredClone(guardian)
    const next = { ...state, guardians: existing ? state.guardians.map((entry) => entry.id === saved.id ? saved : entry) : [...state.guardians, saved] }
    validateBackupState(next)
    return next
  })
}

export function saveStudentState(state: AppState, student: Student): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    const existing = state.students.find((entry) => entry.id === student.id)
    const used = new Set(state.students.map((entry) => entry.billingCode))
    let cursor = state.nextStudentCodeIndex
    while (used.has(studentCodeForIndex(cursor))) cursor++
    const saved = { ...structuredClone(student), billingCode: existing?.billingCode ?? studentCodeForIndex(cursor) }
    const next = {
      ...state, students: existing ? state.students.map((entry) => entry.id === saved.id ? saved : entry) : [...state.students, saved],
      nextStudentCodeIndex: existing ? state.nextStudentCodeIndex : cursor + 1,
    }
    validateBackupState(next)
    return next
  })
}

export function prepareNewInvoice(state: AppState): CommandResult<InvoiceDraft> {
  return commandResult(() => {
    validateBackupState(state)
    return createEmptyInvoiceDraft(state.settings)
  })
}

export function prepareInvoiceCopy(state: AppState, invoiceId: string, targetDate = new Date(), createId = uid): CommandResult<InvoiceDraft> {
  return commandResult(() => {
    validateBackupState(state)
    const invoice = state.invoices.find((entry) => entry.id === invoiceId)
    if (!invoice) throw new Error('Die zu kopierende Rechnung ist nicht mehr vorhanden.')
    if (invoice.guardianIds.some((id) => !state.guardians.some((guardian) => guardian.id === id))
      || invoice.studentIds.some((id) => !state.students.some((student) => student.id === id))) {
      throw new Error('Kopieren gesperrt: Historische Personen oder Kinder fehlen in den aktuellen Stammdaten. Die Zuordnung muss ausdrücklich geklärt werden; keine Position oder Referenz wurde entfernt.')
    }
    // Retain the existing month-shift semantics; calendar corrections are P05.
    const sourceDate = parseDate(invoice.invoiceDate)
    const monthDelta = (targetDate.getFullYear() - sourceDate.getFullYear()) * 12 + targetDate.getMonth() - sourceDate.getMonth()
    const items = copyItemsWithFreshIds(invoice.items, new Set(state.invoices.flatMap((entry) => entry.items.map((item) => item.id))), createId).map((item) => {
      const date = parseDate(item.serviceDate)
      date.setMonth(date.getMonth() + monthDelta)
      return { ...item, serviceDate: date.toISOString().slice(0, 10) }
    })
    const invoiceDate = targetDate.toISOString().slice(0, 10)
    const draft: InvoiceDraft = {
      invoiceDate, dueDate: calculateDueDate(invoiceDate, state.settings.paymentTermDays),
      period: billingPeriodFromItems(items, invoiceDate), guardianIds: [...invoice.guardianIds], studentIds: [...invoice.studentIds],
      recipientStrategy: invoice.recipientStrategy, items, introText: invoice.introText, freeText: invoice.freeText, legalText: invoice.legalText,
    }
    // Verify the actual prospective persistent result without mutating state.
    saveInvoiceDraft(state, draft, false, targetDate.toISOString())
    return draft
  })
}

export function saveInvoiceState(state: AppState, draft: InvoiceDraft, finalize: boolean, at?: string): CommandResult<AppState> {
  return commandResult(() => saveInvoiceDraft(state, draft, finalize, at))
}
