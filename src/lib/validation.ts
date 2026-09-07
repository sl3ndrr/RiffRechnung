import { canonical } from './envelope'
import { documentContent } from './documents'
import type { AppState } from '../types'
import { validId, validPrice, validQuantity } from './values'
import { mailboxError } from './mailbox'
import { ValidationError } from './result'

type BackupObject = Record<string, unknown>

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const
const RECIPIENT_STRATEGIES = ['joint', 'separate'] as const
const LESSON_TYPES = ['solo', 'duo'] as const
const ITEM_UNITS = ['Std.', 'Pauschale', 'Stück'] as const
const THEME_MODES = ['system', 'light', 'dark'] as const
const AUDIT_ENTITY_TYPES = ['invoice', 'person', 'settings', 'backup', 'system'] as const
const VOID_REASONS = ['deleted', 'reopened'] as const

function invalidBackup(path: string, expectation: string): never {
  throw new ValidationError(path, expectation)
}

export function backupObject(value: unknown, path: string): BackupObject {
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
  if (!Number.isSafeInteger(number) || minimum !== undefined && number < minimum) {
    invalidBackup(path, minimum === undefined ? 'muss eine ganze Zahl sein' : `muss eine ganze Zahl ab ${minimum} sein`)
  }
  return number
}

export function backupEnum(value: unknown, path: string, allowed: readonly string[]): string {
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

export function backupTimestamp(value: unknown, path: string): void {
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
  if (!validId(id)) invalidBackup(path, 'muss eine gültige ID aus Buchstaben, Ziffern, Punkt, Bindestrich, Doppelpunkt oder Unterstrich sein')
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

function validateIssuer(value: unknown, path: string, historical = false): void {
  const issuer = validateAddress(value, path)
  knownKeys(issuer, path, 'name email phone street postalCode city')
  backupString(issuer.name, `${path}.name`)
  validateEmail(issuer.email, `${path}.email`, historical)
  backupString(issuer.phone, `${path}.phone`)
}

function validateInvoiceSnapshot(value: unknown, path: string): { guardianIds: Set<string>; studentIds: Set<string> } {
  const snapshot = backupObject(value, path)
  knownKeys(snapshot, path, 'issuer guardians students accountHolder iban bic bankName legalText')
  validateIssuer(snapshot.issuer, `${path}.issuer`, true)
  const guardianIds = new Set<string>()
  backupArray(snapshot.guardians, `${path}.guardians`).forEach((entry, index) => {
    const entryPath = `${path}.guardians[${index}]`
    const guardian = validateAddress(entry, entryPath)
    knownKeys(guardian, entryPath, 'id name email street postalCode city')
    registerId(guardian.id, `${entryPath}.id`, guardianIds)
    backupString(guardian.name, `${entryPath}.name`)
    validateEmail(guardian.email, `${entryPath}.email`, true)
  })
  const studentIds = new Set<string>()
  backupArray(snapshot.students, `${path}.students`).forEach((entry, index) => {
    const entryPath = `${path}.students[${index}]`
    const student = backupObject(entry, entryPath)
    knownKeys(student, entryPath, 'id name')
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
  knownKeys(settings, 'settings', 'issuer accountHolder iban bic bankName privateRate duoRate numberPattern resetNumberAnnually paymentTermDays defaultLegalText theme reducedMotion')
  validateIssuer(settings.issuer, 'settings.issuer')
  backupString(settings.accountHolder, 'settings.accountHolder')
  backupString(settings.iban, 'settings.iban')
  backupString(settings.bic, 'settings.bic')
  backupString(settings.bankName, 'settings.bankName')
  if (!validPrice(backupNumber(settings.privateRate, 'settings.privateRate'))) invalidBackup('settings.privateRate', 'muss ein Preis ab 0 im sicheren Zahlenbereich sein')
  if (!validPrice(backupNumber(settings.duoRate, 'settings.duoRate'))) invalidBackup('settings.duoRate', 'muss ein Preis ab 0 im sicheren Zahlenbereich sein')
  backupString(settings.numberPattern, 'settings.numberPattern', true)
  backupBoolean(settings.resetNumberAnnually, 'settings.resetNumberAnnually')
  backupInteger(settings.paymentTermDays, 'settings.paymentTermDays', 0)
  backupString(settings.defaultLegalText, 'settings.defaultLegalText')
  backupEnum(settings.theme, 'settings.theme', THEME_MODES)
  backupBoolean(settings.reducedMotion, 'settings.reducedMotion')
}

function validateState(value: unknown, schema: 2 | 3 | 4, localItemIds: boolean): void {
  const legacy = schema === 2
  const versioned = schema === 4
  const data = backupObject(value, 'data')
  knownKeys(data, 'data', 'schemaVersion guardians students invoices voidedInvoiceNumbers settings counters nextStudentCodeIndex audit updatedAt' + (versioned ? ' documentVersions invoiceAdministration payments' : ''))
  if (data.schemaVersion !== schema) throw new Error('Die Datei hat kein unterstütztes Backup-Format.')

  const guardianIds = new Set<string>()
  backupArray(data.guardians, 'guardians').forEach((entry, index) => {
    const path = `guardians[${index}]`
    const guardian = backupObject(entry, path)
    knownKeys(guardian, path, 'id name email phone address iban paymentNote createdAt updatedAt')
    knownKeys(backupObject(guardian.address, `${path}.address`), `${path}.address`, 'street postalCode city')
    registerId(guardian.id, `${path}.id`, guardianIds)
    backupString(guardian.name, `${path}.name`, true)
    validateEmail(guardian.email, `${path}.email`)
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
    knownKeys(student, path, 'id name billingCode guardianIds note active createdAt updatedAt')
    registerId(student.id, `${path}.id`, studentIds)
    backupString(student.name, `${path}.name`, true)
    if (!legacy || student.billingCode !== undefined) {
      const billingCode = backupString(student.billingCode, `${path}.billingCode`, !legacy)
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
  const numbers = new Set<string>()
  const itemIds = new Set<string>()
  backupArray(data.invoices, 'invoices').forEach((entry, index) => {
    const path = `invoices[${index}]`
    const invoice = backupObject(entry, path)
    knownKeys(invoice, path, 'id number sequence year invoiceDate dueDate period status guardianIds studentIds recipientStrategy items introText freeText legalText snapshot paidAt sentAt createdAt updatedAt' + (versioned ? ' versionId correction' : ''))
    registerId(invoice.id, `${path}.id`, invoiceIds)
    const number = invoice.number === null ? null : backupString(invoice.number, `${path}.number`, true)
    if (number !== null) {
      if (numbers.has(number)) invalidBackup(`${path}.number`, 'ist doppelt; doppelte Rechnungsnummern sind nicht zulässig')
      numbers.add(number)
    }
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
    if (status === 'draft' && invoice.snapshot !== undefined) invalidBackup(`${path}.snapshot`, 'ist für Entwürfe nicht zulässig')
    const snapshotReferences = invoice.snapshot === undefined ? undefined : validateInvoiceSnapshot(invoice.snapshot, `${path}.snapshot`)
    const correction = invoice.correction === undefined ? undefined : backupObject(invoice.correction, `${path}.correction`)
    if (correction) {
      knownKeys(correction, `${path}.correction`, 'replacesId reason')
      backupString(correction.reason, `${path}.correction.reason`, true)
      backupString(correction.replacesId, `${path}.correction.replacesId`, true)
    }
    const parent = correction && backupArray(data.documentVersions, 'documentVersions').map((entry) => backupObject(entry, 'documentVersions')).find((entry) => entry.id === correction.replacesId)
    if (correction && !parent) invalidBackup(`${path}.correction.replacesId`, 'verweist auf eine unbekannte Belegversion')
    const parentContent = parent ? backupObject(parent.content, 'documentVersions.content') : undefined
    const historicalGuardians = status === 'draft' && parentContent ? backupIdArray(parentContent.guardianIds, 'documentVersions.content.guardianIds') : []
    const historicalStudents = status === 'draft' && parentContent ? backupIdArray(parentContent.studentIds, 'documentVersions.content.studentIds') : []
    invoiceGuardianIds.forEach((id, referenceIndex) => {
      if (!guardianIds.has(id) && !snapshotReferences?.guardianIds.has(id) && !historicalGuardians.includes(id)) {
        invalidBackup(`${path}.guardianIds[${referenceIndex}]`, 'verweist auf eine unbekannte Person')
      }
    })
    invoiceStudentIds.forEach((id, referenceIndex) => {
      if (!studentIds.has(id) && !snapshotReferences?.studentIds.has(id) && !historicalStudents.includes(id)) {
        invalidBackup(`${path}.studentIds[${referenceIndex}]`, 'verweist auf ein unbekanntes Kind')
      }
    })
    // Only the explicit legacy repair preflight uses invoice-local item IDs.
    // Future document versions require their own reference scope (package 04).
    const invoiceItemIds = localItemIds ? new Set<string>() : itemIds
    let totalCents = 0
    backupArray(invoice.items, `${path}.items`).forEach((itemValue, itemIndex) => {
      const itemPath = `${path}.items[${itemIndex}]`
      const item = backupObject(itemValue, itemPath)
      knownKeys(item, itemPath, 'id studentId serviceDate lessonType description quantity unit unitPrice')
      registerId(item.id, `${itemPath}.id`, invoiceItemIds)
      const studentId = backupString(item.studentId, `${itemPath}.studentId`, true)
      if (!studentIds.has(studentId) && !snapshotReferences?.studentIds.has(studentId) && !historicalStudents.includes(studentId)) invalidBackup(`${itemPath}.studentId`, 'verweist auf ein unbekanntes Kind')
      if (!invoiceStudentIdSet.has(studentId)) invalidBackup(`${itemPath}.studentId`, 'ist der Rechnung nicht zugeordnet')
      backupCalendarDate(item.serviceDate, `${itemPath}.serviceDate`)
      if (!legacy || item.lessonType !== undefined) backupEnum(item.lessonType, `${itemPath}.lessonType`, LESSON_TYPES)
      backupString(item.description, `${itemPath}.description`)
      const quantity = backupNumber(item.quantity, `${itemPath}.quantity`)
      if (!validQuantity(quantity)) invalidBackup(`${itemPath}.quantity`, 'muss zwischen 0,01 und 99,99 mit höchstens zwei Nachkommastellen liegen')
      backupEnum(item.unit, `${itemPath}.unit`, ITEM_UNITS)
      const price = backupNumber(item.unitPrice, `${itemPath}.unitPrice`)
      if (!validPrice(price)) invalidBackup(`${itemPath}.unitPrice`, 'muss ein Preis ab 0 im sicheren Zahlenbereich sein')
      totalCents += Math.round(quantity * price * 100)
      if (!Number.isSafeInteger(totalCents)) invalidBackup(`${itemPath}.unitPrice`, 'überschreitet den sicheren Gesamtbetrag')
    })
    backupString(invoice.introText, `${path}.introText`)
    backupString(invoice.freeText, `${path}.freeText`)
    backupString(invoice.legalText, `${path}.legalText`)
    if (invoice.paidAt !== undefined) backupTimestamp(invoice.paidAt, `${path}.paidAt`)
    if (invoice.sentAt !== undefined) backupTimestamp(invoice.sentAt, `${path}.sentAt`)
    backupTimestamp(invoice.createdAt, `${path}.createdAt`)
    backupTimestamp(invoice.updatedAt, `${path}.updatedAt`)
  })

  const registerNumbers = new Set<string>()
  if (!legacy || data.voidedInvoiceNumbers !== undefined) {
    backupArray(data.voidedInvoiceNumbers, 'voidedInvoiceNumbers').forEach((entry, index) => {
      const path = `voidedInvoiceNumbers[${index}]`
      const invoice = backupObject(entry, path)
      knownKeys(invoice, path, 'number sequence year invoiceDate deletedAt reason amount recipient')
      const number = backupString(invoice.number, `${path}.number`, true)
      if (registerNumbers.has(number)) invalidBackup(`${path}.number`, 'ist doppelt')
      registerNumbers.add(number)
      if (numbers.has(number) && versioned && !backupArray(data.documentVersions, 'documentVersions').some((entry) => {
        const version = backupObject(entry, 'documentVersions')
        return version.provenance === 'oldest-available' && backupArray(version.registerEntries, 'documentVersions.registerEntries').some((record) => canonical(record) === canonical(invoice))
      })) invalidBackup(`${path}.number`, 'ist doppelt; doppelte Rechnungsnummern sind nicht zulässig')
      numbers.add(number)
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
  if (!legacy || data.nextStudentCodeIndex !== undefined) backupInteger(data.nextStudentCodeIndex, 'nextStudentCodeIndex', 0)
  const auditIds = new Set<string>()
  backupArray(data.audit, 'audit').forEach((entry, index) => {
    const path = `audit[${index}]`
    const event = backupObject(entry, path)
    knownKeys(event, path, 'id at label entityType entityId snapshotCorrection')
    registerId(event.id, `${path}.id`, auditIds)
    backupTimestamp(event.at, `${path}.at`)
    backupString(event.label, `${path}.label`, true)
    backupEnum(event.entityType, `${path}.entityType`, AUDIT_ENTITY_TYPES)
    if (event.entityId !== undefined) backupString(event.entityId, `${path}.entityId`, true)
    if (event.snapshotCorrection !== undefined) {
      const correction = backupObject(event.snapshotCorrection, `${path}.snapshotCorrection`)
      knownKeys(correction, `${path}.snapshotCorrection`, 'oldValue newValue')
      if (correction.oldValue !== null) validateInvoiceSnapshot(correction.oldValue, `${path}.snapshotCorrection.oldValue`)
      validateInvoiceSnapshot(correction.newValue, `${path}.snapshotCorrection.newValue`)
    }
  })
  backupTimestamp(data.updatedAt, 'updatedAt')
  if (versioned) validateDocuments(data as unknown as AppState)
}

function validateEmail(value: unknown, path: string, historical = false): void {
  const email = backupString(value, path)
  const error = mailboxError(email)
  if (error && !historical) invalidBackup(path, error)
}

export function validateBackupState(value: unknown): asserts value is AppState {
  validateState(value, 4, false)
}

// Never used by the ordinary validator. Must be followed by lineage checks,
// deterministic repair and COMPLETE current-format validation before use.
export function validateLegacyV2Structure(value: unknown): void {
  validateState(value, 2, true)
}

export function knownKeys(value: Record<string, unknown>, path: string, keys: string): void {
  const allowed = new Set(keys.split(' '))
  for (const key of Object.keys(value)) if (!allowed.has(key)) invalidBackup(`${path}.${key}`, 'ist in diesem Format nicht unterstützt')
}

export function validateLegacyV3Structure(value: unknown): void {
  validateState(value, 3, false)
}

function validateDocuments(state: AppState): void {
  const ids = new Set<string>()
  const replaced = new Set<string>()
  backupArray(state.documentVersions, 'documentVersions').forEach((entry, index) => {
    const path = `documentVersions[${index}]`
    const v = backupObject(entry, path)
    knownKeys(v, path, 'id invoiceId originalId replacesId cancelsId reason provenance sourceUpdatedAt content outputSnapshot outputPeriod outputLegalText amounts conflicts snapshotHistory registerEntries')
    const id = registerId(v.id, `${path}.id`, ids)
    backupString(v.invoiceId, `${path}.invoiceId`, true)
    backupString(v.originalId, `${path}.originalId`, true)
    backupEnum(v.provenance, `${path}.provenance`, ['issued', 'oldest-available'])
    backupTimestamp(v.sourceUpdatedAt, `${path}.sourceUpdatedAt`)
    backupString(v.reason, `${path}.reason`, v.replacesId !== null || v.cancelsId !== null)
    const invoice = state.invoices.find((candidate) => candidate.id === v.invoiceId)
    if (!invoice || invoice.status === 'draft' || invoice.versionId !== id || canonical(documentContent(invoice)) !== canonical(v.content)) invalidBackup(`${path}.content`, 'muss dem unveränderten vollständigen Beleginhalt entsprechen')
    const refs = validateInvoiceSnapshot(v.outputSnapshot, `${path}.outputSnapshot`)
    backupString(v.outputPeriod, `${path}.outputPeriod`)
    backupString(v.outputLegalText, `${path}.outputLegalText`)
    const amounts = backupObject(v.amounts, `${path}.amounts`)
    knownKeys(amounts, `${path}.amounts`, 'itemCents totalCents legacyCalculatedTotalCents source calculation')
    const itemCents = backupArray(amounts.itemCents, `${path}.amounts.itemCents`).map((amount, i) => backupInteger(amount, `${path}.amounts.itemCents[${i}]`, 0))
    const total = backupInteger(amounts.totalCents, `${path}.amounts.totalCents`, 0)
    const calculated = backupInteger(amounts.legacyCalculatedTotalCents, `${path}.amounts.legacyCalculatedTotalCents`, 0)
    if (itemCents.length !== invoice.items.length || itemCents.reduce((sum, amount) => sum + amount, 0) !== calculated) invalidBackup(`${path}.amounts`, 'muss vollständige, konsistente gesicherte Positionsbeträge enthalten')
    backupEnum(amounts.source, `${path}.amounts.source`, ['legacy-output', 'number-register'])
    backupEnum(amounts.calculation, `${path}.amounts.calculation`, ['legacy-v1'])
    const registers = backupArray(v.registerEntries, `${path}.registerEntries`)
    if (registers.length > 1 || registers.some((record) => !state.voidedInvoiceNumbers.some((known) => canonical(known) === canonical(record) && known.number === invoice.number))) invalidBackup(`${path}.registerEntries`, 'muss den unveränderten zugehörigen Registereintrag enthalten')
    if (amounts.source === 'legacy-output' ? total !== calculated : !registers.length || total !== Math.round(state.voidedInvoiceNumbers.find((record) => record.number === invoice.number)!.amount * 100)) invalidBackup(`${path}.amounts.totalCents`, 'widerspricht der angegebenen historischen Betragsquelle')
    backupArray(v.conflicts, `${path}.conflicts`).forEach((value, i) => {
      const p = `${path}.conflicts[${i}]`; const conflict = backupObject(value, p)
      knownKeys(conflict, p, 'path message values')
      backupString(conflict.path, `${p}.path`, true); backupString(conflict.message, `${p}.message`, true)
      backupArray(conflict.values, `${p}.values`).forEach((value) => backupString(value, `${p}.values`))
    })
    // Snapshot-only evidence is never represented as a recovered complete invoice.
    const historyIds = new Set<string>()
    backupArray(v.snapshotHistory, `${path}.snapshotHistory`).forEach((value, i) => {
      const p = `${path}.snapshotHistory[${i}]`; const event = backupObject(value, p)
      knownKeys(event, p, 'id at label entityType entityId snapshotCorrection')
      registerId(event.id, `${p}.id`, historyIds); backupTimestamp(event.at, `${p}.at`)
      backupString(event.label, `${p}.label`, true)
      if (event.entityId !== invoice.id || event.entityType !== 'invoice') invalidBackup(p, 'muss zu diesem Beleg gehören')
      const correction = backupObject(event.snapshotCorrection, `${p}.snapshotCorrection`)
      knownKeys(correction, `${p}.snapshotCorrection`, 'oldValue newValue')
      if (correction.oldValue !== null) validateInvoiceSnapshot(correction.oldValue, `${p}.snapshotCorrection.oldValue`)
      validateInvoiceSnapshot(correction.newValue, `${p}.snapshotCorrection.newValue`)
    })
    if (v.replacesId !== null && v.cancelsId !== null) invalidBackup(path, 'darf nicht gleichzeitig ersetzen und stornieren')
    const parentId = v.replacesId ?? v.cancelsId
    if (parentId !== null) {
      const parent = state.documentVersions.find((candidate) => candidate.id === parentId)
      if (!parent || !ids.has(parent.id) || parent.id === id || parent.originalId !== v.originalId || replaced.has(parent.id)) invalidBackup(path, 'enthält eine ungültige, zyklische oder mehrfache Korrekturbeziehung')
      replaced.add(parent.id)
      if (v.cancelsId !== null && total !== 0) invalidBackup(`${path}.amounts`, 'muss bei einer Stornierung null sein')
      if (!invoice.correction || invoice.correction.replacesId !== parentId || invoice.correction.reason !== v.reason) invalidBackup(path, 'widerspricht dem Korrekturverweis der Rechnung')
    } else if (v.originalId !== id || invoice.correction !== undefined) invalidBackup(`${path}.originalId`, 'muss den Originalbeleg bezeichnen')
    if (v.provenance === 'issued' && (canonical(v.outputSnapshot) !== canonical(invoice.snapshot) || canonical([...refs.guardianIds]) !== canonical(invoice.guardianIds) || canonical([...refs.studentIds]) !== canonical(invoice.studentIds) || v.outputLegalText !== invoice.legalText)) invalidBackup(`${path}.outputSnapshot`, 'muss bei neu ausgestellten Belegen mit Inhalt und Zuordnung übereinstimmen')
  })
  const draftParents = new Set<string>()
  for (const invoice of state.invoices) {
    if (invoice.status === 'draft') {
      if (invoice.versionId !== undefined) invalidBackup('invoices.versionId', 'ist bei Entwürfen nicht zulässig')
      if (invoice.correction) {
        if (draftParents.has(invoice.correction.replacesId)) invalidBackup('invoices.correction', 'darf nur einen Korrekturentwurf pro Beleg enthalten')
        draftParents.add(invoice.correction.replacesId)
      }
    } else if (!ids.has(invoice.versionId ?? '')) invalidBackup('invoices.versionId', 'benötigt eine vollständige Belegversion')
  }
  const adminIds = new Set<string>()
  backupArray(state.invoiceAdministration, 'invoiceAdministration').forEach((entry, index) => {
    const path = `invoiceAdministration[${index}]`; const admin = backupObject(entry, path)
    knownKeys(admin, path, 'versionId archived events resolutions')
    const id = registerId(admin.versionId, `${path}.versionId`, adminIds)
    if (!ids.has(id)) invalidBackup(path, 'verweist auf eine unbekannte Belegversion')
    backupBoolean(admin.archived, `${path}.archived`)
    const events = backupArray(admin.events, `${path}.events`)
    if (!events.length) invalidBackup(`${path}.events`, 'benötigt einen Verwaltungsstand')
    events.forEach((entry, i) => {
      const p = `${path}.events[${i}]`; const event = backupObject(entry, p)
      knownKeys(event, p, 'at status kind reason'); backupTimestamp(event.at, `${p}.at`)
      backupEnum(event.status, `${p}.status`, ['sent', 'overdue', 'paid']); backupEnum(event.kind, `${p}.kind`, ['imported', 'status']); backupString(event.reason, `${p}.reason`, true)
    })
    if (backupObject(events.at(-1), path).status !== state.invoices.find((invoice) => invoice.versionId === id)?.status) invalidBackup(path, 'widerspricht dem aktuellen Verwaltungsstatus')
    backupArray(admin.resolutions, `${path}.resolutions`).forEach((entry, i) => {
      const p = `${path}.resolutions[${i}]`; const resolution = backupObject(entry, p)
      knownKeys(resolution, p, 'at reason'); backupTimestamp(resolution.at, `${p}.at`); backupString(resolution.reason, `${p}.reason`, true)
    })
  })
  if (adminIds.size !== ids.size) invalidBackup('invoiceAdministration', 'muss jede Belegversion verwalten')
  const paymentIds = new Set<string>()
  backupArray(state.payments, 'payments').forEach((entry, index) => {
    const path = `payments[${index}]`; const payment = backupObject(entry, path)
    knownKeys(payment, path, 'id sourceVersionId amountCents paidAt recordedAt provenance allocations')
    registerId(payment.id, `${path}.id`, paymentIds)
    const source = state.documentVersions.find((version) => version.id === payment.sourceVersionId)
    if (!source) invalidBackup(`${path}.sourceVersionId`, 'verweist auf einen unbekannten Ursprungsbeleg')
    backupInteger(payment.amountCents, `${path}.amountCents`, 0)
    if (payment.paidAt !== null) backupTimestamp(payment.paidAt, `${path}.paidAt`)
    backupTimestamp(payment.recordedAt, `${path}.recordedAt`)
    backupEnum(payment.provenance, `${path}.provenance`, ['recorded', 'legacy-status'])
    const allocations = backupArray(payment.allocations, `${path}.allocations`)
    if (!allocations.length) invalidBackup(`${path}.allocations`, 'benötigt eine nachvollziehbare Zuordnung')
    allocations.forEach((entry, i) => {
      const p = `${path}.allocations[${i}]`; const allocation = backupObject(entry, p)
      knownKeys(allocation, p, 'versionId at reason'); backupTimestamp(allocation.at, `${p}.at`); backupString(allocation.reason, `${p}.reason`, true)
      if (allocation.versionId !== null && !state.documentVersions.some((version) => version.id === allocation.versionId && version.originalId === source.originalId)) invalidBackup(`${p}.versionId`, 'muss innerhalb derselben Korrekturbeziehung liegen')
    })
  })
}
