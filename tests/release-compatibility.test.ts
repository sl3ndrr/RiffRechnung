import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AppState } from '../src/types'
import { inspectImport } from '../src/lib/importState'
import { serializeBackup, StorageSession } from '../src/lib/storage'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { dashboardStats } from '../src/lib/dashboardStats'
import { memoryStorage, sharedLock } from './storageHarness'

// Frozen output of 1.1.3 at main 750ff71, before the AP8 version bump.
// Synthetic demo: 2025-02-10, with paid originals, open originals and drafts.
const raw = readFileSync('tests/fixtures/schema15-1.1.3.json', 'utf8')
const original = (JSON.parse(raw) as { data: AppState }).data

test('AP8: Backup aus 1.1.3 benötigt keine Migration und bewahrt den gesamten Datenbestand', () => {
  const imported = inspectImport(raw)
  assert.ok(imported.ok)
  assert.equal(imported.value.report, null)
  assert.equal(imported.value.state.schemaVersion, 15)
  assert.deepEqual(imported.value.state, original)
  const exported = JSON.parse(serializeBackup(imported.value.state))
  assert.deepEqual(Object.keys(exported).sort(), ['app', 'data', 'exportedAt', 'schemaVersion'])
  assert.equal(exported.app, 'riffrechnung')
  assert.equal(exported.schemaVersion, 15)
  assert.deepEqual(exported.data, original)
  const reimported = inspectImport(JSON.stringify(exported))
  assert.ok(reimported.ok)
  assert.deepEqual(reimported.value.state, original)
  assertOriginalsPreserved(original, reimported.value.state)
})

test('AP8: bestätigter Restore, Export und Reload erhalten Belege, Zahlungen und Dashboard', async () => {
  const storage = memoryStorage(), lock = sharedLock()
  const session = new StorageSession({ storage, lock })
  await session.restore(raw)
  const backup = JSON.parse(session.export())
  assert.equal(backup.storageVersion, 4)
  assert.equal(backup.schemaVersion, 15)
  assert.deepEqual(session.state.documentVersions, original.documentVersions)
  assert.deepEqual(session.state.payments, original.payments)
  assert.deepEqual(session.state.invoices, original.invoices)
  assertOriginalsPreserved(original, session.state)
  const reloaded = new StorageSession({ storage, lock })
  assert.deepEqual(reloaded.state, session.state)
  const now = new Date('2025-02-10T12:00:00.000Z')
  assert.deepEqual(dashboardStats(reloaded.state, now), dashboardStats(original, now))
  assert.ok(dashboardStats(reloaded.state, now).paid.allTimeCents > 0)
  const imported = inspectImport(session.export())
  assert.ok(imported.ok)
  assert.equal(imported.value.report, null)
  assert.deepEqual(imported.value.state, session.state)
})
