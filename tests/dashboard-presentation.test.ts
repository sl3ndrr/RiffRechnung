import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardBackupDue, dashboardGreeting } from '../src/lib/dashboardPresentation'

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
