import type { Settings } from '../types'
import { paymentDataErrors } from './paymentData'

export interface InvoiceFieldError { field: string; message: string }

/** Names and usable payment data are required; address parts are optional. */
export function invoiceSetupErrors(settings: Settings): InvoiceFieldError[] {
  return [
    ...(!settings.issuer.name.trim() ? [{ field: 'settings.issuer.name', message: 'Einstellungen → Rechnungssteller: Name / Geschäftsbezeichnung fehlt.' }] : []),
    ...paymentDataErrors(settings).map((error) => ({ field: `settings.${error.field}`, message: `Einstellungen → Bankverbindung → ${error.message}` })),
  ]
}
