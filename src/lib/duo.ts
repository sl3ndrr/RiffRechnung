import type { AppState, DuoGroup, DuoLesson, InvoiceDraft } from '../types'
import { saveInvoiceDraft } from './invoiceActions'
import { canonical } from './envelope'
import { duoAudienceErrors, duoInvoices } from './duoModel'
import { freshId } from './identities'
import { assertInvoiceEditable } from './safety'
import { validateBackupState } from './validation'
import { billingPeriodFromItems, calculateDueDate, uid } from './utils'

export function createDuoDrafts(state: AppState, studentIds: string[], lesson: DuoLesson, totalCents?: number, at = new Date().toISOString(), createId = uid): AppState {
  validateBackupState(state)
  if (studentIds.length !== 2 || new Set(studentIds).size !== 2 || studentIds.some((id) => !state.students.some((student) => student.id === id))) throw new Error('Bitte zwei verschiedene Lernende wählen.')
  const occupied = new Set([...state.invoices.flatMap((invoice) => [invoice.id, ...invoice.items.map((item) => item.id)]), ...(state.duoGroups ?? []).flatMap((group) => [group.id, ...group.targets.flatMap((target) => [target.invoiceId, target.itemId])])])
  const group: DuoGroup = { id: freshId('duo', occupied, createId), targets: [], lesson: structuredClone(lesson), ...(totalCents !== undefined ? { totalCents } : {}) }
  let next = state
  for (const studentId of studentIds) {
    const itemId = freshId('item', occupied, createId)
    const draft: InvoiceDraft = {
      invoiceDate: lesson.serviceDate, dueDate: calculateDueDate(lesson.serviceDate, state.settings.paymentTermDays), period: '',
      studentIds: [studentId], guardianIds: [], recipientStrategy: 'joint',
      items: [{ ...lesson, id: itemId, studentId, lessonType: 'duo', unitPrice: state.settings.duoRate }],
      introText: '', freeText: '', legalText: '',
    }
    next = saveInvoiceDraft(next, draft, false, at, createId)
    const invoice = next.invoices.at(-1)!
    occupied.add(invoice.id)
    group.targets.push({ invoiceId: invoice.id, itemId })
  }
  const errors = duoAudienceErrors(next, duoInvoices(next, group))
  if (errors.length) throw new Error(errors.join(' '))
  next = { ...next, duoGroups: [...(state.duoGroups ?? []), group] }
  validateBackupState(next)
  return next
}

export function previewDuoLessonChange(state: AppState, groupId: string, lesson: DuoLesson) {
  validateBackupState(state)
  const group = state.duoGroups?.find((entry) => entry.id === groupId)
  if (!group || duoInvoices(state, group).length !== 2) throw new Error('Für eine gemeinsame Änderung werden beide Entwürfe benötigt.')
  const next = structuredClone(state)
  const differences: { invoiceId: string; field: string; before: string; after: string }[] = []
  for (const target of group.targets) {
    const invoice = next.invoices.find((entry) => entry.id === target.invoiceId)!
    assertInvoiceEditable(invoice)
    const item = invoice.items.find((entry) => entry.id === target.itemId)
    if (!item) throw new Error('Die ursprüngliche gemeinsame Position wurde entfernt. Bitte jede Rechnung einzeln bearbeiten.')
    for (const key of ['serviceDate', 'description', 'quantity', 'unit'] as const) {
      if (item[key] !== lesson[key]) differences.push({ invoiceId: invoice.id, field: key, before: String(item[key]), after: String(lesson[key]) })
    }
    Object.assign(item, lesson)
    invoice.period = billingPeriodFromItems(invoice.items, invoice.invoiceDate)
  }
  next.duoGroups!.find((entry) => entry.id === groupId)!.lesson = structuredClone(lesson)
  validateBackupState(next)
  const errors = duoAudienceErrors(next, duoInvoices(next, group))
  if (errors.length) throw new Error(errors.join(' '))
  return { next, differences, token: canonical({ state, lesson }) }
}

export function applyDuoLessonChange(state: AppState, groupId: string, lesson: DuoLesson, token: string, confirmed: boolean, at = new Date().toISOString()): AppState {
  const preview = previewDuoLessonChange(state, groupId, lesson)
  if (!confirmed || token !== preview.token) throw new Error('Bitte die aktuellen Unterschiede erneut prüfen und ausdrücklich bestätigen.')
  const group = preview.next.duoGroups!.find((entry) => entry.id === groupId)!
  for (const invoice of duoInvoices(preview.next, group)) invoice.updatedAt = at
  validateBackupState(preview.next)
  return preview.next
}

export function setDuoTotal(state: AppState, groupId: string, totalCents?: number): AppState {
  validateBackupState(state)
  const next = structuredClone(state), group = next.duoGroups?.find((entry) => entry.id === groupId)
  if (!group) throw new Error('Die Duo-Verknüpfung fehlt.')
  duoInvoices(next, group).forEach(assertInvoiceEditable)
  if (totalCents === undefined) delete group.totalCents
  else group.totalCents = totalCents
  validateBackupState(next)
  return next
}
