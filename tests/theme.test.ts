import test from 'node:test'
import assert from 'node:assert/strict'
import type { ThemeMode } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { changeThemeState, saveSettingsState } from '../src/lib/commands'
import { requireSuccess } from '../src/lib/result'
import { StorageSession, STORAGE_KEY } from '../src/lib/storage'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { documentAt, documentDraft, documentFamily } from './documentFixtures'
import { memoryStorage, seedState, sharedLock } from './storageHarness'

test('3.AP1: Theme-Command erhält unvollständige Konten ohne Normalisierung', () => {
  const state = emptyState()
  state.settings.iban = 'DE02 1203'
  state.settings.bic = 'abc'
  state.settings.accountHolder = ' Noch offen '
  const before = structuredClone(state)
  for (const theme of ['light', 'system', 'dark'] as const) {
    const next = requireSuccess(changeThemeState(state, theme))
    assert.deepEqual(next, { ...before, settings: { ...before.settings, theme } })
    assert.deepEqual(state, before)
  }
  assert.equal(changeThemeState(state, 'invalid' as ThemeMode).ok, false)
  assert.deepEqual(state, before)
})

test('3.AP1: Theme-Command durchläuft StorageSession und schützt finale Originale', async () => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  const storage = memoryStorage()
  seedState(state, storage)
  const session = new StorageSession({ storage, lock: sharedLock() })
  for (const theme of ['light', 'dark', 'system'] as const) {
    const saved = await session.change((current) => requireSuccess(changeThemeState(current, theme)))
    assertOriginalsPreserved(state, saved)
    assert.deepEqual(saved.documentVersions, state.documentVersions)
    assert.equal(new StorageSession({ storage, lock: sharedLock() }).state.settings.theme, theme)
  }
  const before = storage.getItem(STORAGE_KEY)
  storage.fail = 'write'
  await assert.rejects(session.change((current) => requireSuccess(changeThemeState(current, 'dark'))))
  assert.equal(session.state.settings.theme, 'system')
  assert.equal(storage.getItem(STORAGE_KEY), before)
})

test('3.AP1: gespeicherte Formulardaten übernehmen das Theme aus der aktuellen Queue', async () => {
  const storage = memoryStorage()
  const session = new StorageSession({ storage, lock: sharedLock() })
  const form = { ...session.state.settings, issuer: { ...session.state.settings.issuer, name: 'Neue Eingabe' } }
  const themeSave = session.change((current) => requireSuccess(changeThemeState(current, 'dark')))
  const formSave = session.change((current) => requireSuccess(saveSettingsState(current, { ...form, theme: current.settings.theme })))
  await themeSave
  const saved = await formSave
  assert.equal(saved.settings.theme, 'dark')
  assert.equal(saved.settings.issuer.name, 'Neue Eingabe')
})

test('3.AP1: Demo-Theme bleibt ausschließlich in der Sitzung', async () => {
  const storage = memoryStorage()
  const session = new StorageSession({ mode: 'demo', storage })
  await session.change((current) => requireSuccess(changeThemeState(current, 'dark')))
  assert.equal(session.state.settings.theme, 'dark')
  assert.equal(storage.length, 0)
  assert.equal(new StorageSession({ mode: 'demo', storage }).state.settings.theme, 'system')
})
