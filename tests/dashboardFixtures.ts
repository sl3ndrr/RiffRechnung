import type { AppState, InvoicePayment } from '../src/types'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { documentAt, documentDraft, documentFamily } from './documentFixtures'

export const dashboardNow = new Date('2026-09-16T09:00:00')

function issue(state: AppState, price: number, dueDate: string) {
  const draft = documentDraft()
  draft.dueDate = dueDate
  draft.items[0] = { ...draft.items[0], id: `dashboard-${state.invoices.length}`, quantity: 1, unitPrice: price }
  return saveInvoiceDraft(state, draft, true, documentAt)
}

export function dashboardFixture(): AppState {
  let state = issue(documentFamily(), 30, '2026-09-14')
  state = issue(state, 40, '2026-09-20')
  const versionId = state.invoices[1].versionId!
  const payment = (id: string, amountCents: number, paidAt: string | null): InvoicePayment => ({
    id, amountCents, paidAt, sourceVersionId: versionId, paymentDayStatus: paidAt ? 'confirmed' : 'unknown',
    recordedAt: documentAt, provenance: paidAt ? 'recorded' : 'legacy-status',
    allocations: [{ versionId, at: documentAt, reason: 'Synthetische Teilzahlung' }],
  })
  state.payments = [payment('dashboard-confirmed', 1000, '2026-02-03'), payment('dashboard-unknown', 500, null)]
  state = issue(state, 50, '2026-09-20')
  state = changeInvoiceStatus(state, state.invoices[2].id, 'paid', documentAt, '2025-12-15')
  state = saveInvoiceDraft(state, { ...documentDraft(), items: documentDraft().items.map((item) => ({ ...item, id: 'dashboard-draft' })) }, false, documentAt)
  state.settings.issuer.name = 'Anna Maria Beispiel'
  state.students[1].active = false
  return state
}

export function dashboardManyOpen(): AppState {
  let state = dashboardFixture()
  for (let index = 0; index < 8; index++) state = issue(state, 10, '2026-10-01')
  return state
}
