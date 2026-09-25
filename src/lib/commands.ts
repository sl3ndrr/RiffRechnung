import { localToday, shiftCalendarMonths } from './calendar'
import { contactName, contactPartError } from './contactName'
import type { AppState, Guardian, InvoiceDraft, Settings, Student } from '../types'
import { createEmptyInvoiceDraft, emptyState } from './defaults'
import { assertInvoiceEditable, assertReplacementAllowed } from './safety'
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
    const existing = state.guardians.find((entry) => entry.id === guardian.id)
    const saved = structuredClone(guardian)
    if (saved.firstName !== undefined || saved.lastName !== undefined || !existing) {
      const errors = [contactPartError(saved.firstName, 'Vorname'), contactPartError(saved.lastName, 'Nachname')].filter(Boolean)
      if (errors.length) throw new Error(errors.join(' '))
      if (saved.name !== contactName(saved.firstName!, saved.lastName!)) throw new Error('Der Anzeigename muss ausdrücklich aus Vor- und Nachname gebildet werden.')
      saved.firstName = saved.firstName!.trim()
      saved.lastName = saved.lastName!.trim()
    } else if (saved.name !== existing.name) throw new Error('Ein nicht aufgeteilter Altname darf nur nach ausdrücklicher Eingabe beider Namen geändert werden.')
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
    if (invoice.recipientStrategy === 'separate') throw new Error('Kopieren gesperrt: Dieser historische aufgeteilte Beleg enthält möglicherweise Teilbetragspositionen oder gemeinsame Texte. Bitte eine neue gemeinsame Rechnung erstellen und alle Angaben ausdrücklich prüfen.')
    if (invoice.guardianIds.some((id) => !state.guardians.some((guardian) => guardian.id === id))
      || invoice.studentIds.some((id) => !state.students.some((student) => student.id === id))) {
      throw new Error('Kopieren gesperrt: Historische Personen oder Kinder fehlen in den aktuellen Stammdaten. Die Zuordnung muss ausdrücklich geklärt werden; keine Position oder Referenz wurde entfernt.')
    }
    // Shift service days relative to the invoice month; clamp month ends.
    const sourceDate = parseDate(invoice.invoiceDate)
    const monthDelta = (targetDate.getFullYear() - sourceDate.getFullYear()) * 12 + targetDate.getMonth() - sourceDate.getMonth()
    const items = copyItemsWithFreshIds(invoice.items, new Set(state.invoices.flatMap((entry) => entry.items.map((item) => item.id))), createId).map((item) => {
      return { ...item, serviceDate: shiftCalendarMonths(item.serviceDate, monthDelta) }
    })
    const invoiceDate = localToday(targetDate)
    const draft: InvoiceDraft = {
      invoiceDate, dueDate: calculateDueDate(invoiceDate, state.settings.paymentTermDays),
      period: billingPeriodFromItems(items, invoiceDate), guardianIds: [...invoice.guardianIds], studentIds: [...invoice.studentIds],
      recipientStrategy: invoice.recipientStrategy, invoiceKind: 'standard', items, introText: invoice.introText, freeText: invoice.freeText, legalText: invoice.legalText,
    }
    // Verify the actual prospective persistent result without mutating state.
    saveInvoiceDraft(state, draft, false, targetDate.toISOString())
    return draft
  })
}

export function saveInvoiceState(state: AppState, draft: InvoiceDraft, finalize: boolean, at?: string): CommandResult<AppState> {
  return commandResult(() => saveInvoiceDraft(state, draft, finalize, at))
}

export const LEGACY_REVIEW_FIELDS = ['Empfänger', 'Kind', 'Positionen', 'Einleitung', 'Freitext'] as const

export function convertLegacyDraftState(state: AppState, sourceId: string, reviewed: readonly string[], guardianIds: string[], edited: InvoiceDraft, at?: string): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    const source = state.invoices.find((invoice) => invoice.id === sourceId)
    if (!source || source.status !== 'draft' || source.recipientStrategy !== 'separate' || source.correction || source.number || source.versionId) throw new Error('Nur ein offener historischer Aufteilungsentwurf kann umgewandelt werden.')
    if (!LEGACY_REVIEW_FIELDS.every((field) => reviewed.includes(field))) throw new Error('Bitte Empfänger, Kind, Positionen, Einleitung und Freitext einzeln sichtbar prüfen und bestätigen.')
    if (source.guardianIds.length === 1 && (guardianIds.length !== 1 || guardianIds[0] !== source.guardianIds[0])) throw new Error('Der einzelne Altentwurf wird nur mit seinem bisherigen Empfänger übernommen.')
    if (!guardianIds.length || new Set(guardianIds).size !== guardianIds.length || guardianIds.some((id) => !state.guardians.some((guardian) => guardian.id === id))) throw new Error('Bitte die empfangenden Personen ausdrücklich auswählen.')
    if (edited.id !== sourceId || edited.correction || edited.recipientStrategy !== 'separate') throw new Error('Der zu prüfende Altentwurf hat sich geändert. Bitte neu laden.')
    if (guardianIds.some((id) => edited.studentIds.some((studentId) => !state.students.find((student) => student.id === studentId)?.guardianIds.includes(id)))) throw new Error('Alle ausgewählten Empfänger müssen jedem ausgewählten Kind zugeordnet sein.')
    const sourceRemoved = source.guardianIds.length === 1 ? state : { ...state, invoices: state.invoices.filter((invoice) => invoice.id !== sourceId) }
    const converted: InvoiceDraft = { ...edited, id: source.guardianIds.length === 1 ? sourceId : undefined, guardianIds: [...guardianIds], recipientStrategy: 'joint' }
    const next = saveInvoiceDraft(sourceRemoved, converted, false, at)
    if (next.counters !== state.counters || next.invoices.length !== state.invoices.length || next.invoices.some((invoice) => invoice.number !== null && !state.invoices.some((old) => old.id === invoice.id))) throw new Error('Die Umwandlung darf keine Rechnungsnummer verbrauchen.')
    return next
  })
}

export function deleteGuardianState(state: AppState, id: string): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    const next = {
      ...state, guardians: state.guardians.filter((guardian) => guardian.id !== id),
      students: state.students.map((student) => ({ ...student, guardianIds: student.guardianIds.filter((value) => value !== id) })),
      invoices: state.invoices.map((invoice) => invoice.status === 'draft' && !invoice.correction ? { ...invoice, guardianIds: invoice.guardianIds.filter((value) => value !== id) } : invoice),
    }
    validateBackupState(next)
    return next
  })
}

export function deleteStudentState(state: AppState, id: string): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    const next = {
      ...state, students: state.students.filter((student) => student.id !== id),
      invoices: state.invoices.map((invoice) => invoice.status === 'draft' && !invoice.correction ? { ...invoice, studentIds: invoice.studentIds.filter((value) => value !== id), items: invoice.items.filter((item) => item.studentId !== id) } : invoice),
    }
    validateBackupState(next)
    return next
  })
}

export function recordActivity(state: AppState, event: AppState['audit'][number]): AppState {
  return { ...state, updatedAt: event.at, audit: [event, ...state.audit].slice(0, 200) }
}

export function deleteInvoiceDraftState(state: AppState, invoiceId: string): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    const invoice = state.invoices.find((entry) => entry.id === invoiceId)
    if (!invoice) throw new Error('Der Entwurf ist nicht mehr vorhanden. Bitte neu laden.')
    assertInvoiceEditable(invoice)
    const next = { ...state, invoices: state.invoices.filter((entry) => entry.id !== invoiceId) }
    validateBackupState(next)
    return next
  })
}

export function resetUnissuedState(state: AppState): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    assertReplacementAllowed(state)
    const next = emptyState()
    validateBackupState(next)
    return next
  })
}
