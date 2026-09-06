import type { AppState, Invoice } from '../types'

export const SPLIT_INVOICE_BLOCKED = 'Getrennte Rechnungen sind vorübergehend gesperrt: Die bisherige Aufteilung könnte fremde Kinddaten weitergeben und Leistungen mehrfach berechnen. Eine gemeinsame Rechnung ist nur mit Empfängern möglich, die allen ausgewählten Kindern zugeordnet sind.'
export const FINALIZED_INVOICE_BLOCKED = 'Finalisierte Belege können vorübergehend weder inhaltlich geändert, zurückgesetzt noch gelöscht werden, solange keine vollständige Originalversion gesichert wird. Zahlungs- und Versandstatus bleiben änderbar.'

export function isFinalizedInvoice(invoice: Invoice): boolean {
  return invoice.status !== 'draft' || invoice.number !== null || invoice.snapshot !== undefined
}

export function assertInvoiceEditable(invoice: Invoice | undefined): void {
  if (invoice && isFinalizedInvoice(invoice)) throw new Error(FINALIZED_INVOICE_BLOCKED)
}

// Key order in an imported JSON object does not change its content.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

function originalContent(invoice: Invoice): string {
  const content = { ...invoice }
  delete content.paidAt
  delete content.sentAt
  return canonical({ ...content, status: null, updatedAt: null })
}

export function assertOriginalsPreserved(current: AppState, next: AppState): void {
  for (const original of current.invoices.filter(isFinalizedInvoice)) {
    const candidate = next.invoices.find((invoice) => invoice.id === original.id)
    if (!candidate || candidate.status === 'draft' || originalContent(candidate) !== originalContent(original)) {
      throw new Error(FINALIZED_INVOICE_BLOCKED)
    }
  }
}

export function assertReplacementAllowed(state: AppState): void {
  if (state.invoices.some(isFinalizedInvoice) || state.voidedInvoiceNumbers.length) {
    throw new Error('Ein vollständiger Austausch oder das Zurücksetzen dieses Bestands ist vorübergehend gesperrt, um ausgestellte Belege und reservierte Nummern zu erhalten. Ein separater JSON-Export bleibt möglich.')
  }
}
