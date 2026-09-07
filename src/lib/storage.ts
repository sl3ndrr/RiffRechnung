import type { AppState } from '../types'
import { createDemoState, emptyState } from './defaults'
import { inspectImport, type ImportPreview } from './importState'
import { validateBackupState } from './validation'
import { assertOriginalsPreserved } from './safety'
import { canonical, descendsFrom, fingerprint, reference, type StorageEnvelope } from './envelope'
import { appendBackup, checkDirectory, inspectBackupDirectory, StorageConflict, type DirectoryBinding, type DirectoryInspection } from './backupDirectory'
export { validateBackupState } from './validation'
export { parseBackup } from './importState'
export { ensureWritePermission, inspectBackupDirectory, StorageConflict } from './backupDirectory'
export { storeDirectoryHandle, readDirectoryHandle, clearDirectoryHandle } from './handleStore'

export const STORAGE_KEY = 'riffrechnung-state-v4'
export const LEGACY_STORAGE_KEY = 'gitarrenrechnungen-state-v2'
export const PREVIOUS_STORAGE_KEY = 'riffrechnung-state-v4-previous'
export const LEGACY_GUARD_KEY = 'riffrechnung-state-v4-legacy-original'
const LAST_BACKUP_AT_KEY = 'riffrechnung-v4-last-export-at'
export const STATE_WRITE_LOCK = 'riffrechnung-write-v4'

export interface StorageRecoveryState { status: 'recovery'; rawData: string; error: string; readOnly: boolean }
export type StateLoadResult = { status: 'ready'; state: AppState; envelope: StorageEnvelope | null; rawData: string | null } | StorageRecoveryState
export type WriteLock = <T>(action: () => Promise<T>) => Promise<T>

export function newerFormat(raw: string): boolean {
  try {
    const root = JSON.parse(raw)
    return root.storageVersion > 4 || root.schemaVersion > 4 || root.data?.schemaVersion > 4
  } catch { return false }
}

export function loadState(storage: Storage = localStorage): StateLoadResult {
  let raw: string | null = null
  try {
    raw = storage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const inspected = inspectImport(raw)
      if (!inspected.ok || !inspected.value.envelope || inspected.value.report) throw new Error(inspected.ok ? 'Der Speicherumschlag fehlt. Bitte Übernahme ausdrücklich bestätigen.' : inspected.errors.map((error) => error.message).join(' '))
      return { status: 'ready', state: inspected.value.state, envelope: inspected.value.envelope, rawData: raw }
    }
    raw = storage.getItem(LEGACY_STORAGE_KEY)
    if (raw !== null) return { status: 'recovery', rawData: raw, readOnly: newerFormat(raw), error: 'Bisheriger Speicher gefunden. Alle alten Tabs schließen, Originaldaten exportieren und den kontrollierten Umstieg bestätigen. Der alte Speicher bleibt unverändert.' }
    return { status: 'ready', state: emptyState(), envelope: null, rawData: null }
  } catch (error) {
    return { status: 'recovery', rawData: raw ?? '', readOnly: newerFormat(raw ?? ''), error: error instanceof Error ? error.message : 'Der lokale Speicher ist nicht verfügbar.' }
  }
}

const browserLock: WriteLock = (action) => {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.reject(new Error('Sicheres Speichern benötigt Web Locks. Dieser Browser bleibt schreibgeschützt; JSON-Export ist möglich.'))
  return navigator.locks.request(STATE_WRITE_LOCK, action)
}

interface SessionOptions { mode?: 'real' | 'demo'; storage?: Storage; lock?: WriteLock }

// All application writes go through one queue and one origin-wide Web Lock.
// Demo never accesses Storage, IndexedDB, permission APIs or directory handles.
export class StorageSession {
  readonly mode: 'real' | 'demo'
  readonly initial: StateLoadResult
  private storage?: Storage
  private lock: WriteLock
  private queue: Promise<unknown> = Promise.resolve()
  private token: string | null = null
  private legacy: string | null = null
  private current: AppState
  private envelope: StorageEnvelope | null = null
  private recovery: StorageRecoveryState | null = null
  private binding: DirectoryBinding | null = null

  constructor(options: SessionOptions = {}) {
    this.mode = options.mode ?? 'real'
    this.lock = options.lock ?? browserLock
    if (this.mode === 'demo') {
      this.current = createDemoState()
      this.initial = { status: 'ready', state: this.current, envelope: null, rawData: null }
      return
    }
    try {
      this.storage = options.storage ?? localStorage
      this.initial = loadState(this.storage)
      this.token = this.storage.getItem(STORAGE_KEY)
      this.legacy = this.storage.getItem(LEGACY_STORAGE_KEY)
    } catch (error) {
      this.initial = { status: 'recovery', rawData: '', readOnly: false, error: error instanceof Error ? error.message : 'Lokaler Speicher nicht verfügbar.' }
    }
    this.current = this.initial.status === 'ready' ? this.initial.state : emptyState()
    this.envelope = this.initial.status === 'ready' ? this.initial.envelope : null
    this.recovery = this.initial.status === 'recovery' ? this.initial : null
  }

  get state(): AppState { return structuredClone(this.current) }
  get revision(): StorageEnvelope | null { return this.envelope ? structuredClone(this.envelope) : null }
  get directory(): DirectoryBinding | null { return this.binding }
  async idle(): Promise<void> { await this.queue }

  private run<T>(action: () => Promise<T>): Promise<T> {
    const task = this.queue.then(() => this.mode === 'demo' ? action() : this.lock(action))
    this.queue = task.catch(() => undefined)
    return task
  }

  checkCurrent = (): void => {
    if (this.mode === 'demo') return
    if (!this.storage) throw new Error('Lokaler Speicher nicht verfügbar.')
    if (this.storage.getItem(STORAGE_KEY) !== this.token) throw new StorageConflict('Der Inhalt wurde in einem anderen Tab geändert. Bitte aktuellen Stand neu laden; dieser Tab überschreibt ihn nicht.')
    const guard = this.storage.getItem(LEGACY_GUARD_KEY)
    const actualLegacy = this.storage.getItem(LEGACY_STORAGE_KEY)
    if (actualLegacy !== this.legacy || (guard !== null && guard !== JSON.stringify(actualLegacy))) throw new StorageConflict('Eine alte Anwendungsversion hat den bisherigen Speicher geändert. Alte Tabs schließen; beide Stände separat sichern und bewusst prüfen.')
  }

  private async write(next: AppState, operation: StorageEnvelope['operation'], preview?: ImportPreview): Promise<AppState> {
    validateBackupState(next)
    if (this.mode === 'demo') { this.current = structuredClone(next); return this.state }
    this.checkCurrent()
    if (!this.storage) throw new Error('Lokaler Speicher nicht verfügbar.')
    if (this.recovery && !preview) throw new Error('Geschützte Rohdaten: bitte eine Wiederherstellung prüfen und bestätigen.')
    if (this.recovery?.readOnly || newerFormat(this.token ?? this.legacy ?? '')) throw new Error('Unbekannte neuere Formate bleiben schreibgeschützt. Bitte eine passende Anwendungsversion verwenden.')
    const previous = this.envelope
    const source = preview?.envelope ?? null
    // An empty/recovery profile can adopt a known source identity. A populated
    // valid profile keeps its identity; foreign backups then require a new folder.
    const base = previous ?? source
    const maxRevision = Math.max(previous?.revision ?? 0, source?.revision ?? 0)
    if (!Number.isSafeInteger(maxRevision + 1)) throw new Error('Revisionszähler ausgeschöpft. Der Bestand bleibt unverändert.')
    const envelope: StorageEnvelope = {
      app: 'riffrechnung', storageVersion: 4, schemaVersion: 4,
      datasetId: base?.datasetId ?? crypto.randomUUID(), commitId: crypto.randomUUID(), revision: maxRevision + 1,
      savedAt: new Date().toISOString(), operation,
      ancestors: base ? [...base.ancestors, await reference(base)] : [],
      source: preview ? { datasetId: source?.datasetId ?? null, revision: source?.revision ?? null, fingerprint: await fingerprint(preview.rawData) } : null,
      data: structuredClone(next),
    }
    // An explicitly restored newer branch of the SAME dataset becomes the base;
    // divergent existing branches remain conflicts, not an invented common history.
    if (previous && source && await descendsFrom(source, previous)) envelope.ancestors = [...source.ancestors, await reference(source)]
    const raw = JSON.stringify(envelope)
    this.checkCurrent()
    if (preview) {
      const archive = JSON.stringify({ version: 1, at: envelope.savedAt, previousRaw: this.token, legacyRaw: this.legacy, sourceRaw: preview.rawData, report: preview.report, storageMigration: { algorithm: 'riffrechnung-storage-v4', version: 1, fromStorageVersion: preview.envelope?.storageVersion ?? null, toStorageVersion: 4, datasetId: envelope.datasetId, identity: base ? 'existing-identity' : 'explicit-new-assignment', revision: envelope.revision }, reservations: { before: preview.state.counters, after: next.counters, voidedNumbersBefore: preview.state.voidedInvoiceNumbers, voidedNumbersAfter: next.voidedInvoiceNumbers } })
      this.storage.setItem(`${STORAGE_KEY}-recovery-${envelope.commitId}`, archive)
    }
    // Each individual setItem is atomic. A failed prerequisite aborts the write;
    // the current copy is never removed, including Quota/Security failures.
    if (this.envelope && this.token !== null) this.storage.setItem(PREVIOUS_STORAGE_KEY, this.token)
    if (this.storage.getItem(LEGACY_GUARD_KEY) === null) this.storage.setItem(LEGACY_GUARD_KEY, JSON.stringify(this.legacy))
    this.storage.setItem(STORAGE_KEY, raw)
    this.token = raw
    this.envelope = envelope
    this.current = structuredClone(next)
    this.recovery = null
    return this.state
  }

  change(producer: (current: AppState) => AppState, operation: 'edit' | 'reset' = 'edit'): Promise<AppState> {
    return this.run(async () => {
      this.checkCurrent()
      const next = producer(this.state)
      assertOriginalsPreserved(this.current, next)
      if (canonical(next) === canonical(this.current) && this.envelope) return this.state
      return this.write(next, operation)
    })
  }

  restore(rawData: string): Promise<AppState> {
    return this.run(async () => {
      this.checkCurrent()
      const inspected = inspectImport(rawData)
      if (!inspected.ok) throw new Error(inspected.errors.map((error) => error.message).join(' '))
      const preview = inspected.value
      // Original-content protection from package 01 remains valid for known local
      // issued records. A damaged source is archived, never silently repaired here.
      if (this.recovery && this.token) {
        const current = inspectImport(this.token)
        if (current.ok) assertOriginalsPreserved(current.value.state, preview.state)
      }
      if (!this.recovery) assertOriginalsPreserved(this.current, preview.state)
      const next = structuredClone(preview.state)
      // Reserve known counters/numbers even when an older backup is restored.
      for (const [key, count] of Object.entries(this.current.counters)) next.counters[key] = Math.max(count, next.counters[key] ?? 0)
      next.voidedInvoiceNumbers = [...new Map([...next.voidedInvoiceNumbers, ...this.current.voidedInvoiceNumbers].map((entry) => [entry.number, entry])).values()]
      next.nextStudentCodeIndex = Math.max(next.nextStudentCodeIndex, this.current.nextStudentCodeIndex)
      return this.write(next, this.token === null && this.legacy !== null ? 'adopt' : 'restore', preview)
    })
  }

  connect(binding: DirectoryBinding): Promise<DirectoryInspection> {
    return this.run(async () => {
      if (this.mode === 'demo') throw new Error('Die Demo verwendet keine Backup-Ordner.')
      this.checkCurrent()
      if (!this.envelope) throw new Error('Zuerst den lokalen Bestand speichern oder eine vorhandene Sicherung wiederherstellen.')
      const result = await checkDirectory(binding, this.envelope)
      this.binding = binding
      return result
    })
  }

  disconnect(): void { this.binding = null }

  backup(): Promise<void> {
    return this.run(async () => {
      if (this.mode === 'demo') throw new Error('Die Demo verwendet keine Backup-Ordner.')
      this.checkCurrent()
      if (!this.envelope || this.recovery) throw new Error('Datei-Backup setzt erfolgreiches lokales Speichern voraus.')
      if (!this.binding) throw new Error('Kein geprüfter Backup-Ordner verbunden.')
      await appendBackup(this.binding, this.envelope, this.checkCurrent)
    })
  }

  previousRaw(): string | null {
    if (this.mode === 'demo') return null
    return this.storage?.getItem(PREVIOUS_STORAGE_KEY) ?? null
  }

  exportRecoveryArchive(): string {
    if (this.mode === 'demo') return JSON.stringify({ version: 1, mode: 'demo', recoveries: [] })
    if (!this.storage) throw new Error('Lokaler Speicher nicht verfügbar.')
    const recoveries: unknown[] = []
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index)
      if (key?.startsWith(`${STORAGE_KEY}-recovery-`)) recoveries.push({ key, raw: this.storage.getItem(key) })
    }
    return JSON.stringify({ version: 1, previousRaw: this.previousRaw(), recoveries }, null, 2)
  }

  export(): string {
    return this.envelope ? JSON.stringify(this.envelope, null, 2) : serializeBackup(this.current)
  }
}

export function serializeBackup(state: AppState): string {
  validateBackupState(state)
  // A detached export is deliberately unidentified: it cannot prove lineage.
  return JSON.stringify({ app: 'riffrechnung', exportedAt: new Date().toISOString(), schemaVersion: state.schemaVersion, data: state }, null, 2)
}

export function loadLastBackupAt(): string | null {
  try { const value = localStorage.getItem(LAST_BACKUP_AT_KEY); return value && !Number.isNaN(Date.parse(value)) ? value : null } catch { return null }
}
export function recordBackupExport(at = new Date()): string {
  const value = at.toISOString()
  localStorage.setItem(LAST_BACKUP_AT_KEY, value)
  return value
}

export { inspectBackupDirectory as inspectDirectory }
