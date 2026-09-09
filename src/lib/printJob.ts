import type { Guardian, Invoice, Settings, Student } from '../types'
import { buildEpcPayload, invoiceTotal } from './utils'
import { paymentDataForInvoice } from './paymentData'

export interface PrintRequest {
  id: string
  invoice: Invoice
  guardians: Guardian[]
  students: Student[]
  settings: Settings
  includeGiroCode: boolean
  giroCodeFallbackReason?: string
}

export type GiroCodeResolution =
  | { kind: 'ready'; payload: string }
  | { kind: 'disabled'; reason: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; reason: string }

export type EpcPayloadBuilder = (invoice: Invoice, settings: Settings, amount: number) => string

export type GiroCodeEncoder = (payload: string) => Promise<string>

/** Normalises encoder rejections so the UI can offer the explicit no-code fallback. */
export async function generateGiroCode(payload: string, encoder: GiroCodeEncoder): Promise<string> {
  try {
    return await encoder(payload)
  } catch (error) {
    const reason = error instanceof Error && error.message ? `: ${error.message}` : ''
    throw new Error(`GiroCode konnte nicht erzeugt werden${reason}`)
  }
}

/**
 * Determines whether the optional GiroCode can accompany this exact invoice output.
 * It never changes the invoice or weakens the finalisation rules.
 */
export function resolveGiroCode(
  invoice: Invoice,
  settings: Settings,
  includeGiroCode: boolean,
  payloadBuilder: EpcPayloadBuilder = buildEpcPayload,
): GiroCodeResolution {
  if (!includeGiroCode) {
    return { kind: 'disabled', reason: 'Diese Rechnung wird auf ausdrücklichen Wunsch ohne GiroCode gedruckt.' }
  }
  if (!invoice.number || invoice.status === 'draft') {
    return { kind: 'unavailable', reason: 'GiroCode nur für finalisierte Rechnungen.' }
  }

  const amount = invoiceTotal(invoice)
  if (amount <= 0) {
    return { kind: 'unavailable', reason: 'Für einen Rechnungsbetrag von 0,00 € ist kein GiroCode vorgesehen.' }
  }

  const account = paymentDataForInvoice(invoice, settings)
  if (!account.accountHolder.trim()) {
    return { kind: 'unavailable', reason: 'Kontoinhaber für den GiroCode fehlt in dieser Belegversion.' }
  }
  if (!account.iban.trim()) {
    return { kind: 'unavailable', reason: 'IBAN für den GiroCode fehlt in dieser Belegversion.' }
  }

  try {
    const payload = payloadBuilder(invoice, settings, amount)
    const byteLength = new TextEncoder().encode(payload).byteLength
    if (byteLength > 331) throw new Error(`EPC-GiroCode: Die Payload überschreitet mit ${byteLength} Byte das Maximum von 331 Byte.`)
    return { kind: 'ready', payload }
  } catch (error) {
    return { kind: 'error', reason: error instanceof Error ? error.message : 'GiroCode konnte nicht erzeugt werden.' }
  }
}

/** Reject late asynchronous results from another invoice or an earlier print action. */
export function isCurrentPrintRequest(request: PrintRequest | null, requestId: string, invoiceId: string): request is PrintRequest {
  return Boolean(request && request.id === requestId && request.invoice.id === invoiceId)
}
