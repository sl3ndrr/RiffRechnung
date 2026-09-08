import type { AppState } from '../types'
import { validateBackupState, validateLegacyV3Structure, validateLegacyV4Structure, validateLegacyV5Structure } from './validation'

export const STORAGE_VERSION = 4
export interface RevisionRef { commitId: string; revision: number; fingerprint: string }
export interface StorageEnvelope {
  app: 'riffrechnung'
  storageVersion: 4
  schemaVersion: 3 | 4 | 5 | 6
  datasetId: string
  commitId: string
  revision: number
  savedAt: string
  operation: 'edit' | 'restore' | 'adopt' | 'reset'
  ancestors: RevisionRef[]
  source: { datasetId: string | null; revision: number | null; fingerprint: string } | null
  data: AppState
}

// Content equality never depends on a clock, revision, object key order or ID alone.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export async function fingerprint(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const keys = (value: object, allowed: string) => Object.keys(value).every((key) => allowed.split(' ').includes(key))

export function validateEnvelope(value: unknown, allowLegacy = false): asserts value is StorageEnvelope {
  if (!value || typeof value !== 'object') throw new Error('Ungültiger Speicherumschlag.')
  const e = value as StorageEnvelope
  if (e.storageVersion !== STORAGE_VERSION) throw new Error('Unbekannte Speicherversion: ausschließlich lesender Zugriff.')
  if (!keys(e, 'app storageVersion schemaVersion datasetId commitId revision savedAt operation ancestors source data')
    || e.app !== 'riffrechnung' || (e.schemaVersion !== 6 && !(allowLegacy && (e.schemaVersion === 3 || e.schemaVersion === 4 || e.schemaVersion === 5))) || !id(e.datasetId) || !id(e.commitId) || !revision(e.revision)
    || typeof e.savedAt !== 'string' || Number.isNaN(Date.parse(e.savedAt))
    || !['edit', 'restore', 'adopt', 'reset'].includes(e.operation) || !Array.isArray(e.ancestors)) throw new Error('Ungültiger Speicherumschlag oder Revisionszähler.')
  let last = 0
  const ids = new Set([e.commitId])
  for (const ref of e.ancestors) {
    if (!ref || !keys(ref, 'commitId revision fingerprint') || !id(ref.commitId) || !hash(ref.fingerprint)
      || !revision(ref.revision) || ref.revision <= last || ref.revision >= e.revision || ids.has(ref.commitId)) throw new Error('Ungültige Revisionsfolge.')
    ids.add(ref.commitId)
    last = ref.revision
  }
  if (e.source !== null && (!e.source || !keys(e.source, 'datasetId revision fingerprint') || !hash(e.source.fingerprint)
    || (e.source.datasetId !== null && !id(e.source.datasetId)) || (e.source.revision !== null && !revision(e.source.revision)))) throw new Error('Ungültige Wiederherstellungsquelle.')
  if (e.schemaVersion !== (e.data as { schemaVersion: number }).schemaVersion) throw new Error('Backup-Umschlag und Daten haben unterschiedliche Formatversionen.')
  if (e.schemaVersion === 3) validateLegacyV3Structure(e.data)
  else if (e.schemaVersion === 4) validateLegacyV4Structure(e.data)
  else if (e.schemaVersion === 5) validateLegacyV5Structure(e.data)
  else validateBackupState(e.data)
}

export async function reference(envelope: StorageEnvelope): Promise<RevisionRef> {
  return { commitId: envelope.commitId, revision: envelope.revision, fingerprint: await fingerprint(canonical(envelope)) }
}

export async function descendsFrom(candidate: StorageEnvelope, ancestor: StorageEnvelope): Promise<boolean> {
  if (candidate.datasetId !== ancestor.datasetId) return false
  if (canonical(candidate) === canonical(ancestor)) return true
  const ref = await reference(ancestor)
  return candidate.ancestors.some((entry) => entry.commitId === ref.commitId && entry.revision === ref.revision && entry.fingerprint === ref.fingerprint)
}

