import type { AppState, DocumentConflict } from '../types'
import { canonical } from './envelope'

type RecordValue = Record<string, unknown>
const object = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
export const RETIRED_CONTACT_FIELDS = ['iban', 'paymentNote', 'note', 'firstName', 'lastName'] as const

/** Only person master data is cleaned; issuer accounts and invoice freeText are untouched. */
export function cleanLegacyContacts<T>(value: T): T {
  const copy = structuredClone(value)
  const root = object(copy)
  if (!root) return copy
  if (Array.isArray(root.guardians)) for (const entry of root.guardians) {
    const person = object(entry)
    if (!person) continue
    if (person.name === undefined || person.name === null || typeof person.name === 'string' && !person.name.trim()) {
      if ((person.firstName === undefined || typeof person.firstName === 'string') && (person.lastName === undefined || typeof person.lastName === 'string')) {
        person.name = [person.firstName, person.lastName].filter((part): part is string => typeof part === 'string' && !!part.trim()).map((part) => part.trim()).join(' ')
      }
    }
    for (const field of ['iban', 'paymentNote', 'firstName', 'lastName']) delete person[field]
  }
  if (Array.isArray(root.students)) for (const entry of root.students) {
    const person = object(entry)
    if (person) delete person.note
  }
  return copy
}

/** The bounded pre-schema-11 adapter never consults live people for frozen recipients. */
export function normalizeLegacyRecipients<T>(value: T): T {
  const copy = structuredClone(value)
  const root = object(copy)
  if (!root) return copy
  const conflicts = new Map<string, DocumentConflict[]>()
  const record = (invoiceId: string, path: string, before: unknown, after: unknown) => {
    const entries = conflicts.get(invoiceId) ?? []
    entries.push({ path: `legacyRecipients.${path}`, message: 'Historische Empfängerdarstellungen widersprechen sich. Die bisherige typisierte Ausgabe bleibt erhalten; abweichende eingefrorene Angaben müssen geklärt werden.', values: [before, after].map((entry) => JSON.stringify(entry)) })
    conflicts.set(invoiceId, entries)
  }
  const snapshot = (raw: unknown, invoiceId: string, path: string) => {
    const s = object(raw)
    if (!s) return
    const legacy = Array.isArray(s.guardians) ? s.guardians.map((entry) => ({ ...object(entry), type: 'guardian' })) : undefined
    if (s.recipients === undefined && legacy) s.recipients = legacy
    else if (legacy && Array.isArray(s.recipients)) {
      const projection = s.recipients.filter((entry) => object(entry)?.type === 'guardian')
      if (canonical(legacy) !== canonical(projection)) record(invoiceId, path, legacy, projection)
    }
    delete s.guardians
  }
  const invoice = (raw: unknown, invoiceId: string, path: string) => {
    const i = object(raw)
    if (!i) return
    if (i.recipients === undefined && Array.isArray(i.guardianIds)) i.recipients = i.guardianIds.map((id) => ({ type: 'guardian', id }))
    delete i.guardianIds
    snapshot(i.snapshot, invoiceId, `${path}.snapshot`)
    snapshot(i.draftPrintSnapshot, invoiceId, `${path}.draftPrintSnapshot`)
  }
  const events = (raw: unknown, invoiceId = '') => {
    if (!Array.isArray(raw)) return
    for (const entry of raw) {
      const event = object(entry), correction = object(event?.snapshotCorrection)
      if (!correction) continue
      const id = typeof event?.entityId === 'string' ? event.entityId : invoiceId
      snapshot(correction.oldValue, id, 'snapshotCorrection.oldValue')
      snapshot(correction.newValue, id, 'snapshotCorrection.newValue')
    }
  }
  if (Array.isArray(root.invoices)) for (const raw of root.invoices) invoice(raw, String(object(raw)?.id), 'invoice')
  events(root.audit); events(root.historicalSnapshotCorrections)
  if (Array.isArray(root.documentVersions)) for (const raw of root.documentVersions) {
    const v = object(raw)
    if (!v) continue
    const id = String(v.invoiceId)
    invoice(v.content, id, 'content'); snapshot(v.outputSnapshot, id, 'outputSnapshot'); events(v.snapshotHistory, id)
    if (Array.isArray(v.conflicts)) for (const rawConflict of v.conflicts) {
      const conflict = object(rawConflict)
      if (!conflict || !Array.isArray(conflict.values) || !['snapshot', 'outputSnapshot', 'draftPrintSnapshot'].includes(String(conflict.path))) continue
      conflict.values = conflict.values.map((raw) => {
        if (typeof raw !== 'string') return raw
        let parsed: unknown
        try { parsed = JSON.parse(raw) } catch { return raw }
        snapshot(parsed, id, `conflict.${String(conflict.path)}`)
        return JSON.stringify(parsed)
      })
    }
  }
  // Drafts and orphan evidence have no document administration in which to
  // preserve a second frozen representation. Leave their source protected.
  for (const invoiceId of conflicts.keys()) {
    if (!Array.isArray(root.documentVersions) || !root.documentVersions.some((entry) => object(entry)?.invoiceId === invoiceId)) throw new Error('Widersprüchliche eingefrorene Empfänger ohne vollständige Belegversion. Bitte Rohdaten prüfen; keine automatische Normalisierung.')
  }
  if (Array.isArray(root.documentVersions)) for (const raw of root.documentVersions) {
    const v = object(raw)
    if (v && Array.isArray(v.conflicts)) {
      const extra = conflicts.get(String(v.invoiceId)) ?? []
      v.conflicts.push(...extra.filter((entry, index) => extra.findIndex((candidate) => canonical(candidate) === canonical(entry)) === index))
    }
  }
  return copy
}

export function migrateContactsRecipients(value: unknown): AppState {
  const state = normalizeLegacyRecipients(cleanLegacyContacts(value)) as AppState
  state.schemaVersion = 11
  return state
}
