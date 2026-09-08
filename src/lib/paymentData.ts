import type { Invoice, InvoiceSnapshot, Settings } from '../types'

export interface PaymentData {
  accountHolder: string
  iban: string
  bic: string
  bankName: string
}

export type PaymentField = keyof PaymentData
export interface PaymentDataError { field: PaymentField; code: 'required' | 'country' | 'format' | 'checksum'; message: string }

export function cleanIban(value: string): string {
  return value.replace(/\s/gu, '').toUpperCase()
}

export function formatIban(value: string): string {
  return cleanIban(value).replace(/(.{4})/gu, '$1 ').trim()
}

function hasValidMod97(value: string): boolean {
  const rearranged = value.slice(4) + value.slice(0, 4)
  let remainder = 0
  for (const character of rearranged) {
    const numeric = /[A-Z]/u.test(character) ? String(character.charCodeAt(0) - 55) : character
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

export function germanIbanError(input: string): string | null {
  const iban = cleanIban(input)
  if (/^[A-Z]{2}/u.test(iban) && !iban.startsWith('DE')) return 'Es werden nur deutsche IBANs unterstützt.'
  if (!iban) return 'Bitte eine deutsche IBAN eingeben.'
  if (!/^DE\d{20}$/u.test(iban)) return 'Bitte eine deutsche IBAN im Format DE plus 20 Ziffern (insgesamt 22 Zeichen) eingeben.'
  if (!hasValidMod97(iban)) return 'Die Prüfsumme der deutschen IBAN ist nicht korrekt.'
  return null
}

export function isValidGermanIban(input: string): boolean {
  return germanIbanError(input) === null
}

export function normalizeBic(value: string): string {
  return value.replace(/\s/gu, '').toUpperCase()
}

export function bicError(input: string): string | null {
  const bic = normalizeBic(input)
  if (!bic) return null
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/u.test(bic)) {
    return 'Bitte eine gültige BIC mit 8 oder 11 Zeichen eingeben (4 Buchstaben, 2-stelliger Ländercode, 2 Zeichen und optional 3-stellige Filiale).'
  }
  return null
}

export function normalizePaymentData(data: PaymentData): PaymentData {
  return { ...data, iban: cleanIban(data.iban), bic: normalizeBic(data.bic) }
}

export function paymentDataErrors(data: Pick<PaymentData, 'accountHolder' | 'iban' | 'bic'>): PaymentDataError[] {
  const errors: PaymentDataError[] = []
  if (!data.accountHolder.trim()) errors.push({ field: 'accountHolder', code: 'required', message: 'Kontoinhaber in den Einstellungen angeben.' })
  const ibanMessage = germanIbanError(data.iban)
  if (ibanMessage) errors.push({ field: 'iban', code: ibanMessage === 'Es werden nur deutsche IBANs unterstützt.' ? 'country' : cleanIban(data.iban) && /^DE\d{20}$/u.test(cleanIban(data.iban)) ? 'checksum' : cleanIban(data.iban) ? 'format' : 'required', message: ibanMessage })
  const bicMessage = bicError(data.bic)
  if (bicMessage) errors.push({ field: 'bic', code: 'format', message: bicMessage })
  return errors
}

export function paymentDataForInvoice(invoice: Pick<Invoice, 'snapshot'>, settings: Settings): PaymentData {
  const source: InvoiceSnapshot | Settings = invoice.snapshot ?? settings
  return {
    accountHolder: source.accountHolder,
    iban: source.iban,
    bic: source.bic,
    bankName: source.bankName,
  }
}
