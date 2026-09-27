import type { Guardian, Invoice, InvoiceSnapshot, RecipientRef, RecipientSnapshot, Student } from '../types'

export function recipientRefs(invoice: Pick<Invoice, 'guardianIds' | 'recipients'>): RecipientRef[] {
  return invoice.recipients ?? invoice.guardianIds.map((id) => ({ type: 'guardian', id }))
}

export function guardianIdsFor(refs: RecipientRef[]): string[] {
  return refs.filter((ref) => ref.type === 'guardian').map((ref) => ref.id)
}

export function recipientKey(ref: RecipientRef): string { return `${ref.type}:${ref.id}` }

export function snapshotRecipients(snapshot: InvoiceSnapshot): RecipientSnapshot[] {
  return snapshot.recipients ?? snapshot.guardians.map((guardian) => ({ ...guardian, type: 'guardian' }))
}

export function liveRecipient(ref: RecipientRef, guardians: Guardian[], students: Student[]): RecipientSnapshot | null {
  if (ref.type === 'guardian') {
    const guardian = guardians.find((person) => person.id === ref.id)
    return guardian ? { type: 'guardian', id: ref.id, name: guardian.name, email: guardian.email, ...guardian.address } : null
  }
  const student = students.find((person) => person.id === ref.id)
  return student ? { type: 'student', id: ref.id, name: student.name, email: student.contact?.email ?? '',
    street: student.contact?.address.street ?? '', postalCode: student.contact?.address.postalCode ?? '', city: student.contact?.address.city ?? '' } : null
}

export function recipientCanBillStudent(ref: RecipientRef, student: Student): boolean {
  return ref.type === 'student' ? ref.id === student.id && student.selfPayer === true : student.guardianIds.includes(ref.id)
}
