export const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
export const dateLong = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
export const dateShort = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
const germanCollator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' })

export type PeopleSortMode = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc'

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

export function sortPeople<T extends { name: string; createdAt: string }>(entries: T[], mode: PeopleSortMode): T[] {
  const direction = mode.endsWith('-desc') ? -1 : 1
  return [...entries].sort((a, b) => {
    const primary = mode.startsWith('name')
      ? germanCollator.compare(a.name, b.name)
      : a.createdAt.localeCompare(b.createdAt)
    return direction * primary || germanCollator.compare(a.name, b.name)
  })
}

