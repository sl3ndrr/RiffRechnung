import { cleanLegacyContacts, RETIRED_CONTACT_FIELDS } from './legacyContactsRecipients'
import { cleanRecoveryTaxFields } from './recoveryTaxCleanup'

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

/** Migration-only cleanup of internal raw copies and reports. Unreadable evidence fails closed. */
export function cleanRecoveryFields(raw: string): string {
  const taxCleaned = cleanRecoveryTaxFields(raw)
  let value: unknown
  try { value = JSON.parse(taxCleaned.replace(/^\uFEFF/, '')) } catch {
    for (const match of taxCleaned.matchAll(/"(?:[^"\\]|\\.)*"/gsu)) {
      let token: unknown
      try { token = JSON.parse(match[0]) } catch { continue }
      if (RETIRED_CONTACT_FIELDS.includes(token as typeof RETIRED_CONTACT_FIELDS[number])) throw new Error('Interne Wiederherstellungskopie ist nicht lesbar und enthält mögliche entfernte Kontaktfelder. Der Umstieg wurde ohne Speicherung abgebrochen.')
    }
    return taxCleaned
  }
  const clean = (entry: unknown): unknown => {
    const root = object(entry)
    if (!root) return entry
    const cleaned = cleanLegacyContacts(root)
    if ('data' in cleaned) cleaned.data = clean(cleaned.data)
    for (const field of ['previousRaw', 'legacyRaw', 'sourceRaw', 'originalUtf8', 'raw']) {
      if (typeof cleaned[field] === 'string') cleaned[field] = cleanRecoveryFields(cleaned[field])
    }
    if (Array.isArray(cleaned.recoveries)) cleaned.recoveries = cleaned.recoveries.map(clean)
    const report = object(cleaned.report)
    if (report && Array.isArray(report.changes)) report.changes = report.changes.filter((raw) => {
      const change = object(raw)
      if (!change || typeof change.path !== 'string') return true
      if (/^(guardians(?:\[\d+\]|\.[^.]+)\.(?:iban|paymentNote|firstName|lastName)|students(?:\[\d+\]|\.[^.]+)\.note)$/u.test(change.path)) return false
      for (const field of ['before', 'after']) {
        if (change.path === 'guardians') change[field] = cleanLegacyContacts({ guardians: change[field] }).guardians
        else if (change.path === 'students') change[field] = cleanLegacyContacts({ students: change[field] }).students
        else if (/^guardians(?:\[\d+\]|\.[^.]+)$/u.test(change.path)) change[field] = cleanLegacyContacts({ guardians: [change[field]] }).guardians[0]
        else if (/^students(?:\[\d+\]|\.[^.]+)$/u.test(change.path)) change[field] = cleanLegacyContacts({ students: [change[field]] }).students[0]
        else if (object(change[field])?.guardians || object(change[field])?.students) change[field] = cleanLegacyContacts(change[field])
      }
      return true
    })
    return cleaned
  }
  const result = clean(value)
  return JSON.stringify(result) === JSON.stringify(value) ? taxCleaned : JSON.stringify(result)
}
