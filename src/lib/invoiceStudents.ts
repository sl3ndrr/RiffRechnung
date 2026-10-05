import type { InvoiceDraft, Settings, Student } from '../types'
import { createLessonItem } from './invoiceDrafts'
import { recipientCanBillStudent, recipientKey } from './recipients'

/** Preserve unselected assignments until a replacement or an explicit item assignment. */
export function toggleDraftStudent(draft: InvoiceDraft, student: Student, students: Student[], settings: Settings, initialStudentIds: readonly string[] = draft.studentIds): InvoiceDraft {
  if (draft.correction) throw new Error('Für Korrekturen die bestehende Neuzuordnung verwenden.')
  const selected = draft.studentIds.includes(student.id)
  const studentIds = selected ? draft.studentIds.filter((id) => id !== student.id) : [...draft.studentIds, student.id]
  const replacements = studentIds.filter((id) => !initialStudentIds.includes(id))
  const target = selected ? replacements.length === 1 ? students.find((entry) => entry.id === replacements[0]) : undefined : student
  const oldIds = selected ? [student.id] : [...new Set(draft.items.filter((item) => !draft.studentIds.includes(item.studentId)).map((item) => item.studentId))]
  const items = draft.items.length ? draft.items.map((item) => target && oldIds.includes(item.studentId) ? { ...item, studentId: target.id } : item)
    : selected ? [] : [createLessonItem(student.id, draft.invoiceDate, settings)]
  const defaults = target ? target.selfPayer ? [{ type: 'student' as const, id: target.id }] : target.guardianIds.map((id) => ({ type: 'guardian' as const, id })) : []
  const learners = students.filter((entry) => studentIds.includes(entry.id))
  const next = [...draft.recipients, ...defaults].filter((ref) => learners.length > 0 && learners.every((learner) => recipientCanBillStudent(ref, learner)))
  const recipients = [...new Map(next.map((ref) => [recipientKey(ref), ref])).values()]
  return { ...draft, studentIds, recipients, items }
}
