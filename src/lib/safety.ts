import type { AppState, Invoice } from '../types'

export const FINALIZED_INVOICE_BLOCKED = 'Finalisierte Belege bleiben unverändert erhalten. Inhaltliche Änderungen benötigen einen verknüpften Korrekturentwurf mit Grund. Zahlungs- und Versanddaten werden getrennt verwaltet.'

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
  for (const evidence of current.historicalSnapshotCorrections) {
    if (!next.historicalSnapshotCorrections.some((entry) => entry.id === evidence.id && canonical(entry) === canonical(evidence))) throw new Error('Historische Snapshot-Differenzen müssen unverändert erhalten bleiben.')
  }
  for (const original of current.invoices.filter(isFinalizedInvoice)) {
    const candidate = next.invoices.find((invoice) => invoice.id === original.id)
    if (!candidate || candidate.status === 'draft' || originalContent(candidate) !== originalContent(original)) {
      throw new Error(FINALIZED_INVOICE_BLOCKED)
    }
  }
  for (const version of current.documentVersions) {
    if (!next.documentVersions.some((candidate) => candidate.id === version.id && canonical(candidate) === canonical(version))) throw new Error('Vollständige Belegversionen dürfen weder geändert noch entfernt werden.')
  }
  for (const payment of current.payments) {
    const candidate = next.payments.find((entry) => entry.id === payment.id)
    // Paket 08 permits only a documented business-day correction (including
    // unknown → confirmed after historic-data review). Origin, amount,
    // recordedAt and the established allocation history remain immutable.
    const permittedDayTransition = candidate && (candidate.paymentDayStatus === payment.paymentDayStatus
      || payment.paymentDayStatus === 'unknown' && candidate.paymentDayStatus === 'confirmed')
    if (!candidate || !permittedDayTransition
      || canonical({ ...candidate, paidAt: payment.paidAt, paymentDayStatus: payment.paymentDayStatus, allocations: payment.allocations }) !== canonical(payment)
      || canonical(candidate.allocations.slice(0, payment.allocations.length)) !== canonical(payment.allocations)) throw new Error('Zahlungen und bisherige Zuordnungen müssen unverändert erhalten bleiben.')
  }
  for (const admin of current.invoiceAdministration) {
    const candidate = next.invoiceAdministration.find((entry) => entry.versionId === admin.versionId)
    if (!candidate || canonical(candidate.events.slice(0, admin.events.length)) !== canonical(admin.events)
      || canonical(candidate.resolutions.slice(0, admin.resolutions.length)) !== canonical(admin.resolutions)) throw new Error('Verwaltungs- und Klärungshistorie muss erhalten bleiben.')
  }

}

export function assertReplacementAllowed(state: AppState): void {
  if (state.invoices.some(isFinalizedInvoice) || state.voidedInvoiceNumbers.length) {
    throw new Error('Ein vollständiger Austausch oder das Zurücksetzen dieses Bestands ist vorübergehend gesperrt, um ausgestellte Belege und reservierte Nummern zu erhalten. Ein separater JSON-Export bleibt möglich.')
  }
}
