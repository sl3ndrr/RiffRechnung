import type { Guardian, InvoiceKind, Settings } from '../types'
import { invoiceSetupErrors, type InvoiceFieldError } from './invoiceProfile'

/** The only decision point for invoice-kind-specific finalization requirements. */
export function invoiceCompliance(kind: InvoiceKind | undefined, totalCents: number, settings: Settings, recipients: Guardian[]): InvoiceFieldError[] {
  const errors = invoiceSetupErrors(settings)
  if (kind === 'small-amount' && totalCents > 25_000) {
    errors.push({ field: 'invoiceKind', message: 'Kleinbetragsrechnung über 250,00 €: Standardrechnung erforderlich. Bitte Rechnungsart ändern und die fehlenden Empfängerangaben ergänzen.' })
  }
  if (kind !== 'small-amount' || totalCents > 25_000) {
    for (const recipient of recipients) {
      const label = `Familien → ${recipient.name || recipient.id}`
      for (const [field, title] of [['street', 'Straße & Hausnummer'], ['postalCode', 'PLZ'], ['city', 'Ort']] as const) {
        if (!recipient.address[field].trim()) errors.push({ field: `guardians.${recipient.id}.address.${field}`, message: `${label}: ${title} fehlt. Bitte unter Familien ergänzen.` })
      }
    }
  }
  for (const recipient of recipients) if (!recipient.name.trim()) errors.push({ field: `guardians.${recipient.id}.name`, message: `Familien → ${recipient.id}: Name fehlt. Bitte unter Familien ergänzen.` })
  return errors
}
