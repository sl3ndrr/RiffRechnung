import type { AppState, Guardian, Invoice, RecipientRef, Student } from '../types'
import { canonical } from './canonical'
import { deleteGuardianState, deleteInvoiceDraftState, deleteStudentState, recordActivity } from './commands'
import { archiveInvoice } from './documents'
import { uid } from './identities'
import { commandResult, requireSuccess, type CommandResult } from './result'
import { assertInvoiceEditable, assertOriginalsPreserved } from './safety'
import { recipientCanBillStudent } from './recipients'
import { validateBackupState } from './validation'

export type UndoChange = { kind: 'draft' | 'guardian' | 'student'; id: string } | { kind: 'archive'; id: string; archived: boolean }
type DraftLinks = Pick<Invoice, 'recipients' | 'studentIds' | 'items'>
interface DraftPatch { id: string; before: Partial<DraftLinks>; after: Partial<DraftLinks> }
interface UndoBase { token: string; entityId: string; requiredPeople: RecipientRef[] }
export type UndoPackage = UndoBase & (
  | { kind: 'draft'; invoice: Invoice; index: number }
  | { kind: 'guardian'; guardian: Guardian; index: number; students: { id: string; before: string[]; after: string[] }[]; drafts: DraftPatch[] }
  | { kind: 'student'; student: Student; index: number; drafts: DraftPatch[] }
  | { kind: 'archive'; versionId: string; before: boolean; after: boolean }
)

function conflict(detail: string): never {
  throw new Error(`Rückgängig nicht möglich: ${detail} Der Bestand wurde nicht geändert.`)
}

function draftPatches(before: AppState, after: AppState): DraftPatch[] {
  return before.invoices.flatMap((invoice) => {
    const next = after.invoices.find((entry) => entry.id === invoice.id)
    if (!next) return []
    const fields = (['recipients', 'studentIds', 'items'] as const).filter((key) => canonical(invoice[key]) !== canonical(next[key]))
    return fields.length ? [{ id: invoice.id,
      before: Object.fromEntries(fields.map((key) => [key, invoice[key]])),
      after: Object.fromEntries(fields.map((key) => [key, next[key]])) }] : []
  })
}

function invoicePeople(invoice: Invoice): RecipientRef[] {
  return [...invoice.recipients, ...[...invoice.studentIds, ...invoice.items.map((item) => item.studentId)].map((id): RecipientRef => ({ type: 'student', id }))]
}

function assertDraftAudience(state: AppState, invoice: Invoice) {
  if (invoice.recipients.some((ref) => invoice.studentIds.some((id) => {
    const student = state.students.find((entry) => entry.id === id)
    return student && !recipientCanBillStudent(ref, student)
  }))) conflict('Die Empfänger sind inzwischen nicht mehr allen zugehörigen Lernenden zugeordnet.')
}

/** Capture inside the commit producer, from the state actually being changed. */
export function prepareUndoChangeState(state: AppState, change: UndoChange): CommandResult<{ state: AppState; undo: UndoPackage }> {
  return commandResult(() => {
    validateBackupState(state)
    const base: UndoBase = { token: uid('undo'), entityId: change.id, requiredPeople: [] }
    let next: AppState
    let undo: UndoPackage
    if (change.kind === 'draft') {
      const index = state.invoices.findIndex((entry) => entry.id === change.id)
      next = requireSuccess(deleteInvoiceDraftState(state, change.id))
      const invoice = state.invoices[index]
      undo = { ...base, kind: 'draft', invoice, index, requiredPeople: invoicePeople(invoice) }
    } else if (change.kind === 'archive') {
      const invoice = state.invoices.find((entry) => entry.id === change.id)
      const admin = state.invoiceAdministration.find((entry) => entry.versionId === invoice?.versionId)
      if (!admin || admin.archived === change.archived) throw new Error('Der Archivstand hat sich bereits geändert. Bitte neu laden.')
      next = archiveInvoice(state, change.id, change.archived)
      undo = { ...base, kind: 'archive', versionId: admin.versionId, before: admin.archived, after: change.archived }
    } else if (change.kind === 'guardian') {
      const index = state.guardians.findIndex((entry) => entry.id === change.id)
      if (index < 0) throw new Error('Die erziehungsberechtigte Person ist nicht mehr vorhanden.')
      next = requireSuccess(deleteGuardianState(state, change.id))
      const students = state.students.filter((student) => student.guardianIds.includes(change.id)).map((student) => ({
        id: student.id, before: student.guardianIds, after: student.guardianIds.filter((id) => id !== change.id),
      }))
      undo = { ...base, kind: 'guardian', guardian: state.guardians[index], index, students, drafts: draftPatches(state, next) }
    } else {
      const index = state.students.findIndex((entry) => entry.id === change.id)
      if (index < 0) throw new Error('Die lernende Person ist nicht mehr vorhanden.')
      next = requireSuccess(deleteStudentState(state, change.id))
      const student = state.students[index]
      undo = { ...base, kind: 'student', student, index, drafts: draftPatches(state, next),
        requiredPeople: student.guardianIds.map((id) => ({ type: 'guardian', id })) }
    }
    // Pre-existing historical gaps in correction drafts remain valid gaps.
    undo.requiredPeople = undo.requiredPeople.filter((ref) => state[ref.type === 'guardian' ? 'guardians' : 'students'].some((person) => person.id === ref.id))
    assertOriginalsPreserved(state, next)
    return { state: next, undo: structuredClone(undo) }
  })
}

function restoreDraftLinks(state: AppState, patches: DraftPatch[]): Invoice[] {
  for (const patch of patches) {
    const invoice = state.invoices.find((entry) => entry.id === patch.id)
    if (!invoice) conflict('Ein zugehöriger Entwurf wurde inzwischen gelöscht.')
    try { assertInvoiceEditable(invoice) } catch { conflict('Ein zugehöriger Entwurf wurde inzwischen finalisiert.') }
    if (invoice.correction || Object.entries(patch.after).some(([key, value]) => canonical(invoice[key as keyof DraftLinks]) !== canonical(value))) {
      conflict('Die betroffenen Zuordnungen oder Positionen eines Entwurfs wurden inzwischen geändert.')
    }
  }
  return state.invoices.map((invoice) => {
    const patch = patches.find((entry) => entry.id === invoice.id)
    return patch ? { ...invoice, ...structuredClone(patch.before) } : invoice
  })
}

function insertAt<T>(entries: T[], index: number, entry: T): T[] {
  return [...entries.slice(0, index), structuredClone(entry), ...entries.slice(index)]
}

/** Pure targeted inverse; the token in the audit feed rejects replay. */
export function undoChangeState(state: AppState, undo: UndoPackage, at = new Date().toISOString()): CommandResult<AppState> {
  return commandResult(() => {
    validateBackupState(state)
    if (state.audit.some((event) => event.id === undo.token)) conflict('Diese Aktion wurde bereits rückgängig gemacht.')
    let next = state
    if (undo.kind === 'draft') {
      if (state.invoices.some((entry) => entry.id === undo.invoice.id)) conflict('Der Entwurf ist bereits vorhanden.')
      assertInvoiceEditable(undo.invoice)
      next = { ...state, invoices: insertAt(state.invoices, undo.index, undo.invoice) }
    } else if (undo.kind === 'guardian') {
      if (state.guardians.some((entry) => entry.id === undo.guardian.id)) conflict('Die erziehungsberechtigte Person ist bereits vorhanden.')
      for (const patch of undo.students) {
        const student = state.students.find((entry) => entry.id === patch.id)
        if (!student) conflict('Eine zugehörige lernende Person wurde inzwischen gelöscht.')
        if (student.selfPayer || canonical(student.guardianIds) !== canonical(patch.after)) conflict('Die Erziehungsberechtigten-Zuordnung wurde inzwischen geändert.')
      }
      next = { ...state, guardians: insertAt(state.guardians, undo.index, undo.guardian),
        students: state.students.map((student) => {
          const patch = undo.students.find((entry) => entry.id === student.id)
          return patch ? { ...student, guardianIds: [...patch.before] } : student
        }), invoices: restoreDraftLinks(state, undo.drafts) }
    } else if (undo.kind === 'student') {
      if (state.students.some((entry) => entry.id === undo.student.id || entry.billingCode === undo.student.billingCode)) conflict('Die lernende Person oder ihre Kennung ist bereits vorhanden.')
      next = { ...state, students: insertAt(state.students, undo.index, undo.student), invoices: restoreDraftLinks(state, undo.drafts) }
    } else {
      const invoice = state.invoices.find((entry) => entry.id === undo.entityId)
      const admin = state.invoiceAdministration.find((entry) => entry.versionId === undo.versionId)
      if (invoice?.versionId !== undo.versionId || !admin || admin.archived !== undo.after) conflict('Der Archivstand dieses Belegs wurde inzwischen geändert.')
      next = { ...state, invoiceAdministration: state.invoiceAdministration.map((entry) => entry.versionId === undo.versionId ? { ...entry, archived: undo.before } : entry) }
    }
    if (undo.requiredPeople.some((ref) => !next[ref.type === 'guardian' ? 'guardians' : 'students'].some((person) => person.id === ref.id))) {
      conflict('Eine zugehörige Person wurde inzwischen gelöscht.')
    }
    const restoredIds = undo.kind === 'draft' ? [undo.invoice.id] : undo.kind === 'archive' ? [] : undo.drafts.map((patch) => patch.id)
    for (const invoice of next.invoices.filter((entry) => restoredIds.includes(entry.id))) assertDraftAudience(next, invoice)
    try { validateBackupState(next) } catch { conflict('Die früheren Zuordnungen lassen sich nicht mehr vollständig wiederherstellen.') }
    assertOriginalsPreserved(state, next)
    return recordActivity(next, { id: undo.token, at, label: undo.kind === 'archive' ? 'Archivänderung rückgängig gemacht' : 'Löschen rückgängig gemacht',
      entityType: undo.kind === 'guardian' || undo.kind === 'student' ? 'person' : 'invoice', entityId: undo.entityId })
  })
}
