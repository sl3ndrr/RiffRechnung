import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { decimalInputText, draftAmountChange, invoiceTotalCents, itemTotalCents, MAX_NEW_CENTS, moneyErrors, sumCents } from '../src/lib/money'
import { addCalendarDays, calendarParts, localToday, shiftCalendarMonths } from '../src/lib/calendar'
import { itemNumberInput, parseDecimalInput } from '../src/lib/values'
import { createEmptyInvoiceDraft } from '../src/lib/defaults'
import { prepareInvoiceCopy, saveInvoiceState } from '../src/lib/commands'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { captureLegacyDocuments, inspectImport } from '../src/lib/importState'
import { selectInvoice, selectedInvoices } from '../src/lib/documents'
import { buildEpcPayload, createReminder, invoiceTotal, invoicesToCsv, nextInvoiceAllocation, outputItemTotal, outputUnitPrice } from '../src/lib/utils'
import { validateBackupState } from '../src/lib/validation'
import { requireSuccess } from '../src/lib/result'
import { serializeBackup, StorageSession, STORAGE_KEY } from '../src/lib/storage'
import { documentAt, documentDraft, documentFamily, legacyFixture } from './documentFixtures'
import { memoryStorage, sharedLock } from './storageHarness'

const line = (quantity: number, unitPrice: number) => ({ ...documentDraft().items[0], quantity, unitPrice })

test('P05: Halbcentgrenzen, Viertelstunden, Hundertstel, Untercentpreise und Positionssumme', () => {
  for (const [q, p, expected] of [[.75, 10.10, 758], [.25, .02, 1], [.01, .5, 1], [.01, .49, 0], [1, 1.005, 101], [1, 1.0049999999999997, 100], [1, 1.0050000000000001, 101], [.25, 30, 750], [.33, 10.10, 333], [.99, .5, 50]]) {
    assert.equal(itemTotalCents(line(q, p)), expected, `${q} × ${p}`)
  }
  assert.equal(invoiceTotalCents({ items: [line(.75, 10.1), line(.25, .02), line(.01, .5)] }), 760)
  assert.equal(invoiceTotalCents({ items: [line(.5, .01), line(.5, .01)] }), 2)
  const fresh = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  assert.equal(outputUnitPrice(selectInvoice(fresh, fresh.invoices[0]), line(1, 1.005)), '1,005\u00a0€')
  const old = v4Fixture()
  assert.equal(outputUnitPrice({ ...old.invoices[0], issuedAmounts: old.documentVersions[0].amounts }, line(1, 1.005)), '1,01\u00a0€')
})

test('P05: 100.000 Kombinationen gegen unabhängigen Python Decimal ROUND_HALF_UP Referenzrechner', () => {
  const reference = JSON.parse(execFileSync('python3', ['-c', `
import json
from decimal import Decimal, ROUND_HALF_UP
result = []
for q in range(1, 1001):
    for p in range(1, 101):
        quantity = Decimal(q) / 100
        price = Decimal(p if p % 2 else p * 101) / 100
        cents = int((quantity * price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) * 100)
        result.append(cents)
print(json.dumps(result))
`], { encoding: 'utf8', maxBuffer: 4_000_000 })) as number[]
  let index = 0
  for (let q = 1; q <= 1000; q++) for (let p = 1; p <= 100; p++) assert.equal(itemTotalCents(line(q / 100, (p % 2 ? p : p * 101) / 100)), reference[index++], `${q}/100 × ${p}/100`)
  assert.equal(index, 100_000)
})

test('P05: Grenzen/Überläufe liefern Fehler; JSON und Eingaben verlieren keine zusätzliche Altpräzision', () => {
  assert.equal(itemTotalCents(line(1, 999_999_999.99)), MAX_NEW_CENTS)
  assert.deepEqual(moneyErrors({ items: [line(1, 999_999_999.99)] }), [])
  assert.equal(moneyErrors({ items: [line(1, 999_999_999.99), line(1, .01)] }).length, 1)
  assert.throws(() => itemTotalCents(line(99.99, Number.MAX_SAFE_INTEGER / 100)), /Centbereich/)
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER, 1]), /Centbereich/)
  for (const value of [NaN, Infinity, -1]) assert.throws(() => itemTotalCents(line(1, value)))
  for (const price of [1.005, .12345678901234568, 1e-20, Number.MIN_VALUE]) {
    const raw = decimalInputText(price)
    assert.equal(parseDecimalInput(raw), price)
    assert.equal(itemNumberInput(raw, 'unitPrice'), price)
    assert.equal(JSON.parse(JSON.stringify(line(.75, price))).unitPrice, price)
  }
  assert.equal(parseDecimalInput('0.1234567890123456789'), null)
  assert.equal(parseDecimalInput('1e-7'), null)
  assert.equal(parseDecimalInput('0.' + '0'.repeat(324) + '1'), null)
  const draft = documentDraft(); draft.items = [line(99.99, Number.MAX_SAFE_INTEGER / 100)]
  const state = documentFamily(), before = JSON.stringify(state)
  assert.equal(saveInvoiceState(state, draft, true, documentAt).ok, false)
  assert.equal(JSON.stringify(state), before)
  assert.equal(nextInvoiceAllocation(state, draft.invoiceDate, draft.studentIds).sequence, 1)
})

function v4Fixture() {
  const current = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  const captured = captureLegacyDocuments(legacyFixture(current))
  Reflect.deleteProperty(captured.settings, 'invoiceProfile')
  Reflect.deleteProperty(captured.settings, 'taxIdentifier')
  const legacyPayments = captured.payments.map(({ paymentDayStatus, legacyPaymentDay, ...payment }) => payment)
  return { ...captured, payments: legacyPayments, schemaVersion: 4 as const }
}

test('P05/P08: Schema 4 → 7 bewahrt Originale; Entwürfe zeigen Änderungen, Import/Reload sind idempotent', async () => {
  const old = v4Fixture()
  const draft = { ...structuredClone(old.invoices[0]), id: 'old-draft', status: 'draft' as const, number: null, sequence: null, items: [line(.75, 10.1)] }
  delete draft.versionId; delete draft.snapshot
  draft.items[0].id = 'old-draft-position'
  old.invoices.push(draft)
  const raw = '\uFEFF' + JSON.stringify(old, null, 2) + '\r\n'
  const preview = requireSuccess(inspectImport(raw))
  assert.equal(preview.rawData, raw)
  assert.equal(preview.report?.fromSchema, 4)
  assert.equal(preview.report?.toSchema, 7)
  assert.ok(preview.report?.changes.some((change) => change.path.endsWith('amountReview') && change.before === 757 && change.after === 758))
  assert.deepEqual(preview.state.documentVersions, old.documentVersions)
  assert.equal(invoiceTotal(selectInvoice(preview.state, preview.state.invoices[0])), 7.57)
  assert.equal(invoiceTotal(preview.state.invoices[1]), 7.58)
  preview.state.settings = { ...preview.state.settings, invoiceProfile: 'small-business', taxIdentifier: { kind: 'tax-number', value: '12/345/67890' } }
  assert.throws(() => changeInvoiceStatus(preview.state, draft.id, 'sent', documentAt), /Editor/)
  // Actual review text/amounts are asserted in the P05 Chromium test (Modal uses a portal).
  const accepted = saveInvoiceDraft(preview.state, { ...draft }, true, documentAt)
  assert.equal(accepted.documentVersions[1].amounts.totalCents, 758)
  assert.equal(accepted.documentVersions[1].amounts.calculation, 'decimal-v1')
  assert.equal(accepted.documentVersions[0].amounts.totalCents, 757)
  const storage = memoryStorage(), lock = sharedLock()
  const session = new StorageSession({ storage, lock })
  await session.restore(raw)
  const archive = [...storage.entries.entries()].find(([key]) => key.includes('-recovery-'))!
  assert.equal(JSON.parse(archive[1]).sourceRaw, raw)
  const reloaded = new StorageSession({ storage, lock })
  assert.deepEqual(reloaded.state.documentVersions, old.documentVersions)
  assert.equal(requireSuccess(inspectImport(storage.getItem(STORAGE_KEY)!)).report, null)
  assert.equal(requireSuccess(inspectImport(serializeBackup(accepted))).report, null)
  validateBackupState(JSON.parse(JSON.stringify(accepted)))
  const future = JSON.stringify({ ...old, schemaVersion: 8 })
  assert.equal(inspectImport(future).ok, false)
  storage.setItem(STORAGE_KEY, future)
  await assert.rejects(() => new StorageSession({ storage, lock }).restore(serializeBackup(accepted)), /neuere|schreibgeschützt/)
  assert.equal(storage.getItem(STORAGE_KEY), future)
})

test('P05: neue Versionen, EPC, Erinnerung, CSV, Register und Ausgabe stimmen nach Reload überein', () => {
  let state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  state = requireSuccess(inspectImport(serializeBackup(state))).state
  const invoice = selectInvoice(state, state.invoices[0])
  assert.equal(invoiceTotal(invoice), 7.58)
  assert.equal(outputItemTotal(invoice, invoice.items[0]), 7.58)
  assert.equal(state.documentVersions[0].amounts.totalCents, 758)
  assert.match(buildEpcPayload(invoice, state.settings, invoiceTotal(invoice)), /EUR7\.58/)
  assert.match(createReminder(invoice, state.guardians, state.students).body, /7,58/)
  assert.match(invoicesToCsv(selectedInvoices(state), state.guardians, state.students), /"7,58"/)
  assert.equal(nextInvoiceAllocation(state, invoice.invoiceDate, invoice.studentIds).sequence, 2)
  const corrupt = structuredClone(state)
  corrupt.documentVersions[0].amounts.itemCents[0] = 757
  corrupt.documentVersions[0].amounts.totalCents = 757
  corrupt.documentVersions[0].amounts.legacyCalculatedTotalCents = 757
  assert.equal(inspectImport(JSON.stringify(corrupt)).ok, false)
  const precise = documentDraft(); precise.items[0].unitPrice = .12345678901234568
  const restored = requireSuccess(inspectImport(serializeBackup(saveInvoiceDraft(documentFamily(), precise, true, documentAt)))).state
  assert.equal(restored.documentVersions[0].content.items[0].unitPrice, .12345678901234568)
  assert.equal(restored.documentVersions[0].amounts.totalCents, 9)
  assert.deepEqual(draftAmountChange(invoice), { before: 757, after: 758, changed: true })
})

test('P05: Kalender-Monatsenden, Schaltjahr, Jahrhundertregel und Jahreswechsel', () => {
  for (const [input, shift, expected] of [['2025-01-31', 1, '2025-02-28'], ['2024-01-31', 1, '2024-02-29'], ['2024-02-29', 12, '2025-02-28'], ['2025-12-31', 1, '2026-01-31'], ['2026-01-31', -1, '2025-12-31'], ['2000-01-31', 1, '2000-02-29'], ['2100-01-31', 1, '2100-02-28']] as const) assert.equal(shiftCalendarMonths(input, shift), expected)
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29')
  assert.equal(addCalendarDays('2025-12-31', 1), '2026-01-01')
  assert.throws(() => calendarParts('2025-02-29'))
  assert.throws(() => addCalendarDays('9999-12-31', 1))
  assert.throws(() => addCalendarDays('2026-01-01', Number.MAX_SAFE_INTEGER))
})

test('P05: Europe/Berlin und UTC – Mitternacht, Sommerzeit, Zahlungstag, Kopie und JSON', () => {
  const previous = process.env.TZ
  try {
    for (const zone of ['Europe/Berlin', 'UTC']) {
      process.env.TZ = zone
      const berlin = zone === 'Europe/Berlin'
      for (const [instant, expectedBerlin, expectedUtc] of [
        ['2026-08-31T22:30:00.000Z', '2026-09-01', '2026-08-31'],
        ['2026-12-31T23:30:00.000Z', '2027-01-01', '2026-12-31'],
        ['2026-03-29T00:30:00.000Z', '2026-03-29', '2026-03-29'],
        ['2026-03-29T01:30:00.000Z', '2026-03-29', '2026-03-29'],
        ['2026-10-25T00:30:00.000Z', '2026-10-25', '2026-10-25'],
        ['2026-10-25T01:30:00.000Z', '2026-10-25', '2026-10-25'],
      ]) {
        const expected = berlin ? expectedBerlin : expectedUtc
        assert.equal(localToday(new Date(instant)), expected)
        assert.equal(createEmptyInvoiceDraft(documentFamily().settings, new Date(instant)).invoiceDate, expected)
        let state = saveInvoiceDraft(documentFamily(), documentDraft(), true, instant)
        state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', instant, expected)
        const restored = requireSuccess(inspectImport(serializeBackup(state))).state
        assert.equal(restored.payments[0].paidAt, expected)
        assert.equal(restored.payments[0].recordedAt, instant)
      }
      assert.equal(addCalendarDays('2026-03-28', 2), '2026-03-30')
      assert.equal(addCalendarDays('2026-10-24', 2), '2026-10-26')
      const draft = documentDraft(); draft.invoiceDate = '2024-01-31'; draft.items[0].serviceDate = '2024-01-31'
      const state = saveInvoiceDraft(documentFamily(), draft, false, documentAt)
      const copy = requireSuccess(prepareInvoiceCopy(state, state.invoices[0].id, new Date('2024-02-15T12:00:00Z')))
      assert.equal(copy.items[0].serviceDate, '2024-02-29')
      const saved = saveInvoiceDraft(state, copy, false, documentAt)
      validateBackupState(requireSuccess(inspectImport(serializeBackup(saved))).state)
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
