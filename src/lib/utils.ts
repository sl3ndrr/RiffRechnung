import type { AppState, Guardian, Invoice, InvoiceItem, InvoiceStatus, LessonType, Settings, Student } from '../types'

export const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
export const dateLong = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
export const dateShort = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
export const MAX_FOOTER_TEXT_LENGTH = 120
const germanCollator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' })

export type SortDirection = 'asc' | 'desc'
export type PeopleSortMode = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc'
export type InvoiceSortKey = 'date' | 'number' | 'family' | 'period' | 'status' | 'amount'

export function isFooterTextWithinLimit(value: string): boolean {
  return value.length <= MAX_FOOTER_TEXT_LENGTH
}

export function limitFooterText(value: string): string {
  return value.slice(0, MAX_FOOTER_TEXT_LENGTH)
}

export function footerTextForPrint(value: string): string {
  return limitFooterText(value.replace(/\s+/g, ' ').trim())
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

export function buildInvoicePrintPageStyle(footerText: string, invoiceNumber: string | null): string {
  const footerContent = cssContentString(footerTextForPrint(footerText))
  const invoiceReference = invoiceNumber ? cssContentString(`Rechnung ${invoiceNumber}`) : '""'
  return `
@page {
  @bottom-left {
    content: ${footerContent};
    box-sizing: border-box;
    width: 138mm;
    height: 15.5mm;
    overflow: hidden;
    padding: 3pt 0 7mm;
    border-top: .5pt solid rgb(30 90 160);
    color: #666;
    font-family: 'Inter Variable', Inter, Arial, sans-serif;
    font-size: 6.8pt;
    line-height: 1.35;
    text-align: left;
    vertical-align: bottom;
    white-space: normal;
  }
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

export function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00`)
}

export function formatDate(value: string): string {
  if (!value) return '–'
  const parsed = parseDate(value)
  return Number.isNaN(parsed.getTime()) ? value : dateShort.format(parsed)
}

export function formatDateLong(value: string): string {
  if (!value) return '–'
  const parsed = parseDate(value)
  return Number.isNaN(parsed.getTime()) ? value : dateLong.format(parsed)
}

function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calculateDueDate(invoiceDate: string, paymentTermDays: number): string {
  const parsed = parseDate(invoiceDate)
  if (Number.isNaN(parsed.getTime())) return ''
  parsed.setDate(parsed.getDate() + Math.max(0, Math.trunc(paymentTermDays)))
  return isoDate(parsed)
}

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

function itemTotalCents(item: Pick<InvoiceItem, 'quantity' | 'unitPrice'>): number {
  const total = item.quantity * item.unitPrice
  const value = Math.abs(total)
  const [coefficient, exponent = '0'] = value.toString().split('e')
  return Math.sign(total) * Math.round(Number(`${coefficient}e${Number(exponent) + 2}`))
}

export function invoiceTotal(invoice: Pick<Invoice, 'items'>): number {
  return invoice.items.reduce((sum, item) => sum + itemTotalCents(item), 0) / 100
}

export function itemTotal(item: InvoiceItem): number {
  return itemTotalCents(item) / 100
}

export function effectiveStatus(invoice: Invoice, reference = new Date()): InvoiceStatus {
  if (invoice.status === 'sent' && invoice.dueDate) {
    const dueDate = parseDate(invoice.dueDate)
    if (!Number.isNaN(dueDate.getTime()) && isoDate(dueDate) < isoDate(reference)) return 'overdue'
  }
  return invoice.status
}

export const statusLabel: Record<InvoiceStatus, string> = {
  draft: 'Entwurf',
  sent: 'Versendet',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
}

export function guardianName(invoice: Invoice, guardians: Guardian[]): string {
  const snapshot = invoice.snapshot?.guardians.map((item) => item.name).filter(Boolean)
  if (snapshot?.length) return snapshot.join(' & ')
  const names = invoice.guardianIds
    .map((id) => guardians.find((guardian) => guardian.id === id)?.name)
    .filter(Boolean)
  return names.join(' & ') || 'Ohne Empfänger'
}

export function studentName(invoice: Invoice, students: Student[]): string {
  const snapshot = invoice.snapshot?.students.map((item) => item.name).filter(Boolean)
  if (snapshot?.length) return snapshot.join(', ')
  const names = invoice.studentIds
    .map((id) => students.find((student) => student.id === id)?.name)
    .filter(Boolean)
  return names.join(', ') || 'Ohne Kind'
}

export function reopenInvoiceAsDraft(state: AppState, invoiceId: string, at = new Date().toISOString()): AppState {
  const target = state.invoices.find((invoice) => invoice.id === invoiceId)
  if (!target || target.status === 'draft') return state
  const reopened: Invoice = {
    ...target,
    number: null,
    sequence: null,
    status: 'draft',
    snapshot: undefined,
    paidAt: undefined,
    sentAt: undefined,
    updatedAt: at,
  }
  return {
    ...state,
    invoices: state.invoices.map((invoice) => invoice.id === invoiceId ? reopened : invoice),
    voidedInvoiceNumbers: target.number ? [{
      number: target.number,
      sequence: target.sequence,
      year: target.year,
      invoiceDate: target.invoiceDate,
      deletedAt: at,
      reason: 'reopened',
      amount: invoiceTotal(target),
      recipient: guardianName(target, state.guardians),
    }, ...state.voidedInvoiceNumbers] : state.voidedInvoiceNumbers,
  }
}

export function sortPeople<T extends { name: string; createdAt: string }>(entries: T[], mode: PeopleSortMode): T[] {
  const direction = mode.endsWith('-desc') ? -1 : 1
  return [...entries].sort((a, b) => {
    const primary = mode.startsWith('name')
      ? germanCollator.compare(a.name, b.name)
      : a.createdAt.localeCompare(b.createdAt)
    return direction * primary || germanCollator.compare(a.name, b.name)
  })
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
    if (key === 'family') primary = germanCollator.compare(`${guardianName(a, guardians)} ${studentName(a, students)}`, `${guardianName(b, guardians)} ${studentName(b, students)}`)
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
  const child = filenamePart(studentName(invoice, students), 'Ohne Kind')
  return `Rechnung ${number} - ${child}`
}

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

export function ensureStudentCodePattern(pattern?: string): string {
  const source = pattern?.trim() || '{YYYY}-{NNNN}'
  if (source.includes('{K}')) return source
  const sequenceToken = /\{N+\}/.exec(source)
  if (!sequenceToken || sequenceToken.index === undefined) return `${source}-{K}-{NNNN}`
  const prefix = source.slice(0, sequenceToken.index)
  const separator = /[-/_.]/.test(prefix.at(-1) ?? '') ? prefix.at(-1) : '-'
  return `${prefix}{K}${separator}${source.slice(sequenceToken.index)}`
}

export function invoiceStudentCode(state: Pick<AppState, 'students'>, studentIds: string[]): string {
  const codes = [...new Set(studentIds
    .map((id) => state.students.find((student) => student.id === id)?.billingCode?.toLowerCase())
    .filter((code): code is string => Boolean(code)))]
    .sort((a, b) => studentCodeIndex(a) - studentCodeIndex(b))
  return codes.join('') || 'x'
}

export function formatInvoiceNumber(settings: Settings, sequence: number, year: number, studentCode = 'a'): string {
  const pattern = ensureStudentCodePattern(settings.numberPattern)
  const hasSequence = /\{N+\}/.test(pattern)
  const formatted = pattern
    .replaceAll('{YYYY}', String(year))
    .replaceAll('{YY}', String(year).slice(-2))
    .replaceAll('{K}', studentCode.toLowerCase())
    .replace(/\{(N+)\}/g, (_match, digits: string) => String(sequence).padStart(digits.length, '0'))
  return hasSequence ? formatted : `${formatted}-${String(sequence).padStart(4, '0')}`
}

export function nextInvoiceAllocation(state: AppState, invoiceDate: string, studentIds: string[]): { number: string; sequence: number; counterKey: string } {
  const year = parseDate(invoiceDate).getFullYear()
  const studentCode = invoiceStudentCode(state, studentIds)
  const counterScope = state.settings.resetNumberAnnually ? String(year) : 'global'
  const counterKey = `${counterScope}:${studentCode}`
  let sequence = Math.max(1, state.counters[counterKey] ?? 1)
  let candidate = formatInvoiceNumber(state.settings, sequence, year, studentCode)
  const used = new Set([
    ...state.invoices.map((invoice) => invoice.number),
    ...state.voidedInvoiceNumbers.map((invoice) => invoice.number),
  ].filter(Boolean))
  while (used.has(candidate)) {
    sequence += 1
    candidate = formatInvoiceNumber(state.settings, sequence, year, studentCode)
  }
  return { number: candidate, sequence, counterKey }
}

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function cleanIban(value: string): string {
  return value.replace(/\s/g, '').toUpperCase()
}

export function formatIban(value: string): string {
  return cleanIban(value).replace(/(.{4})/g, '$1 ').trim()
}

export const SEPA_IBAN_LENGTH_BY_COUNTRY: Readonly<Record<string, number>> = {
  AD: 24,
  AL: 28,
  AT: 20,
  BE: 16,
  BG: 22,
  CH: 21,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  EE: 20,
  ES: 24,
  FI: 18,
  FR: 27,
  GB: 22,
  GI: 23,
  GR: 27,
  HR: 21,
  HU: 28,
  IE: 22,
  IS: 26,
  IT: 27,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MT: 31,
  NL: 18,
  NO: 15,
  PL: 28,
  PT: 25,
  RO: 24,
  RS: 22,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  VA: 22,
}

export function isValidIban(input: string): boolean {
  const iban = cleanIban(input)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  const expectedLength = SEPA_IBAN_LENGTH_BY_COUNTRY[iban.slice(0, 2)]
  if (expectedLength === undefined || iban.length !== expectedLength) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55))
  let remainder = 0
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97
  return remainder === 1
}

export function isInvoiceSetupComplete(settings: Pick<Settings, 'issuer' | 'iban'>): boolean {
  return Boolean(settings.issuer.name.trim()) && isValidIban(settings.iban)
}

function sanitizeEpc(value: string, maxLength: number): string {
  return value.replace(/[\r\n]/g, ' ').trim().slice(0, maxLength)
}

export function buildEpcPayload(invoice: Invoice, settings: Settings, amount: number): string {
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 999_999_999.99) {
    throw new Error('EPC-GiroCode: Der Betrag muss zwischen 0,01 und 999.999.999,99 EUR liegen.')
  }
  const source = invoice.snapshot
  const name = source?.accountHolder || settings.accountHolder || source?.issuer.name || settings.issuer.name
  const iban = cleanIban(source?.iban || settings.iban)
  const bic = (source?.bic || settings.bic).replace(/\s/g, '').toUpperCase()
  if (bic && !/^(?:[A-Z0-9]{8}|[A-Z0-9]{11})$/.test(bic)) {
    throw new Error('EPC-GiroCode: Die BIC muss 8 oder 11 alphanumerische Zeichen enthalten.')
  }
  const purpose = invoice.number ? `Rechnung ${invoice.number}` : 'Rechnung Entwurf'
  const fields = [
    'BCD',
    '002',
    '1',
    'SCT',
    sanitizeEpc(bic, 11),
    sanitizeEpc(name, 70),
    iban,
    `EUR${amount.toFixed(2)}`,
    '',
    '',
    sanitizeEpc(purpose, 140),
    '',
  ]
  while (fields.at(-1) === '') fields.pop()
  const payload = fields.join('\n')
  const byteLength = new TextEncoder().encode(payload).byteLength
  if (byteLength > 331) throw new Error(`EPC-GiroCode: Die Payload überschreitet mit ${byteLength} Byte das Maximum von 331 Byte.`)
  return payload
}

export function downloadText(filename: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function csvCell(value: string | number): string {
  const raw = String(value)
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  const normalized = safe.replaceAll('"', '""')
  return `"${normalized}"`
}

export function invoicesToCsv(invoices: Invoice[], guardians: Guardian[], students: Student[]): string {
  const header = ['Rechnungsnummer', 'Datum', 'Zeitraum', 'Empfänger', 'Kind(er)', 'Status', 'Netto/Gesamt EUR', 'Bezahlt am']
  const rows = invoices
    .filter((invoice) => invoice.number)
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
    .map((invoice) => [
      invoice.number ?? '',
      invoice.invoiceDate,
      invoice.period,
      guardianName(invoice, guardians),
      studentName(invoice, students),
      statusLabel[effectiveStatus(invoice)],
      invoiceTotal(invoice).toFixed(2).replace('.', ','),
      invoice.paidAt?.slice(0, 10) ?? '',
    ])
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}

export function createReminder(invoice: Invoice, guardians: Guardian[], students: Student[]): { subject: string; body: string; recipients: string[] } {
  const names = guardianName(invoice, guardians)
  const child = studentName(invoice, students)
  const numberText = invoice.number ?? 'Entwurf'
  const snapshotEmails = invoice.snapshot?.guardians.map((guardian) => guardian.email).filter(Boolean) ?? []
  const liveEmails = invoice.guardianIds
    .map((id) => guardians.find((guardian) => guardian.id === id)?.email)
    .filter((email): email is string => Boolean(email))
  const recipients = snapshotEmails.length ? snapshotEmails : liveEmails
  const subject = `Zahlungserinnerung zur Rechnung ${numberText}`
  const body = `Guten Tag ${names},\n\nbei der Durchsicht meiner Unterlagen ist mir aufgefallen, dass die Rechnung ${numberText} für den Gitarrenunterricht von ${child} über ${euro.format(invoiceTotal(invoice))} mit Fälligkeit zum ${formatDateLong(invoice.dueDate)} noch offen ist.\n\nFalls die Zahlung bereits veranlasst wurde, betrachten Sie diese Nachricht bitte als gegenstandslos. Andernfalls freue ich mich über eine zeitnahe Überweisung unter Angabe der Rechnungsnummer.\n\nVielen Dank und freundliche Grüße`
  return { subject, body, recipients }
}

export function mailtoUrl(invoice: Invoice, guardians: Guardian[], students: Student[]): string {
  const reminder = createReminder(invoice, guardians, students)
  return `mailto:${reminder.recipients.join(',')}?subject=${encodeURIComponent(reminder.subject)}&body=${encodeURIComponent(reminder.body)}`
}

export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(year, month - 1, 1)).replace('.', '')
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
