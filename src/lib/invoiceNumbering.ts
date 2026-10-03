import type { AppState } from '../types'
import { parseDate } from './utils'

export function studentCodeForIndex(index: number): string {
  let value = Math.max(0, Math.floor(index)) + 1
  let code = ''
  while (value > 0) {
    value -= 1
    code = String.fromCharCode(97 + (value % 26)) + code
    value = Math.floor(value / 26)
  }
  return code
}

export function studentCodeIndex(code: string): number {
  if (!/^[a-z]+$/i.test(code)) return -1
  const value = code.toLowerCase().split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 96, 0)
  return value - 1
}

/** Exact alphabetic allocation order, including codes beyond safe numeric indexes. */
export function compareStudentCodes(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
}

export function invoiceStudentCode(state: Pick<AppState, 'students'>, studentIds: string[]): string {
  const codes = [...new Set(studentIds
    .map((id) => state.students.find((student) => student.id === id)?.billingCode?.toLowerCase())
    .filter((code): code is string => Boolean(code)))]
    .sort(compareStudentCodes)
  return codes.join('+') || 'x'
}

/** New allocations always use an annual, person/combinations specific circle. */
export function formatInvoiceNumber(sequence: number, year: number, studentCode: string): string {
  return `${year}-${String(sequence).padStart(4, '0')}-${studentCode}`
}

export function nextInvoiceAllocation(state: AppState, invoiceDate: string, studentIds: string[]): { number: string; sequence: number; counterKey: string } {
  const year = parseDate(invoiceDate).getFullYear()
  const studentCode = invoiceStudentCode(state, studentIds)
  const counterKey = `${year}:${studentCode}`
  let sequence = Math.max(1, state.counters[counterKey] ?? 1, state.counters[`${year}:*`] ?? 1)
  const documents = [...state.invoices, ...state.documentVersions.map((version) => version.content)]
  for (const invoice of documents) {
    if (invoice.number && (invoice.year ?? Number(invoice.invoiceDate.slice(0, 4))) === year && invoiceStudentCode(state, invoice.studentIds) === studentCode) {
      sequence = Math.max(sequence, (invoice.sequence ?? 0) + 1)
    }
  }
  const reservations = [...state.voidedInvoiceNumbers, ...state.documentVersions.flatMap((version) => version.registerEntries)]
  for (const reservation of reservations) {
    const match = /^(\d{4})-(\d+)-([a-z]+(?:\+[a-z]+)*)$/.exec(reservation.number)
    const old = /^(\d{4})-([a-z]+(?:\+[a-z]+)*)-(\d+)$/.exec(reservation.number)
    const reservedCode = match?.[3] ?? old?.[2]
    if (reservedCode && Number(match?.[1] ?? old?.[1]) === year && reservedCode.split('+').sort(compareStudentCodes).join('+') === studentCode) {
      sequence = Math.max(sequence, Number(match?.[2] ?? old?.[3]) + 1, (reservation.sequence ?? 0) + 1)
    }
  }
  const used = new Set([...documents, ...reservations].map((entry) => entry.number).filter(Boolean))
  let candidate = formatInvoiceNumber(sequence, year, studentCode)
  while (used.has(candidate)) candidate = formatInvoiceNumber(++sequence, year, studentCode)
  // Finalization stores sequence + 1, so both values must remain safe integers.
  if (!Number.isSafeInteger(sequence + 1)) throw new Error('Rechnungsfolge ausgeschöpft. Bestehende Nummern bleiben erhalten.')
  return { number: candidate, sequence, counterKey }
}

