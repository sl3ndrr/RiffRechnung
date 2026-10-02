import type { DocumentContent, Invoice } from '../types'

/** Legacy copies are read only to validate schemas through 12 before migration. */
export function documentContent(invoice: Invoice, legacyOutputCopies = false): DocumentContent {
  const content = structuredClone(invoice)
  const administrationKeys = ['status', 'paidAt', 'sentAt', 'updatedAt', 'versionId', 'correction', 'issuedAmounts', 'claimState', 'archived']
  if (!legacyOutputCopies) administrationKeys.push('snapshot', 'draftPrintSnapshot', 'period', 'legalText')
  for (const key of administrationKeys) Reflect.deleteProperty(content, key)
  return content

}
