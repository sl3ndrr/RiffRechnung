import type { Guardian, Invoice, InvoiceItem, InvoiceStatus, Student } from '../types'
import { localToday } from './calendar'
import { decimalInputText, invoiceTotal, itemTotalCents } from './money'
import { euro, parseDate } from './utils'
import { liveRecipient, recipientRefs, snapshotRecipients } from './recipients'

const germanCollator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' })
export type SortDirection = 'asc' | 'desc'
export type InvoiceSortKey = 'date' | 'number' | 'family' | 'period' | 'status' | 'amount'

export function billingPeriodFromItems(items: Array<Pick<InvoiceItem, 'serviceDate'>>, fallbackDate = ''): string {
  const dates = items
    .map((item) => item.serviceDate)
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDate(value).getTime()))
    .sort()
  const firstValue = dates[0] ?? fallbackDate
  const lastValue = dates.at(-1) ?? fallbackDate
  if (!firstValue || !lastValue) return ''
  const first = parseDate(firstValue)
  const last = parseDate(lastValue)
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return ''
  const monthYear = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) return monthYear.format(first)
  if (first.getFullYear() === last.getFullYear()) {
    const month = new Intl.DateTimeFormat('de-DE', { month: 'long' })
    return `${month.format(first)} bis ${monthYear.format(last)}`
  }
  return `${monthYear.format(first)} bis ${monthYear.format(last)}`
}

export function effectiveStatus(invoice: Invoice, reference = new Date()): InvoiceStatus {
  if (invoice.status === 'sent' && invoice.claimState !== 'replaced' && invoice.openAmountCents !== 0 && invoice.dueDate) {
    const dueDate = parseDate(invoice.dueDate)
    if (!Number.isNaN(dueDate.getTime()) && localToday(dueDate) < localToday(reference)) return 'overdue'
  }
  return invoice.status
}

export const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'Entwurf',
  sent: 'Versendet',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
}

export function guardianName(invoice: Invoice, guardians: Guardian[], students: Student[] = []): string {
  const snapshot = invoice.snapshot && snapshotRecipients(invoice.snapshot).map((item) => item.name).filter(Boolean)
  if (snapshot) return snapshot.join(' & ') || 'Ohne Empfänger'
  const names = recipientRefs(invoice)
    .map((ref) => liveRecipient(ref, guardians, students)?.name)
    .filter(Boolean)
  return names.join(' & ') || 'Ohne Empfänger'
}

export function studentName(invoice: Invoice, students: Student[]): string {
  const snapshot = (invoice.snapshot ?? invoice.draftPrintSnapshot)?.students.map((item) => item.name).filter(Boolean)
  if (snapshot) return snapshot.join(', ') || 'Ohne Lernende'
  if (invoice.status === 'draft') return 'Ohne Lernende'
  const names = invoice.studentIds
    .map((id) => students.find((student) => student.id === id)?.name)
    .filter(Boolean)
  return names.join(', ') || 'Ohne Lernende'
}

function invoicePeriodSortValue(invoice: Invoice): string {
  return invoice.items
    .map((item) => item.serviceDate)
    .filter(Boolean)
    .sort()[0] ?? invoice.invoiceDate
}

const invoiceStatusOrder: Record<InvoiceStatus, number> = {
  draft: 0,
  sent: 1,
  overdue: 2,
  paid: 3,
}

export function sortInvoices(invoices: Invoice[], key: InvoiceSortKey, direction: SortDirection, guardians: Guardian[], students: Student[]): Invoice[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...invoices].sort((a, b) => {
    let primary = 0
    if (key === 'date') primary = a.invoiceDate.localeCompare(b.invoiceDate) || a.createdAt.localeCompare(b.createdAt)
    if (key === 'number') primary = germanCollator.compare(a.number ?? 'Entwurf', b.number ?? 'Entwurf')
    if (key === 'family') primary = germanCollator.compare(`${guardianName(a, guardians, students)} ${studentName(a, students)}`, `${guardianName(b, guardians, students)} ${studentName(b, students)}`)
    if (key === 'period') primary = invoicePeriodSortValue(a).localeCompare(invoicePeriodSortValue(b))
    if (key === 'status') primary = invoiceStatusOrder[effectiveStatus(a)] - invoiceStatusOrder[effectiveStatus(b)]
    if (key === 'amount') primary = invoiceTotal(a) - invoiceTotal(b)
    return multiplier * primary || b.invoiceDate.localeCompare(a.invoiceDate) || b.createdAt.localeCompare(a.createdAt)
  })
}

function filenamePart(value: string, fallback: string): string {
  const normalized = Array.from(value.normalize('NFKC'), (character) => character.charCodeAt(0) < 32 ? '-' : character).join('')
  const sanitized = normalized
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/g, '')
    .trim()
  return sanitized || fallback
}

export function invoicePdfTitle(invoice: Invoice, students: Student[]): string {
  const number = filenamePart(invoice.number ?? 'Entwurf', 'Entwurf')
  const child = filenamePart(studentName(invoice, students), 'Ohne Lernende')
  return `Rechnung ${number} - ${child}`
}

function cssContentString(value: string): string {
  let escaped = ''
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    escaped += character === '\\' || character === '"' || character === '<' || codePoint < 32 || codePoint === 127
      ? `\\${codePoint.toString(16)} `
      : character
  }
  return `"${escaped}"`
}

export function buildInvoicePrintPageStyle(invoiceNumber: string | null): string {
  const invoiceReference = invoiceNumber ? cssContentString(`Rechnung ${invoiceNumber}`) : '""'
  // Margin boxes are only an enhancement. Essential legal and reference text is
  // also present in the ordinary document flow in InvoicePrint.
  return `
@page {
  @bottom-right {
    content: "Seite " counter(page) " von " counter(pages);
    box-sizing: border-box;
    width: 32mm;
    height: 15.5mm;
    padding: 3pt 0 7mm;
    border-top: .5pt solid rgb(30 90 160);
    color: #666;
    font-family: 'Inter Variable', Inter, Arial, sans-serif;
    font-size: 6.8pt;
    line-height: 1.35;
    text-align: right;
    vertical-align: bottom;
    white-space: nowrap;
  }
  @top-right {
    content: ${invoiceReference};
    padding-top: 5mm;
    color: #777;
    font-family: 'Inter Variable', Inter, Arial, sans-serif;
    font-size: 6.5pt;
    line-height: 1.2;
    text-align: right;
    vertical-align: top;
  }
}
@page :first {
  @top-right { content: ""; }
}
`
}

export function groupItemsByStudent(items: InvoiceItem[], studentIds: string[]): Array<[string, InvoiceItem[]]> {
  const known = new Set(studentIds)
  const groups = new Map<string, InvoiceItem[]>()
  for (const item of items) {
    const key = known.has(item.studentId) ? item.studentId : studentIds[0] ?? ''
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
}

export function outputItemTotal(invoice: Invoice, item: InvoiceItem): number {
  return outputItemCents(invoice, item) / 100
}


export function outputItemCents(invoice: Invoice, item: InvoiceItem): number {
  const index = invoice.items.findIndex((entry) => entry.id === item.id)
  return invoice.issuedAmounts && index >= 0 ? invoice.issuedAmounts.itemCents[index] : itemTotalCents(item)
}

export function outputUnitPrice(invoice: Invoice, item: InvoiceItem): string {
  // Preserve historical formatting, including its original two-decimal display.
  if (invoice.issuedAmounts?.calculation === 'legacy-v1') return euro.format(item.unitPrice)
  const [whole, fraction = ''] = decimalInputText(item.unitPrice).split('.')
  return `${new Intl.NumberFormat('de-DE').format(BigInt(whole))},${fraction.padEnd(2, '0')}\u00a0€`
}


