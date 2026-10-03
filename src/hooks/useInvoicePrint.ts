import { useCallback, useRef, useState, type RefObject } from 'react'
import type { AppState, Invoice, ToastMessage } from '../types'
import { selectInvoice } from '../lib/documents'
import { uid } from '../lib/identities'
import { invoicePdfTitle } from '../lib/invoiceOutput'
import { isCurrentPrintRequest, type PrintRequest } from '../lib/printJob'

interface PrintConfirmation {
  title: string
  message: string
  label: string
  action: () => void
}

// Pins each print job to its confirmed document and ignores stale QR/font results.
export function useInvoicePrint(stateRef: RefObject<AppState>, toast: (message: string, tone?: ToastMessage['tone']) => void, confirm: (request: PrintConfirmation) => void) {
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null)
  const printRequestRef = useRef<PrintRequest | null>(null)
  const print = (invoice: Invoice) => {
    const current = stateRef.current
    const request: PrintRequest = {
      id: uid('print'),
      invoice: selectInvoice(current, current.invoices.find((entry) => entry.id === invoice.id) ?? invoice),
      guardians: structuredClone(current.guardians),
      students: structuredClone(current.students),
      settings: structuredClone(current.settings),
      includeGiroCode: true,
    }
    printRequestRef.current = request
    setPrintRequest(request)
  }

  const handlePrintReady = useCallback(async (requestId: string, invoiceId: string) => {
    const request = printRequestRef.current
    if (!isCurrentPrintRequest(request, requestId, invoiceId)) return
    try {
      await document.fonts?.ready
    } catch {
      // A printable fallback font is still better than crossing into another job.
    }
    if (!isCurrentPrintRequest(printRequestRef.current, requestId, invoiceId)) return

    printRequestRef.current = null
    const previousTitle = document.title
    const restoreTitle = () => {
      document.title = previousTitle
      setPrintRequest((current) => current?.id === requestId ? null : current)
    }
    document.title = invoicePdfTitle(request.invoice, request.students)
    window.addEventListener('afterprint', restoreTitle, { once: true })
    try {
      window.print()
    } catch {
      window.removeEventListener('afterprint', restoreTitle)
      restoreTitle()
      toast('Druckdialog konnte nicht geöffnet werden.', 'error')
    }
  }, [toast])

  const handlePrintError = useCallback((requestId: string, invoiceId: string, message: string) => {
    const request = printRequestRef.current
    if (!isCurrentPrintRequest(request, requestId, invoiceId)) return
    confirm({
      title: 'GiroCode nicht verfügbar',
      message: `${message} Die Rechnung selbst ist vollständig und kann bewusst ohne GiroCode gedruckt werden. Bankdaten, Betrag und Verwendungszweck bleiben unverändert aus diesem Druckauftrag.`,
      label: 'Ohne GiroCode drucken',
      action: () => {
        const pending = printRequestRef.current
        if (!isCurrentPrintRequest(pending, requestId, invoiceId)) return
        const fallback = { ...pending, includeGiroCode: false }
        printRequestRef.current = fallback
        setPrintRequest(fallback)
      },
    })
  }, [confirm])

  return { print, printRequest, handlePrintReady, handlePrintError }
}

