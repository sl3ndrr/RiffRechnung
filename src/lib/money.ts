import type { Invoice, InvoiceItem } from '../types'

// JSON stores numbers; arithmetic interprets their canonical decimal spelling.
// No binary multiplication occurs before the rounding boundary.
export const MAX_NEW_CENTS = 99_999_999_999 // EPC-compatible EUR 999,999,999.99
export const MAX_STORED_CENTS = Number.MAX_SAFE_INTEGER

type Decimal = { coefficient: bigint; scale: number }
export function decimal(value: number | string): Decimal {
  const text = String(value)
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text)
  if (!match || text.length > 400) throw new Error('Ungültige nichtnegative Dezimalzahl.')
  const scale = (match[2]?.length ?? 0) - Number(match[3] ?? 0)
  if (!Number.isSafeInteger(scale) || Math.abs(scale) > 400) throw new Error('Dezimalzahl außerhalb des unterstützten Bereichs.')
  return { coefficient: BigInt(match[1] + (match[2] ?? '')), scale }
}
export function sameDecimal(a: number | string, b: number | string): boolean {
  const x = decimal(a), y = decimal(b)
  const scale = Math.max(x.scale, y.scale)
  return x.coefficient * 10n ** BigInt(scale - x.scale) === y.coefficient * 10n ** BigInt(scale - y.scale)
}
function safeCents(value: bigint): number {
  if (value < 0n || value > BigInt(MAX_STORED_CENTS)) throw new Error('Der Betrag überschreitet den sicheren Centbereich.')
  return Number(value)
}
export function itemTotalCents(item: Pick<InvoiceItem, 'quantity' | 'unitPrice'>): number {
  const q = decimal(item.quantity), p = decimal(item.unitPrice)
  const product = q.coefficient * p.coefficient
  const scale = q.scale + p.scale - 2
  if (scale <= 0) return safeCents(product * 10n ** BigInt(-scale))
  const divisor = 10n ** BigInt(scale)
  return safeCents((product + divisor / 2n) / divisor) // half up, per position
}
export function sumCents(values: number[]): number {
  return safeCents(values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Ungültiger Centbetrag.')
    return sum + BigInt(value)
  }, 0n))
}
export function invoiceTotalCents(invoice: Pick<Invoice, 'items' | 'issuedAmounts'>): number {
  return invoice.issuedAmounts?.totalCents ?? sumCents(invoice.items.map(itemTotalCents))
}
export function moneyErrors(invoice: Pick<Invoice, 'items'>): string[] {
  try {
    if (invoiceTotalCents(invoice) > MAX_NEW_CENTS) return ['Neue Rechnungen dürfen höchstens 999.999.999,99 EUR betragen. Bitte Mengen und Preise prüfen.']
    return []
  } catch (error) { return [error instanceof Error ? error.message : 'Ungültiger Betrag.'] }
}
export function previewCents(invoice: Pick<Invoice, 'items'>): number | null {
  try { return invoiceTotalCents(invoice) } catch { return null }
}

// Frozen historical algorithm. Only migration and the old/new draft review use it.
export function legacyItemCents(item: Pick<InvoiceItem, 'quantity' | 'unitPrice'>): number {
  const total = item.quantity * item.unitPrice
  const [coefficient, exponent = '0'] = Math.abs(total).toString().split('e')
  return Math.sign(total) * Math.round(Number(`${coefficient}e${Number(exponent) + 2}`))
}
export function draftAmountChange(invoice: Pick<Invoice, 'items'>): { before: number; after: number | null; changed: boolean } {
  const beforeItems = invoice.items.map(legacyItemCents)
  const after = previewCents(invoice)
  return { before: beforeItems.reduce((sum, value) => sum + value, 0), after,
    changed: after === null || invoice.items.some((item, i) => itemTotalCents(item) !== beforeItems[i]) }
}

/** Plain spelling for form round trips, including subnormal legacy prices. */
export function decimalInputText(value: number): string {
  const { coefficient, scale } = decimal(value)
  if (scale <= 0) return String(coefficient) + '0'.repeat(-scale)
  const digits = String(coefficient).padStart(scale + 1, '0')
  return digits.slice(0, -scale) + '.' + digits.slice(-scale)
}
