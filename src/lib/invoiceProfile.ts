import type { Address, Guardian, Invoice, InvoiceProfile, InvoiceSnapshot, Settings, TaxIdentifier, TaxIdentifierKind } from '../types'
import { paymentDataErrors } from './paymentData'

export const SMALL_BUSINESS_TAX_NOTICE = 'Steuerbefreiung für Kleinunternehmer (§ 19 UStG).'
export const TAX_IDENTIFIER_LABELS: Record<TaxIdentifierKind, string> = {
  'tax-number': 'Steuernummer',
  'vat-id': 'Umsatzsteuer-Identifikationsnummer',
  'small-business-id': 'Kleinunternehmer-Identifikationsnummer',
}
export interface InvoiceFieldError { field: string; message: string }
const required = (field: string, label: string, value: string): InvoiceFieldError[] => value.trim() ? [] : [{ field, message: `${label} fehlt.` }]
function addressErrors(field: string, label: string, value: Address & { name: string }): InvoiceFieldError[] {
  return [...required(`${field}.name`, `${label}: Name / Geschäftsbezeichnung`, value.name), ...required(`${field}.street`, `${label}: Straße & Hausnummer`, value.street), ...required(`${field}.postalCode`, `${label}: PLZ`, value.postalCode), ...required(`${field}.city`, `${label}: Ort`, value.city)]
}
export function taxIdentifierInputError(identifier: TaxIdentifier): string | null {
  const value = identifier.value.trim()
  if (!value) return 'Steuerliche Identifikationsangabe fehlt.'
  if (value.length > 64 || /[\r\n]/u.test(value)) return 'Die steuerliche Identifikationsangabe darf höchstens 64 Zeichen und keinen Zeilenumbruch enthalten.'
  return null
}
export function invoiceSetupErrors(settings: Settings): InvoiceFieldError[] {
  const errors = addressErrors('settings.issuer', 'Einstellungen → Rechnungssteller', settings.issuer)
  if (settings.invoiceProfile !== 'small-business') errors.push({ field: 'settings.invoiceProfile', message: 'Einstellungen → Rechnungsprofil: Kleinunternehmer nach § 19 UStG ausdrücklich auswählen.' })
  const identifierError = taxIdentifierInputError(settings.taxIdentifier)
  if (identifierError) errors.push({ field: 'settings.taxIdentifier.value', message: `Einstellungen → ${TAX_IDENTIFIER_LABELS[settings.taxIdentifier.kind]}: ${identifierError}` })
  errors.push(...paymentDataErrors(settings).map((error) => ({ field: `settings.${error.field}`, message: `Einstellungen → Bankverbindung → ${error.message}` })))
  return errors
}
export function invoiceProfileErrors(settings: Settings, guardians: Guardian[]): InvoiceFieldError[] {
  return [...invoiceSetupErrors(settings), ...guardians.flatMap((guardian) => addressErrors(`guardians.${guardian.id}.address`, `Familien → ${guardian.name || guardian.id}`, { ...guardian.address, name: guardian.name }))]
}
export interface TaxData { invoiceProfile: InvoiceProfile | null; taxIdentifier: TaxIdentifier | null }
export function taxDataForInvoice(invoice: Pick<Invoice, 'snapshot'>, settings: Settings): TaxData {
  if (invoice.snapshot) return { invoiceProfile: invoice.snapshot.invoiceProfile ?? null, taxIdentifier: invoice.snapshot.taxIdentifier ? structuredClone(invoice.snapshot.taxIdentifier) : null }
  return { invoiceProfile: settings.invoiceProfile, taxIdentifier: structuredClone(settings.taxIdentifier) }
}
export function snapshotTaxData(settings: Settings): Pick<InvoiceSnapshot, 'invoiceProfile' | 'taxIdentifier'> {
  return { invoiceProfile: settings.invoiceProfile, taxIdentifier: structuredClone(settings.taxIdentifier) }
}
