import { RETIRED_INVOICE_FIELDS, RETIRED_SETTINGS_FIELDS, RETIRED_SNAPSHOT_FIELDS, stripLegacyTaxFields } from './legacyTaxFields'

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

/** Clean only documented internal copies. Unreadable copies stop the migration. */
export function cleanRecoveryTaxFields(raw: string): string {
  let value: unknown
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')) } catch {
    // A broken copy with no retired field-name tokens contains no structured
    // tax evidence. Otherwise fail closed, including escaped JSON key names.
    const retired = new Set<string>([...RETIRED_SETTINGS_FIELDS, ...RETIRED_INVOICE_FIELDS, ...RETIRED_SNAPSHOT_FIELDS])
    for (const match of raw.matchAll(/"(?:[^"\\]|\\.)*"/gsu)) {
      try { if (retired.has(JSON.parse(match[0]))) throw new Error('retired-field') } catch (error) {
        if (error instanceof Error && error.message === 'retired-field') throw new Error('Interne Wiederherstellungskopie ist nicht lesbar und enthält mögliche Steuerfelder. Der Umstieg wurde ohne Speicherung abgebrochen.')
      }
    }
    return raw
  }
  const clean = (entry: unknown): unknown => {
    const root = object(entry)
    if (!root) return entry
    if ('schemaVersion' in root && 'settings' in root && 'invoices' in root) return stripLegacyTaxFields(root).value
    if ('data' in root) root.data = clean(root.data)
    for (const field of ['previousRaw', 'legacyRaw', 'sourceRaw', 'originalUtf8']) {
      if (typeof root[field] === 'string') root[field] = cleanRecoveryTaxFields(root[field])
    }
    if (object(root.report)) root.report = cleanReport(root.report)
    return root
  }
  const before = JSON.stringify(value)
  const result = clean(value)
  return JSON.stringify(result) === before ? raw : JSON.stringify(result)
}

function cleanReport(raw: unknown): unknown {
  const report = object(raw)
  if (!report || !Array.isArray(report.changes)) return raw
  const retired = new Set<string>([...RETIRED_SETTINGS_FIELDS, ...RETIRED_INVOICE_FIELDS, ...RETIRED_SNAPSHOT_FIELDS])
  report.changes = report.changes.filter((raw) => {
    const change = object(raw)
    if (!change || typeof change.path !== 'string') return true
    // Field paths are metadata, never free text. Drop solely tax-related entries.
    if (change.path.split('.').some((part) => retired.has(part))) return false
    for (const field of ['before', 'after']) {
      const value = change[field]
      if (change.path === 'settings') change[field] = stripLegacyTaxFields({ settings: value }).value.settings
      else if (change.path.startsWith('documentVersions.')) change[field] = stripLegacyTaxFields({ documentVersions: [value] }).value.documentVersions[0]
      else if (change.path === 'historicalSnapshotCorrections' || change.path === 'audit') change[field] = stripLegacyTaxFields({ audit: value }).value.audit
      else if (change.path.startsWith('invoices.') && !change.path.includes('.items')) {
        if (change.path.endsWith('.snapshot') || change.path.endsWith('.draftPrintSnapshot')) change[field] = stripLegacyTaxFields({ invoices: [{ snapshot: value }] }).value.invoices[0].snapshot
        else if (object(value)?.items) change[field] = stripLegacyTaxFields({ invoices: [value] }).value.invoices[0]
      }
    }
    return true
  })
  return report
}

/** Roll back changed keys only; a failed setItem itself leaves its key intact. */
export function writeStorageBatch(storage: Storage, updates: Map<string, string | null>): void {
  const original = new Map([...updates.keys()].map((key) => [key, storage.getItem(key)]))
  const changed: string[] = []
  try {
    for (const [key, raw] of updates) {
      if (original.get(key) === raw) continue
      if (raw === null) storage.removeItem(key)
      else storage.setItem(key, raw)
      changed.push(key)
    }
  } catch (error) {
    for (const key of changed.reverse()) {
      const raw = original.get(key)!
      if (raw === null) storage.removeItem(key)
      else storage.setItem(key, raw)
    }
    throw error
  }
}
