import type { AppState, InvoiceItem } from '../src/types'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { documentAt, documentDraft, documentFamily } from './documentFixtures'

export const p11Cases = ['ein-empfaenger', 'zwei-anschriften', 'identische-anschriften', 'ohne-anschriften', 'teilanschriften', 'lange-namen', 'langer-hinweis', 'mehrseitig'] as const
export type P11Case = typeof p11Cases[number]

export function p11State(example: P11Case): AppState {
  const state = documentFamily()
  const draft = documentDraft()
  if (example !== 'ein-empfaenger') draft.recipients = [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }]
  if (example === 'identische-anschriften') state.guardians[1].address = structuredClone(state.guardians[0].address)
  if (example === 'ohne-anschriften') state.guardians.forEach((person) => { person.address = { street: '', postalCode: '', city: '' } })
  if (example === 'teilanschriften') {
    state.guardians[0].address = { street: '', postalCode: '54321', city: 'Teilort A' }
    state.guardians[1].address = { street: 'Teilweg B 9', postalCode: '', city: '' }
  }
  if (example === 'lange-namen') {
    state.guardians.forEach((person, i) => {
      person.name = `Synthetische erziehungsberechtigte Person ${i + 1} mit einem außergewöhnlich langen mehrteiligen Familiennamen und eindeutigem Namensende ${i + 1}`
      person.address.street = `Synthetischer langer Straßenname mit mehreren Bestandteilen und Hausnummer ${i + 2}`
      person.address.city = `Langer synthetischer Ortsname mit eindeutigem Ende ${i + 1}`
    })
  }
  draft.freeText = example === 'langer-hinweis'
    ? Array.from({ length: 55 }, (_, i) => `Hinweiszeile ${i + 1}: unverändert und vollständig bis zum letzten Hinweisende.`).join('\n')
    : 'P11: unveränderter optionaler Rechnungshinweis.'
  if (example === 'zwei-anschriften' || example === 'mehrseitig') {
    draft.studentIds = ['s-a', 's-b']
    const units: InvoiceItem['unit'][] = ['Std.', 'Pauschale', 'Stück']
    draft.items = Array.from({ length: example === 'mehrseitig' ? 108 : 3 }, (_, i) => ({
      ...draft.items[0], id: `p11-position-${i + 1}`, studentId: i % 2 ? 's-b' : 's-a',
      serviceDate: `2026-${i % 2 ? '09' : '08'}-15`, unit: units[i % 3],
      quantity: [.75, 2, 3][i % 3], unitPrice: [10.10, 12.50, 2][i % 3],
      description: `P11 Position ${i + 1}: vollständige Leistung mit eindeutiger Zuordnung zur lernenden Person.`,
    }))
  }
  return saveInvoiceDraft(state, draft, true, documentAt)
}
