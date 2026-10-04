import type { AppState } from '../src/types'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { documentAt, documentDraft, documentFamily } from './documentFixtures'

export function monthlyPrintState(twoMonths = true, itemCount = twoMonths ? 4 : 3): AppState {
  const state = documentFamily(), draft = documentDraft()
  state.settings.issuer.name = 'Vincent Beispiel'
  state.settings.issuer.phone = '0551 123456'
  state.settings.issuer.email = 'unterricht@example.org'
  state.settings.accountHolder = 'VINCENT BEISPIEL'
  state.settings.bic = 'BYLADEM1001'
  state.settings.bankName = 'Synthetische Bank'
  state.guardians[1].name = 'Arta Beispiel'
  state.students[1].name = 'Paul Beispiel'
  draft.recipients = [{ type: 'guardian', id: 'g-b' }]
  draft.studentIds = ['s-b']
  draft.invoiceDate = '2026-09-15'; draft.dueDate = '2026-09-29'; draft.freeText = ''
  draft.items = Array.from({ length: itemCount }, (_, i) => ({
    ...draft.items[0], id: `monthly-item-${i}`, studentId: 's-b', lessonType: 'duo',
    serviceDate: twoMonths && i === 0 ? '2026-08-25' : `2026-09-${String((twoMonths ? (i - 1) % 4 : i % 4) * 7 + 1).padStart(2, '0')}`,
    description: 'Gitarrenunterricht (Duo)', quantity: 1, unitPrice: 20,
  }))
  return saveInvoiceDraft(state, draft, true, documentAt)
}
