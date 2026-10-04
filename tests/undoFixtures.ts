import type { AppState } from '../src/types'
import { emptyState } from '../src/lib/defaults'
import { saveGuardianState, saveInvoiceState, saveStudentState } from '../src/lib/commands'
import { createLessonItem } from '../src/lib/invoiceDrafts'
import { requireSuccess } from '../src/lib/result'

export const undoAt = '2026-10-04T07:00:00.000Z'

export function undoFixture(): AppState {
  let state = emptyState()
  state.settings = { ...state.settings, issuer: { ...state.settings.issuer, name: 'Teststudio' }, accountHolder: 'Teststudio', iban: 'DE02120300000000202051' }
  for (const id of ['g1', 'g2']) state = requireSuccess(saveGuardianState(state, {
    id, name: `Kontakt ${id}`, email: '', phone: '', address: { street: '', postalCode: '', city: '' }, createdAt: undoAt, updatedAt: undoAt,
  }))
  for (const id of ['s1', 's2']) state = requireSuccess(saveStudentState(state, {
    id, name: `Kind ${id}`, billingCode: '', guardianIds: ['g1', 'g2'], active: true, createdAt: undoAt, updatedAt: undoAt,
  }))
  state = requireSuccess(saveInvoiceState(state, {
    invoiceDate: '2026-10-04', dueDate: '2026-10-18', recipients: [{ type: 'guardian', id: 'g1' }, { type: 'guardian', id: 'g2' }],
    studentIds: ['s1', 's2'], recipientStrategy: 'joint', freeText: 'Originalinhalt',
    items: [createLessonItem('s1', '2026-10-01', state.settings, 'undo-item-1'), createLessonItem('s2', '2026-10-02', state.settings, 'undo-item-2')],
  }, false, undoAt))
  return state
}
