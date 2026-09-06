import { DIRECTORY_BACKUP_BLOCKED } from './safety'
import type { AppState } from '../types'
import { emptyState } from './defaults'
import { validateBackupState } from './validation'
import { inspectImport, parseBackup } from './importState'
export { validateBackupState } from './validation'
export { parseBackup } from './importState'

export const STORAGE_KEY = 'gitarrenrechnungen-state-v2'
const LAST_BACKUP_AT_KEY = 'riffrechnung-last-backup-at'
const DB_NAME = 'gitarrenrechnungen-handles'
const HANDLE_KEY = 'backup-directory'
const STATE_WRITE_LOCK = 'riffrechnung-state-write'

export interface StorageRecoveryState {
  status: 'recovery'
  rawData: string
  error: string
}

export type StateLoadResult = { status: 'ready'; state: AppState; persistedUpdatedAt: string | null } | StorageRecoveryState

export interface PersistenceResult {
  local: { status: 'saved' | 'conflict' | 'error'; error?: string }
  fileBackup: { status: 'skipped' | 'saved' | 'error'; error?: string }
}

export function loadState(): StateLoadResult {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    return {
      status: 'recovery',
      rawData: '',
      error: error instanceof Error ? error.message : 'Der lokale Speicher konnte nicht gelesen werden.',
    }
  }
  if (!raw) return { status: 'ready', state: emptyState(), persistedUpdatedAt: null }
  try {
    const inspection = inspectImport(raw)
    if (!inspection.ok) throw new Error(inspection.errors.map((error) => error.message).join(' '))
    if (inspection.value.report) return { status: 'recovery', rawData: raw, error: 'Altformat erkannt. Bitte Migration prüfen und separat exportieren; die lokalen Eingangsbytes bleiben geschützt.' }
    const state = inspection.value.state
    return { status: 'ready', state, persistedUpdatedAt: state.updatedAt }
  } catch (error) {
    return {
      status: 'recovery',
      rawData: raw,
      error: error instanceof Error ? error.message : 'Die lokalen Daten konnten nicht validiert werden.',
    }
  }
}

export function saveState(state: AppState): void {
  validateBackupState(state)
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    // Package 02 has no safe overwrite path for corrupt, older or newer data.
    // A recovery must keep these bytes; package 03 supplies the write service.
    const inspected = inspectImport(raw)
    if (!inspected.ok || inspected.value.report) throw new Error('Die vorhandenen Rohdaten haben kein unterstütztes Backup-Format für direktes Überschreiben. Bitte separat exportieren.')
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

async function persistLocalState(state: AppState, expectedUpdatedAt: string | null | undefined, forceOverwrite: boolean): Promise<PersistenceResult['local']> {
  const write = (): PersistenceResult['local'] => {
    try {
      if (expectedUpdatedAt !== undefined && !forceOverwrite) {
        const storedRaw = localStorage.getItem(STORAGE_KEY)
        let storedUpdatedAt: string | null = null
        if (storedRaw) {
          try {
            const inspected = inspectImport(storedRaw)
            if (!inspected.ok || inspected.value.report) throw new Error('Geschützte Rohdaten')
            storedUpdatedAt = inspected.value.state.updatedAt
          } catch {
            return { status: 'conflict', error: 'Die lokalen Daten wurden in einem anderen Tab geändert oder sind nicht mehr lesbar.' }
          }
        }
        if (storedUpdatedAt !== expectedUpdatedAt) {
          return { status: 'conflict', error: 'Die lokalen Daten wurden in einem anderen Tab geändert. Bitte lade den aktuellen Stand neu.' }
        }
      }
      saveState(state)
      return { status: 'saved' }
    } catch (error) {
      return { status: 'error', error: error instanceof Error ? error.message : 'Lokales Speichern ist fehlgeschlagen.' }
    }
  }
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(STATE_WRITE_LOCK, write)
  return write()
}

export async function persistState(state: AppState, directoryHandle: FileSystemDirectoryHandle | null, includeFileBackup: boolean, expectedUpdatedAt?: string | null, forceLocalOverwrite = false): Promise<PersistenceResult> {
  let local: PersistenceResult['local']
  try {
    local = await persistLocalState(state, expectedUpdatedAt, forceLocalOverwrite)
  } catch (error) {
    local = { status: 'error', error: error instanceof Error ? error.message : 'Lokales Speichern ist fehlgeschlagen.' }
  }

  let fileBackup: PersistenceResult['fileBackup'] = { status: 'skipped' }
  if (local.status !== 'conflict' && includeFileBackup && directoryHandle) {
    try {
      await writeBackupToDirectory(directoryHandle, state)
      fileBackup = { status: 'saved' }
    } catch (error) {
      fileBackup = { status: 'error', error: error instanceof Error ? error.message : 'Das Datei-Backup ist fehlgeschlagen.' }
    }
  }
  return { local, fileBackup }
}

export function loadLastBackupAt(): string | null {
  try {
    const value = localStorage.getItem(LAST_BACKUP_AT_KEY)
    return value && !Number.isNaN(Date.parse(value)) ? value : null
  } catch {
    return null
  }
}

export function recordBackupExport(at = new Date()): string {
  const value = at.toISOString()
  localStorage.setItem(LAST_BACKUP_AT_KEY, value)
  return value
}

export function serializeBackup(state: AppState): string {
  validateBackupState(state)
  return JSON.stringify({
    app: 'riffrechnung',
    exportedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion,
    data: state,
  }, null, 2)
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('handles')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite')
    tx.objectStore('handles').put(handle, HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function readDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb()
    const value = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly')
      const request = tx.objectStore('handles').get(HANDLE_KEY)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return value
  } catch (error) {
    throw new Error(`Gespeicherter Backup-Ordner konnte nicht geprüft werden: ${error instanceof Error ? error.message : 'IndexedDB nicht verfügbar.'}`)
  }
}

export async function clearDirectoryHandle(): Promise<void> {
  const db = await openHandleDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite')
    tx.objectStore('handles').delete(HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function ensureWritePermission(handle: FileSystemDirectoryHandle, request = false): Promise<boolean> {
  const options = { mode: 'readwrite' as const }
  if (await handle.queryPermission?.(options) === 'granted') return true
  if (request && await handle.requestPermission?.(options) === 'granted') return true
  return false
}

export async function inspectBackupDirectory(handle: FileSystemDirectoryHandle): Promise<string> {
  let fileHandle: FileSystemFileHandle
  try {
    fileHandle = await handle.getFileHandle('riffrechnung-backup.json', { create: false })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return `Keine Backup-Datei vorhanden. ${DIRECTORY_BACKUP_BLOCKED}`
    throw error
  }
  const raw = await (await fileHandle.getFile()).text()
  try {
    const backup = parseBackup(raw)
    return `Vorhandene Sicherung geprüft: ${backup.students.length} Kinder, ${backup.invoices.length} Rechnungen. Die Datei bleibt unverändert. ${DIRECTORY_BACKUP_BLOCKED}`
  } catch (error) {
    return `Vorhandene Datei bleibt unverändert: ${error instanceof Error ? error.message : 'Format nicht lesbar.'} ${DIRECTORY_BACKUP_BLOCKED}`
  }
}

// Fail closed for EVERY caller until package 03 provides revision checks and safe writes.
export async function writeBackupToDirectory(handle: FileSystemDirectoryHandle, state: AppState): Promise<void> {
  void handle
  void state
  throw new Error(DIRECTORY_BACKUP_BLOCKED)
}
