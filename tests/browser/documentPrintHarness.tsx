import { createRoot } from 'react-dom/client'
import type { AppState, Guardian, Invoice, Settings, Student } from '../../src/types'
import { selectInvoice } from '../../src/lib/documents'
import { InvoicePrint, type GiroCodeEncoder } from '../../src/components/InvoicePrint'

interface MountOptions {
  rejectGiroCode?: boolean
}

// Browser-only synthetic harness: production print component, real QR image load
// and Chromium PDF engine. It does not claim native OS print-dialog acceptance.
export function mountDocument(state: AppState, invoiceId: string, options: MountOptions = {}) {
  const invoice = selectInvoice(state, state.invoices.find((entry) => entry.id === invoiceId)!)
  mountInvoiceDocument(invoice, state.settings, state.guardians, state.students, options)
}

export function mountInvoiceDocument(invoice: Invoice, settings: Settings, guardians: Guardian[], students: Student[], options: MountOptions = {}) {
  const root = document.createElement('div')
  root.className = 'print-root'
  document.body.append(root)
  const qrEncoder: GiroCodeEncoder | undefined = options.rejectGiroCode
    ? async () => { throw new Error('Synthetische QR-Erzeugung abgelehnt') }
    : undefined
  createRoot(root).render(
    <InvoicePrint
      invoice={invoice}
      guardians={guardians}
      students={students}
      settings={settings}
      requestId="synthetic-print"
      onPrintReady={(_requestId, invoiceId, payload) => {
        document.documentElement.dataset.documentReady = invoiceId
        document.documentElement.dataset.giroPayload = payload ?? ''
      }}
      onPrintError={(_request, _invoice, message) => { document.documentElement.dataset.documentError = message }}
      qrEncoder={qrEncoder}
    />,
  )
}

export function mountDocumentRace(state: AppState, firstInvoiceId: string, secondInvoiceId: string) {
  const first = selectInvoice(state, state.invoices.find((entry) => entry.id === firstInvoiceId)!)
  const second = selectInvoice(state, state.invoices.find((entry) => entry.id === secondInvoiceId)!)
  const root = document.createElement('div')
  root.className = 'print-root'
  document.body.append(root)
  const reactRoot = createRoot(root)
  let resolveFirst: (value: string) => void = () => {}
  const delayedEncoder: GiroCodeEncoder = () => new Promise((resolve) => { resolveFirst = resolve })

  reactRoot.render(
    <InvoicePrint
      invoice={first}
      guardians={state.guardians}
      students={state.students}
      settings={state.settings}
      requestId="first-request"
      onPrintReady={(_requestId, invoiceId, payload) => {
        document.documentElement.dataset.documentReady = invoiceId
        document.documentElement.dataset.giroPayload = payload ?? ''
      }}
      onPrintError={(_request, _invoice, message) => { document.documentElement.dataset.documentError = message }}
      qrEncoder={delayedEncoder}
    />,
  )
  window.setTimeout(() => {
    reactRoot.render(
      <InvoicePrint
        invoice={second}
        guardians={state.guardians}
        students={state.students}
        settings={state.settings}
        requestId="second-request"
        onPrintReady={(_requestId, invoiceId, payload) => {
          document.documentElement.dataset.documentReady = invoiceId
          document.documentElement.dataset.giroPayload = payload ?? ''
        }}
        onPrintError={(_request, _invoice, message) => { document.documentElement.dataset.documentError = message }}
      />,
    )
    resolveFirst('data:image/png;base64,old')
  }, 0)
}
