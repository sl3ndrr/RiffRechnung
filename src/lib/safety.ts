import type { AppState, Invoice } from '../types'
import { createDemoState, defaultSettings } from './defaults'

export const SPLIT_INVOICE_BLOCKED = 'Getrennte Rechnungen sind vorübergehend gesperrt: Die bisherige Aufteilung könnte fremde Kinddaten weitergeben und Leistungen mehrfach berechnen. Eine gemeinsame Rechnung ist nur mit Empfängern möglich, die allen ausgewählten Kindern zugeordnet sind.'
export const FINALIZED_INVOICE_BLOCKED = 'Finalisierte Belege können vorübergehend weder inhaltlich geändert, zurückgesetzt noch gelöscht werden, solange keine vollständige Originalversion gesichert wird. Zahlungs- und Versandstatus bleiben änderbar.'
export const DIRECTORY_BACKUP_BLOCKED = 'Ordnerbackups sind vorübergehend schreibgeschützt, weil Konflikte und der Erhalt der bisherigen Sicherung noch nicht zuverlässig abgesichert sind. Bitte ein separates JSON-Backup exportieren.'

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

export function demoBlockedReason(state: AppState, folderChecked: boolean, folderConnected: boolean, settingsTouched = false): string | null {
  if (!folderChecked) return 'Beispieldaten sind gesperrt, solange ein gespeicherter Backup-Ordner nicht geprüft werden konnte.'
  if (folderConnected) return 'Beispieldaten sind bei verbundenem Backup-Ordner bis zum isolierten Demomodus gesperrt.'
  if (settingsTouched || state.guardians.length || state.students.length || state.invoices.length || state.voidedInvoiceNumbers.length
    || state.audit.length || Object.keys(state.counters).length || state.nextStudentCodeIndex !== 0
    || canonical(state.settings) !== canonical(defaultSettings)) {
    return 'Beispieldaten sind bis zum isolierten Demomodus gesperrt: Es gibt bereits eigene Daten oder geänderte Einstellungen.'
  }
  return null
}

export function loadDemoState(state: AppState, folderChecked: boolean, folderConnected: boolean, settingsTouched = false): AppState {
  const reason = demoBlockedReason(state, folderChecked, folderConnected, settingsTouched)
  if (reason) throw new Error(reason)
  return createDemoState()
}
