import type { AppState, DuoGroup, Invoice } from '../types'
import { canonical } from './envelope'
import { correctionErrors, snapshotFor } from './documents'
import { invoiceTotalCents, sumCents } from './money'
import { assertInvoiceEditable } from './safety'
import { euro, invoiceFinalizationErrors } from './utils'
import { validateBackupState } from './validation'

export function duoForInvoice(state: AppState, invoiceId: string): DuoGroup | undefined {
  return state.duoGroups?.find((group) => group.targets.some((target) => target.invoiceId === invoiceId))
}

export function duoInvoices(state: AppState, group: DuoGroup): Invoice[] {
  return group.targets.flatMap((target) => state.invoices.filter((invoice) => invoice.id === target.invoiceId))
}

export function duoAudienceErrors(state: AppState, invoices: Invoice[]): string[] {
  const errors: string[] = []
  if (invoices.length !== 2 || invoices.some((invoice) => invoice.studentIds.length !== 1) || invoices[0].studentIds[0] === invoices[1].studentIds[0]) {
    return ['Zwei Zielrechnungen benötigen genau zwei verschiedene Lernende, je einen pro Rechnung.']
  }
  const students = invoices.map((invoice) => state.students.find((student) => student.id === invoice.studentIds[0]))
  if (students.some((student) => !student)) return ['Bitte beide Lernenden erneut zuordnen.']
  if (students[0]!.guardianIds.some((id) => students[1]!.guardianIds.includes(id))) errors.push('Gemeinsamer Haushalt: Eine empfangende Person ist beiden Lernenden zugeordnet. Bitte eine gemeinsame Rechnung erstellen.')
  invoices.forEach((invoice, i) => {
    if (invoice.recipientStrategy !== 'joint' || invoice.correction) errors.push('Duo-Ziele müssen eigenständige gemeinsame Rechnungen sein.')
    if (invoice.items.some((item) => item.studentId !== invoice.studentIds[0])) errors.push(`Rechnung ${i + 1}: Positionen dürfen nur den eigenen Lernenden betreffen.`)
    const partner = students[1 - i]!
    const foreignNames = [partner.name, ...state.guardians.filter((guardian) => partner.guardianIds.includes(guardian.id)).map((guardian) => guardian.name)].filter((name) => name.trim())
    const fields = [invoice.introText, invoice.freeText, invoice.legalText, ...invoice.items.map((item) => item.description)]
    if (fields.some((text) => foreignNames.some((name) => text.toLocaleLowerCase('de-DE').includes(name.toLocaleLowerCase('de-DE'))))) errors.push(`Rechnung ${i + 1}: Ausgabetext enthält einen Namen des anderen Haushalts. Bitte getrennt formulieren.`)
  })
  return errors
}

/** The token binds the confirmation to the exact reviewed state, including output settings. */
export function previewDuo(state: AppState, groupId: string) {
  validateBackupState(state)
  const group = state.duoGroups?.find((entry) => entry.id === groupId)
  if (!group) throw new Error('Die Duo-Verknüpfung fehlt.')
  const invoices = duoInvoices(state, group)
  if (invoices.length !== 2) throw new Error('Der Partnerentwurf fehlt. Die verbleibende Rechnung kann eigenständig bearbeitet und abgeschlossen werden.')
  invoices.forEach(assertInvoiceEditable)
  const errors = duoAudienceErrors(state, invoices)
  invoices.forEach((invoice, index) => errors.push(...[...invoiceFinalizationErrors(state, invoice), ...correctionErrors(state, invoice)].map((message) => `Rechnung ${index + 1}: ${message}`)))
  const totalCents = sumCents(invoices.map(invoiceTotalCents))
  if (group.totalCents !== undefined && totalCents !== group.totalCents) errors.push(`Gruppenbetrag ${euro.format(group.totalCents / 100)}, Zielbeträge ${euro.format(totalCents / 100)}: Differenz ${euro.format((totalCents - group.totalCents) / 100)}. Bitte die eigenen Positionen berichtigen.`)
  return { token: canonical(state), errors, totalCents, invoices: invoices.map((invoice) => ({ ...structuredClone(invoice), snapshot: snapshotFor(state, invoice) })) }
}

export function groupCentsInput(raw: string): number | undefined {
  if (!raw.trim()) return undefined
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error('Gruppenbetrag bitte als Eurobetrag mit höchstens zwei Nachkommastellen eingeben.')
  const [whole, fraction = ''] = raw.replace(',', '.').split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Gruppenbetrag ist zu groß.')
  return Number(cents)
}
