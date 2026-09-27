import type { Guardian, InvoiceKind, Settings, Student, TaxPresentation } from '../types'
import { invoiceSetupErrors, type InvoiceFieldError } from './invoiceProfile'

/** The only decision point for invoice-kind-specific finalization requirements. */
export function invoiceCompliance(kind: InvoiceKind | undefined, totalCents: number, settings: Settings, recipients: Array<Guardian | Student>, presentation?: TaxPresentation): InvoiceFieldError[] {
  const showIdentifier = presentation?.showIdentifier ?? true
  const errors = invoiceSetupErrors(settings, kind !== 'small-amount' || showIdentifier)
  if (kind !== 'small-amount' && !showIdentifier) {
    errors.push({ field: 'taxPresentation.showIdentifier', message: 'Standardrechnung: Steuerkennung ausgeben ist Pflicht. Bitte im Rechnungseditor aktivieren.' })
  }
  if (kind === 'small-amount' && totalCents > 25_000) {
    errors.push({ field: 'invoiceKind', message: 'Kleinbetragsrechnung über 250,00 €: Standardrechnung erforderlich. Bitte Rechnungsart ändern und die fehlenden Empfängerangaben ergänzen.' })
  }
  if (kind !== 'small-amount' || totalCents > 25_000) {
    for (const recipient of recipients) {
      const selfPayer = 'billingCode' in recipient
      const label = `${selfPayer ? 'Personen' : 'Familien'} → ${recipient.name || recipient.id}`
      const address = selfPayer ? recipient.contact?.address : recipient.address
      for (const [field, title] of [['street', 'Straße & Hausnummer'], ['postalCode', 'PLZ'], ['city', 'Ort']] as const) {
        if (!address?.[field].trim()) errors.push({ field: `${selfPayer ? 'students' : 'guardians'}.${recipient.id}.${selfPayer ? 'contact.' : ''}address.${field}`, message: `${label}: ${title} fehlt. Bitte unter ${selfPayer ? 'Personen' : 'Familien'} ergänzen.` })
      }
    }
  }
  for (const recipient of recipients) if (!recipient.name.trim()) {
    const selfPayer = 'billingCode' in recipient
    errors.push({ field: `${selfPayer ? 'students' : 'guardians'}.${recipient.id}.name`, message: `${selfPayer ? 'Personen' : 'Familien'} → ${recipient.id}: Name fehlt. Bitte unter ${selfPayer ? 'Personen' : 'Familien'} ergänzen.` })
  }
  return errors
}
