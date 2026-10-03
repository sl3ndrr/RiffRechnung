import test from 'node:test'
import assert from 'node:assert/strict'
import type { Invoice } from '../src/types'
import { calculateInvoiceMenuPosition, type InvoiceMenuAction, runInvoiceMenuAction } from '../src/lib/invoiceMenu'
import { invoice } from './invoiceFixtures'

test('alle Kebab-Menü-Aktionen werden an den vorgesehenen Handler weitergeleitet', () => {
  const calls: string[] = []
  const handlers = {
    onEdit: (value: Invoice) => calls.push(`edit:${value.id}`),
    onPrint: (value: Invoice) => calls.push(`pdf:${value.id}`),
    onDuplicate: (value: Invoice) => calls.push(`duplicate:${value.id}`),
    onDelete: (value: Invoice) => calls.push(`delete:${value.id}`),
  }
  const actions: InvoiceMenuAction[] = ['edit', 'pdf', 'duplicate', 'delete']
  actions.forEach((action) => runInvoiceMenuAction(action, invoice(), handlers))
  assert.deepEqual(calls, ['edit:invoice-test', 'pdf:invoice-test', 'duplicate:invoice-test', 'delete:invoice-test'])
})


test('Kebab-Menü wird rechtsbündig verankert und bleibt vollständig im Viewport', () => {
  assert.deepEqual(calculateInvoiceMenuPosition(
    { top: 100, right: 900, bottom: 140 },
    { width: 184, height: 176 },
    { width: 1000, height: 800 },
  ), { top: 146, left: 716 })

  assert.deepEqual(calculateInvoiceMenuPosition(
    { top: 700, right: 990, bottom: 740 },
    { width: 184, height: 176 },
    { width: 1000, height: 800 },
  ), { top: 518, left: 804 })

  assert.deepEqual(calculateInvoiceMenuPosition(
    { top: 100, right: 40, bottom: 140 },
    { width: 184, height: 176 },
    { width: 320, height: 480 },
  ), { top: 146, left: 12 })

})
