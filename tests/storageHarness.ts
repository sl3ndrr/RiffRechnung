import type { AppState } from '../src/types'
import type { StorageEnvelope } from '../src/lib/envelope'
import { LEGACY_GUARD_KEY, LEGACY_STORAGE_KEY, STORAGE_KEY, type WriteLock } from '../src/lib/storage'
import { validateBackupState } from '../src/lib/validation'

export function memoryStorage(): Storage & { entries: Map<string, string>; fail: string | null } {
  const entries = new Map<string, string>()
  return {
    entries, fail: null,
    get length() { return entries.size },
    key: (index) => [...entries.keys()][index] ?? null,
    clear: () => entries.clear(), removeItem: (key) => { entries.delete(key) },
    getItem(key) { if (this.fail === 'read') throw new DOMException('Speicherzugriff gesperrt', 'SecurityError'); return entries.get(key) ?? null },
    setItem(key, value) { if (this.fail === 'security-write') throw new DOMException('Schreibzugriff gesperrt', 'SecurityError'); if (this.fail === 'write' || this.fail === key) throw new DOMException('Speicherplatz erschöpft', 'QuotaExceededError'); entries.set(key, value) },
  }
}

export function sharedLock(): WriteLock {
  let queue: Promise<unknown> = Promise.resolve()
  return <T>(action: () => Promise<T>): Promise<T> => {
    const task = queue.then(action)
    queue = task.catch(() => undefined)
    return task
  }
}

// Seed fixtures, never application write code. Persistence itself is tested using
// StorageSession in storage.test and the real-browser suite.
export function seedState(state: AppState, storage: Storage = localStorage): StorageEnvelope {
  validateBackupState(state)
  const envelope: StorageEnvelope = { app: 'riffrechnung', storageVersion: 4, schemaVersion: state.schemaVersion, datasetId: crypto.randomUUID(), commitId: crypto.randomUUID(), revision: 1, savedAt: '2026-09-06T12:00:00.000Z', operation: 'edit', ancestors: [], source: null, data: structuredClone(state) }
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  storage.setItem(LEGACY_GUARD_KEY, JSON.stringify(storage.getItem(LEGACY_STORAGE_KEY)))
  return envelope
}
