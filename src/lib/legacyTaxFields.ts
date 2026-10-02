/** Read adapter only. Never used to relax ordinary writes or current validation. */
type ObjectValue = Record<string, unknown>
const object = (value: unknown): ObjectValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null
export const RETIRED_SETTINGS_FIELDS = ['invoiceProfile', 'taxIdentifier'] as const
export const RETIRED_INVOICE_FIELDS = ['invoiceKind', 'taxPresentation'] as const
export const RETIRED_SNAPSHOT_FIELDS = ['invoiceProfile', 'taxIdentifier', 'invoiceKind', 'taxOutput'] as const

/** Only explicitly named fields and their conflict evidence may be removed. */
export function stripLegacyTaxFields<T>(input: T): { value: T; removedPaths: string[] } {
  const value = structuredClone(input), removedPaths: string[] = []
  const remove = (raw: unknown, fields: readonly string[], path: string) => {
    const entry = object(raw)
    if (!entry) return
    for (const field of fields) if (Object.hasOwn(entry, field)) {
      delete entry[field]
      removedPaths.push(`${path}.${field}`)
    }
  }
  const snapshot = (raw: unknown, path: string) => remove(raw, RETIRED_SNAPSHOT_FIELDS, path)
  const invoice = (raw: unknown, path: string) => {
    remove(raw, RETIRED_INVOICE_FIELDS, path)
    const entry = object(raw)
    if (entry) { snapshot(entry.snapshot, `${path}.snapshot`); snapshot(entry.draftPrintSnapshot, `${path}.draftPrintSnapshot`) }
  }
  const events = (raw: unknown, path: string) => {
    if (!Array.isArray(raw)) return
    raw.forEach((event, i) => {
      const correction = object(object(event)?.snapshotCorrection)
      if (!correction) return
      snapshot(correction.oldValue, `${path}[${i}].snapshotCorrection.oldValue`)
      snapshot(correction.newValue, `${path}[${i}].snapshotCorrection.newValue`)
    })
  }
  const root = object(value)
  if (!root) return { value, removedPaths }
  remove(root.settings, RETIRED_SETTINGS_FIELDS, 'settings')
  if (Array.isArray(root.invoices)) root.invoices.forEach((entry, i) => invoice(entry, `invoices[${i}]`))
  events(root.audit, 'audit')
  events(root.historicalSnapshotCorrections, 'historicalSnapshotCorrections')
  if (Array.isArray(root.documentVersions)) root.documentVersions.forEach((raw, i) => {
    const version = object(raw), path = `documentVersions[${i}]`
    if (!version) return
    invoice(version.content, `${path}.content`)
    snapshot(version.outputSnapshot, `${path}.outputSnapshot`)
    events(version.snapshotHistory, `${path}.snapshotHistory`)
    if (!Array.isArray(version.conflicts)) return
    version.conflicts = version.conflicts.filter((raw, index) => {
      const conflict = object(raw)
      if (!conflict || typeof conflict.path !== 'string') return true
      const parts = conflict.path.split('.')
      const retired = parts.length === 1 && [...RETIRED_INVOICE_FIELDS, ...RETIRED_SNAPSHOT_FIELDS].some((field) => parts[0] === field)
        || ['snapshot', 'outputSnapshot', 'draftPrintSnapshot'].includes(parts[0]) && RETIRED_SNAPSHOT_FIELDS.some((field) => parts[1] === field)
      if (retired) { removedPaths.push(`${path}.conflicts[${index}]`); return false }
      if (['snapshot', 'outputSnapshot', 'draftPrintSnapshot'].includes(conflict.path) && Array.isArray(conflict.values)) {
        conflict.values = conflict.values.map((text, j) => {
          if (typeof text !== 'string') return text
          let parsed: unknown
          try { parsed = JSON.parse(text) } catch { throw new Error('Historischer Snapshot-Konflikt kann nicht sicher bereinigt werden.') }
          const before = removedPaths.length
          snapshot(parsed, `${path}.conflicts[${index}].values[${j}]`)
          return removedPaths.length === before ? text : JSON.stringify(parsed)
        })
      }
      return true
    })
  })
  return { value, removedPaths }
}
