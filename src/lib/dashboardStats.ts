import type { AppState, Invoice } from '../types'
import { calendarDate, calendarDaysBetween, calendarParts, localToday } from './calendar'
import { isActiveClaim, openCents, selectedInvoices } from './documents'
import { effectiveStatus, guardianName, studentName } from './invoiceOutput'
import { previewCents, sumCents } from './money'

export interface DashboardOpenItem {
  invoiceId: string
  number: Invoice['number']
  recipientLabel: string
  studentLabel: string
  openCents: number
  invoiceDate: string
  dueDate: string
  daysSinceInvoice: number
  daysOverdue: number
  daysUntilDue: number
  isOverdue: boolean
}

export interface DashboardStats {
  paid: { yearCents: number; allTimeCents: number; withoutConfirmedDay: { count: number; cents: number } }
  open: { count: number; totalCents: number; overdueCount: number; overdueCents: number; items: DashboardOpenItem[] }
  /** Uncalculable drafts contribute only to uncalculableCount. */
  drafts: { count: number; totalCount: number; totalCents: number; uncalculableCount: number }
  people: { guardians: number; students: number; activeStudents: number }
  monthly: { year: number; months: { month: number; cents: number; paymentCount: number }[]; availableYears: number[] }
}

/** Read-only workspace derivation; months are numbered 1–12. */
export function dashboardStats(state: AppState, now: Date, year = now.getFullYear()): DashboardStats {
  calendarDate(year, 1, 1)
  const today = localToday(now)
  const years = new Set([calendarParts(today)[0]])
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, cents: 0, paymentCount: 0 }))
  const withoutConfirmedDay = { count: 0, cents: 0 }
  // A payment is cash received once, even if unallocated or attached to an
  // archived/replaced version. Allocation changes do not duplicate or undo it.
  // confirmedPaymentDay describes full settlement; monthly reporting instead
  // needs each confirmed partial payment's day, even alongside unknown days.
  for (const payment of state.payments) {
    if (payment.paymentDayStatus !== 'confirmed' || !payment.paidAt) {
      withoutConfirmedDay.count++
      withoutConfirmedDay.cents = sumCents([withoutConfirmedDay.cents, payment.amountCents])
      continue
    }
    const [paymentYear, month] = calendarParts(payment.paidAt)
    years.add(paymentYear)
    if (paymentYear === year) {
      months[month - 1].cents = sumCents([months[month - 1].cents, payment.amountCents])
      months[month - 1].paymentCount++
    }
  }

  const invoices = selectedInvoices(state)
  const items: DashboardOpenItem[] = invoices.flatMap((invoice) => {
    if (invoice.archived || !isActiveClaim(state, invoice)) return []
    // Reuse the claim's clamped remainder, including existing overpayments.
    const remaining = openCents(state, invoice)
    if (remaining <= 0) return []
    const isOverdue = effectiveStatus(invoice, now) === 'overdue'
    return [{
      invoiceId: invoice.id, number: invoice.number,
      recipientLabel: guardianName(invoice, state.guardians, state.students), studentLabel: studentName(invoice, state.students),
      openCents: remaining, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate,
      daysSinceInvoice: Math.max(0, calendarDaysBetween(invoice.invoiceDate, today)),
      daysOverdue: isOverdue ? Math.max(0, calendarDaysBetween(invoice.dueDate, today)) : 0, isOverdue,
      daysUntilDue: Math.max(0, calendarDaysBetween(today, invoice.dueDate)),
    }]
  }).sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || b.daysOverdue - a.daysOverdue
    || a.dueDate.localeCompare(b.dueDate) || a.invoiceId.localeCompare(b.invoiceId))
  const overdue = items.filter((item) => item.isOverdue)
  const drafts = invoices.filter((invoice) => !invoice.versionId)
  const draftAmounts = drafts.map(previewCents)
  const calculableDrafts = draftAmounts.filter((amount): amount is number => amount !== null)
  return {
    paid: { yearCents: sumCents(months.map((month) => month.cents)), allTimeCents: sumCents(state.payments.map((payment) => payment.amountCents)), withoutConfirmedDay },
    open: { count: items.length, totalCents: sumCents(items.map((item) => item.openCents)), overdueCount: overdue.length, overdueCents: sumCents(overdue.map((item) => item.openCents)), items },
    drafts: { count: calculableDrafts.length, totalCount: drafts.length, totalCents: sumCents(calculableDrafts), uncalculableCount: drafts.length - calculableDrafts.length },
    people: { guardians: state.guardians.length, students: state.students.length, activeStudents: state.students.filter((student) => student.active).length },
    monthly: { year, months, availableYears: [...years].sort((a, b) => b - a) },
  }
}
