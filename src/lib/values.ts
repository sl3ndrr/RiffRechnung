import type { InvoiceItem } from '../types'

// Storage boundaries, not a replacement for the exact-money work in package 05.
export const MIN_QUANTITY = 0.01
export const MAX_QUANTITY = 99.99
export const QUANTITY_INCREMENT = 0.25
export const MAX_PRICE = Number.MAX_SAFE_INTEGER / 100

export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
}

export function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_PRICE
}

export function validQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_QUANTITY && value <= MAX_QUANTITY && Math.round(value * 100) / 100 === value
}

export function parseDecimalInput(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null
  const value = Number(text.replace(',', '.'))
  if (!Number.isFinite(value) || (value === 0 && /[1-9]/.test(text))) return null
  return value
}

export function parseQuantityInput(raw: string): number | null {
  const value = parseDecimalInput(raw)
  return validQuantity(value) ? value : null
}

export function adjustQuantity(quantity: number, direction: 1 | -1): number {
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.round((quantity + direction * QUANTITY_INCREMENT) * 100) / 100))
}

export function itemNumberInput(raw: string, field: 'quantity' | 'unitPrice'): number | null {
  const value = parseDecimalInput(raw)
  return (field === 'quantity' ? validQuantity(value) : validPrice(value)) ? value : null
}

export function applyItemNumberInput(item: InvoiceItem, field: 'quantity' | 'unitPrice', raw: string): InvoiceItem {
  const value = itemNumberInput(raw, field)
  return value === null ? item : { ...item, [field]: value }
}

export function parsePaymentTermInput(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}
