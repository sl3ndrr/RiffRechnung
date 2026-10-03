import { seedState, sharedLock } from './storageHarness'
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Invoice } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { StorageSession, loadState, parseBackup } from '../src/lib/storage'
import { withMockLocalStorage, loadReadyState, validImportState } from './invoiceFixtures'

test('manuelle Theme-Auswahl bleibt nach einem Reload erhalten', () => {
  withMockLocalStorage(() => {
    const state = emptyState()
    state.settings.theme = 'dark'
    seedState(state)
    assert.equal(loadReadyState().settings.theme, 'dark')
  })
})


test('beschädigte lokale Daten bleiben für die Wiederherstellung unangetastet', () => {
  const storageKey = 'gitarrenrechnungen-state-v2'
  const invalidState = validImportState()
  invalidState.invoices[0].status = 'cancelled' as Invoice['status']
  const corruptValues = ['{"schemaVersion":2', JSON.stringify(invalidState)]

  corruptValues.forEach((rawData) => withMockLocalStorage(() => {
    localStorage.setItem(storageKey, rawData)
    const loaded = loadState()
    if (loaded.status !== 'recovery') assert.fail('Beschädigte Daten wurden als normaler Zustand geladen.')
    assert.equal(loaded.rawData, rawData)
    assert.ok(loaded.error)
    assert.equal(localStorage.getItem(storageKey), rawData)
  }))

  // Writable recovery is exercised through StorageSession (including rejected
  // unconfirmed writes, raw export, confirmed restore and reload) in storage.test.

})


test('lokaler Schreibfehler bestätigt nichts; Wiederholung und Export bleiben möglich', async () => {
  const { memoryStorage } = await import('./storageHarness')
  const storage = memoryStorage()
  const session = new StorageSession({ storage, lock: sharedLock() })
  storage.fail = 'write'
  await assert.rejects(session.change(() => emptyState()), /Speicherplatz/)
  assert.equal(session.revision, null)
  assert.deepEqual(parseBackup(session.export()), session.state)
  storage.fail = null
  await session.change(() => emptyState())
  assert.equal(loadState(storage).status, 'ready')
})


test('veraltete Tabs überschreiben keinen zwischenzeitlich gespeicherten Zustand', async () => {
  const { memoryStorage } = await import('./storageHarness')
  const storage = memoryStorage()
  const lock = sharedLock()
  seedState(emptyState(), storage)
  const first = new StorageSession({ storage, lock })
  const stale = new StorageSession({ storage, lock })
  await first.change((state) => ({ ...state, settings: { ...state.settings, accountHolder: 'Erster Tab' } }))
  await assert.rejects(stale.change((state) => ({ ...state, settings: { ...state.settings, accountHolder: 'Zweiter Tab' } })), /anderen Tab/)
  const loaded = loadState(storage)
  assert.equal(loaded.status === 'ready' && loaded.state.settings.accountHolder, 'Erster Tab')
})
