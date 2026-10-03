import { seedState } from './storageHarness'
import { prepareNewInvoice, saveInvoiceState } from '../src/lib/commands'
import { requireSuccess, ValidationError } from '../src/lib/result'
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Guardian, InvoiceDraft } from '../src/types'
import { selectedInvoices } from '../src/lib/documents'
import { createDemoState, defaultSettings, emptyState } from '../src/lib/defaults'
import { applyLessonType, createLessonItem } from '../src/lib/invoiceDrafts'
import { billingPeriodFromItems, effectiveStatus, sortInvoices } from '../src/lib/invoiceOutput'
import { isValidIban } from '../src/lib/paymentData'
import { calculateDueDate } from '../src/lib/calendar'
import { sortPeople } from '../src/lib/utils'
import { formatInvoiceNumber, nextInvoiceAllocation, studentCodeForIndex } from '../src/lib/invoiceNumbering'
import { invoiceFinalizationErrors } from '../src/lib/invoiceRules'
import { isInvoiceSetupComplete } from '../src/lib/invoiceSetup'
import { changeInvoiceStatus, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { student, invoice, withMockLocalStorage, loadReadyState, validImportState } from './invoiceFixtures'

test('feste Rechnungsnummern haben Jahr, mindestens vierstellige Folge und nachgestellte Kennung', () => {
  assert.equal(formatInvoiceNumber(23, 2026, 'a'), '2026-0023-a')
  assert.equal(formatInvoiceNumber(10000, 2026, 'a+b'), '2026-10000-a+b')
  assert.equal(studentCodeForIndex(0), 'a')
  assert.equal(studentCodeForIndex(26), 'aa')
})


test('jedes Kind erhält einen eigenen fortlaufenden Nummernkreis', () => {
  const state = emptyState()
  state.students = [student('student-a', 'Anna', 'a'), student('student-b', 'Ben', 'b'), student('student-ab', 'Zora', 'ab')]
  state.invoices = [invoice()]
  state.counters = { '2026:a': 2, '2026:ab': 4 }
  assert.deepEqual(nextInvoiceAllocation(state, '2026-08-01', ['student-a']), { number: '2026-0002-a', sequence: 2, counterKey: '2026:a' })
  assert.deepEqual(nextInvoiceAllocation(state, '2026-08-01', ['student-b']), { number: '2026-0001-b', sequence: 1, counterKey: '2026:b' })
  assert.deepEqual(nextInvoiceAllocation(state, '2026-08-01', ['student-b', 'student-a']), { number: '2026-0001-a+b', sequence: 1, counterKey: '2026:a+b' })
  assert.deepEqual(nextInvoiceAllocation(state, '2026-08-01', ['student-ab']), { number: '2026-0004-ab', sequence: 4, counterKey: '2026:ab' })
})


test('gelöschte finalisierte Rechnungsnummern bleiben reserviert', () => {
  const state = emptyState()
  state.students = [student('student-a', 'Anna', 'a')]
  state.counters = { '2026:a': 1 }
  state.voidedInvoiceNumbers = [{
    number: '2026-a-0001',
    sequence: 1,
    year: 2026,
    invoiceDate: '2026-08-01',
    deletedAt: '2026-08-20T12:00:00.000Z',
    amount: 120,
    recipient: 'Testfamilie',
  }]
  assert.equal(nextInvoiceAllocation(state, '2026-08-21', ['student-a']).number, '2026-0002-a')
})


test('historisch verbrauchte Nummern bleiben reserviert', () => {
  const state = emptyState()
  state.students = [student('student-a', 'Anna', 'a')]
  state.counters = { '2026:a': 2 }
  state.invoices = [invoice({
    status: 'paid',
    paidAt: '2026-08-05T10:00:00.000Z',
    sentAt: '2026-08-01T10:00:00.000Z',
    snapshot: {
      issuer: structuredClone(defaultSettings.issuer),
      recipients: [],
      students: [{ id: 'student-a', name: 'Anna' }],
      accountHolder: '',
      iban: '',
      bic: '',
      bankName: '',
      },
  })]
  assert.equal(nextInvoiceAllocation(state, '2026-08-21', ['student-a']).number, '2026-0002-a')

})


test('Entwürfe dürfen vor der Einrichtung starten; vollständige Einrichtung verlangt gültige IBAN', () => {
  const settings = structuredClone(defaultSettings)
  assert.equal(isInvoiceSetupComplete(settings), false)
  settings.issuer = { ...settings.issuer, name: '  Gitarrenstudio Beispiel  ', street: 'Testweg 1', postalCode: '12345', city: 'Teststadt' }
  settings.accountHolder = 'Gitarrenstudio Beispiel'
  settings.iban = 'DE02 1203 0000 0000 2020 52'
  assert.equal(isInvoiceSetupComplete(settings), false)
  settings.iban = 'DE02 1203 0000 0000 2020 51'
  assert.equal(isInvoiceSetupComplete(settings), true)

  const initial = emptyState()
  const draft = requireSuccess(prepareNewInvoice(initial))
  const saved = requireSuccess(saveInvoiceState(initial, draft, false))
  assert.equal(saved.invoices.length, 1)
  assert.equal(saved.invoices[0].number, null)
  assert.throws(() => changeInvoiceStatus(saved, saved.invoices[0].id, 'sent'), /Finalisieren nicht möglich/)

})


test('versendete Rechnung wird nach Fälligkeit als überfällig erkannt', () => {
  assert.equal(effectiveStatus(invoice(), new Date('2026-08-15T23:59:59')), 'sent')
  assert.equal(effectiveStatus(invoice(), new Date('2026-08-16T00:00:00')), 'overdue')
  assert.equal(effectiveStatus(invoice(), new Date('2026-08-20T12:00:00')), 'overdue')
  assert.equal(effectiveStatus(invoice({ status: 'paid' }), new Date('2026-08-20T12:00:00')), 'paid')
})


test('Solo- und Duo-Positionen übernehmen die aktuell konfigurierten Standardpreise', () => {
  assert.equal(defaultSettings.privateRate, 30)
  assert.equal(defaultSettings.duoRate, 20)
  const settings = { ...defaultSettings, privateRate: 34, duoRate: 22 }
  const solo = createLessonItem('student-a', '2026-08-05', settings, 'item-test')
  assert.equal(solo.lessonType, 'solo')
  assert.equal(solo.description, 'Gitarrenunterricht (Solo)')
  assert.equal(solo.unitPrice, 34)

  const duo = applyLessonType({ ...solo, description: 'Akkordwechsel (Solo)' }, 'duo', settings)
  assert.equal(duo.lessonType, 'duo')
  assert.equal(duo.description, 'Akkordwechsel (Duo)')
  assert.equal(duo.unitPrice, 22)

  const manuallyOverridden = { ...duo, unitPrice: 27 }
  const changedSettings = { ...settings, privateRate: 40, duoRate: 25 }
  assert.equal(manuallyOverridden.unitPrice, 27)
  assert.equal(createLessonItem('student-a', '2026-08-12', changedSettings, 'item-new').unitPrice, 40)
})


test('Abrechnungszeitraum und Fälligkeit werden aus Positions- und Rechnungsdaten berechnet', () => {
  assert.equal(billingPeriodFromItems([{ serviceDate: '2026-08-02' }, { serviceDate: '2026-08-28' }]), 'August 2026')
  assert.equal(billingPeriodFromItems([{ serviceDate: '2026-08-28' }, { serviceDate: '2026-10-02' }]), 'August bis Oktober 2026')
  assert.equal(billingPeriodFromItems([{ serviceDate: '2026-12-28' }, { serviceDate: '2027-01-08' }]), 'Dezember 2026 bis Januar 2027')
  assert.equal(calculateDueDate('2026-08-01', 14), '2026-08-15')
})


test('P10: Personen A–Z und Rechnungsdatum neueste zuerst, mit stabilen bestehenden Schlüsseln', () => {
  const anna = { ...student('student-a', 'Anna', 'a'), createdAt: '2026-08-02T10:00:00.000Z' }
  const olderAnna = { ...anna, id: 'student-old', createdAt: '2026-08-01T10:00:00.000Z' }
  const ben = student('student-b', 'Ben', 'b')
  const people = [ben, anna, olderAnna]
  assert.deepEqual(sortPeople(people).map((entry) => entry.id), ['student-old', 'student-a', 'student-b'])
  assert.equal(people[0], ben)
  assert.deepEqual(sortPeople([{ ...anna, id: 'z' }, { ...anna, id: 'a' }]).map((entry) => entry.id), ['a', 'z'])
  const first = invoice({ id: 'new-date', invoiceDate: '2026-09-02', createdAt: '2026-08-01T10:00:00.000Z' })
  const second = invoice({ id: 'new-created', invoiceDate: '2026-09-01', createdAt: '2026-08-03T10:00:00.000Z' })
  const third = invoice({ id: 'old-created', invoiceDate: '2026-09-01', createdAt: '2026-08-02T10:00:00.000Z' })
  const source = [third, first, second]
  assert.deepEqual(sortInvoices(source).map((entry) => entry.id), ['new-date', 'new-created', 'old-created'])
  assert.equal(source[0], third)
  assert.deepEqual(sortInvoices([{ ...first, id: 'z' }, { ...first, id: 'a' }]).map((entry) => entry.id), ['a', 'z'])
})


test('Demo-Daten bilden Familien, Unterricht und Rechnungen seit Januar 2025 vollständig ab', () => {
  const demo = createDemoState(new Date('2026-08-20T12:00:00.000Z'))
  assert.equal(demo.settings.issuer.name, 'Max Mustermann')
  assert.equal(demo.settings.accountHolder, 'Max Mustermann')
  assert.equal(isValidIban(demo.settings.iban), true)
  assert.equal(demo.guardians.length, 10)
  assert.equal(demo.students.length, 10)
  assert.ok(demo.guardians.every((guardian) => guardian.email.endsWith('@example.de') && guardian.phone && guardian.address.street && guardian.address.postalCode && guardian.address.city))
  assert.ok(demo.students.every((entry) => entry.guardianIds.length > 0 && entry.active))
  assert.ok(demo.students.some((entry) => entry.guardianIds.length === 2))

  const expectedMonths: string[] = []
  for (let year = 2025, month = 0; year < 2026 || year === 2026 && month <= 7;) {
    expectedMonths.push(`${year}-${String(month + 1).padStart(2, '0')}`)
    month += 1
    if (month === 12) { year += 1; month = 0 }
  }
  assert.deepEqual([...new Set(demo.invoices.map((entry) => entry.invoiceDate.slice(0, 7)))].sort(), expectedMonths)

  const historical = selectedInvoices(demo).filter((entry) => entry.invoiceDate.slice(0, 7) < '2026-08')
  assert.equal(historical.length, 19 * 7)
  assert.ok(historical.every((entry) => entry.status === 'paid' && entry.number && entry.paidAt && entry.paidAt.slice(0, 10) <= entry.dueDate))

  const current = demo.invoices.filter((entry) => entry.invoiceDate.startsWith('2026-08'))
  assert.equal(current.length, 7)
  assert.ok(current.some((entry) => entry.status === 'sent'))
  assert.ok(current.filter((entry) => entry.status === 'draft').length >= 2)
  assert.ok(demo.invoices.every((entry) => entry.items.length >= 8))
  assert.deepEqual(new Set(demo.invoices.flatMap((entry) => entry.items.map((item) => item.lessonType))), new Set(['solo', 'duo']))
  assert.ok(demo.invoices.flatMap((entry) => entry.items).every((item) => item.description.endsWith(`(${item.lessonType === 'duo' ? 'Duo' : 'Solo'})`)))

  const numbers = demo.invoices.flatMap((entry) => entry.number ? [entry.number] : [])
  assert.equal(new Set(numbers).size, numbers.length)
  withMockLocalStorage(() => {
    seedState(demo)
    const restored = loadReadyState()
    assert.equal(restored.guardians.length, 10)
    assert.equal(restored.students.length, 10)
    assert.equal(restored.invoices.length, demo.invoices.length)
  })
})


test('Entwürfe lassen sich aus der Detailansicht nur mit vollständigen aktuellen Daten finalisieren', () => {
  const state = validImportState()
  state.settings = { ...state.settings, issuer: { ...state.settings.issuer, name: 'Synthetisches Studio', street: 'Testweg 1', postalCode: '12345', city: 'Teststadt' }, accountHolder: 'Synthetisches Studio', iban: 'DE02120300000000202051' }
  const draft = invoice({
    number: null,
    sequence: null,
    status: 'draft',
    recipients: (['guardian-a']).map((id) => ({ type: 'guardian' as const, id })),
    studentIds: ['student-a'],
    items: [createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-finalization')],
  })
  assert.deepEqual(invoiceFinalizationErrors(state, draft), [])
  assert.match(invoiceFinalizationErrors(state, { ...draft, recipients: ([]).map((id) => ({ type: 'guardian' as const, id })) }).join(' '), /empfangende Person/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, recipients: (['guardian-missing']).map((id) => ({ type: 'guardian' as const, id })) }).join(' '), /Stammdaten/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, studentIds: [] }).join(' '), /lernende/i)
  assert.match(invoiceFinalizationErrors(state, { ...draft, studentIds: ['student-missing'] }).join(' '), /Stammdaten/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, items: [] }).join(' '), /Position/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, items: [{ ...draft.items[0], description: '' }] }).join(' '), /vollständig/)

  state.settings.iban = 'DE02120300000000202051'
  state.invoices = [draft]
  state.documentVersions = []; state.invoiceAdministration = []; state.payments = []
  const original = structuredClone(state)
  assert.throws(() => changeInvoiceStatus({ ...state, guardians: [] }, draft.id, 'sent'), (error: unknown) => error instanceof ValidationError && error.path === 'students[0].guardianIds[0]')
  assert.deepEqual(state, original)
  assert.equal(changeInvoiceStatus(state, draft.id, 'sent').invoices[0].number, '2026-0002-a', 'Die beim Import gesicherte Folge wird durch einen Formatwechsel nicht freigegeben')

})


test('Editor-Finalisierung wird vor Nummern- und Snapshot-Vergabe zentral validiert', () => {
  const state = validImportState()
  const validDraft: InvoiceDraft = {
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-15',
    period: 'August 2026',
    recipients: (['guardian-a']).map((id) => ({ type: 'guardian' as const, id })),
    studentIds: ['student-a'],
    recipientStrategy: 'joint',
    items: [createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-editor-finalization')],
    freeText: '',
    }
  const unlinkedGuardian: Guardian = {
    ...state.guardians[0],
    id: 'guardian-unlinked',
    name: 'Nicht zugeordnet',
  }
  const scenarios: Array<{ name: string; draft: InvoiceDraft; expected: RegExp; guardians?: Guardian[] }> = [
    { name: 'kein Empfänger', draft: { ...validDraft, recipients: ([]).map((id) => ({ type: 'guardian' as const, id })) }, expected: /empfangende Person/ },
    { name: 'gelöschter Empfänger', draft: { ...validDraft, recipients: (['guardian-missing']).map((id) => ({ type: 'guardian' as const, id })) }, expected: /Stammdaten/ },
    { name: 'nicht zugeordneter Empfänger', draft: { ...validDraft, recipients: (['guardian-unlinked']).map((id) => ({ type: 'guardian' as const, id })) }, guardians: [...state.guardians, unlinkedGuardian], expected: /zugeordnet/ },
    { name: 'kein Kind', draft: { ...validDraft, studentIds: [] }, expected: /lernende/i },
    { name: 'gelöschtes Kind', draft: { ...validDraft, studentIds: ['student-missing'] }, expected: /Stammdaten/ },
    { name: 'keine Position', draft: { ...validDraft, items: [] }, expected: /Position/ },
    { name: 'Position mit gelöschtem Kind', draft: { ...validDraft, items: [{ ...validDraft.items[0], studentId: 'student-missing' }] }, expected: /aktuellen Stammdaten/ },
  ]

  assert.deepEqual(invoiceFinalizationErrors(state, validDraft), [])
  scenarios.forEach(({ name, draft, expected, guardians = state.guardians }) => {
    assert.match(invoiceFinalizationErrors({ ...state, guardians }, draft).join(' '), expected, name)
  })

  state.settings.iban = 'DE02120300000000202051'
  const original = structuredClone(state)
  scenarios.forEach(({ name, draft, expected, guardians = state.guardians }) => {
    assert.throws(() => saveInvoiceDraft({ ...state, guardians }, draft, true), expected, name)
  })
  assert.deepEqual(state, original)
  const finalized = saveInvoiceDraft(state, validDraft, true)
  assert.equal(finalized.invoices.at(-1)?.number, '2026-0002-a')
  assert.equal(finalized.invoices.at(-1)?.snapshot?.recipients[0].id, 'guardian-a')

})
