import { calendarDaysBetween, localToday } from './calendar'

/** Local hours: morning 05–10, day 11–17, evening 18–04. */
export function dashboardGreeting(name: string, now: Date): string {
  const hour = now.getHours()
  const greeting = hour >= 5 && hour < 11 ? 'Guten Morgen' : hour >= 11 && hour < 18 ? 'Guten Tag' : 'Guten Abend'
  const firstName = name.trim().split(/\s+/)[0]
  return firstName ? `${greeting}, ${firstName}` : greeting
}

export function dashboardBackupDue(lastBackupAt: string | null, now: Date): boolean {
  if (!lastBackupAt) return true
  const backupAt = new Date(lastBackupAt)
  return Number.isNaN(backupAt.getTime()) || calendarDaysBetween(localToday(backupAt), localToday(now)) > 30
}
