import type { AppState, InvoicePayment } from '../types'
import { activeInvoices, openCents } from './documents'
import { invoiceTotalCents, sumCents } from './money'
import { csvCell, guardianName, monthKey, statusLabel, studentName } from './utils'

export interface FinancialMonth {
  key: string
  invoiceCount: number
  invoiceVolumeCents: number
  paymentIncomeCents: number
}

export interface FinancialReport {
  year: number
  invoices: ReturnType<typeof activeInvoices>
  payments: InvoicePayment[]
  unknownDatePayments: InvoicePayment[]
  invoiceVolumeCents: number
  paymentIncomeCents: number
  openClaimsCents: number
  openClaimCount: number
  months: FinancialMonth[]
}

function paymentHasConfirmedDay(payment: InvoicePayment): payment is InvoicePayment & { paidAt: string } {
  return payment.paymentDayStatus === 'confirmed' && payment.paidAt !== null
}

function paymentYear(payment: InvoicePayment): number | null {
  return paymentHasConfirmedDay(payment) ? Number(payment.paidAt.slice(0, 4)) : null
}

/** A single source of truth for invoice volume, actual payment income and open claims. */
export function financialReport(state: AppState, year: number): FinancialReport {
  const invoices = activeInvoices(state).filter((invoice) => invoice.number && Number(invoice.invoiceDate.slice(0, 4)) === year)
  const payments = state.payments.filter(paymentHasConfirmedDay).filter((payment) => paymentYear(payment) === year)
  const unknownDatePayments = state.payments.filter((payment) => !paymentHasConfirmedDay(payment))
  const active = activeInvoices(state)
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`
    const monthInvoices = invoices.filter((invoice) => monthKey(invoice.invoiceDate) === key)
    const monthPayments = payments.filter((payment) => monthKey(payment.paidAt) === key)
    return {
      key,
      invoiceCount: monthInvoices.length,
      invoiceVolumeCents: sumCents(monthInvoices.map(invoiceTotalCents)),
      paymentIncomeCents: sumCents(monthPayments.map((payment) => payment.amountCents)),
    }
  })
  const openClaims = active.filter((invoice) => openCents(state, invoice) > 0)
  return {
    year,
    invoices,
    payments,
    unknownDatePayments,
    invoiceVolumeCents: sumCents(invoices.map(invoiceTotalCents)),
    paymentIncomeCents: sumCents(payments.map((payment) => payment.amountCents)),
    openClaimsCents: sumCents(openClaims.map((invoice) => openCents(state, invoice))),
    openClaimCount: openClaims.length,
    months,
  }
}

export function reportYears(state: AppState): number[] {
  return [...new Set([
    ...activeInvoices(state).filter((invoice) => invoice.number).map((invoice) => Number(invoice.invoiceDate.slice(0, 4))),
    ...state.payments.map(paymentYear).filter((year): year is number => year !== null),
  ])].sort((a, b) => b - a)
}

export function unknownPaymentDayLabel(payment: InvoicePayment): string {
  return payment.legacyPaymentDay
    ? `Zahlungsdatum unbekannt (bisheriger unbestätigter Wert: ${payment.legacyPaymentDay})`
    : 'Zahlungsdatum unbekannt'
}

/** CSV is built from the same financial report, never from a separate date rule. */
export function financialReportToCsv(state: AppState, year: number): string {
  const report = financialReport(state, year)
  const header = ['Datensatz', 'Rechnungsnummer', 'Rechnungsdatum', 'Zahlungsdatum', 'Zahlungsdatum-Status', 'Erfassungszeitpunkt', 'Empfänger', 'Kind(er)', 'Forderungsstatus', 'Rechnungsvolumen EUR', 'Zahlungseingang EUR', 'Ursprungsbeleg', 'Aktuelle Zuordnung']
  const invoiceRows = report.invoices
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || (a.number ?? '').localeCompare(b.number ?? ''))
    .map((invoice) => [
      'Rechnungsvolumen',
      invoice.number ?? '',
      invoice.invoiceDate,
      '',
      '',
      '',
      guardianName(invoice, state.guardians),
      studentName(invoice, state.students),
      invoice.claimState === 'replaced' ? 'Ersetzt – keine zusätzliche Forderung' : statusLabel[invoice.status],
      (invoiceTotalCents(invoice) / 100).toFixed(2).replace('.', ','),
      '',
      invoice.versionId ?? '',
      invoice.versionId ?? '',
    ])
  const paymentRows = [...report.payments, ...report.unknownDatePayments]
    .sort((a, b) => (a.paidAt ?? a.recordedAt).localeCompare(b.paidAt ?? b.recordedAt) || a.id.localeCompare(b.id))
    .map((payment) => {
      const source = state.documentVersions.find((version) => version.id === payment.sourceVersionId)
      const allocated = payment.allocations.at(-1)?.versionId
      const allocation = allocated ? state.documentVersions.find((version) => version.id === allocated) : undefined
      return [
        paymentHasConfirmedDay(payment) ? 'Zahlungseingang' : 'Zahlung ohne Kalenderjahr',
        source?.content.number ?? '',
        source?.content.invoiceDate ?? '',
        payment.paidAt ?? '',
        paymentHasConfirmedDay(payment) ? 'Bestätigt' : unknownPaymentDayLabel(payment),
        payment.recordedAt,
        source ? source.outputSnapshot.guardians.map((guardian) => guardian.name).join(', ') : '',
        source ? source.outputSnapshot.students.map((student) => student.name).join(', ') : '',
        allocated ? 'Zugeordnet' : 'Zur Klärung nicht zugeordnet',
        '',
        (payment.amountCents / 100).toFixed(2).replace('.', ','),
        source?.id ?? '',
        allocation?.id ?? '',
      ]
    })
  return `\uFEFF${[header, ...invoiceRows, ...paymentRows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}
