import type { AppState, DuoLesson } from '../src/types'
import { documentAt, documentFamily, editable } from './documentFixtures'
import { createDuoDrafts } from '../src/lib/duo'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { studentCodeIndex } from '../src/lib/utils'

export const duoLesson: DuoLesson = { serviceDate: '2026-09-25', description: 'Rhythmusarbeit (Duo)', quantity: .75, unit: 'Std.' }
export const households = [
  { student: 'Aurora Nordlicht', guardian: 'Mira Nordlicht', code: 'aur', note: 'GEHEIM_A: Duo mit Bastian Suedwind', intro: 'Einleitung Aurora', free: 'Hinweis Aurora', legal: 'Rechtstext Aurora' },
  { student: 'Bastian Suedwind', guardian: 'Tarek Suedwind', code: 'bas', note: 'GEHEIM_B: Duo mit Aurora Nordlicht', intro: 'Einleitung Bastian', free: 'Hinweis Bastian', legal: 'Rechtstext Bastian' },
]

export function duoFamily(): AppState {
  const state = documentFamily()
  households.forEach((household, index) => {
    Object.assign(state.students[index], { name: household.student, billingCode: household.code, note: household.note, guardianIds: [state.guardians[index].id] })
    Object.assign(state.guardians[index], { name: household.guardian, email: `${household.code}@example.org`, paymentNote: household.note })
    state.guardians[index].address.street = `${household.code.toUpperCase()}-Weg ${index + 1}`
  })
  state.nextStudentCodeIndex = Math.max(...households.map((household) => studentCodeIndex(household.code))) + 1
  state.settings.duoRate = 20
  return state
}

export function duoDrafts(totalCents?: number): AppState {
  let state = createDuoDrafts(duoFamily(), ['s-a', 's-b'], duoLesson, totalCents, documentAt)
  for (const [index, target] of state.duoGroups![0].targets.entries()) {
    const draft = editable(state.invoices.find((invoice) => invoice.id === target.invoiceId)!)
    const household = households[index]
    Object.assign(draft, { guardianIds: [index === 0 ? 'g-a' : 'g-b'], introText: household.intro, freeText: household.free, legalText: household.legal })
    draft.items[0].unitPrice = index === 0 ? 10.10 : 20.02
    state = saveInvoiceDraft(state, draft, false, documentAt)
  }
  return state
}
