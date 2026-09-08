import { createRoot } from 'react-dom/client'
import type { AppState } from '../../src/types'
import { selectInvoice } from '../../src/lib/documents'
import { InvoicePrint } from '../../src/components/InvoicePrint'

// Browser-only synthetic harness: production print component, real QR image load
// and Chromium PDF engine. It does not claim native OS print-dialog acceptance.
export function mountDocument(state: AppState, invoiceId: string) {
  const root = document.createElement('div')
  root.className = 'print-root'
  document.body.append(root)
  const invoice = selectInvoice(state, state.invoices.find((entry) => entry.id === invoiceId)!)
  createRoot(root).render(<InvoicePrint invoice={invoice} guardians={state.guardians} students={state.students} settings={state.settings} requestId="synthetic-print" onPrintReady={() => { document.documentElement.dataset.documentReady = invoiceId }} onPrintError={(_request, _invoice, message) => { document.documentElement.dataset.documentError = message }} />)
}
