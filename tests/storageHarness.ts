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
    setItem(key, value) { if (this.fail === 'write' || this.fail === key) throw new DOMException('Speicherplatz erschöpft', 'QuotaExceededError'); entries.set(key, value) },
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
  const envelope: StorageEnvelope = { app: 'riffrechnung', storageVersion: 4, schemaVersion: 3, datasetId: crypto.randomUUID(), commitId: crypto.randomUUID(), revision: 1, savedAt: '2026-09-06T12:00:00.000Z', operation: 'edit', ancestors: [], source: null, data: structuredClone(state) }
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  storage.setItem(LEGACY_GUARD_KEY, JSON.stringify(storage.getItem(LEGACY_STORAGE_KEY)))
  return envelope
}

export function fakeDirectory(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial))
  const controls = { permission: 'granted' as PermissionState, requested: 'granted' as PermissionState, fail: '', writes: 0, closes: 0, creates: 0, prompts: 0, beforeWrite: null as (() => void) | null }
  const file = (name: string) => ({
    kind: 'file', name,
    getFile: async () => { if (controls.fail === 'stale') throw new DOMException('Handle ist veraltet', 'NotFoundError'); return new File([files.get(name) ?? ''], name, { lastModified: 1 }) },
    createWritable: async () => {
      if (controls.fail === 'createWritable') throw new Error('createWritable fehlgeschlagen')
      return {
        write: async (raw: string) => { controls.writes++; files.set(name, raw); controls.beforeWrite?.(); if (controls.fail === 'write') throw new Error('write fehlgeschlagen') },
        close: async () => { controls.closes++; if (controls.fail === 'close') throw new Error('close fehlgeschlagen') },
        abort: async () => undefined,
      }
    },
  })
  const handle = {
    name: 'Synthetischer Ordner', kind: 'directory',
    queryPermission: async () => controls.permission,
    requestPermission: async () => { controls.prompts++; controls.permission = controls.requested; return controls.requested },
    values: async function* () { for (const name of [...files.keys()]) yield file(name) },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name)) {
        if (!options?.create) throw new DOMException('Fehlt', 'NotFoundError')
        controls.creates++; files.set(name, '')
      }
      return file(name)
    },
    removeEntry: async (name: string) => { if (controls.fail === 'remove') throw new Error('Entfernen verweigert'); files.delete(name) },
  } as unknown as FileSystemDirectoryHandle
  return { handle, files, controls }
}
