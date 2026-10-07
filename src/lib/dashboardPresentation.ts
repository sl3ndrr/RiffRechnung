import { calendarDaysBetween } from './calendar'
import type { DashboardOpenItem, DashboardStats } from './dashboardStats'
import { sumCents } from './money'

/** Local hours: morning 05–10, day 11–17, evening 18–04. */
export function dashboardGreeting(name: string, now: Date): string {
  const hour = now.getHours()
  const greeting = hour >= 5 && hour < 11 ? 'Guten Morgen' : hour >= 11 && hour < 18 ? 'Guten Tag' : 'Guten Abend'
  const firstName = name.trim().split(/\s+/)[0]
  return firstName ? `${greeting}, ${firstName}` : greeting
}

export function dashboardBackupDue(lastBackupAt: string | null, now: Date): boolean {
  if (!lastBackupAt) return true
  const backupAt = Date.parse(lastBackupAt)
  return Number.isNaN(backupAt) || now.getTime() - backupAt > 30 * 24 * 60 * 60 * 1000
}

/** Anzeigeableitung: Jahresbetrag, kaufmännisch auf ganzzahlige Cent gerundet. */
export function dashboardMonthlyAverage(monthly: DashboardStats['monthly'], now: Date): number {
  const divisor = monthly.year === now.getFullYear() ? now.getMonth() + 1 : 12
  return Math.round(sumCents(monthly.months.map(({ cents }) => cents)) / divisor)
}

/** Bereits überfällige Ansprüche stehen im Fehlerchip; hier folgt der nächste Termin. */
export function dashboardNextDue(items: readonly DashboardOpenItem[]): DashboardOpenItem | null {
  return items.filter((item) => !item.isOverdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.invoiceId.localeCompare(b.invoiceId))[0] ?? null
}

/** Rein dekorativer Anteil der verstrichenen Zahlungsfrist, begrenzt auf 0–1. */
export function dashboardDeadlineProgress(item: DashboardOpenItem): number {
  const duration = calendarDaysBetween(item.invoiceDate, item.dueDate)
  if (duration <= 0) return item.daysUntilDue === 0 ? 1 : 0
  return Math.min(1, Math.max(0, item.daysSinceInvoice / duration))
}
