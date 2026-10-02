import type { DocumentContent, Invoice } from '../types'

export function documentContent(invoice: Invoice): DocumentContent {
  const content = structuredClone(invoice)
  const administrationKeys = ['status', 'paidAt', 'sentAt', 'updatedAt', 'versionId', 'correction', 'issuedAmounts', 'claimState', 'archived']
  for (const key of administrationKeys) Reflect.deleteProperty(content, key)
  return content

}
