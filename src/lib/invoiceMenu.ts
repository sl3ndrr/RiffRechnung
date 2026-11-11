import type { Invoice } from '../types'

export type InvoiceMenuAction = 'edit' | 'pdf' | 'duplicate' | 'delete'

export interface InvoiceMenuHandlers {
  onEdit: (invoice: Invoice) => void
  onPrint: (invoice: Invoice) => void
  onDuplicate: (invoice: Invoice) => void
  onDelete: (invoice: Invoice) => void
}

interface InvoiceMenuAnchorRect {
  top: number
  right: number
  bottom: number
}

interface InvoiceMenuSize {
  width: number
  height: number
}

interface InvoiceMenuViewport {
  width: number
  height: number
}

export interface InvoiceMenuPosition {
  top: number
  left: number
}

const MENU_GAP = 6
const VIEWPORT_MARGIN = 12

export function calculateInvoiceMenuPosition(
  anchor: InvoiceMenuAnchorRect,
  menu: InvoiceMenuSize,
  viewport: InvoiceMenuViewport,
): InvoiceMenuPosition {
  const maximumLeft = Math.max(VIEWPORT_MARGIN, viewport.width - menu.width - VIEWPORT_MARGIN)
  const left = Math.min(maximumLeft, Math.max(VIEWPORT_MARGIN, anchor.right - menu.width))
  const below = anchor.bottom + MENU_GAP
  const above = anchor.top - MENU_GAP - menu.height
  const maximumTop = Math.max(VIEWPORT_MARGIN, viewport.height - menu.height - VIEWPORT_MARGIN)
  const top =
    below + menu.height <= viewport.height - VIEWPORT_MARGIN || above < VIEWPORT_MARGIN
      ? Math.min(maximumTop, Math.max(VIEWPORT_MARGIN, below))
      : above

  return { top, left }
}

export function runInvoiceMenuAction(action: InvoiceMenuAction, invoice: Invoice, handlers: InvoiceMenuHandlers): void {
  if (action === 'edit') handlers.onEdit(invoice)
  if (action === 'pdf') handlers.onPrint(invoice)
  if (action === 'duplicate') handlers.onDuplicate(invoice)
  if (action === 'delete') handlers.onDelete(invoice)
}
