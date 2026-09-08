import { draftAmountChange, legacyItemCents, itemTotalCents } from './money'
import { captureDocument } from './documents'
import { validateEnvelope, type StorageEnvelope } from './envelope'
import type { AppState, Invoice, InvoiceItem, Settings, Student } from '../types'
import { commandResult, requireSuccess, type CommandResult } from './result'
import { backupEnum, backupObject, backupTimestamp, knownKeys, validateBackupState, validateLegacyV2Structure, validateLegacyV3Structure, validateLegacyV4Structure, validateLegacyV5Structure } from './validation'
import { ensureStudentCodePattern, invoiceStudentCode, studentCodeForIndex, studentCodeIndex } from './utils'
import { mailboxError } from './mailbox'

interface MigrationChange { path: string; before: unknown; after: unknown; reason: string }
export interface IdMapping { invoiceId: string; itemIndex: number; oldId: string; newId: string }
export interface MigrationReport {
  migration: 'riffrechnung-to-v6'
  version: 1
  fromSchema: 2 | 3 | 4 | 5
  toSchema: 6
  source: 'local-state' | 'riffrechnung' | 'gitarrenrechnungen'
  changes: MigrationChange[]
  idMappings: IdMapping[]
}
export interface ImportPreview {
  envelope: StorageEnvelope | null
  state: AppState
  rawData: string
  report: MigrationReport | null
  warnings: string[]
}

function upgradeToV6(value: unknown): AppState {
  const state = structuredClone(value) as AppState
  state.schemaVersion = 6
  const settings = state.settings as Settings
  if (!settings.invoiceProfile) settings.invoiceProfile = 'small-business'
  if (!settings.taxIdentifier) settings.taxIdentifier = { kind: 'tax-number', value: '' }
  return state
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

// The old saveInvoice copied ALL items, dates, text and createdAt for each
// single recipient while retaining recipientStrategy='separate'. No other
// origin is inferred merely from an equal ID or a similar invoice number.
function copySignature(invoice: Invoice): string {
  return canonical({
    year: invoice.year, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate,
    period: invoice.period, studentIds: invoice.studentIds, items: invoice.items,
    introText: invoice.introText, freeText: invoice.freeText, legalText: invoice.legalText,
    createdAt: invoice.createdAt,
    snapshot: invoice.snapshot && { ...invoice.snapshot, guardians: [] },
  })
}

function repairCopiedItemIds(state: LegacyState, report: MigrationReport): void {
  const occurrences = new Map<string, Array<{ invoice: Invoice; itemIndex: number }>>()
  for (const invoice of state.invoices) invoice.items.forEach((item, itemIndex) => {
    occurrences.set(item.id, [...(occurrences.get(item.id) ?? []), { invoice, itemIndex }])
  })
  // Preflight every collision BEFORE modifying the copy. The normal validator
  // still rejects duplicates within one invoice and all current-format collisions.
  for (const [id, entries] of occurrences) {
    if (entries.length < 2) continue
    const signature = copySignature(entries[0].invoice)
    const recipients = new Set<string>()
    for (const { invoice } of entries) {
      if (invoice.recipientStrategy !== 'separate' || invoice.guardianIds.length !== 1
        || recipients.has(invoice.guardianIds[0]) || copySignature(invoice) !== signature
        || (invoice.snapshot && (invoice.snapshot.guardians.length !== 1 || invoice.snapshot.guardians[0].id !== invoice.guardianIds[0]))) {
        throw new Error(`Positions-ID ${id} ist mehrfach vorhanden, aber die Herkunft als bekannte Empfängerkopie ist nicht eindeutig. Keine automatische Reparatur; bitte Rohdaten exportieren.`)
      }
      recipients.add(invoice.guardianIds[0])
    }
  }
  const occupied = new Set(occurrences.keys())
  const seen = new Set<string>()
  state.invoices.forEach((invoice, invoiceIndex) => invoice.items.forEach((item, itemIndex) => {
    if (!seen.has(item.id)) { seen.add(item.id); return }
    const oldId = item.id
    const stem = `item-v3-${invoiceIndex}-${itemIndex}`
    let newId = stem
    let suffix = 1
    while (occupied.has(newId)) newId = `${stem}-${suffix++}`
    occupied.add(newId)
    item.id = newId
    report.idMappings.push({ invoiceId: invoice.id, itemIndex, oldId, newId })
    report.changes.push({ path: `invoices[${invoiceIndex}].items[${itemIndex}].id`, before: oldId, after: newId, reason: 'Eindeutige Positions-ID für bekannte Empfängerkopie' })
  }))
}

function migrateV2(data: unknown, source: MigrationReport['source']): { state: LegacyState; report: MigrationReport } {
  validateLegacyV2Structure(data)
  // Shape has been checked, including references and ALL numeric values.
  // Only the following documented optional v2 fields may still be absent.
  const state = structuredClone(data) as LegacyState
  const report: MigrationReport = { migration: 'riffrechnung-to-v6', version: 1, fromSchema: 2, toSchema: 6, source, changes: [], idMappings: [] }
  repairCopiedItemIds(state, report)
  const record = (path: string, before: unknown, after: unknown, reason: string) => {
    if (canonical(before) !== canonical(after)) report.changes.push({ path, before: before ?? null, after, reason })
  }
  // Reserve all declared codes first, including codes later in storage order.
  const used = new Set(state.students.map((student) => student.billingCode).filter(Boolean))
  let cursor = 0
  state.students.forEach((student: Student, index) => {
    if (student.billingCode) return
    while (used.has(studentCodeForIndex(cursor))) cursor++
    const code = studentCodeForIndex(cursor++)
    record(`students[${index}].billingCode`, student.billingCode, code, 'Fehlendes Alt-Kinderkennzeichen; keine Person erzeugt')
    student.billingCode = code
    used.add(code)
  })
  const nextIndex = Math.max(state.nextStudentCodeIndex ?? 0, ...state.students.map((student) => studentCodeIndex(student.billingCode) + 1), 0)
  record('nextStudentCodeIndex', state.nextStudentCodeIndex, nextIndex, 'Kinderkennzeichen reservieren')
  state.nextStudentCodeIndex = nextIndex
  state.invoices.forEach((invoice, invoiceIndex) => invoice.items.forEach((item: InvoiceItem, itemIndex) => {
    if (item.lessonType !== undefined) return
    const type = /\(duo\)\s*$/iu.test(item.description) ? 'duo' : 'solo'
    record(`invoices[${invoiceIndex}].items[${itemIndex}].lessonType`, undefined, type, 'Dokumentierter Altformat-Standard; Preis und Text bleiben unverändert')
    item.lessonType = type
  }))
  for (const invoice of state.invoices) {
    const code = invoiceStudentCode(state, invoice.studentIds)
    if (!code.includes('+')) continue
    const scope = state.settings.resetNumberAnnually ? String(invoice.year) : 'global'
    const key = `${scope}:${code}`
    const oldKey = `${scope}:${code.replaceAll('+', '')}`
    if (state.counters[key] === undefined && state.counters[oldKey] !== undefined) {
      record(`counters.${key}`, undefined, state.counters[oldKey], 'Bestehenden Kombinationszähler zusätzlich segmentiert reservieren')
      state.counters[key] = state.counters[oldKey]
    }
  }
  const pattern = ensureStudentCodePattern(state.settings.numberPattern)
  record('settings.numberPattern', state.settings.numberPattern, pattern, 'Kinderkennzeichen im Muster für künftige Nummern')
  state.settings.numberPattern = pattern
  if (state.voidedInvoiceNumbers === undefined) {
    record('voidedInvoiceNumbers', undefined, [], 'Altformat ohne Reservierungsliste; keine fehlende Historie rekonstruiert')
    state.voidedInvoiceNumbers = []
  }
  record('schemaVersion', 2, 3, 'Geprüftes Speicherformat')
  state.schemaVersion = 3
  validateLegacyV3Structure(state)
  return { state, report }
}

export function historicalEmailWarnings(state: AppState): string[] {
  const warnings: string[] = []
  const inspect = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value)) {
      const childPath = `${path}.${key}`
      if (key === 'email' && typeof entry === 'string' && mailboxError(entry)) warnings.push(`${childPath}: ${JSON.stringify(entry)} ist keine unterstützte Mailbox. Historischer Wert bleibt erhalten; E-Mail-Versandlink ist gesperrt.`)
      else if (entry && typeof entry === 'object') inspect(entry, childPath)
    }
  }
  state.invoices.forEach((invoice, index) => inspect(invoice.snapshot, `invoices[${index}].snapshot`))
  state.audit.forEach((event, index) => inspect(event.snapshotCorrection, `audit[${index}].snapshotCorrection`))
  return warnings
}

export function inspectImport(rawData: string): CommandResult<ImportPreview> {
  return commandResult(() => {
    let parsed: unknown
    try { parsed = JSON.parse(rawData.replace(/^\uFEFF/, '')) } catch { throw new Error('Die Backup-Datei enthält kein gültiges JSON.') }
    const root = backupObject(parsed, 'Backup')
    let data: unknown = root
    let source: MigrationReport['source'] = 'local-state'
    let envelope: StorageEnvelope | null = null
    if ('storageVersion' in root) {
      validateEnvelope(root, true)
      envelope = root
      data = root.data
    } else if ('data' in root) {
      knownKeys(root, 'Backup', 'app exportedAt schemaVersion data')
      source = backupEnum(root.app, 'app', ['riffrechnung', 'gitarrenrechnungen']) as MigrationReport['source']
      backupTimestamp(root.exportedAt, 'exportedAt')
      data = root.data
      if (root.schemaVersion !== backupObject(data, 'data').schemaVersion) throw new Error('Backup-Umschlag und Daten haben unterschiedliche Formatversionen.')
    }
    const version = backupObject(data, 'data').schemaVersion
    if (version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6) throw new Error('Die Datei hat kein unterstütztes Backup-Format. Neuere oder unbekannte Formate bleiben unverändert.')
    let report: MigrationReport | null = null
    let state: AppState
    if (version === 6) { validateBackupState(data); state = structuredClone(data) }
    else if (version === 5) {
      validateLegacyV5Structure(data)
      state = upgradeToV6(data)
      report = { migration: 'riffrechnung-to-v6', version: 1, fromSchema: 5, toSchema: 6, source, changes: [], idMappings: [] }
    }
    else if (version === 4) {
      validateLegacyV4Structure(data)
      state = upgradeToV6({ ...structuredClone(data as AppState), schemaVersion: 5 })
      report = { migration: 'riffrechnung-to-v6', version: 1, fromSchema: 4, toSchema: 6, source, changes: [], idMappings: [] }
    }
    else {
      let legacy: LegacyState
      if (version === 2) ({ state: legacy, report } = migrateV2(data, source))
      else { validateLegacyV3Structure(data); legacy = structuredClone(data) as LegacyState }
      report ??= { migration: 'riffrechnung-to-v6', version: 1, fromSchema: 3, toSchema: 6, source, changes: [], idMappings: [] }
      state = captureLegacyDocuments(legacy)
      report.changes.push({ path: 'schemaVersion', before: version, after: 6, reason: 'Vollständige älteste verfügbare Belegstände und getrennte Verwaltung sichern; frühere Inhalte bleiben unbekannt' })
      for (const document of state.documentVersions) report.changes.push({ path: `documentVersions.${document.id}`, before: null, after: document, reason: 'Jetzt verfügbarer historischer Inhalt, alte Ausgabebeträge und Snapshot-/Registerbelege; keine Wiederherstellung verlorener Originale' })
      for (const invoice of state.invoices.filter((entry) => entry.versionId)) report.changes.push({ path: `invoices.${invoice.id}.versionId`, before: null, after: invoice.versionId, reason: 'Verweis auf den gesicherten vollständigen Belegstand' })
      report.changes.push({ path: 'invoiceAdministration', before: null, after: state.invoiceAdministration, reason: 'Vorhandenen Verwaltungsstatus übernehmen; frühere Ereignisse bleiben unbekannt' })
      report.changes.push({ path: 'payments', before: null, after: state.payments, reason: 'Vorhandenen Vollzahlungsstatus oder gespeicherten Zahlungshinweis einmalig übernehmen; fehlende Zahlungstage bleiben unbekannt' })
      if (state.historicalSnapshotCorrections.length) report.changes.push({ path: 'historicalSnapshotCorrections', before: null, after: state.historicalSnapshotCorrections, reason: 'Vorhandene Snapshot-Differenzen unabhängig von der begrenzten Aktivitätsliste bewahren; auch ohne vollständigen Beleg' })
      validateBackupState(state)
    }
    if (report) {
      if (version >= 4) report.changes.push({ path: 'schemaVersion', before: version, after: 6, reason: 'Rechnungsprofil und steuerliche Identifikationsangabe strukturiert erfassen; historische Beleg-Snapshots bleiben unverändert' })
      report.changes.push({ path: 'settings.invoiceProfile', before: null, after: 'small-business', reason: 'Vom Produktverantwortlichen in Paket 07 ausdrücklich gewähltes Kleinunternehmerprofil; neue Finalisierung bleibt bis zur Steuerkennung gesperrt' })
      report.changes.push({ path: 'settings.taxIdentifier', before: null, after: state.settings.taxIdentifier, reason: 'Leeres strukturiertes Feld; keine fehlende steuerliche Kennung erfunden' })
      for (const invoice of state.invoices.filter((entry) => entry.status === 'draft')) {
        const change = draftAmountChange(invoice)
        if (change.changed) report.changes.push({ path: `invoices.${invoice.id}.amountReview`, before: change.before, after: change.after, reason: 'Centvergleich Altberechnung/exakte Dezimalberechnung; Originalwerte unverändert. Vor Finalisierung im Editor prüfen. Kein gespeicherter historischer Belegbetrag.' })
        if (change.changed && change.after !== null) invoice.items.forEach((item, index) => {
          const before = legacyItemCents(item), after = itemTotalCents(item)
          if (before !== after) report!.changes.push({ path: `invoices.${invoice.id}.items[${index}].amountReview`, before, after, reason: 'Positionsbetrag in Cent: Altalgorithmus → kaufmännische exakte Dezimalrundung; Eingaben bleiben erhalten' })
        })
      }
      validateBackupState(state)
    }
    return { rawData, state, report, envelope, warnings: [...historicalEmailWarnings(state), ...state.documentVersions.flatMap((version) => version.conflicts.map((conflict) => `${version.content.number}: ${conflict.message}`))] }
  })
}

export function inspectImportBytes(bytes: Uint8Array): CommandResult<ImportPreview> {
  try {
    return inspectImport(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes))
  } catch { return { ok: false, errors: [{ code: 'INVALID_ENCODING', message: 'Die Datei enthält kein gültiges UTF-8. Bitte unveränderte Rohdaten exportieren.' }] } }
}

// Read-only conversion; callers must inspect the report before a replacement.
export function parseBackup(text: string): AppState {
  return requireSuccess(inspectImport(text)).state
}

export function serializeMigrationReport(preview: ImportPreview): string {
  return JSON.stringify({ app: 'riffrechnung-recovery', version: 1, originalUtf8: preview.rawData, report: preview.report, warnings: preview.warnings }, null, 2)
}

export type LegacyState = Omit<AppState, 'schemaVersion' | 'documentVersions' | 'invoiceAdministration' | 'payments' | 'historicalSnapshotCorrections'> & { schemaVersion: 3 }

/** Deterministic capture: sourceUpdatedAt is a source timestamp, not a guessed issuance date. */
export function captureLegacyDocuments(legacy: LegacyState): AppState {
  const state: AppState = { ...upgradeToV6(legacy), documentVersions: [], invoiceAdministration: [], payments: [], historicalSnapshotCorrections: structuredClone(legacy.audit.filter((event) => event.snapshotCorrection)) }
  state.invoices.forEach((invoice, index) => {
    if (invoice.status === 'draft') return
    const version = captureDocument(state, invoice, `version-v4-${index}`, true)
    state.documentVersions.push(version)
    invoice.versionId = version.id
    state.invoiceAdministration.push({ versionId: version.id, archived: false, events: [{ at: invoice.updatedAt, status: invoice.status, kind: 'imported', reason: 'Ältester verfügbarer Verwaltungsstand; frühere Versand-/Statusereignisse unbekannt.' }], resolutions: [] })
    if (invoice.status === 'paid' || invoice.paidAt) state.payments.push({
      id: `payment-v4-${index}`, sourceVersionId: version.id, amountCents: version.amounts.totalCents,
      paidAt: invoice.paidAt ?? null, recordedAt: invoice.updatedAt, provenance: 'legacy-status',
      allocations: [{ versionId: invoice.status === 'paid' ? version.id : null, at: invoice.updatedAt, reason: 'Aus historischem Vollzahlungsstatus übernommen; Zahlungsdatum bleibt unbekannt, wenn es nicht gespeichert war.' }],
    })
  })
  return state
}

