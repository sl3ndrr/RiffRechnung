import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyState } from '../src/lib/defaults'
import { StorageSession, STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_GUARD_KEY, PREVIOUS_STORAGE_KEY, loadState } from '../src/lib/storage'
import { StorageConflict } from '../src/lib/storageConflict'
import { inspectImport } from '../src/lib/importState'
import { dashboardFixture } from './dashboardFixtures'
import { memoryStorage, seedState, sharedLock } from './storageHarness'

test('Full reset deletes issued stock and recovery copies; exported JSON remains restorable', async () => {
  const storage = memoryStorage()
  const original = dashboardFixture()
  seedState(original, storage)
  const session = new StorageSession({ storage, lock: sharedLock() })
  const backup = session.export()
  storage.setItem(LEGACY_STORAGE_KEY, 'legacy copy')
  storage.setItem(LEGACY_GUARD_KEY, JSON.stringify('legacy copy'))
  // Establish a session with the legacy copy present, as after a migration.
  const migrated = new StorageSession({ storage, lock: sharedLock() })
  for (const key of [PREVIOUS_STORAGE_KEY, `${STORAGE_KEY}-recovery-one`, 'riffrechnung-v4-last-export-at', 'riffrechnung-theme-hint']) storage.setItem(key, 'old')
  storage.setItem('unrelated-app', 'keep')
  const next = await migrated.resetAllLocalData()
  assert.equal(next.invoices.length, 0)
  assert.deepEqual(next.settings, emptyState().settings)
  assert.deepEqual([...storage.entries], [['unrelated-app', 'keep']])
  assert.equal(migrated.revision, null)
  const loaded = loadState(storage)
  assert.ok(loaded.status === 'ready')
  assert.equal(loaded.state.invoices.length, 0)
  const inspected = inspectImport(backup)
  assert.ok(inspected.ok)
  assert.deepEqual(inspected.value.state, original)
  const restored = await migrated.restore(backup)
  assert.deepEqual(restored.invoices, original.invoices)
})

test('Reset preserves conflict detection, queued writes, and a new dataset identity', async () => {
  const storage = memoryStorage()
  const lock = sharedLock()
  seedState(dashboardFixture(), storage)
  const session = new StorageSession({ storage, lock })
  const other = new StorageSession({ storage, lock })
  const oldId = session.revision!.datasetId
  await session.resetAllLocalData()
  await assert.rejects(other.resetAllLocalData(), StorageConflict)
  await assert.rejects(other.change((state) => state), StorageConflict)
  await session.change((state) => ({ ...state, settings: { ...state.settings, issuer: { ...state.settings.issuer, name: 'Neu' } } }))
  assert.notEqual(session.revision!.datasetId, oldId)
  assert.equal(session.state.settings.issuer.name, 'Neu')
})

test('Failed deletion rolls back all changed keys and leaves the confirmed state intact', async () => {
  const storage = memoryStorage()
  seedState(dashboardFixture(), storage)
  storage.setItem(PREVIOUS_STORAGE_KEY, 'previous')
  const session = new StorageSession({ storage, lock: sharedLock() })
  const before = new Map(storage.entries)
  const originalState = session.state
  const originalRemove = storage.removeItem
  storage.removeItem = (key) => {
    if (key === PREVIOUS_STORAGE_KEY) throw new DOMException('Löschen gesperrt', 'SecurityError')
    originalRemove(key)
  }
  await assert.rejects(session.resetAllLocalData(), /Löschen gesperrt/)
  assert.deepEqual(storage.entries, before)
  assert.deepEqual(session.state, originalState)
})

test('Demo reset never touches real storage or its write lock', async () => {
  const storage = memoryStorage()
  seedState(dashboardFixture(), storage)
  const before = new Map(storage.entries)
  const session = new StorageSession({ mode: 'demo', storage, lock: async () => { throw new Error('Real lock used') } })
  await session.resetAllLocalData()
  assert.deepEqual(storage.entries, before)
  assert.equal(session.state.invoices.length, 0)
})
