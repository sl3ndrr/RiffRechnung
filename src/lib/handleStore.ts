import type { DirectoryBinding } from './backupDirectory'

export const HANDLE_DB_NAME = 'riffrechnung-handles-v4'
const HANDLE_KEY = 'backup-directory'

export function openHandleDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(HANDLE_DB_NAME, 1)
    let failed = false
    request.onupgradeneeded = () => request.result.createObjectStore('handles')
    request.onsuccess = () => {
      if (failed) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB konnte nicht geöffnet werden.'))
    request.onblocked = () => { failed = true; reject(new Error('IndexedDB ist durch eine andere Anwendungsversion blockiert. Bitte alte Tabs schließen.')) }
  })
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest, factory?: IDBFactory): Promise<T> {
  const db = await openHandleDb(factory)
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('handles', mode)
      let value: T
      const request = action(tx.objectStore('handles'))
      request.onsuccess = () => { value = request.result as T }
      request.onerror = () => reject(request.error ?? new Error('IndexedDB-Anfrage fehlgeschlagen.'))
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Transaktion fehlgeschlagen.'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-Transaktion abgebrochen.'))
    })
  } finally { db.close() }
}

export const storeDirectoryHandle = (binding: DirectoryBinding, factory?: IDBFactory): Promise<void> => transaction('readwrite', (store) => store.put(binding, HANDLE_KEY), factory)
export const clearDirectoryHandle = (factory?: IDBFactory): Promise<void> => transaction('readwrite', (store) => store.delete(HANDLE_KEY), factory)
export async function readDirectoryHandle(factory?: IDBFactory): Promise<DirectoryBinding | null> {
  const binding = await transaction<DirectoryBinding | undefined>('readonly', (store) => store.get(HANDLE_KEY), factory)
  if (!binding) return null
  if (!binding.handle || typeof binding.handle.getFileHandle !== 'function' || typeof binding.datasetId !== 'string' || !Array.isArray(binding.legacyFiles)) throw new Error('Gespeicherte Ordnerverbindung ist ungültig. Bitte den Ordner erneut wählen.')
  return binding
}
