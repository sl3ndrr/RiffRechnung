import { assertInvoiceEditable } from './safety'
import type { AppState, Invoice, InvoiceDraft } from '../types'
import { moneyErrors } from './money'
import { validId, validPrice, validQuantity } from './values'
import { invoiceSetupErrors } from './invoiceSetup'
import { liveRecipient, recipientCanBillStudent, recipientRefs } from './recipients'
import { billingPeriodFromItems } from './invoiceOutput'

type InvoiceFinalizationCandidate = Pick<Invoice, 'recipients' | 'studentIds' | 'invoiceDate' | 'dueDate' | 'items'> & Partial<Pick<Invoice, 'recipientStrategy' | 'correction'>>

export function invoiceFinalizationErrors(state: Pick<AppState, 'guardians' | 'students' | 'settings' | 'documentVersions' | 'invoiceAdministration'>, invoice: InvoiceFinalizationCandidate): string[] {
  const errors: string[] = [...moneyErrors(invoice)]
  if (invoice.recipientStrategy === 'separate' && (!invoice.correction || state.documentVersions.find((version) => version.id === invoice.correction?.replacesId)?.content.recipientStrategy !== 'separate')) errors.push('Historische getrennte Entwürfe dürfen nicht finalisiert werden. Bitte ausdrücklich in einen gemeinsamen Entwurf umwandeln.')
  const studentIds = new Set(state.students.map((student) => student.id))
  const selectedStudentIds = new Set(invoice.studentIds)
  const selectedStudents = state.students.filter((student) => selectedStudentIds.has(student.id))
  const refs = recipientRefs(invoice)
  const selectedGuardians = state.guardians.filter((guardian) => refs.some((ref) => ref.type === 'guardian' && ref.id === guardian.id))
  const selfPayers = state.students.filter((student) => refs.some((ref) => ref.type === 'student' && ref.id === student.id))
  if (!errors.length) errors.push(...[...invoiceSetupErrors(state.settings).map((error) => error.message), ...[...selectedGuardians, ...selfPayers].filter((person) => !person.name.trim()).map((person) => `Personen → ${person.id}: Name fehlt. Bitte unter Personen ergänzen.`)])

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
  return [...errors, ...correctionErrors(state, invoice)]
}


export function correctionErrors(state: Pick<AppState, 'documentVersions' | 'invoiceAdministration'>, draft: Pick<InvoiceDraft, 'correction'>): string[] {
  if (!draft.correction) return []
  const parent = state.documentVersions.find((version) => version.id === draft.correction?.replacesId)
  if (!parent) return ['Der Originalbeleg der Korrektur fehlt.']
  const errors = []
  if (!draft.correction.reason.trim()) errors.push('Bitte einen Korrekturgrund angeben.')
  if (state.documentVersions.some((version) => version.replacesId === parent.id || version.cancelsId === parent.id)) errors.push('Dieser Beleg ist bereits ersetzt. Bitte die neueste Version korrigieren.')
  if (parent.conflicts.length && !state.invoiceAdministration.find((admin) => admin.versionId === parent.id)?.resolutions.length) errors.push('Die historischen Abweichungen müssen zuerst mit einer Begründung geklärt werden.')
  return errors
}

function draftAudienceErrors(state: AppState, draft: InvoiceDraft): string[] {
  if (draft.studentIds.length && recipientRefs(draft).some((ref) => {
    if (draft.correction && !state[ref.type === 'guardian' ? 'guardians' : 'students'].some((person) => person.id === ref.id)) return false
    return draft.studentIds.some((id) => {
      const student = state.students.find((entry) => entry.id === id)
      return student && !recipientCanBillStudent(ref, student)
    })
  })) return ['Alle empfangenden Personen müssen jedem ausgewählten Lernenden zugeordnet sein.']
  return []
}

export function invoiceSaveErrors(state: AppState, draft: InvoiceDraft, finalize: boolean): string[] {
  if (draft.id !== undefined && !validId(draft.id)) throw new Error('Der Entwurf hat eine ungültige ID.')
  const existing = draft.id ? state.invoices.find((invoice) => invoice.id === draft.id) : undefined
  if (draft.id && !existing) throw new Error('Der Entwurf ist nicht mehr vorhanden. Bitte neu laden.')
  assertInvoiceEditable(existing)
  if (existing?.correction?.replacesId !== draft.correction?.replacesId && existing) throw new Error('Der Korrekturverweis eines gespeicherten Entwurfs bleibt erhalten.')
  if (draft.recipientStrategy === 'separate' && (!existing?.correction || !draft.correction ||
    state.documentVersions.find((version) => version.id === draft.correction?.replacesId)?.content.recipientStrategy !== 'separate')) {
    throw new Error('Getrennte Rechnungen sind nur als Korrektur eines historischen aufgeteilten Belegs zulässig. Bitte den Altentwurf ausdrücklich in einen gemeinsamen Entwurf umwandeln.')
  }
  return finalize ? invoiceFinalizationErrors(state, draft) : [...moneyErrors(draft), ...draftAudienceErrors(state, draft)]
}
