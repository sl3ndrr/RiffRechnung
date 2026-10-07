import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardFixture, dashboardNow } from './dashboardFixtures'
import { dashboardStats } from '../src/lib/dashboardStats'
import { dashboardBackupDue, dashboardGreeting, dashboardMonthlyAverage, dashboardNextDue, dashboardDeadlineProgress } from '../src/lib/dashboardPresentation'

test('3.AP3: Begrüßung an allen lokalen Tageszeitgrenzen', () => {
  for (const [time, expected] of [['00:00', 'Guten Abend'], ['04:59', 'Guten Abend'], ['05:00', 'Guten Morgen'], ['10:59', 'Guten Morgen'], ['11:00', 'Guten Tag'], ['17:59', 'Guten Tag'], ['18:00', 'Guten Abend'], ['23:59', 'Guten Abend']]) {
    assert.equal(dashboardGreeting('  Anna Maria Müller  ', new Date(`2026-09-16T${time}:00`)), `${expected}, Anna`)
  }
  assert.equal(dashboardGreeting(' \t\n ', new Date('2026-09-16T09:00:00')), 'Guten Morgen')
})

test('3.AP3: Backup-Erinnerung erscheint erst nach mehr als 30 Tagen seit dem Exportzeitpunkt', () => {
  const now = new Date('2026-04-01T12:00:00Z')
  const boundary = now.getTime() - 30 * 24 * 60 * 60 * 1000
  assert.equal(dashboardBackupDue(null, now), true)
  assert.equal(dashboardBackupDue('ungültig', now), true)
  assert.equal(dashboardBackupDue(new Date(boundary).toISOString(), now), false)
  assert.equal(dashboardBackupDue(new Date(boundary - 1).toISOString(), now), true)
  assert.equal(dashboardBackupDue(new Date('2026-04-02T00:00:00').toISOString(), now), false)
})


test('Dashboard: Monatsdurchschnitt rundet nur die Anzeige auf ganze Cent', () => {
  const monthly = (year: number, cents: number) => ({ year, availableYears: [year], months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, cents: index === 0 ? cents : 0, paymentCount: 0 })) })
  assert.equal(dashboardMonthlyAverage(monthly(2026, 1000), new Date('2026-09-16T09:00:00')), 111)
  assert.equal(dashboardMonthlyAverage(monthly(2026, 101), new Date('2026-02-01T09:00:00')), 51)
  assert.equal(dashboardMonthlyAverage(monthly(2025, 1000), new Date('2026-09-16T09:00:00')), 83)
  assert.equal(dashboardMonthlyAverage(monthly(2026, 101), new Date('2026-01-01T09:00:00')), 101)
  assert.equal(dashboardMonthlyAverage(monthly(2026, 0), new Date('2026-12-31T09:00:00')), 0)
  assert.equal(dashboardMonthlyAverage(monthly(2026, 123456789), new Date('2026-12-31T09:00:00')), 10288066)
})

test('Dashboard: nächste Fälligkeit überspringt Überfällige, schließt heute ein und verändert keine Items', () => {
  const items = dashboardStats(dashboardFixture(), dashboardNow).open.items
  const before = structuredClone(items)
  assert.equal(dashboardNextDue(items)?.dueDate, '2026-09-20')
  assert.equal(dashboardNextDue([]), null)
  assert.equal(dashboardNextDue(items.filter((item) => item.isOverdue)), null)
  const today = { ...items[1], dueDate: '2026-09-16', daysUntilDue: 0 }
  assert.equal(dashboardNextDue([...items, today]), today)
  assert.deepEqual(items, before)
  const sameDay = { ...today, invoiceId: 'aaa' }
  assert.equal(dashboardNextDue([today, sameDay]), sameDay)
})

test('Dashboard: Fristanteil bleibt begrenzt, einschließlich Nullfrist und zukünftiger Ausstellung', () => {
  const item = dashboardStats(dashboardFixture(), dashboardNow).open.items[1]
  assert.equal(dashboardDeadlineProgress({ ...item, invoiceDate: '2026-09-01', dueDate: '2026-09-21', daysSinceInvoice: 10 }), .5)
  assert.equal(dashboardDeadlineProgress({ ...item, daysSinceInvoice: 100 }), 1)
  assert.equal(dashboardDeadlineProgress({ ...item, daysSinceInvoice: 0 }), 0)
  assert.equal(dashboardDeadlineProgress({ ...item, dueDate: item.invoiceDate, daysUntilDue: 0 }), 1)
  assert.equal(dashboardDeadlineProgress({ ...item, dueDate: item.invoiceDate, daysUntilDue: 4 }), 0)
})
