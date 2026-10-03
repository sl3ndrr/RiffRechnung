import type { AppState, Invoice } from '../types'
import { moneyErrors } from './money'
import { validPrice, validQuantity } from './values'
import { invoiceCompliance } from './invoiceCompliance'
import { liveRecipient, recipientCanBillStudent, recipientRefs } from './recipients'
import { billingPeriodFromItems } from './invoiceOutput'

type InvoiceFinalizationCandidate = Pick<Invoice, 'recipients' | 'studentIds' | 'invoiceDate' | 'dueDate' | 'items'> & Partial<Pick<Invoice, 'recipientStrategy' | 'correction'>>

export function invoiceFinalizationErrors(state: Pick<AppState, 'guardians' | 'students' | 'settings'>, invoice: InvoiceFinalizationCandidate): string[] {
  const errors: string[] = [...moneyErrors(invoice)]
  if (invoice.recipientStrategy === 'separate' && !('correction' in invoice && invoice.correction)) errors.push('Neue getrennte Rechnungen sind nicht zulässig. Historische Entwürfe ausdrücklich als gemeinsame Rechnung übernehmen.')
  const studentIds = new Set(state.students.map((student) => student.id))
  const selectedStudentIds = new Set(invoice.studentIds)
  const selectedStudents = state.students.filter((student) => selectedStudentIds.has(student.id))
  const refs = recipientRefs(invoice)
  const selectedGuardians = state.guardians.filter((guardian) => refs.some((ref) => ref.type === 'guardian' && ref.id === guardian.id))
  const selfPayers = state.students.filter((student) => refs.some((ref) => ref.type === 'student' && ref.id === student.id))
  if (!errors.length) errors.push(...invoiceCompliance(state.settings, [...selectedGuardians, ...selfPayers]).map((error) => error.message))

  if (!refs.length) errors.push('Mindestens eine empfangende Person auswählen.')
  else if (refs.some((ref) => !liveRecipient(ref, state.guardians, state.students) || ref.type === 'student' && !state.students.find((student) => student.id === ref.id)?.selfPayer)) errors.push('Alle empfangenden Personen müssen als berechtigte Stammdaten vorhanden sein.')
  if (!invoice.studentIds.length) errors.push('Mindestens eine lernende Person auswählen.')
  else if (invoice.studentIds.some((id) => !studentIds.has(id))) errors.push('Alle ausgewählten Lernenden müssen in den aktuellen Stammdaten vorhanden sein.')

  if (refs.some((ref) => !selectedStudents.some((student) => recipientCanBillStudent(ref, student))) || selectedStudents.some((student) => !refs.some((ref) => recipientCanBillStudent(ref, student)))) errors.push('Jeder Rechnungsempfänger muss mindestens einem ausgewählten Lernenden zugeordnet sein und jeder Lernende einen Rechnungsempfänger haben.')
  if (refs.some((ref) => selectedStudents.some((student) => !recipientCanBillStudent(ref, student)))) errors.push('Alle empfangenden Personen müssen jedem ausgewählten Lernenden zugeordnet sein; Angaben zu anderen Lernenden dürfen nicht weitergegeben werden.')
  if (!invoice.invoiceDate || !invoice.dueDate) errors.push('Rechnungs- und Fälligkeitsdatum angeben.')
  if (!billingPeriodFromItems(invoice.items, invoice.invoiceDate)) errors.push('Leistungszeitraum über die Positionsdaten angeben.')
  if (!invoice.items.length) errors.push('Mindestens eine Position ergänzen.')
  if (invoice.items.some((item) => (
    !item.serviceDate
    || !item.description.trim()
    || !validQuantity(item.quantity)
    || !validPrice(item.unitPrice)
  ))) errors.push('Alle Positionen vollständig und mit gültigen Werten ausfüllen.')
  if (invoice.items.some((item) => !studentIds.has(item.studentId) || !selectedStudentIds.has(item.studentId))) {
    errors.push('Alle Positionen müssen einem ausgewählten Lernenden aus den aktuellen Stammdaten zugeordnet sein.')
  }
  return errors
}

