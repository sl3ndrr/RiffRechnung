/** Business dates are Gregorian YYYY-MM-DD, years 0001–9999, never instants. */
export function daysInMonth(year: number, month: number): number {
  return month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
}
export function calendarParts(value: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ungültiges Kalenderdatum.')
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) throw new Error('Ungültiges Kalenderdatum.')
  return [year, month, day]
}
export function calendarDate(year: number, month: number, day: number): string {
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  calendarParts(value)
  return value
}
export function localToday(reference = new Date()): string {
  return calendarDate(reference.getFullYear(), reference.getMonth() + 1, reference.getDate())
}
export function shiftCalendarMonths(value: string, months: number): string {
  const [year, month, day] = calendarParts(value)
  if (!Number.isSafeInteger(months)) throw new Error('Ungültige Monatsverschiebung.')
  const index = year * 12 + month - 1 + months
  const targetYear = Math.floor(index / 12), targetMonth = index % 12 + 1
  return calendarDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)))
}
export function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = calendarParts(value)
  if (!Number.isSafeInteger(days) || Math.abs(days) > 3_652_058) throw new Error('Zahlungsziel außerhalb des Kalenderbereichs.')
  // UTC is used only as a timezone-free Gregorian day counter, never to derive today.
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCDate(date.getUTCDate() + days)
  return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}
/** Old timestamps retain their recorded day; new payments store a date directly. */
export function paymentDay(value: string): string {
  const day = value.slice(0, 10)
  calendarParts(day)
  return day
}
