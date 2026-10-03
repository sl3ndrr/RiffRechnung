import type { InvoiceDraft, InvoiceItem, LessonType, Settings } from '../types'
import { calculateDueDate, localToday } from './calendar'
import { validId, validPrice } from './values'
import { uid } from './identities'

export function createEmptyInvoiceDraft(settings: Settings, reference = new Date()): InvoiceDraft {
  const invoiceDate = reference

  return invoiceDraftFields({
    invoiceDate: localToday(invoiceDate),
    dueDate: calculateDueDate(localToday(invoiceDate), settings.paymentTermDays),
    recipients: [],
    studentIds: [],
    recipientStrategy: 'joint',
    items: [],
    freeText: '',
  })
}

export const lessonTypeLabel: Record<LessonType, string> = {
  solo: 'Solo',
  duo: 'Duo',
}

export function lessonRate(settings: Pick<Settings, 'privateRate' | 'duoRate'>, lessonType: LessonType): number {
  return lessonType === 'duo' ? settings.duoRate : settings.privateRate
}

export function lessonDescription(description: string, lessonType: LessonType): string {
  const base = description.replace(/\s*\((?:solo|duo|einzel)\)\s*$/iu, '').trim() || 'Gitarrenunterricht'
  return `${base} (${lessonTypeLabel[lessonType]})`
}

export function applyLessonType(item: InvoiceItem, lessonType: LessonType, settings: Pick<Settings, 'privateRate' | 'duoRate'>): InvoiceItem {
  return {
    ...item,
    lessonType,
    description: lessonDescription(item.description, lessonType),
    unitPrice: lessonRate(settings, lessonType),
  }
}

export function createLessonItem(studentId: string, serviceDate: string, settings: Pick<Settings, 'privateRate' | 'duoRate'>, id = uid('item')): InvoiceItem {
  const lessonType: LessonType = 'solo'
  if (!validId(id) || !validId(studentId)) throw new Error('Eine gültige Positions- und Lernenden-ID wird benötigt.')
  if (!validPrice(lessonRate(settings, lessonType))) throw new Error('Der Standardpreis ist ungültig.')
  return {
    id,
    studentId,
    serviceDate,
    lessonType,
    description: lessonDescription('Gitarrenunterricht', lessonType),
    quantity: 1,
    unit: 'Std.',
    unitPrice: lessonRate(settings, lessonType),
  }
}


/** Shared editable values only. Each caller owns identity, numbering and frozen data. */
export function invoiceDraftFields(source: InvoiceDraft): Omit<InvoiceDraft, 'id' | 'correction' | 'period'> {
  return structuredClone({ invoiceDate: source.invoiceDate, dueDate: source.dueDate, recipients: source.recipients,
    studentIds: source.studentIds, recipientStrategy: source.recipientStrategy, items: source.items, freeText: source.freeText })
}
