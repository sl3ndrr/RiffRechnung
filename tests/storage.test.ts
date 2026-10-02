import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyState } from '../src/lib/defaults'
import { canonical, descendsFrom, validateEnvelope } from '../src/lib/envelope'
import { StorageConflict } from '../src/lib/storageConflict'
import { StorageSession, LEGACY_GUARD_KEY, LEGACY_STORAGE_KEY, PREVIOUS_STORAGE_KEY, STORAGE_KEY, loadState, serializeBackup } from '../src/lib/storage'
import { inspectImport } from '../src/lib/importState'
import { SettingsBuffer } from '../src/lib/settingsBuffer'
import { memoryStorage, seedState, sharedLock } from './storageHarness'

const context = () => {
  const storage = memoryStorage()
  const lock = sharedLock()
  const session = new StorageSession({ storage, lock })
  return { storage, lock, session }
}
const title = (name: string) => (state: ReturnType<typeof emptyState>) => ({ ...state, settings: { ...state.settings, issuer: { ...state.settings.issuer, name } } })
test('P03: lokaler Schreibabschluss bestätigt den Stand; Export/Import/Reload sind unverändert', async () => {
  const { session, storage } = context()
  const saved = await session.change(title('Bestätigt'))
  const loaded = loadState(storage)
  assert.equal(loaded.status, 'ready')
  assert.deepEqual(loaded.status === 'ready' && loaded.state, saved)
  const parsed = inspectImport(session.export())
  assert.ok(parsed.ok)
  assert.equal(parsed.value.report, null)
  assert.deepEqual(parsed.value.state, saved)
  const again = new StorageSession({ storage, lock: sharedLock() })
  assert.deepEqual(again.revision, session.revision)
  assert.equal(again.state.settings.issuer.name, 'Bestätigt')
})

test('P03: gleiche Revision, ID und Uhrzeit mit anderem Inhalt ist ein lokaler Konflikt', async () => {
  const { session, storage } = context()
  await session.change(title('Original'))
  const altered = session.revision!
  altered.data.settings.issuer.name = 'Extern'
  const raw = JSON.stringify(altered)
  storage.setItem(STORAGE_KEY, raw)
  await assert.rejects(session.change(title('Veraltet')), StorageConflict)
  assert.equal(storage.getItem(STORAGE_KEY), raw)
})

test('P03: zwei Sitzungen und parallele Schreibbefehle liefern genau einen Gewinner', async () => {
  const { session, storage, lock } = context()
  const other = new StorageSession({ storage, lock })
  const result = await Promise.allSettled([session.change(title('A')), other.change(title('B'))])
  assert.equal(result.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(result.filter((item) => item.status === 'rejected').length, 1)
  const initial = loadState(storage)
  assert.ok(initial.status === 'ready')
  assert.equal(initial.envelope?.revision, 1)
})

for (const key of ['write', STORAGE_KEY, PREVIOUS_STORAGE_KEY]) test(`P03: Quota bei ${key} bestätigt nichts, erhält letzten Stand und erlaubt Wiederholung`, async () => {
  const { storage, session } = context()
  await session.change(title('Vorher'))
  const original = storage.getItem(STORAGE_KEY)
  storage.fail = key
  await assert.rejects(session.change(title('Nachher')), /Speicherplatz/)
  assert.equal(storage.getItem(STORAGE_KEY), original)
  assert.equal(session.state.settings.issuer.name, 'Vorher')
  storage.fail = null
  await session.change(title('Nachher'))
  assert.equal(storage.getItem(PREVIOUS_STORAGE_KEY), original)
  assert.equal(session.state.settings.issuer.name, 'Nachher')
})

test('P03: Security beim Lesen und fehlende Sperren bleiben geschlossen', async () => {
  const storage = memoryStorage()
  storage.fail = 'read'
  const session = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(session.initial.status, 'recovery')
  await assert.rejects(session.change(title('Verboten')), /Speicherzugriff/)
  storage.fail = null
  const noLocks = new StorageSession({ storage, lock: async () => { throw new Error('Web Locks fehlen') } })
  await assert.rejects(noLocks.change(title('Verboten')), /Web Locks/)
  assert.equal(storage.entries.size, 0)
})

test('P03: Recovery archiviert unveränderte Rohdaten und Bericht vor Persistieren und Reload', async () => {
  const storage = memoryStorage()
  const corrupt = '{Original\r\nkaputt'
  storage.setItem(STORAGE_KEY, corrupt)
  const session = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(session.initial.status === 'recovery' && session.initial.rawData, corrupt)
  await assert.rejects(session.change(title('Unbestätigt')), /Rohdaten/)
  const backup = serializeBackup(title('Wiederhergestellt')(emptyState()))
  await session.restore(backup)
  const archive = [...storage.entries].find(([key]) => key.startsWith(`${STORAGE_KEY}-recovery-`))!
  assert.equal(JSON.parse(archive[1]).previousRaw, corrupt)
  assert.equal(JSON.parse(archive[1]).sourceRaw, backup)
  const reloaded = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(reloaded.state.settings.issuer.name, 'Wiederhergestellt')
  assert.equal(reloaded.initial.status, 'ready')
  assert.equal(inspectImport(reloaded.export()).ok, true)
})

test('P03: Altumstieg bewahrt bisherigen Schlüssel; ein bereits geöffneter alter Tab sperrt weitere Writes', async () => {
  const storage = memoryStorage()
  const legacy = JSON.stringify(emptyState())
  storage.setItem(LEGACY_STORAGE_KEY, legacy)
  const session = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(session.initial.status, 'recovery')
  await session.restore(legacy)
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), legacy)
  assert.equal(storage.getItem(LEGACY_GUARD_KEY), JSON.stringify(legacy))
  assert.equal(session.revision?.source?.datasetId, null)
  const reloaded = new StorageSession({ storage, lock: sharedLock() })
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(title('Alter Tab schreibt')(emptyState())))
  const previous = storage.getItem(STORAGE_KEY)
  await assert.rejects(reloaded.change(title('Neuer Tab')), /alte Anwendungsversion/)
  assert.equal(storage.getItem(STORAGE_KEY), previous)
  const again = new StorageSession({ storage, lock: sharedLock() })
  await assert.rejects(again.change(title('Auch nach Reload')), /alte Anwendungsversion/)
})

test('P03: auch neu aufgetauchter Altschlüssel sperrt den neuen Speicher', async () => {
  const { session, storage } = context()
  await session.change(title('Neues Profil'))
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(emptyState()))
  await assert.rejects(session.change(title('Alter Tab jetzt aktiv')), StorageConflict)
})

test('P03: Wiederherstellen alter Revision erzeugt neue Revision und bewahrt bekannte Reservierungen', async () => {
  const { session, storage } = context()
  await session.change(title('Alt'))
  const old = session.export()
  await session.change((state) => ({ ...title('Neu')(state), counters: { '2026:a': 50 }, voidedInvoiceNumbers: [{ number: '2026-a-0049', sequence: 49, year: 2026, invoiceDate: '2026-08-15', deletedAt: '2026-08-16T10:00:00.000Z', reason: 'deleted', amount: 50, recipient: 'Synthetisch' }] }))
  const before = session.revision!
  await session.restore(old)
  assert.equal(session.revision?.revision, 3)
  assert.equal(session.state.counters['2026:a'], 50)
  assert.equal(session.state.voidedInvoiceNumbers[0].number, '2026-a-0049')
  assert.ok(await descendsFrom(session.revision!, before))
  const raw = storage.getItem(STORAGE_KEY)
  const reloaded = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(storage.getItem(STORAGE_KEY), raw)
  assert.deepEqual(reloaded.state, session.state)
  await reloaded.restore(old)
  assert.equal(reloaded.revision?.revision, 4)
  assert.equal(reloaded.state.voidedInvoiceNumbers.length, 1)
})

test('P03: unbekannte neuere lokale/Dateiformate werden niemals überschrieben', async () => {
  for (const raw of ['{"storageVersion":5}', '{"schemaVersion":99}']) {
    const { storage } = context()
    storage.setItem(STORAGE_KEY, raw)
    const session = new StorageSession({ storage, lock: sharedLock() })
    await assert.rejects(session.restore(serializeBackup(emptyState())), /schreibgeschützt/)
    assert.equal(storage.getItem(STORAGE_KEY), raw)
  }
})

test('P03: Einstellung und sofortiger Ansichtswechsel warten auf bestätigtes Speichern', async () => {
  const { session, storage } = context()
  const buffer = new SettingsBuffer(session.state.settings)
  buffer.update({ ...session.state.settings, privateRate: 37.5 })
  let release!: () => void
  const wait = new Promise<void>((resolve) => { release = resolve })
  const first = buffer.flush(async (settings) => { await wait; await session.change((state) => ({ ...state, settings })); return true })
  assert.equal(storage.getItem(STORAGE_KEY), null)
  buffer.update({ ...session.state.settings, privateRate: 42 })
  const navigation = buffer.flush(async () => { throw new Error('Ein zweiter Schreiber darf nicht starten') })
  assert.equal(first, navigation)
  release()
  assert.equal(await navigation, true)
  assert.equal(buffer.dirty, false)
  assert.equal(new StorageSession({ storage, lock: sharedLock() }).state.settings.privateRate, 42)
  buffer.update({ ...session.state.settings, privateRate: 42 }, false)
  assert.equal(await buffer.flush(async () => true), false)
})

test('P03: fehlerhafte Revisionsfolgen werden bereits beim Import abgewiesen', () => {
  const storage = memoryStorage()
  const e = seedState(emptyState(), storage)
  assert.throws(() => validateEnvelope({ ...e, revision: Number.MAX_SAFE_INTEGER + 1 }))
  assert.throws(() => validateEnvelope({ ...e, ancestors: [{ commitId: e.commitId, revision: 1, fingerprint: 'a'.repeat(64) }] }))
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }))
})

test('P03: Wiederherstellungsfehler erhält auch eine ältere gültige lokale Kopie', async () => {
  const { storage, session } = context()
  await session.change(title('Gültiger Vorgänger'))
  await session.change(title('Später beschädigt'))
  const previous = storage.getItem(PREVIOUS_STORAGE_KEY)
  storage.setItem(STORAGE_KEY, '{beschädigt')
  const recovery = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(recovery.previousRaw(), previous)
  storage.fail = STORAGE_KEY
  await assert.rejects(recovery.restore(serializeBackup(emptyState())), /Speicherplatz/)
  assert.equal(storage.getItem(PREVIOUS_STORAGE_KEY), previous)
  assert.equal(storage.getItem(STORAGE_KEY), '{beschädigt')
  storage.fail = null
  await recovery.restore(previous!)
  assert.equal(recovery.state.settings.issuer.name, 'Gültiger Vorgänger')
  const archive = JSON.parse(recovery.exportRecoveryArchive())
  expectArchive(archive)
})

function expectArchive(archive: { previousRaw: string; recoveries: Array<{ raw: string }> }) {
  assert.ok(archive.previousRaw)
  assert.ok(archive.recoveries.length)
  const report = JSON.parse(archive.recoveries.at(-1)!.raw)
  assert.equal(report.previousRaw, '{beschädigt')
  assert.equal(report.storageMigration.version, 1)
  assert.equal(report.storageMigration.toStorageVersion, 4)
}

test('P03: Security beim Schreiben bestätigt nichts und lässt Wiederholung zu', async () => {
  const { storage, session } = context()
  await session.change(title('Bestätigt'))
  const before = storage.getItem(STORAGE_KEY)
  storage.fail = 'security-write'
  await assert.rejects(session.change(title('Noch nicht gespeichert')), { name: 'SecurityError' })
  assert.equal(storage.getItem(STORAGE_KEY), before)
  assert.equal(session.state.settings.issuer.name, 'Bestätigt')
  storage.fail = null
  await session.change(title('Noch nicht gespeichert'))
  assert.equal(new StorageSession({ storage, lock: sharedLock() }).state.settings.issuer.name, 'Noch nicht gespeichert')
})

test('P03: synchroner IndexedDB-Fehler und blockiertes Öffnen schließen verspätete Verbindungen', async () => {
  const factory = { open() { throw new DOMException('Gesperrt', 'SecurityError') } } as unknown as IDBFactory
  await assert.rejects(openHandleDb(factory), { name: 'SecurityError' })
  const request = {} as IDBOpenDBRequest
  let closed = 0
  const blocked = openHandleDb({ open: () => request } as unknown as IDBFactory)
  request.onblocked!.call(request, new Event('blocked') as IDBVersionChangeEvent)
  await assert.rejects(blocked, /blockiert/)
  Object.defineProperty(request, 'result', { value: { close: () => { closed++ } } })
  request.onsuccess!.call(request, new Event('success'))
  assert.equal(closed, 1)
})
