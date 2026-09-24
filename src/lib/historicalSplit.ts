import type { AppState, Invoice } from '../types'

export function needsHistoricalSplitReview(state: AppState, invoice: Invoice): boolean {
  if (invoice.recipientStrategy !== 'separate' || !invoice.versionId) return false
  return state.documentVersions.find((version) => version.id === invoice.versionId)?.provenance === 'oldest-available'
}
