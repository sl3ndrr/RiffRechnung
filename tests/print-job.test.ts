import test from 'node:test'
import assert from 'node:assert/strict'
import type { Invoice, Settings } from '../src/types'
import { generateGiroCode, isCurrentPrintRequest, resolveGiroCode, type PrintRequest } from '../src/lib/printJob'
import { defaultSettings } from '../src/lib/defaults'

const settings: Settings = {
  ...defaultSettings,
  accountHolder: 'Synthetisches Studio',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'print-a',
    number: '2026-a-0001',
    sequence: 1,
    year: 2026,
    invoiceDate: '2026-09-01',
    dueDate: '2026-09-15',
    period: 'September 2026',
    status: 'sent',
    guardianIds: [],
    studentIds: [],
    recipientStrategy: 'joint',
    items: [{ id: 'item-a', studentId: '', serviceDate: '2026-09-01', lessonType: 'solo', description: 'Synthetischer Unterricht', quantity: 1, unit: 'Std.', unitPrice: 42 }],
    introText: '',
    freeText: '',
    legalText: '',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  }
}

test('P09: GiroCode-Fehler sind optional, fachliche Unvollständigkeit bleibt getrennt', () => {
  const complete = resolveGiroCode(invoice(), settings, true)
  assert.equal(complete.kind, 'ready')

  const unfinished = resolveGiroCode(invoice({ number: null, status: 'draft' }), settings, true)
  assert.deepEqual(unfinished, { kind: 'unavailable', reason: 'GiroCode nur für finalisierte Rechnungen.' })

  const invalidBic = resolveGiroCode(invoice(), { ...settings, bic: 'UNGÜLTIG!' }, true)
  assert.equal(invalidBic.kind, 'error')
  assert.match(invalidBic.reason, /BIC/)

  const oversized = resolveGiroCode(invoice(), settings, true, () => 'X'.repeat(332))
  assert.equal(oversized.kind, 'error')
  assert.match(oversized.reason, /331 Byte/)

  const explicitFallback = resolveGiroCode(invoice(), settings, false)
  assert.equal(explicitFallback.kind, 'disabled')
})

test('P09: abgelehnte QR-Erzeugung liefert einen prüfbaren Fehler statt eines alten Bildes', async () => {
  await assert.rejects(
    generateGiroCode('synthetic payload', async () => { throw new Error('Encoder lehnt Payload ab') }),
    /GiroCode konnte nicht erzeugt werden: Encoder lehnt Payload ab/,
  )
})

test('P09: verspätete Resultate dürfen nur den gleichen Druckauftrag freigeben', () => {
  const first: PrintRequest = {
    id: 'print-first',
    invoice: invoice({ id: 'invoice-first', number: '2026-a-0001' }),
    guardians: [],
    students: [],
    settings,
    includeGiroCode: true,
  }
  const second: PrintRequest = {
    ...first,
    id: 'print-second',
    invoice: invoice({ id: 'invoice-second', number: '2026-b-0001', items: [{ ...invoice().items[0], id: 'item-b', unitPrice: 81 }] }),
  }

  assert.equal(isCurrentPrintRequest(first, 'print-first', 'invoice-first'), true)
  assert.equal(isCurrentPrintRequest(second, 'print-first', 'invoice-first'), false)
  assert.equal(isCurrentPrintRequest(second, 'print-second', 'invoice-first'), false)
  assert.equal(isCurrentPrintRequest(second, 'print-second', 'invoice-second'), true)
})
