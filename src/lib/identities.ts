import type { InvoiceItem } from '../types'
import { validId } from './values'

export function freshId(prefix: string, occupied: Set<string>, createId: (prefix: string) => string): string {
  for (let attempt = 0; attempt < 32; attempt++) {
    const id = createId(prefix)
    if (!validId(id)) throw new Error('Der ID-Generator hat eine ungültige Identität erzeugt.')
    if (!occupied.has(id)) { occupied.add(id); return id }
  }
  throw new Error('Es konnte keine eindeutige Identität erzeugt werden. Bitte erneut versuchen.')
}

// Active invoice copies/splits use fresh positions. Document version copies
// must define their own identity/reference scope in package 04.
export function copyItemsWithFreshIds(items: InvoiceItem[], occupied: Set<string>, createId: (prefix: string) => string): InvoiceItem[] {
  const used = new Set([...occupied, ...items.map((item) => item.id)])
  return items.map((item) => ({ ...structuredClone(item), id: freshId('item', used, createId) }))
}
