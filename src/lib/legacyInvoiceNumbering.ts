import type { AppState, Settings } from '../types'
import { localToday } from './calendar'
import { compareStudentCodes, invoiceStudentCode } from './utils'

/** Input-only configuration; schema 12 never persists or executes a pattern. */
export type LegacyNumberSettings = Settings & { numberPattern: string; resetNumberAnnually: boolean }
interface Change { path: string; before: unknown; after: unknown; reason: string }

const canonicalCode = (code: string) => [...new Set(code.split('+'))].sort(compareStudentCodes).join('+')

/** Only evidence parsing, never formatting or allocation using old templates. */
function numberEvidence(number: string, pattern: string): { code?: string; sequence?: number } {
  const fixed = /^\d{4}-(\d+)-([a-z]+(?:\+[a-z]+)*)$/.exec(number)
  if (fixed) return { code: canonicalCode(fixed[2]), sequence: Number(fixed[1]) }
  const old = /^\d{4}-([a-z]+(?:\+[a-z]+)*)-(\d+)$/.exec(number)
  if (old) return { code: canonicalCode(old[1]), sequence: Number(old[2]) }
  const groups: string[] = []
  const expression = pattern.split(/(\{YYYY\}|\{YY\}|\{K\}|\{N+\})/).map((part) => {
    if (part === '{YYYY}' || part === '{YY}') return part === '{YYYY}' ? '\\d{4}' : '\\d{2}'
    if (part === '{K}') { groups.push('code'); return '([a-z]+(?:\\+[a-z]+)*)' }
    if (/^\{N+\}$/.test(part)) { groups.push('sequence'); return '(\\d+)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  const match = new RegExp(`^${expression}$`).exec(number)
  const values = match ? Object.fromEntries(groups.map((key, index) => [key, match[index + 1]])) : {}
  return { ...(values.code ? { code: canonicalCode(values.code) } : {}), ...(values.sequence ? { sequence: Number(values.sequence) } : {}) }
}

/**
 * Ambiguous concatenated legacy keys reserve every segmentation supported by
 * existing codes. New allocation never consults these aliases again.
 */
function legacyCircles(code: string, codes: string[]): string[] {
  if (code.includes('+')) return [canonicalCode(code)]
  const matches = new Set([code])
  const visit = (rest: string, start: number, parts: string[]) => {
    if (!rest) { if (parts.length > 1) matches.add(parts.join('+')); return }
    for (let index = start; index < codes.length; index++) {
      if (rest.startsWith(codes[index])) visit(rest.slice(codes[index].length), index + 1, [...parts, codes[index]])
    }
  }
  visit(code, 0, [])
  return [...matches]
}

export function migrateInvoiceNumbering(value: AppState, changes: Change[] = [], migrationYear = Number(localToday().slice(0, 4))): AppState {
  const state = structuredClone(value)
  const settings = state.settings as LegacyNumberSettings
  const pattern = settings.numberPattern ?? ''
  const nonAnnual = settings.resetNumberAnnually === false
  const documents = [...state.invoices, ...state.documentVersions.map((version) => version.content)]
  const reservations = [...state.voidedInvoiceNumbers, ...state.documentVersions.flatMap((version) => version.registerEntries)]
  const years = [...new Set([migrationYear, ...documents.map((entry) => entry.year ?? Number(entry.invoiceDate.slice(0, 4))), ...reservations.map((entry) => entry.year),
    ...Object.keys(state.counters).flatMap((key) => { const match = /^(\d{4})(?:[:-]|$)/.exec(key); return match ? [Number(match[1])] : [] })])]
  const codes = state.students.map((student) => student.billingCode).sort(compareStudentCodes)
  const reserve = (year: number, code: string, next: number, reason: string) => {
    if (!Number.isSafeInteger(next) || next < 1) throw new Error('Alte Rechnungsfolge kann nicht sicher übernommen werden. Originaldaten bleiben geschützt.')
    const key = `${year}:${code}`
    const before = state.counters[key]
    if (next <= (before ?? 0)) return
    state.counters[key] = next
    changes.push({ path: `counters.${key}`, before: before ?? null, after: next, reason })
  }
  for (const [key, count] of Object.entries(value.counters)) {
    const match = /^(global|\d{4})(?:[:-]([a-z]+(?:\+[a-z]+)*|\*))?$/.exec(key)
    const scopes = !match || match[1] === 'global' || nonAnnual ? years : [Number(match[1])]
    const circles = match?.[2] && match[2] !== '*' ? legacyCircles(match[2], codes) : ['*']
    for (const year of scopes) for (const code of circles) reserve(year, code, count,
      !match || !match[2] || match[2] === '*' ? `Nicht personenbezogener Altzähler ${key}: jährlicher Mindeststand für alle Kreise; keine Folge zurücksetzen.`
        : match[1] === 'global' || nonAnnual ? `Nichtjährlichen Altzähler ${key} in Umstiegsjahr und bekannte Rechnungs-/Reservierungsjahre übernehmen; spätere neue Jahre zählen jährlich.`
          : `Altzähler ${key} kanonisch übernehmen; mehrdeutige unsegmentierte Kombinationen konservativ zusätzlich reservieren.`)
  }
  for (const document of documents) {
    if (!document.number) continue
    const evidence = numberEvidence(document.number, pattern)
    const sequence = Math.max(document.sequence ?? 0, evidence.sequence ?? 0)
    const liveCodesComplete = document.studentIds.length > 0 && document.studentIds.every((id) => state.students.some((student) => student.id === id))
    const circles = liveCodesComplete ? [invoiceStudentCode(state, document.studentIds)] : evidence.code ? legacyCircles(evidence.code, codes) : ['*']
    if (sequence) for (const year of nonAnnual ? years : [document.year ?? Number(document.invoiceDate.slice(0, 4))]) for (const code of circles) reserve(year, code, sequence + 1,
      nonAnnual ? 'Nichtjährliche bekannte Belegfolge auch ohne globalen Altzähler im Umstiegsjahr und bekannten Jahren fortsetzen.' : 'Vergebene Belegfolge unverändert schützen, auch bei niedrigerem gespeichertem Zähler.')
  }
  for (const entry of reservations) {
    const evidence = numberEvidence(entry.number, pattern)
    const sequence = Math.max(entry.sequence ?? 0, evidence.sequence ?? 0)
    if (sequence) {
      for (const year of nonAnnual ? years : [entry.year]) for (const code of evidence.code ? legacyCircles(evidence.code, codes) : ['*']) reserve(year, code, sequence + 1,
        nonAnnual ? 'Nichtjährliche reservierte Folge auch ohne globalen Altzähler im Umstiegsjahr und bekannten Jahren schützen.' : evidence.code ? 'Reservierte Nummer unverändert schützen; erkennbare Kennung konservativ zuordnen.' : 'Reservierung ohne eindeutige Kennung: Mindestfolge für alle Kreise dieses Jahres bewahren.')
    }
  }
  for (const key of ['numberPattern', 'resetNumberAnnually'] as const) {
    changes.push({ path: `settings.${key}`, before: settings[key] ?? null, after: null, reason: 'Nur Migrationsinput; neue Nummern fest YYYY-NNNN-Kennung, jährlich je Person/Kombination.' })
    Reflect.deleteProperty(state.settings, key)
  }
  state.schemaVersion = 12 as never
  changes.push({ path: 'schemaVersion', before: 11, after: 12, reason: `Feste jährliche Nummerierung; konservatives Umstiegsjahr ${migrationYear}. Nummern, Kennungen und Reservierungsbelege bleiben unverändert.` })
  return state
}
