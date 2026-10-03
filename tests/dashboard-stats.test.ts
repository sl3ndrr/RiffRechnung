import test from 'node:test'
import assert from 'node:assert/strict'
import type { AppState, InvoicePayment } from '../src/types'
import { calendarDaysBetween } from '../src/lib/calendar'
import { dashboardStats, type DashboardStats } from '../src/lib/dashboardStats'
import { createDemoState, emptyState } from '../src/lib/defaults'
import { activeInvoices, allocatedCents, allocatePayment, archiveInvoice, confirmedPaymentDay, createCorrectionDraft, openCents } from '../src/lib/documents'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { invoiceTotalCents, sumCents } from '../src/lib/money'
import { parseBackup, serializeBackup } from '../src/lib/storage'
import { parseDate } from '../src/lib/utils'
import { validateBackupState } from '../src/lib/validation'
import { documentAt, documentDraft, documentFamily, editable, legacyFixture } from './documentFixtures'

const now = parseDate('2026-09-16')
function issue(state = documentFamily(), invoiceDate = '2026-09-01', dueDate = '2026-09-15', price = 30): AppState {
  const draft = documentDraft()
  draft.invoiceDate = invoiceDate; draft.dueDate = dueDate
  draft.items[0] = { ...draft.items[0], id: `dashboard-item-${state.invoices.length}`, serviceDate: invoiceDate, quantity: 1, unitPrice: price }
  return saveInvoiceDraft(state, draft, true, documentAt)
}
function payment(state: AppState, id: string, amountCents: number, paidAt: string | null): InvoicePayment {
  const versionId = state.invoices.at(-1)!.versionId!
  return { id, sourceVersionId: versionId, amountCents, paidAt, paymentDayStatus: paidAt ? 'confirmed' : 'unknown', recordedAt: documentAt,
    provenance: paidAt ? 'recorded' : 'legacy-status', allocations: [{ versionId, at: documentAt, reason: 'Synthetische Teilzahlung' }] }
}
function assertInvariants(state: AppState, stats: DashboardStats) {
  assert.deepEqual(stats.monthly.months.map((month) => month.month), Array.from({ length: 12 }, (_, i) => i + 1))
  assert.equal(sumCents(stats.monthly.months.map((month) => month.cents)), stats.paid.yearCents)
  assert.equal(stats.paid.yearCents, sumCents(state.payments.filter((entry) => entry.paymentDayStatus === 'confirmed'
    && Number(entry.paidAt?.slice(0, 4)) === stats.monthly.year).map((entry) => entry.amountCents)))
  const active = activeInvoices(state)
  for (const invoice of active) {
    const total = invoiceTotalCents(invoice), allocated = allocatedCents(state, invoice.versionId!), remaining = openCents(state, invoice)
    // Existing correction allocations may overpay a lower claim. The original
    // money remains recorded; only claims without overpayment obey the equality.
    if (allocated <= total) assert.equal(total, sumCents([allocated, remaining]))
    else assert.equal(remaining, 0)
  }
  const open = active.filter((invoice) => !invoice.archived && openCents(state, invoice) > 0)
  assert.equal(stats.open.totalCents, sumCents(open.map((invoice) => openCents(state, invoice))))
  assert.equal(stats.open.count, open.length)
  assert.deepEqual(stats.open.items.map((item) => item.invoiceId).sort(), open.map((invoice) => invoice.id).sort())
  assert.equal(new Set(stats.open.items.map((item) => item.invoiceId)).size, stats.open.count)
  const cents = [stats.paid.yearCents, stats.paid.allTimeCents, stats.paid.withoutConfirmedDay.cents, stats.open.totalCents,
    stats.open.overdueCents, stats.drafts.totalCents, ...stats.open.items.map((item) => item.openCents), ...stats.monthly.months.map((month) => month.cents)]
  for (const amount of cents) assert.ok(Number.isSafeInteger(amount) && amount >= 0, `ganze sichere Cent: ${amount}`)
}
function checkedStats(state: AppState, reference = now, year?: number): DashboardStats {
  validateBackupState(state)
  const before = structuredClone(state)
  const stats = dashboardStats(state, reference, year)
  assert.deepEqual(state, before)
  assertInvariants(state, stats)
  return stats
}

test('3.AP2: leerer Bestand und ein gewähltes Jahr ohne Zahlungen', () => {
  const state = emptyState(), stats = checkedStats(state)
  assert.deepEqual(stats.paid, { yearCents: 0, allTimeCents: 0, withoutConfirmedDay: { count: 0, cents: 0 } })
  assert.deepEqual(stats.open, { count: 0, totalCents: 0, overdueCount: 0, overdueCents: 0, items: [] })
  assert.deepEqual(stats.drafts, { count: 0, totalCents: 0, uncalculableCount: 0 })
  assert.deepEqual(stats.people, { guardians: 0, students: 0, activeStudents: 0 })
  assert.equal(stats.monthly.year, 2026)
  assert.deepEqual(stats.monthly.availableYears, [2026])
  assert.ok(stats.monthly.months.every((month) => month.cents === 0 && month.paymentCount === 0))
  assert.equal(checkedStats(state, now, 2024).monthly.year, 2024)
  assert.deepEqual(checkedStats(state, now, 2024).monthly.availableYears, [2026])
})

test('3.AP2: nur Entwürfe verwenden exakte Vorschaucent; Personen zählen aktive Lernende', () => {
  let state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  const draft = documentDraft(); draft.items[0].id = 'second-draft-item'; draft.items[0].unitPrice = 1.005
  state = saveInvoiceDraft(state, draft, false, documentAt)
  state.students[1].active = false
  const stats = checkedStats(state)
  assert.deepEqual(stats.drafts, { count: 2, totalCents: 833, uncalculableCount: 0 })
  assert.deepEqual(stats.people, { guardians: 2, students: 2, activeStudents: 1 })
  assert.equal(stats.open.count, 0); assert.equal(stats.paid.allTimeCents, 0)
})

test('3.AP2: genau am Fälligkeitstag offen, erst einen Kalendertag danach überfällig', () => {
  const state = issue(), invoice = state.invoices[0]
  for (const [day, overdue] of [['2026-09-15', false], ['2026-09-16', true]] as const) {
    const stats = checkedStats(state, parseDate(day))
    assert.deepEqual(stats.open.items, [{ invoiceId: invoice.id, number: invoice.number, recipientLabel: 'Empfaenger A', studentLabel: 'Testkind A',
      openCents: 3000, invoiceDate: '2026-09-01', dueDate: '2026-09-15', daysSinceInvoice: overdue ? 15 : 14, daysOverdue: overdue ? 1 : 0, isOverdue: overdue }])
    assert.equal(stats.open.totalCents, 3000); assert.equal(stats.open.overdueCount, overdue ? 1 : 0)
    assert.equal(stats.open.overdueCents, overdue ? 3000 : 0)
  }
})

test('3.AP2: offene Liste sortiert überfällige zuerst und anschließend nach Fälligkeit', () => {
  let state = issue(documentFamily(), '2026-09-01', '2026-09-20')
  state = issue(state, '2026-09-01', '2026-09-14')
  state = issue(state, '2026-09-01', '2026-09-10')
  state = issue(state, '2026-09-01', '2026-09-18')
  state = issue(state, '2026-09-01', '2026-09-14')
  const stats = checkedStats(state)
  assert.deepEqual(stats.open.items.map((item) => item.dueDate), ['2026-09-10', '2026-09-14', '2026-09-14', '2026-09-18', '2026-09-20'])
  assert.deepEqual(stats.open.items.map((item) => item.daysOverdue), [6, 2, 2, 0, 0])
  assert.equal(stats.open.overdueCount, 3); assert.equal(stats.open.overdueCents, 9000)
  assert.deepEqual(checkedStats({ ...state, invoices: [...state.invoices].reverse() }).open.items, stats.open.items)
})

test('3.AP2: Teilzahlung zählt nach Eingangstag und lässt nur den Rest offen', () => {
  const state = issue()
  state.payments = [payment(state, 'partial', 1001, '2026-08-31')]
  assert.equal(confirmedPaymentDay(state, state.invoices[0].versionId!), undefined)
  const stats = checkedStats(state)
  assert.equal(stats.paid.yearCents, 1001); assert.equal(stats.paid.allTimeCents, 1001)
  assert.deepEqual(stats.monthly.months[7], { month: 8, cents: 1001, paymentCount: 1 })
  assert.equal(stats.monthly.months[8].cents, 0)
  assert.equal(stats.open.totalCents, 1999); assert.equal(stats.open.overdueCents, 1999)
})

test('3.AP2: Vollzahlung und Nullrechnung haben keinen offenen Anspruch', () => {
  let state = issue()
  state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-14')
  state = issue(state, '2026-09-01', '2026-09-15', 0)
  const stats = checkedStats(state)
  assert.equal(stats.open.count, 0); assert.equal(stats.paid.yearCents, 3000)
  assert.deepEqual(stats.monthly.months[8], { month: 9, cents: 3000, paymentCount: 1 })
})

test('3.AP2: unbekannte Tage bleiben separat; bestätigte Teilzahlungen zählen auch ohne Gesamttag', () => {
  const state = issue()
  state.payments = [payment(state, 'known', 1000, '2026-09-03'), { ...payment(state, 'unknown', 2000, null), legacyPaymentDay: '2024-12-31' }]
  assert.equal(confirmedPaymentDay(state, state.invoices[0].versionId!), undefined)
  const stats = checkedStats(state)
  assert.deepEqual(stats.paid, { yearCents: 1000, allTimeCents: 3000, withoutConfirmedDay: { count: 1, cents: 2000 } })
  assert.deepEqual(stats.monthly.months[8], { month: 9, cents: 1000, paymentCount: 1 })
  assert.deepEqual(stats.monthly.availableYears, [2026]); assert.equal(stats.open.count, 0)
  state.payments[0] = { ...state.payments[0], paymentDayStatus: 'unknown', paidAt: null }
  const unknown = checkedStats(state)
  assert.equal(unknown.paid.yearCents, 0); assert.equal(unknown.paid.withoutConfirmedDay.count, 2)
  assert.equal(unknown.paid.withoutConfirmedDay.cents, 3000)
  assert.ok(unknown.monthly.months.every((month) => month.paymentCount === 0))
})

test('3.AP2: 31.12./01.01. und mehrere Jahre folgen Zahlungstagen statt Beleg- oder Erfassungsdatum', () => {
  const state = issue(documentFamily(), '2024-12-01', '2024-12-15')
  state.payments = [payment(state, 'old', 500, '2024-12-31'), payment(state, 'december', 1000, '2025-12-31'), payment(state, 'january', 1500, '2026-01-01')]
  const stats = checkedStats(state)
  assert.deepEqual(stats.monthly.availableYears, [2026, 2025, 2024])
  assert.deepEqual(stats.monthly.months[0], { month: 1, cents: 1500, paymentCount: 1 })
  assert.equal(stats.paid.allTimeCents, 3000)
  const previous = checkedStats(state, now, 2025)
  assert.equal(previous.paid.yearCents, 1000)
  assert.deepEqual(previous.monthly.months[11], { month: 12, cents: 1000, paymentCount: 1 })
  assert.equal(checkedStats(state, now, 2024).paid.yearCents, 500)
  assert.equal(checkedStats(state, parseDate('2027-01-01')).paid.yearCents, 0)
  assert.deepEqual(checkedStats(state, parseDate('2027-01-01')).monthly.availableYears, [2027, 2026, 2025, 2024])
})

test('3.AP2: Korrekturentwurf lässt den ursprünglichen offenen oder bezahlten Anspruch unverändert', () => {
  for (const paid of [false, true]) {
    let state = issue()
    if (paid) state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-04')
    const before = checkedStats(state)
    state = createCorrectionDraft(state, state.invoices[0].id, 'Text berichtigen', documentAt)
    const stats = checkedStats(state)
    assert.deepEqual(stats.paid, before.paid); assert.deepEqual(stats.open, before.open)
    assert.deepEqual(stats.drafts, { count: 1, totalCents: 3000, uncalculableCount: 0 })
  }
})

test('3.AP2: finalisierte Korrektur ersetzt nur den Anspruch; Zuordnung zählt den Geldfluss nie doppelt', () => {
  let state = issue(); const original = state.invoices[0]
  state = changeInvoiceStatus(state, original.id, 'paid', documentAt, '2026-09-04')
  const paid = checkedStats(state).paid
  state = createCorrectionDraft(state, original.id, 'Betrag berichtigen', documentAt)
  const draft = editable(state.invoices.at(-1)!); draft.items[0].unitPrice = 40
  state = saveInvoiceDraft(state, draft, true, documentAt)
  const correction = state.invoices.at(-1)!
  let stats = checkedStats(state)
  assert.deepEqual(stats.paid, paid); assert.equal(stats.drafts.count, 0)
  assert.equal(stats.open.totalCents, 4000); assert.equal(stats.open.items[0].invoiceId, correction.id)
  state = allocatePayment(state, state.payments[0].id, correction.versionId!, 'Zahlung auf Korrektur anrechnen', documentAt)
  stats = checkedStats(state)
  assert.deepEqual(stats.paid, paid); assert.equal(stats.open.totalCents, 1000)
  state = allocatePayment(state, state.payments[0].id, null, 'Zuordnung zur Klärung lösen', documentAt)
  stats = checkedStats(state)
  assert.deepEqual(stats.paid, paid); assert.equal(stats.open.totalCents, 4000)
  assert.equal(state.payments.length, 1); assert.equal(openCents(state, original), 0)
})

test('3.AP2: Zuordnungsrücknahme und Wiederzuordnung erhalten Zahlung und Monat einmalig', () => {
  let state = issue(); const id = state.invoices[0].id
  state = changeInvoiceStatus(state, id, 'paid', documentAt, '2026-08-31')
  const before = checkedStats(state)
  state = changeInvoiceStatus(state, id, 'sent', documentAt)
  assert.deepEqual(checkedStats(state).paid, before.paid)
  assert.deepEqual(checkedStats(state).monthly, before.monthly)
  assert.equal(checkedStats(state).open.totalCents, 3000)
  state = changeInvoiceStatus(state, id, 'paid', documentAt, '2026-08-31')
  assert.deepEqual(checkedStats(state), before)
})

test('3.AP2: Zahlungstagskorrektur verschiebt den Monat ohne den Gesamtbetrag zu ändern', () => {
  let state = issue(); const id = state.invoices[0].id
  state = changeInvoiceStatus(state, id, 'paid', documentAt, '2025-12-31')
  assert.equal(checkedStats(state).paid.yearCents, 0)
  state = changeInvoiceStatus(state, id, 'paid', documentAt, '2026-01-01')
  const stats = checkedStats(state)
  assert.equal(stats.paid.yearCents, 3000); assert.equal(stats.paid.allTimeCents, 3000)
  assert.equal(stats.monthly.months[0].paymentCount, 1)
  assert.deepEqual(stats.monthly.availableYears, [2026])
})

test('3.AP2: archivierte Ansprüche entfallen, Zahlungseingänge bleiben auch dort erhalten', () => {
  let state = issue()
  state.payments = [payment(state, 'archived-partial', 1000, '2026-09-02')]
  state = archiveInvoice(state, state.invoices[0].id)
  const stats = checkedStats(state)
  assert.equal(stats.open.count, 0); assert.equal(stats.open.totalCents, 0); assert.equal(stats.open.overdueCount, 0)
  assert.equal(stats.paid.yearCents, 1000); assert.equal(stats.paid.allTimeCents, 1000)
  assert.equal(checkedStats(archiveInvoice(state, state.invoices[0].id, false)).open.totalCents, 2000)
})

test('3.AP2: unberechenbare Entwürfe zählen ausschließlich im gesonderten Zähler', () => {
  let state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  const draft = documentDraft(); draft.items[0].id = 'overflow-draft'
  state = saveInvoiceDraft(state, draft, false, documentAt)
  // An in-memory draft preview can overflow; persistence rejects this input.
  state.invoices[1].items[0].quantity = 99.99
  state.invoices[1].items[0].unitPrice = Number.MAX_SAFE_INTEGER / 100
  const before = structuredClone(state), stats = dashboardStats(state, now)
  assert.deepEqual(stats.drafts, { count: 1, totalCents: 758, uncalculableCount: 1 })
  assert.equal(stats.open.count, 0); assert.deepEqual(state, before)
  assertInvariants(state, stats)
})

test('3.AP2: niedrigere Korrektur mit bestehender Überzahlung erzeugt keinen negativen Rest', () => {
  let state = issue(); const original = state.invoices[0]
  state = changeInvoiceStatus(state, original.id, 'paid', documentAt, '2026-09-04')
  state = createCorrectionDraft(state, original.id, 'Niedrigerer Betrag', documentAt)
  const draft = editable(state.invoices.at(-1)!); draft.items[0].unitPrice = 20
  state = saveInvoiceDraft(state, draft, true, documentAt)
  state = allocatePayment(state, state.payments[0].id, state.invoices.at(-1)!.versionId!, 'Bestehende Überzahlung erhalten', documentAt)
  const stats = checkedStats(state)
  assert.equal(stats.open.count, 0); assert.equal(stats.paid.allTimeCents, 3000); assert.equal(stats.paid.yearCents, 3000)
})

test('3.AP2: Tagesdifferenzen über beide Sommerzeitgrenzen bleiben Kalendertage', () => {
  const previous = process.env.TZ
  try {
    for (const zone of ['Europe/Berlin', 'UTC', 'America/New_York']) {
      process.env.TZ = zone
      for (const [invoiceDate, dueDate, today] of [['2026-03-28', '2026-03-29', '2026-03-30'], ['2026-10-24', '2026-10-25', '2026-10-26']]) {
        const item = checkedStats(issue(documentFamily(), invoiceDate, dueDate), parseDate(today)).open.items[0]
        assert.equal(item.daysSinceInvoice, 2); assert.equal(item.daysOverdue, 1)
      }
    }
    process.env.TZ = 'Europe/Berlin'
    const state = issue(documentFamily(), '2026-09-01', '2026-09-15')
    assert.equal(checkedStats(state, new Date('2026-09-15T22:30:00Z')).open.items[0].daysOverdue, 1)
    assert.equal(checkedStats(state, new Date('2026-12-31T23:30:00Z')).monthly.year, 2027)
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})

test('3.AP2: Kalenderdifferenz behandelt Schaltjahre, Monatsgrenzen und den gesamten Datumsbereich', () => {
  assert.equal(calendarDaysBetween('2024-02-28', '2024-03-01'), 2)
  assert.equal(calendarDaysBetween('1900-02-28', '1900-03-01'), 1)
  assert.equal(calendarDaysBetween('2000-02-28', '2000-03-01'), 2)
  assert.equal(calendarDaysBetween('2025-12-31', '2026-01-01'), 1)
  assert.equal(calendarDaysBetween('2026-01-01', '2025-12-31'), -1)
  assert.equal(calendarDaysBetween('0001-01-01', '9999-12-31'), 3_652_058)
  assert.equal(calendarDaysBetween('2026-09-16', '2026-09-16'), 0)
  assert.throws(() => calendarDaysBetween('2025-02-29', '2026-01-01'), /Kalenderdatum/)
})

test('3.AP2: zukünftige Rechnungen zeigen keine negativen Tage', () => {
  const item = checkedStats(issue(documentFamily(), '2026-09-20', '2026-10-04')).open.items[0]
  assert.equal(item.daysSinceInvoice, 0); assert.equal(item.daysOverdue, 0); assert.equal(item.isOverdue, false)
})

test('3.AP2: historische legacy-output-Beträge und eingefrorene Namen bleiben maßgeblich', () => {
  const old = legacyFixture(saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt))
  old.invoices[0].items[0].quantity = .05; old.invoices[0].items[0].unitPrice = .7
  let state = parseBackup(JSON.stringify(old))
  assert.equal(state.documentVersions[0].amounts.source, 'legacy-output')
  assert.equal(state.documentVersions[0].amounts.totalCents, 3)
  assert.equal(invoiceTotalCents({ items: state.invoices[0].items }), 4, 'heutige Neuberechnung würde das Original ändern')
  state.guardians[0].name = 'Heute umbenannt'; state.students[0].name = 'Heute anders'
  let stats = checkedStats(state)
  assert.equal(stats.open.totalCents, 3)
  assert.equal(stats.open.items[0].recipientLabel, 'Empfaenger A'); assert.equal(stats.open.items[0].studentLabel, 'Testkind A')
  state = changeInvoiceStatus(state, state.invoices[0].id, 'paid', documentAt, '2026-09-05')
  stats = checkedStats(state)
  assert.equal(stats.paid.yearCents, 3); assert.equal(stats.open.count, 0)
})

test('3.AP2: Demo-Daten erfüllen die Cent- und Anspruchsinvarianten auch nach Reload', () => {
  const state = createDemoState(parseDate('2026-10-03')), stats = checkedStats(state, parseDate('2026-10-03'))
  assert.deepEqual(stats.people, { guardians: 10, students: 10, activeStudents: 10 })
  assert.ok(stats.paid.yearCents > 0); assert.ok(stats.paid.allTimeCents > stats.paid.yearCents)
  assert.ok(stats.open.count > 0); assert.ok(stats.drafts.count > 0)
  assert.deepEqual(stats.monthly.availableYears, [2026, 2025])
  assert.deepEqual(checkedStats(parseBackup(serializeBackup(state)), parseDate('2026-10-03')), stats)
})

test('3.AP2: eingefrorener Eingabestand und Date bleiben unverändert, Ergebnisse sind unabhängig', () => {
  const state = issue(), before = structuredClone(state)
  const freeze = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    Object.values(value).forEach(freeze); Object.freeze(value)
  }
  freeze(state)
  const instant = now.getTime(), stats = checkedStats(state)
  stats.open.items[0].recipientLabel = 'Nur Ergebnis'
  stats.monthly.months[0].cents = 99
  stats.monthly.availableYears.push(1900)
  assert.deepEqual(state, before); assert.equal(now.getTime(), instant)
  assert.equal(checkedStats(state).open.items[0].recipientLabel, 'Empfaenger A')
  assert.equal(checkedStats(state).monthly.months[0].cents, 0)
})
