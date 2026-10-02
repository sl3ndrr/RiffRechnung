import { readFileSync } from 'node:fs'
import type { AppState } from '../src/types'
import { documentAt, documentDraft, documentFamily } from './documentFixtures'
import { saveInvoiceDraft, changeInvoiceStatus } from '../src/lib/invoiceActions'
import { studentCodeIndex } from '../src/lib/utils'

export const duoLesson = { serviceDate: '2026-09-25', description: 'Rhythmusarbeit (Duo)', quantity: .75, unit: 'Std.' as const }
export const households = [
  { student: 'Aurora Nordlicht', guardian: 'Mira Nordlicht', code: 'aur', note: 'GEHEIM_A: Duo mit Bastian Suedwind', intro: 'Einleitung Aurora', free: 'Hinweis Aurora', legal: 'Rechtstext Aurora' },
  { student: 'Bastian Suedwind', guardian: 'Tarek Suedwind', code: 'bas', note: 'GEHEIM_B: Duo mit Aurora Nordlicht', intro: 'Einleitung Bastian', free: 'Hinweis Bastian', legal: 'Rechtstext Bastian' },
]
export function duoFamily(): AppState {
  const state = documentFamily()
  households.forEach((household, index) => {
    Object.assign(state.students[index], { name: household.student, billingCode: household.code,  guardianIds: [state.guardians[index].id] })
    Object.assign(state.guardians[index], { name: household.guardian, email: `${household.code}@example.org` })
    state.guardians[index].address.street = `${household.code.toUpperCase()}-Weg ${index + 1}`
  })
  state.nextStudentCodeIndex = Math.max(...households.map((household) => studentCodeIndex(household.code))) + 1
  state.settings.duoRate = 20
  return state
}
/** Two ordinary invoices, created explicitly one at a time. */
export function duoDrafts(): AppState {
  let state = duoFamily()
  households.forEach((household, index) => {
    const studentId = index === 0 ? 's-a' : 's-b'
    state = saveInvoiceDraft(state, { ...documentDraft(), recipients: ([index === 0 ? 'g-a' : 'g-b']).map((id) => ({ type: 'guardian' as const, id })), studentIds: [studentId],
      introText: household.intro, freeText: household.free, legalText: household.legal,
      items: [{ ...duoLesson, id: `duo-item-${index}`, studentId, lessonType: 'duo', unitPrice: index === 0 ? 10.10 : 20.02 }],
    }, false, documentAt, () => `duo-invoice-${index}`)
  })
  return state
}
export function duoIssued(): AppState {
  let state = duoDrafts()
  for (const invoice of state.invoices) state = changeInvoiceStatus(state, invoice.id, 'sent', documentAt)
  return state
}
/** Frozen output of the unchanged P02 group commands, never rebuilt by new code. */
const legacy = JSON.parse(readFileSync('tests/fixtures/duo-schema9.json', 'utf8')) as {
  sourceCommit: string; drafts: AppState; issued: AppState
}
export const legacyDuoSource = legacy.sourceCommit
export function legacyDuoState(schemaVersion: 8 | 9 = 9, issued = false) {
  const state = structuredClone(issued ? legacy.issued : legacy.drafts)
  return { ...state, schemaVersion, duoGroups: Reflect.get(state, 'duoGroups') as {
    id: string; targets: { invoiceId: string; itemId: string }[]; lesson: typeof duoLesson; totalCents: number
  }[] }
}
