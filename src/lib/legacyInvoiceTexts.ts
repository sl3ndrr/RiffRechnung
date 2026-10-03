import type { AppState } from '../types'

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const entries = (value: unknown): unknown[] => Array.isArray(value) ? value : []
export const RETIRED_TEXT_FIELDS = ['introText', 'legalText', 'defaultLegalText', 'outputLegalText'] as const
export function isRetiredTextPath(path: string): boolean {
  return path.split(/[.[\]]/u).some((part) => RETIRED_TEXT_FIELDS.includes(part as typeof RETIRED_TEXT_FIELDS[number]))
}

/** Remove only the retired structured text fields; user strings are never searched. */
export function cleanInvoiceTexts<T>(value: T): T {
  const result = structuredClone(value)
  const root = object(result)
  if (!root) return result
  const snapshot = (value: unknown) => { const s = object(value); if (s) delete s.legalText }
  const invoice = (value: unknown) => {
    const i = object(value)
    if (!i) return
    delete i.introText; delete i.legalText
    snapshot(i.snapshot); snapshot(i.draftPrintSnapshot)
  }
  const history = (value: unknown) => {
    for (const event of entries(value)) {
      const correction = object(object(event)?.snapshotCorrection)
      if (correction) { snapshot(correction.oldValue); snapshot(correction.newValue) }
    }
  }
  const settings = object(root.settings)
  if (settings) delete settings.defaultLegalText
  entries(root.invoices).forEach(invoice)
  history(root.audit); history(root.historicalSnapshotCorrections)
  for (const entry of entries(root.documentVersions)) {
    const version = object(entry)
    if (!version) continue
    delete version.outputLegalText
    invoice(version.content); snapshot(version.outputSnapshot); history(version.snapshotHistory)
    if (Array.isArray(version.conflicts)) version.conflicts = version.conflicts.filter((entry) => {
      const conflict = object(entry)
      if (!conflict || typeof conflict.path !== 'string') return true
      if (isRetiredTextPath(conflict.path)) return false
      if (['snapshot', 'outputSnapshot', 'draftPrintSnapshot'].includes(conflict.path) && Array.isArray(conflict.values)) {
        conflict.values = conflict.values.map((raw) => {
          if (typeof raw !== 'string') return raw
          let evidence: unknown
          try { evidence = JSON.parse(raw) } catch { throw new Error('Snapshot-Konflikt enthält unlesbare Daten. Textbereinigung ohne Speicherung abgebrochen.') }
          const before = JSON.stringify(evidence)
          snapshot(evidence)
          return JSON.stringify(evidence) === before ? raw : JSON.stringify(evidence)
        })
      }
      return true
    })
  }
  return result
}

/** Reports may contain whole-record copies; keep all other evidence and paths. */
export function cleanTextReport<T>(value: T): T {
  const report = structuredClone(value)
  const root = object(report)
  if (!root || !Array.isArray(root.changes)) return report
  const cleanEvidence = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(cleanEvidence)
    const entry = object(value)
    if (!entry) return value
    // These values are structured field copies, never freeText contents.
    const cleaned = cleanInvoiceTexts({ documentVersions: [entry] }).documentVersions[0]
    for (const field of RETIRED_TEXT_FIELDS) delete cleaned[field]
    for (const [key, child] of Object.entries(cleaned)) cleaned[key] = cleanEvidence(child)
    if (Array.isArray(cleaned.conflicts)) cleaned.conflicts = cleaned.conflicts.filter((c) => !isRetiredTextPath(String(object(c)?.path ?? '')))
    return cleanInvoiceTexts({ documentVersions: [cleaned] }).documentVersions[0]
  }
  root.changes = root.changes.filter((value) => !isRetiredTextPath(String(object(value)?.path ?? ''))).map((value) => {
    const change = object(value)
    if (change) for (const key of ['before', 'after']) change[key] = cleanEvidence(change[key])
    return value
  })
  return report
}

export function migrateInvoiceTexts(state: AppState): AppState {
  const cleaned = cleanInvoiceTexts(state)
  cleaned.schemaVersion = 15
  return cleaned
}

/** Internal copies only. Fail closed if broken JSON may contain retired fields. */
export function cleanRecoveryInvoiceTexts(raw: string): string {
  let value: unknown
  try { value = JSON.parse(raw.replace(/^\uFEFF/u, '')) } catch {
    for (const match of raw.matchAll(/"(?:[^"\\]|\\.)*"/gsu)) {
      let token: unknown
      try { token = JSON.parse(match[0]) } catch { continue }
      if (RETIRED_TEXT_FIELDS.includes(token as typeof RETIRED_TEXT_FIELDS[number])) throw new Error('Interne Wiederherstellungskopie ist unlesbar und enthält mögliche abgeschaffte Rechnungstexte. Der Umstieg wurde ohne Speicherung abgebrochen.')
    }
    return raw
  }
  const clean = (value: unknown): unknown => {
    const root = object(value)
    if (!root) return value
    const cleaned = cleanInvoiceTexts(root)
    if ('data' in cleaned) cleaned.data = clean(cleaned.data)
    if ('report' in cleaned) cleaned.report = cleanTextReport(cleaned.report)
    for (const field of ['previousRaw', 'legacyRaw', 'sourceRaw', 'originalUtf8', 'raw']) {
      if (typeof cleaned[field] === 'string') cleaned[field] = cleanRecoveryInvoiceTexts(cleaned[field])
    }
    if (Array.isArray(cleaned.recoveries)) cleaned.recoveries = cleaned.recoveries.map(clean)
    return cleaned
  }
  const result = clean(value)
  return JSON.stringify(result) === JSON.stringify(value) ? raw : JSON.stringify(result)
}
