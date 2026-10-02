import type { Guardian, Settings, Student } from '../types'
import { invoiceSetupErrors, type InvoiceFieldError } from './invoiceSetup'

export function invoiceCompliance(settings: Settings, recipients: Array<Guardian | Student>): InvoiceFieldError[] {
  return [
    ...invoiceSetupErrors(settings),
    ...recipients.filter((recipient) => !recipient.name.trim()).map((recipient) => ({
      field: `${'billingCode' in recipient ? 'students' : 'guardians'}.${recipient.id}.name`,
      message: `Personen → ${recipient.id}: Name fehlt. Bitte unter Personen ergänzen.`,
    })),
  ]
}
