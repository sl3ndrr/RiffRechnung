import type { AppState, Invoice, InvoiceItem, Student } from '../types'
import { emptyState } from './defaults'
import { ensureStudentCodePattern, invoiceStudentCode, studentCodeForIndex, studentCodeIndex } from './utils'

export const STORAGE_KEY = 'gitarrenrechnungen-state-v2'
const LAST_BACKUP_AT_KEY = 'riffrechnung-last-backup-at'
const DB_NAME = 'gitarrenrechnungen-handles'
const HANDLE_KEY = 'backup-directory'
const STATE_WRITE_LOCK = 'riffrechnung-state-write'

type BackupObject = Record<string, unknown>

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

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const
const RECIPIENT_STRATEGIES = ['joint', 'separate'] as const
const LESSON_TYPES = ['solo', 'duo'] as const
const ITEM_UNITS = ['Std.', 'Pauschale', 'Stück'] as const
const THEME_MODES = ['system', 'light', 'dark'] as const
const AUDIT_ENTITY_TYPES = ['invoice', 'person', 'settings', 'backup', 'system'] as const
const VOID_REASONS = ['deleted', 'reopened'] as const
const BACKUP_APP_IDS = ['riffrechnung', 'gitarrenrechnungen'] as const

function invalidBackup(path: string, expectation: string): never {
  throw new Error(`Backup ungültig: ${path} ${expectation}.`)
}

function backupObject(value: unknown, path: string): BackupObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalidBackup(path, 'muss ein Objekt sein')
  return value as BackupObject
}

function backupArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalidBackup(path, 'muss ein Array sein')
  return value
}

function backupString(value: unknown, path: string, nonEmpty = false): string {
  if (typeof value !== 'string') invalidBackup(path, 'muss eine Zeichenkette sein')
  if (nonEmpty && !value.trim()) invalidBackup(path, 'darf nicht leer sein')
  return value
}

function backupBoolean(value: unknown, path: string): void {
  if (typeof value !== 'boolean') invalidBackup(path, 'muss ein Wahrheitswert sein')
}

function backupNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalidBackup(path, 'muss eine endliche Zahl sein')
  return value
}

function backupInteger(value: unknown, path: string, minimum?: number): number {
  const number = backupNumber(value, path)
  if (!Number.isInteger(number) || minimum !== undefined && number < minimum) {
    invalidBackup(path, minimum === undefined ? 'muss eine ganze Zahl sein' : `muss eine ganze Zahl ab ${minimum} sein`)
  }
  return number
}

function backupEnum(value: unknown, path: string, allowed: readonly string[]): string {
  if (typeof value !== 'string' || !allowed.includes(value)) invalidBackup(path, `muss einer der Werte ${allowed.join(', ')} sein`)
  return value
}

function backupCalendarDate(value: unknown, path: string): string {
  const dateValue = backupString(value, path)
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dateValue)) invalidBackup(path, 'muss ein gültiges Kalenderdatum im Format YYYY-MM-DD sein')
  const date = new Date(`${dateValue}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) {
    invalidBackup(path, 'muss ein gültiges Kalenderdatum im Format YYYY-MM-DD sein')
  }
  return dateValue
}

function backupTimestamp(value: unknown, path: string): void {
  const timestamp = backupString(value, path)
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime()) || date.toISOString() !== timestamp) invalidBackup(path, 'muss ein gültiger ISO-Zeitpunkt sein')
}

function backupIdArray(value: unknown, path: string): string[] {
  const values = backupArray(value, path).map((entry, index) => backupString(entry, `${path}[${index}]`, true))
  const seen = new Set<string>()
  values.forEach((id, index) => {
    if (seen.has(id)) invalidBackup(`${path}[${index}]`, 'ist doppelt')
    seen.add(id)
  })
  return values
}

function registerId(value: unknown, path: string, ids: Set<string>): string {
  const id = backupString(value, path, true)
  if (ids.has(id)) invalidBackup(path, 'ist doppelt')
  ids.add(id)
  return id
}

function validateAddress(value: unknown, path: string): BackupObject {
  const address = backupObject(value, path)
  backupString(address.street, `${path}.street`)
  backupString(address.postalCode, `${path}.postalCode`)
  backupString(address.city, `${path}.city`)
  return address
}

function validateIssuer(value: unknown, path: string): void {
  const issuer = validateAddress(value, path)
  backupString(issuer.name, `${path}.name`)
  backupString(issuer.email, `${path}.email`)
  backupString(issuer.phone, `${path}.phone`)
}

function validateInvoiceSnapshot(value: unknown, path: string): { guardianIds: Set<string>; studentIds: Set<string> } {
  const snapshot = backupObject(value, path)
  validateIssuer(snapshot.issuer, `${path}.issuer`)
  const guardianIds = new Set<string>()
  backupArray(snapshot.guardians, `${path}.guardians`).forEach((entry, index) => {
    const entryPath = `${path}.guardians[${index}]`
    const guardian = validateAddress(entry, entryPath)
    registerId(guardian.id, `${entryPath}.id`, guardianIds)
    backupString(guardian.name, `${entryPath}.name`)
    backupString(guardian.email, `${entryPath}.email`)
  })
  const studentIds = new Set<string>()
  backupArray(snapshot.students, `${path}.students`).forEach((entry, index) => {
    const entryPath = `${path}.students[${index}]`
    const student = backupObject(entry, entryPath)
    registerId(student.id, `${entryPath}.id`, studentIds)
    backupString(student.name, `${entryPath}.name`)
  })
  backupString(snapshot.accountHolder, `${path}.accountHolder`)
  backupString(snapshot.iban, `${path}.iban`)
  backupString(snapshot.bic, `${path}.bic`)
  backupString(snapshot.bankName, `${path}.bankName`)
  backupString(snapshot.legalText, `${path}.legalText`)
  return { guardianIds, studentIds }
}

function validateSettings(value: unknown): void {
  const settings = backupObject(value, 'settings')
  validateIssuer(settings.issuer, 'settings.issuer')
  backupString(settings.accountHolder, 'settings.accountHolder')
  backupString(settings.iban, 'settings.iban')
  backupString(settings.bic, 'settings.bic')
  backupString(settings.bankName, 'settings.bankName')
  if (backupNumber(settings.privateRate, 'settings.privateRate') < 0) invalidBackup('settings.privateRate', 'darf nicht negativ sein')
  if (backupNumber(settings.duoRate, 'settings.duoRate') < 0) invalidBackup('settings.duoRate', 'darf nicht negativ sein')
  backupString(settings.numberPattern, 'settings.numberPattern', true)
  backupBoolean(settings.resetNumberAnnually, 'settings.resetNumberAnnually')
  backupInteger(settings.paymentTermDays, 'settings.paymentTermDays', 0)
  backupString(settings.defaultLegalText, 'settings.defaultLegalText')
  backupEnum(settings.theme, 'settings.theme', THEME_MODES)
  backupBoolean(settings.reducedMotion, 'settings.reducedMotion')
}

function validateBackupState(value: unknown): void {
  const data = backupObject(value, 'data')
  if (data.schemaVersion !== 2) throw new Error('Die Datei hat kein unterstütztes Backup-Format.')

  const guardianIds = new Set<string>()
  backupArray(data.guardians, 'guardians').forEach((entry, index) => {
    const path = `guardians[${index}]`
    const guardian = backupObject(entry, path)
    registerId(guardian.id, `${path}.id`, guardianIds)
    backupString(guardian.name, `${path}.name`)
    backupString(guardian.email, `${path}.email`)
    backupString(guardian.phone, `${path}.phone`)
    validateAddress(guardian.address, `${path}.address`)
    backupString(guardian.iban, `${path}.iban`)
    backupString(guardian.paymentNote, `${path}.paymentNote`)
    backupTimestamp(guardian.createdAt, `${path}.createdAt`)
    backupTimestamp(guardian.updatedAt, `${path}.updatedAt`)
  })

  const studentIds = new Set<string>()
  const billingCodes = new Set<string>()
  backupArray(data.students, 'students').forEach((entry, index) => {
    const path = `students[${index}]`
    const student = backupObject(entry, path)
    registerId(student.id, `${path}.id`, studentIds)
    backupString(student.name, `${path}.name`)
    if (student.billingCode !== undefined) {
      const billingCode = backupString(student.billingCode, `${path}.billingCode`).trim()
      if (billingCode && !/^[a-z]+$/u.test(billingCode)) invalidBackup(`${path}.billingCode`, 'muss aus Kleinbuchstaben bestehen')
      if (billingCode && billingCodes.has(billingCode)) invalidBackup(`${path}.billingCode`, 'ist doppelt')
      if (billingCode) billingCodes.add(billingCode)
    }
    backupIdArray(student.guardianIds, `${path}.guardianIds`).forEach((id, referenceIndex) => {
      if (!guardianIds.has(id)) invalidBackup(`${path}.guardianIds[${referenceIndex}]`, 'verweist auf eine unbekannte Person')
    })
    backupString(student.note, `${path}.note`)
    backupBoolean(student.active, `${path}.active`)
    backupTimestamp(student.createdAt, `${path}.createdAt`)
    backupTimestamp(student.updatedAt, `${path}.updatedAt`)
  })

  const invoiceIds = new Set<string>()
  const itemIds = new Set<string>()
  backupArray(data.invoices, 'invoices').forEach((entry, index) => {
    const path = `invoices[${index}]`
    const invoice = backupObject(entry, path)
    registerId(invoice.id, `${path}.id`, invoiceIds)
    const number = invoice.number === null ? null : backupString(invoice.number, `${path}.number`, true)
    const sequence = invoice.sequence === null ? null : backupInteger(invoice.sequence, `${path}.sequence`, 1)
    if ((number === null) !== (sequence === null)) invalidBackup(path, 'muss Rechnungsnummer und Sequenz gemeinsam setzen')
    const year = backupInteger(invoice.year, `${path}.year`, 1)
    const invoiceDate = backupCalendarDate(invoice.invoiceDate, `${path}.invoiceDate`)
    const dueDate = backupCalendarDate(invoice.dueDate, `${path}.dueDate`)
    if (dueDate < invoiceDate) invalidBackup(`${path}.dueDate`, 'darf nicht vor dem Rechnungsdatum liegen')
    if (Number(invoiceDate.slice(0, 4)) !== year) invalidBackup(`${path}.year`, 'muss zum Rechnungsdatum passen')
    backupString(invoice.period, `${path}.period`)
    const status = backupEnum(invoice.status, `${path}.status`, INVOICE_STATUSES)
    if (status === 'draft' && number !== null) invalidBackup(`${path}.number`, 'muss bei einem Entwurf leer sein')
    if (status !== 'draft' && number === null) invalidBackup(`${path}.number`, 'muss bei einer finalisierten Rechnung gesetzt sein')
    const invoiceGuardianIds = backupIdArray(invoice.guardianIds, `${path}.guardianIds`)
    const invoiceStudentIds = backupIdArray(invoice.studentIds, `${path}.studentIds`)
    const invoiceStudentIdSet = new Set(invoiceStudentIds)
    backupEnum(invoice.recipientStrategy, `${path}.recipientStrategy`, RECIPIENT_STRATEGIES)
    const snapshotReferences = invoice.snapshot === undefined ? undefined : validateInvoiceSnapshot(invoice.snapshot, `${path}.snapshot`)
    invoiceGuardianIds.forEach((id, referenceIndex) => {
      if (!guardianIds.has(id) && !snapshotReferences?.guardianIds.has(id)) {
        invalidBackup(`${path}.guardianIds[${referenceIndex}]`, 'verweist auf eine unbekannte Person')
      }
    })
    invoiceStudentIds.forEach((id, referenceIndex) => {
      if (!studentIds.has(id) && !snapshotReferences?.studentIds.has(id)) {
        invalidBackup(`${path}.studentIds[${referenceIndex}]`, 'verweist auf ein unbekanntes Kind')
      }
    })
    backupArray(invoice.items, `${path}.items`).forEach((itemValue, itemIndex) => {
      const itemPath = `${path}.items[${itemIndex}]`
      const item = backupObject(itemValue, itemPath)
      registerId(item.id, `${itemPath}.id`, itemIds)
      const studentId = backupString(item.studentId, `${itemPath}.studentId`, true)
      if (!studentIds.has(studentId) && !snapshotReferences?.studentIds.has(studentId)) invalidBackup(`${itemPath}.studentId`, 'verweist auf ein unbekanntes Kind')
      if (!invoiceStudentIdSet.has(studentId)) invalidBackup(`${itemPath}.studentId`, 'ist der Rechnung nicht zugeordnet')
      backupCalendarDate(item.serviceDate, `${itemPath}.serviceDate`)
      if (item.lessonType !== undefined) backupEnum(item.lessonType, `${itemPath}.lessonType`, LESSON_TYPES)
      backupString(item.description, `${itemPath}.description`)
      if (backupNumber(item.quantity, `${itemPath}.quantity`) <= 0) invalidBackup(`${itemPath}.quantity`, 'muss größer als null sein')
      backupEnum(item.unit, `${itemPath}.unit`, ITEM_UNITS)
      if (backupNumber(item.unitPrice, `${itemPath}.unitPrice`) < 0) invalidBackup(`${itemPath}.unitPrice`, 'darf nicht negativ sein')
    })
    backupString(invoice.introText, `${path}.introText`)
    backupString(invoice.freeText, `${path}.freeText`)
    backupString(invoice.legalText, `${path}.legalText`)
    if (invoice.paidAt !== undefined) backupTimestamp(invoice.paidAt, `${path}.paidAt`)
    if (invoice.sentAt !== undefined) backupTimestamp(invoice.sentAt, `${path}.sentAt`)
    backupTimestamp(invoice.createdAt, `${path}.createdAt`)
    backupTimestamp(invoice.updatedAt, `${path}.updatedAt`)
  })

  if (data.voidedInvoiceNumbers !== undefined) {
    backupArray(data.voidedInvoiceNumbers, 'voidedInvoiceNumbers').forEach((entry, index) => {
      const path = `voidedInvoiceNumbers[${index}]`
      const invoice = backupObject(entry, path)
      backupString(invoice.number, `${path}.number`, true)
      if (invoice.sequence !== null) backupInteger(invoice.sequence, `${path}.sequence`, 1)
      backupInteger(invoice.year, `${path}.year`, 1)
      backupCalendarDate(invoice.invoiceDate, `${path}.invoiceDate`)
      backupTimestamp(invoice.deletedAt, `${path}.deletedAt`)
      if (invoice.reason !== undefined) backupEnum(invoice.reason, `${path}.reason`, VOID_REASONS)
      if (backupNumber(invoice.amount, `${path}.amount`) < 0) invalidBackup(`${path}.amount`, 'darf nicht negativ sein')
      backupString(invoice.recipient, `${path}.recipient`)
    })
  }

  validateSettings(data.settings)
  const counters = backupObject(data.counters, 'counters')
  Object.entries(counters).forEach(([key, counter]) => backupInteger(counter, `counters.${key}`, 1))
  if (data.nextStudentCodeIndex !== undefined) backupInteger(data.nextStudentCodeIndex, 'nextStudentCodeIndex', 0)
  const auditIds = new Set<string>()
  backupArray(data.audit, 'audit').forEach((entry, index) => {
    const path = `audit[${index}]`
    const event = backupObject(entry, path)
    registerId(event.id, `${path}.id`, auditIds)
    backupTimestamp(event.at, `${path}.at`)
    backupString(event.label, `${path}.label`, true)
    backupEnum(event.entityType, `${path}.entityType`, AUDIT_ENTITY_TYPES)
    if (event.entityId !== undefined) backupString(event.entityId, `${path}.entityId`, true)
    if (event.snapshotCorrection !== undefined) {
      const correction = backupObject(event.snapshotCorrection, `${path}.snapshotCorrection`)
      if (correction.oldValue !== null) validateInvoiceSnapshot(correction.oldValue, `${path}.snapshotCorrection.oldValue`)
      validateInvoiceSnapshot(correction.newValue, `${path}.snapshotCorrection.newValue`)
    }
  })
  backupTimestamp(data.updatedAt, 'updatedAt')
}

function normalizeStudents(students: Student[], declaredNextIndex = 0): { students: Student[]; nextStudentCodeIndex: number } {
  const used = new Set<string>()
  let cursor = 0
  let highestIndex = -1
  const normalized = students.map((student) => {
    const requestedCode = typeof student.billingCode === 'string' ? student.billingCode.trim().toLowerCase() : ''
    let billingCode = requestedCode
    if (studentCodeIndex(billingCode) < 0 || used.has(billingCode)) {
      while (used.has(studentCodeForIndex(cursor))) cursor += 1
      billingCode = studentCodeForIndex(cursor)
    }
    used.add(billingCode)
    const index = studentCodeIndex(billingCode)
    highestIndex = Math.max(highestIndex, index)
    cursor = Math.max(cursor, index + 1)
    return { ...student, billingCode }
  })
  return {
    students: normalized,
    nextStudentCodeIndex: Math.max(0, declaredNextIndex, highestIndex + 1),
  }
}

function normalizeInvoiceItem(item: InvoiceItem): InvoiceItem {
  const lessonType = item.lessonType === 'duo' || /\(duo\)\s*$/iu.test(item.description) ? 'duo' : 'solo'
  return { ...item, lessonType }
}

function normalizeInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.map((invoice) => ({
    ...invoice,
    items: Array.isArray(invoice.items) ? invoice.items.map(normalizeInvoiceItem) : [],
  }))
}

function normalizeCounters(counters: Record<string, number>, invoices: Invoice[], students: Student[], resetNumberAnnually: boolean): Record<string, number> {
  const normalized = { ...counters }
  for (const invoice of invoices) {
    const studentCode = invoiceStudentCode({ students }, invoice.studentIds)
    if (!studentCode.includes('+')) continue
    const counterScope = resetNumberAnnually ? String(invoice.year) : 'global'
    const counterKey = `${counterScope}:${studentCode}`
    const legacyCounterKey = `${counterScope}:${studentCode.replaceAll('+', '')}`
    if (normalized[counterKey] === undefined && normalized[legacyCounterKey] !== undefined) {
      normalized[counterKey] = normalized[legacyCounterKey]
    }
  }
  return normalized
}

function normalizeState(data: Partial<AppState>): AppState {
  const base = emptyState()
  const normalizedStudents = normalizeStudents(Array.isArray(data.students) ? data.students : [], data.nextStudentCodeIndex)
  const incomingSettings = data.settings ?? base.settings
  const invoices = Array.isArray(data.invoices) ? normalizeInvoices(data.invoices) : []
  const settings = {
    ...base.settings,
    ...incomingSettings,
    issuer: { ...base.settings.issuer, ...incomingSettings.issuer },
    numberPattern: ensureStudentCodePattern(incomingSettings.numberPattern),
  }
  return {
    ...base,
    ...data,
    guardians: Array.isArray(data.guardians) ? data.guardians : [],
    students: normalizedStudents.students,
    invoices,
    voidedInvoiceNumbers: Array.isArray(data.voidedInvoiceNumbers) ? data.voidedInvoiceNumbers : [],
    settings,
    counters: normalizeCounters(data.counters ?? {}, invoices, normalizedStudents.students, settings.resetNumberAnnually),
    nextStudentCodeIndex: normalizedStudents.nextStudentCodeIndex,
    audit: Array.isArray(data.audit) ? data.audit : [],
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  }
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
    const parsed: unknown = JSON.parse(raw)
    validateBackupState(parsed)
    const state = normalizeState(parsed as Partial<AppState>)
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
            const stored: unknown = JSON.parse(storedRaw)
            validateBackupState(stored)
            storedUpdatedAt = (stored as AppState).updatedAt
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
      if (!await ensureWritePermission(directoryHandle)) throw new Error('Die Schreibberechtigung für den Backup-Ordner fehlt.')
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
  return JSON.stringify({
    app: 'riffrechnung',
    exportedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion,
    data: state,
  }, null, 2)
}

export function parseBackup(text: string): AppState {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Die Backup-Datei enthält kein gültiges JSON.')
  }
  const root = backupObject(parsed, 'Backup')
  let data: unknown = root
  if ('data' in root) {
    backupEnum(root.app, 'app', BACKUP_APP_IDS)
    if (root.schemaVersion !== 2) throw new Error('Die Datei hat kein unterstütztes Backup-Format.')
    backupTimestamp(root.exportedAt, 'exportedAt')
    data = root.data
  }
  validateBackupState(data)
  const normalized = normalizeState(data as Partial<AppState>)
  const voidedInvoiceNumbers = normalized.voidedInvoiceNumbers
  const numbers = [...normalized.invoices.map((invoice) => invoice.number), ...voidedInvoiceNumbers.map((invoice) => invoice.number)].filter(Boolean)
  if (new Set(numbers).size !== numbers.length) {
    throw new Error('Das Backup enthält doppelte Rechnungsnummern.')
  }
  return { ...normalized, updatedAt: new Date().toISOString() }
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
  } catch {
    return null
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

export async function writeBackupToDirectory(handle: FileSystemDirectoryHandle, state: AppState): Promise<void> {
  const fileHandle = await handle.getFileHandle('riffrechnung-backup.json', { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(serializeBackup(state))
  await writable.close()
}
