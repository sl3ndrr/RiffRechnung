import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Guardian, Invoice, Student } from '../src/types'
import changelog from '../src/content/changelog.json'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { Dashboard } from '../src/views/Dashboard'
import { createDemoState, defaultSettings, emptyState } from '../src/lib/defaults'
import { calculateInvoiceMenuPosition, type InvoiceMenuAction, runInvoiceMenuAction } from '../src/lib/invoiceMenu'
import { loadLastBackupAt, loadState, parseBackup, recordBackupExport, saveState, serializeBackup } from '../src/lib/storage'
import { applyLessonType, billingPeriodFromItems, buildEpcPayload, buildInvoicePrintPageStyle, calculateDueDate, createLessonItem, effectiveStatus, ensureStudentCodePattern, footerTextForPrint, formatDateLong, formatInvoiceNumber, invoiceFinalizationErrors, invoicePdfTitle, invoiceTotal, invoicesToCsv, isFooterTextWithinLimit, isInvoiceSetupComplete, isValidIban, itemTotal, limitFooterText, MAX_FOOTER_TEXT_LENGTH, nextInvoiceAllocation, reopenInvoiceAsDraft, sortInvoices, sortPeople, studentCodeForIndex } from '../src/lib/utils'
import { APP_VERSION } from '../src/version'

const student = (id: string, name: string, billingCode: string): Student => ({
  id,
  name,
  billingCode,
  guardianIds: [],
  note: '',
  active: true,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
})

const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'invoice-test',
  number: '2026-a-0001',
  sequence: 1,
  year: 2026,
  invoiceDate: '2026-08-01',
  dueDate: '2026-08-15',
  period: 'August 2026',
  status: 'sent',
  guardianIds: [],
  studentIds: ['student-a'],
  recipientStrategy: 'joint',
  items: [],
  introText: '',
  freeText: '',
  legalText: '',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
})

function withMockLocalStorage(run: () => void): void {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const entries = new Map<string, string>()
  const localStorageMock: Storage = {
    get length() { return entries.size },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock })

  try {
    run()
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

function loadReadyState() {
  const loaded = loadState()
  if (loaded.status !== 'ready') assert.fail(`Unerwarteter Recovery-Zustand: ${loaded.error}`)
  return loaded.state
}

function validImportState() {
  const state = emptyState()
  state.guardians.push({
    id: 'guardian-a',
    name: 'Alex Beispiel',
    email: 'alex@example.de',
    phone: '0123456789',
    address: { street: 'Beispielweg 1', postalCode: '12345', city: 'Beispielstadt' },
    iban: '',
    paymentNote: '',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  })
  state.students.push({ ...student('student-a', 'Anna', 'a'), guardianIds: ['guardian-a'] })
  state.nextStudentCodeIndex = 1
  state.invoices.push(invoice({
    guardianIds: ['guardian-a'],
    items: [createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-a')],
  }))
  return state
}

function corruptBackup(mutate: (data: Record<string, unknown>) => void): string {
  const backup = JSON.parse(serializeBackup(validImportState())) as { data: Record<string, unknown> }
  mutate(backup.data)
  return JSON.stringify(backup)
}

test('konfigurierbare Rechnungsnummern werden korrekt formatiert', () => {
  assert.equal(formatInvoiceNumber(defaultSettings, 23, 2026, 'a'), '2026-a-0023')
  assert.equal(formatInvoiceNumber({ ...defaultSettings, numberPattern: 'RG-{YY}-{NNN}' }, 7, 2026, 'b'), 'RG-26-b-007')
  assert.equal(formatInvoiceNumber({ ...defaultSettings, numberPattern: 'RG-{YYYY}' }, 7, 2026, 'c'), 'RG-2026-c-0007')
  assert.equal(ensureStudentCodePattern('{YYYY}-{NNNN}'), '{YYYY}-{K}-{NNNN}')
  assert.equal(studentCodeForIndex(0), 'a')
  assert.equal(studentCodeForIndex(26), 'aa')
})

test('jedes Kind erhält einen eigenen fortlaufenden Nummernkreis', () => {
  const state = emptyState()
  state.students = [student('student-a', 'Anna', 'a'), student('student-b', 'Ben', 'b'), student('student-ab', 'Zora', 'ab')]
  state.invoices = [invoice()]
  state.counters = { '2026:a': 2, '2026:ab': 4 }
  assert.deepEqual(nextInvoiceAllocation(state, '2026-08-01', ['student-a']), { number: '2026-a-0002', sequence: 2, counterKey: '2026:a' })
  assert.deepEqual(nextInvoiceAllocation(state, '2026-08-01', ['student-b']), { number: '2026-b-0001', sequence: 1, counterKey: '2026:b' })
  assert.deepEqual(nextInvoiceAllocation(state, '2026-08-01', ['student-b', 'student-a']), { number: '2026-a+b-0004', sequence: 4, counterKey: '2026:a+b' })
  assert.deepEqual(nextInvoiceAllocation(state, '2026-08-01', ['student-ab']), { number: '2026-ab-0004', sequence: 4, counterKey: '2026:ab' })
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
  assert.equal(nextInvoiceAllocation(state, '2026-08-21', ['student-a']).number, '2026-a-0002')
})

test('zurückgesetzte Rechnungen werden echte Entwürfe und verbrauchte Nummern bleiben reserviert', () => {
  const state = emptyState()
  state.students = [student('student-a', 'Anna', 'a')]
  state.counters = { '2026:a': 2 }
  state.invoices = [invoice({
    status: 'paid',
    paidAt: '2026-08-05T10:00:00.000Z',
    sentAt: '2026-08-01T10:00:00.000Z',
    snapshot: {
      issuer: structuredClone(defaultSettings.issuer),
      guardians: [],
      students: [{ id: 'student-a', name: 'Anna' }],
      accountHolder: '',
      iban: '',
      bic: '',
      bankName: '',
      legalText: defaultSettings.defaultLegalText,
    },
  })]
  const reopened = reopenInvoiceAsDraft(state, 'invoice-test', '2026-08-20T12:00:00.000Z')
  const draft = reopened.invoices[0]
  assert.equal(draft?.status, 'draft')
  assert.equal(draft?.number, null)
  assert.equal(draft?.sequence, null)
  assert.equal(draft?.snapshot, undefined)
  assert.equal(draft?.paidAt, undefined)
  assert.equal(draft?.sentAt, undefined)
  assert.equal(reopened.voidedInvoiceNumbers[0]?.number, '2026-a-0001')
  assert.equal(reopened.voidedInvoiceNumbers[0]?.reason, 'reopened')
  assert.equal(nextInvoiceAllocation(reopened, '2026-08-21', ['student-a']).number, '2026-a-0002')
  assert.equal(reopenInvoiceAsDraft(reopened, 'invoice-test'), reopened)
  assert.match(readFileSync(new URL('../src/views/Invoices.tsx', import.meta.url), 'utf8'), /Zurück in Entwurf/)
  assert.match(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), /In Entwurf zurücksetzen/)
})

test('IBAN-Land, landesspezifische Länge und Prüfsumme werden validiert', () => {
  assert.equal(isValidIban('DE02 1203 0000 0000 2020 51'), true)
  assert.equal(isValidIban('DE02 1203 0000 0000 2020 52'), false)
  assert.equal(isValidIban('DE31 1203 0000 0000 2020 5100'), false)
  assert.equal(isValidIban('ZZ32 1203 0000 0000 2020 51'), false)
  assert.equal(isValidIban('AE07 0331 2345 6789 0123 456'), false)
  assert.equal(isValidIban('RS35 2600 0560 1001 6113 79'), true)
})

test('Rechnungsstart verlangt Absendernamen und eine gültige IBAN', () => {
  const settings = structuredClone(defaultSettings)
  assert.equal(isInvoiceSetupComplete(settings), false)
  settings.issuer.name = '  Gitarrenstudio Beispiel  '
  settings.iban = 'DE02 1203 0000 0000 2020 52'
  assert.equal(isInvoiceSetupComplete(settings), false)
  settings.iban = 'DE02 1203 0000 0000 2020 51'
  assert.equal(isInvoiceSetupComplete(settings), true)

  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const invoiceGuard = appSource.slice(appSource.indexOf('const openNewInvoice'), appSource.indexOf('const editInvoice'))
  assert.ok(invoiceGuard.indexOf('isInvoiceSetupComplete') < invoiceGuard.indexOf('!state.students.length'))
  assert.match(invoiceGuard, /setPage\('settings'\)/)
  assert.match(invoiceGuard, /setPage\('people'\)/)

  const invoiceSource = readFileSync(new URL('../src/views/Invoices.tsx', import.meta.url), 'utf8')
  assert.equal(invoiceSource.match(/onClick=\{onNew\}/g)?.length, 2)
})

test('Onboarding priorisiert die Einrichtung und hält den Demo-Zugang sichtbar', () => {
  const renderDashboard = (state = emptyState()) => renderToStaticMarkup(createElement(Dashboard, {
    state,
    onNavigate: () => undefined,
    onNewInvoice: () => undefined,
    onLoadDemo: () => undefined,
    onOpenInvoice: () => undefined,
  }))

  const emptyMarkup = renderDashboard()
  assert.match(emptyMarkup, /0 von 2 Schritten abgeschlossen/)
  assert.ok(emptyMarkup.indexOf('Absender &amp; Konto') < emptyMarkup.indexOf('Familie anlegen'))
  assert.match(emptyMarkup, /Lieber erst mit Beispieldaten testen\?/)
  assert.match(emptyMarkup, /Mit Beispieldaten starten/)

  const issuerReady = emptyState()
  issuerReady.settings.issuer.name = 'Gitarrenstudio Beispiel'
  issuerReady.settings.iban = 'DE02 1203 0000 0000 2020 51'
  assert.match(renderDashboard(issuerReady), /1 von 2 Schritten abgeschlossen/)

  const familyReady = emptyState()
  familyReady.students = [student('student-a', 'Anna', 'a')]
  assert.match(renderDashboard(familyReady), /1 von 2 Schritten abgeschlossen/)

  issuerReady.students = [student('student-a', 'Anna', 'a')]
  assert.doesNotMatch(renderDashboard(issuerReady), /von 2 Schritten abgeschlossen/)

  const source = readFileSync(new URL('../src/views/Dashboard.tsx', import.meta.url), 'utf8')
  assert.equal(source.match(/onClick=\{onLoadDemo\}/g)?.length, 2)
})

test('EPC-Payload enthält Version, Betrag und Rechnungsnummer', () => {
  const settings = { ...defaultSettings, accountHolder: 'Mara Beispiel', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' }
  const payload = buildEpcPayload(invoice(), settings, 125.5)
  assert.deepEqual(payload.split('\n').slice(0, 4), ['BCD', '002', '1', 'SCT'])
  assert.match(payload, /EUR125\.50/)
  assert.match(payload, /Rechnung 2026-a-0001/)
  assert.doesNotMatch(payload, /\n$/)
})

test('EPC-Payload lehnt ungültige Beträge, BICs und überlange UTF-8-Daten ab', () => {
  const settings = { ...defaultSettings, accountHolder: 'Mara Beispiel', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' }
  assert.throws(() => buildEpcPayload(invoice(), settings, 0), /Betrag.*0,01/)
  assert.throws(() => buildEpcPayload(invoice(), settings, 1_000_000_000), /Betrag.*999\.999\.999,99/)
  assert.throws(() => buildEpcPayload(invoice(), { ...settings, bic: 'INVALID!' }, 125.5), /BIC.*8.*11/)
  assert.doesNotThrow(() => buildEpcPayload(invoice(), { ...settings, bic: '' }, 125.5))
  assert.throws(() => buildEpcPayload(
    invoice({ number: '€'.repeat(140) }),
    { ...settings, accountHolder: 'ä'.repeat(70) },
    125.5,
  ), /331 Byte/)
})

test('Geldbeträge werden positionsweise kaufmännisch auf Cent gerundet', () => {
  const items = [
    { ...createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-rounding-1'), quantity: 1.5, unitPrice: 0.67 },
    { ...createLessonItem('student-a', '2026-08-12', defaultSettings, 'item-rounding-2'), quantity: 1.5, unitPrice: 0.67 },
  ]
  const testInvoice = invoice({ items })
  const settings = { ...defaultSettings, accountHolder: 'Mara Beispiel', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' }

  assert.equal(itemTotal(items[0]), 1.01)
  assert.equal(invoiceTotal(testInvoice), 2.02)
  assert.match(buildEpcPayload(testInvoice, settings, invoiceTotal(testInvoice)), /EUR2\.02/)
  assert.match(renderToStaticMarkup(createElement(InvoicePrint, { invoice: testInvoice, guardians: [], students: [student('student-a', 'Anna', 'a')], settings })), /2,02\s€/)
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

test('Familien- und Rechnungslisten werden stabil nach der gewählten Spalte sortiert', () => {
  const anna = { ...student('student-a', 'Anna', 'a'), createdAt: '2026-08-02T10:00:00.000Z' }
  const ben = { ...student('student-b', 'Ben', 'b'), createdAt: '2026-08-01T10:00:00.000Z' }
  assert.deepEqual(sortPeople([ben, anna], 'name-asc').map((entry) => entry.name), ['Anna', 'Ben'])
  assert.deepEqual(sortPeople([ben, anna], 'created-desc').map((entry) => entry.name), ['Anna', 'Ben'])

  const guardians: Guardian[] = [
    { id: 'guardian-a', name: 'Anna Familie', email: '', phone: '', iban: '', paymentNote: '', address: { street: '', postalCode: '', city: '' }, createdAt: anna.createdAt, updatedAt: anna.updatedAt },
    { id: 'guardian-b', name: 'Zora Familie', email: '', phone: '', iban: '', paymentNote: '', address: { street: '', postalCode: '', city: '' }, createdAt: ben.createdAt, updatedAt: ben.updatedAt },
  ]
  const first = invoice({
    id: 'invoice-first',
    number: '2026-a-0010',
    guardianIds: ['guardian-a'],
    studentIds: ['student-a'],
    status: 'paid',
    items: [{ ...createLessonItem('student-a', '2026-09-01', defaultSettings, 'item-first'), unitPrice: 50 }],
  })
  const second = invoice({
    id: 'invoice-second',
    number: '2026-a-0002',
    guardianIds: ['guardian-b'],
    studentIds: ['student-b'],
    status: 'draft',
    items: [{ ...createLessonItem('student-b', '2026-07-01', defaultSettings, 'item-second'), unitPrice: 10 }],
  })
  const ids = (key: Parameters<typeof sortInvoices>[1]) => sortInvoices([first, second], key, 'asc', guardians, [anna, ben]).map((entry) => entry.id)
  assert.deepEqual(ids('number'), ['invoice-second', 'invoice-first'])
  assert.deepEqual(ids('family'), ['invoice-first', 'invoice-second'])
  assert.deepEqual(ids('period'), ['invoice-second', 'invoice-first'])
  assert.deepEqual(ids('status'), ['invoice-second', 'invoice-first'])
  assert.deepEqual(ids('amount'), ['invoice-second', 'invoice-first'])
})

test('CSV-Export neutralisiert gefährliche Formelpräfixe', () => {
  for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
    const dangerousValue = `${prefix}FORMEL`
    const csv = invoicesToCsv([invoice({ number: dangerousValue })], [], [])
    assert.ok(csv.includes(`"'${dangerousValue}"`), JSON.stringify(prefix))
  }
  assert.ok(invoicesToCsv([invoice()], [], []).includes('"2026-a-0001"'))
})

test('Rechnungsdokument druckt automatisch berechneten Zeitraum und Fälligkeit', () => {
  const item = createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-print')
  const testInvoice = invoice({
    dueDate: calculateDueDate('2026-08-01', defaultSettings.paymentTermDays),
    period: 'Nicht verwenden',
    items: [item],
  })
  assert.equal(billingPeriodFromItems(testInvoice.items, testInvoice.invoiceDate), 'August 2026')
  assert.equal(formatDateLong(testInvoice.dueDate), '15. August 2026')
})

test('PDF-Titel enthält Rechnungsnummer und dateisicheren Kindesnamen', () => {
  const testInvoice = invoice({ number: '2026/b:0002', studentIds: ['student-a'] })
  assert.equal(invoicePdfTitle(testInvoice, [student('student-a', 'Lina / Winter', 'a')]), 'Rechnung 2026-b-0002 - Lina - Winter')
})

test('Fußzeilentext ist auf eine verlässliche zweizeilige Drucklänge begrenzt', () => {
  assert.equal(MAX_FOOTER_TEXT_LENGTH, 120)
  assert.equal(defaultSettings.defaultLegalText.startsWith('Privatrechnung |'), true)
  assert.equal(isFooterTextWithinLimit('x'.repeat(MAX_FOOTER_TEXT_LENGTH)), true)
  assert.equal(isFooterTextWithinLimit('x'.repeat(MAX_FOOTER_TEXT_LENGTH + 1)), false)
  assert.equal(limitFooterText('x'.repeat(MAX_FOOTER_TEXT_LENGTH + 1)).length, MAX_FOOTER_TEXT_LENGTH)
  assert.equal(footerTextForPrint('  Privatrechnung\n   Test  '), 'Privatrechnung Test')
})

test('Druckrechnungen unterschiedlicher Länge nutzen gemeinsame Seitenfuß- und Folgeseitenbereiche', () => {
  const renderInvoice = (itemCount: number) => {
    const items = Array.from({ length: itemCount }, (_, index) => createLessonItem(
      'student-a',
      index < Math.ceil(itemCount / 2)
        ? `2026-08-${String(index % 28 + 1).padStart(2, '0')}`
        : `2026-09-${String(index % 28 + 1).padStart(2, '0')}`,
      defaultSettings,
      `item-print-${itemCount}-${index}`,
    ))
    return renderToStaticMarkup(createElement(InvoicePrint, {
      invoice: invoice({ items }),
      guardians: [],
      students: [student('student-a', 'Anna', 'a')],
      settings: defaultSettings,
    }))
  }

  const cases = [
    { label: 'einseitig', itemCount: 6 },
    { label: 'zweiseitig', itemCount: 24 },
    { label: 'knapp dreiseitig', itemCount: 52 },
  ]
  cases.forEach(({ label, itemCount }) => {
    const markup = renderInvoice(itemCount)
    assert.equal(markup.match(/class="invoice-item-row(?:\s|")/g)?.length, itemCount, label)
    assert.equal(markup.match(/class="invoice-footer"/g)?.length, 1, label)
    assert.ok(markup.indexOf('invoice-closing') > markup.lastIndexOf('</table>'), label)
    assert.ok(markup.indexOf('invoice-footer') > markup.indexOf('invoice-thanks'), label)
    assert.doesNotMatch(markup, /Seite 1 von 1/, label)
  })

  const stylesheet = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const componentSource = readFileSync(new URL('../src/components/InvoicePrint.tsx', import.meta.url), 'utf8')
  const printStyles = stylesheet.slice(stylesheet.indexOf('@media print'))
  const pageStyle = buildInvoicePrintPageStyle('Rechtstext mit "Anführungszeichen" und </style>', '2026-a-0001')
  assert.match(stylesheet, /\.invoice-table tr \{ break-inside: avoid; page-break-inside: avoid; \}/)
  assert.match(printStyles, /@page \{[\s\S]*size: A4 portrait;[\s\S]*margin: 16mm 20mm 22mm;/)
  assert.doesNotMatch(printStyles, /@bottom-right/)
  assert.match(pageStyle, /@bottom-left \{[\s\S]*content: "Rechtstext/)
  assert.match(pageStyle, /@bottom-right \{[\s\S]*content: "Seite " counter\(page\) " von " counter\(pages\);/)
  assert.match(pageStyle, /@top-right \{[\s\S]*content: "Rechnung 2026-a-0001";/)
  assert.match(pageStyle, /@page :first \{[\s\S]*@top-right \{ content: ""; \}/)
  assert.doesNotMatch(pageStyle, /<\/style>/)
  assert.doesNotMatch(componentSource, /Privatrechnung/)
  assert.match(stylesheet, /\.invoice-closing \{ break-inside: avoid; page-break-inside: avoid; \}/)
  assert.match(stylesheet, /\.invoice-footer \{[^}]*text-align: left;/)
  assert.match(stylesheet, /\.invoice-footer p \{[^}]*-webkit-line-clamp: 2;/)
  assert.match(printStyles, /\.invoice-footer \{ display: none; \}/)
  assert.doesNotMatch(printStyles, /page-break-after: always/)
})

test('Entwurfsdrucke tragen ein Wasserzeichen und nur Entwürfe zeigen Positionsdetails', () => {
  const props = {
    guardians: [],
    students: [student('student-a', 'Anna', 'a')],
    settings: defaultSettings,
  }
  const draftMarkup = renderToStaticMarkup(createElement(InvoicePrint, { ...props, invoice: invoice({ number: null, sequence: null, status: 'draft' }) }))
  const finalMarkup = renderToStaticMarkup(createElement(InvoicePrint, { ...props, invoice: invoice() }))
  assert.match(draftMarkup, /class="invoice-draft-watermark"[^>]*>ENTWURF</)
  assert.doesNotMatch(finalMarkup, /invoice-draft-watermark/)

  const stylesheet = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../src/views/Invoices.tsx', import.meta.url), 'utf8')
  assert.match(stylesheet.slice(stylesheet.indexOf('@media print')), /\.invoice-draft-watermark \{ position: fixed;/)
  assert.match(source, /invoice\.status === 'draft' && <section className="position-summary">/)
  assert.doesNotMatch(source, /<Download/)
})

test('Druck wartet auf den QR-Code des konkreten Druckauftrags', () => {
  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const printHandler = appSource.slice(appSource.indexOf('const print ='), appSource.indexOf('const exportBackup'))
  const printSource = readFileSync(new URL('../src/components/InvoicePrint.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(printHandler, /setTimeout/)
  assert.match(printHandler, /printRequestRef/)
  assert.match(appSource, /onPrintReady=\{handlePrintReady\}/)
  assert.match(printSource, /setQrCode\(null\)/)
  assert.match(printSource, /requestId: string/)
  assert.match(printSource, /invoiceId: string/)
  assert.match(printSource, /payload: string/)
  assert.match(printSource, /qrCode\.invoiceId === invoice\.id/)
  assert.match(printSource, /qrCode\.payload === qrRequest\.payload/)
  assert.match(printSource, /onLoad=.*onPrintReady/)
})

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

  const source = readFileSync(new URL('../src/views/Invoices.tsx', import.meta.url), 'utf8')
  assert.match(source, /createPortal\([\s\S]*document\.body/)
})

test('Demo-Daten bilden Familien, Unterricht und Rechnungen seit Januar 2025 vollständig ab', () => {
  const demo = createDemoState(new Date('2026-08-20T12:00:00.000Z'))
  assert.equal(demo.settings.issuer.name, 'Max Mustermann')
  assert.equal(demo.settings.accountHolder, 'Max Mustermann')
  assert.equal(isValidIban(demo.settings.iban), true)
  assert.equal(demo.guardians.length, 10)
  assert.equal(demo.students.length, 10)
  assert.ok(demo.guardians.every((guardian) => guardian.email.endsWith('@example.de') && guardian.phone && guardian.address.street && guardian.address.postalCode && guardian.address.city))
  assert.ok(demo.students.every((entry) => entry.guardianIds.length > 0 && entry.note && entry.active))
  assert.ok(demo.students.some((entry) => entry.guardianIds.length === 2))

  const expectedMonths: string[] = []
  for (let year = 2025, month = 0; year < 2026 || year === 2026 && month <= 7;) {
    expectedMonths.push(`${year}-${String(month + 1).padStart(2, '0')}`)
    month += 1
    if (month === 12) { year += 1; month = 0 }
  }
  assert.deepEqual([...new Set(demo.invoices.map((entry) => entry.invoiceDate.slice(0, 7)))].sort(), expectedMonths)

  const historical = demo.invoices.filter((entry) => entry.invoiceDate.slice(0, 7) < '2026-08')
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
    saveState(demo)
    const restored = loadReadyState()
    assert.equal(restored.guardians.length, 10)
    assert.equal(restored.students.length, 10)
    assert.equal(restored.invoices.length, demo.invoices.length)
  })
})

test('vollständiges Backup lässt sich wiederherstellen', () => {
  const state = emptyState()
  state.settings.issuer.name = 'Test Unterricht'
  state.students.push(student('student-a', 'Anna', 'a'))
  state.nextStudentCodeIndex = 1
  state.voidedInvoiceNumbers.push({ number: '2026-a-0004', sequence: 4, year: 2026, invoiceDate: '2026-08-01', deletedAt: '2026-08-20T12:00:00.000Z', amount: 90, recipient: 'Testfamilie' })
  const correctedSnapshot = {
    issuer: structuredClone(state.settings.issuer),
    guardians: [],
    students: [{ id: 'student-a', name: 'Anna' }],
    accountHolder: 'Neuer Kontoinhaber',
    iban: '',
    bic: '',
    bankName: '',
    legalText: '',
  }
  state.audit.push({
    id: 'event-snapshot-correction',
    at: '2026-08-20T12:30:00.000Z',
    label: 'Snapshot-Korrektur',
    entityType: 'invoice',
    entityId: 'invoice-test',
    snapshotCorrection: {
      oldValue: null,
      newValue: correctedSnapshot,
    },
  })
  const restored = parseBackup(serializeBackup(state))
  assert.equal(restored.schemaVersion, 2)
  assert.equal(restored.settings.issuer.name, 'Test Unterricht')
  assert.equal(restored.students[0]?.billingCode, 'a')
  assert.equal(restored.voidedInvoiceNumbers[0]?.number, '2026-a-0004')
  assert.equal(restored.audit[0]?.snapshotCorrection?.newValue.accountHolder, 'Neuer Kontoinhaber')
})

test('finalisierte Snapshots bleiben ohne bestätigten Korrekturmodus unverändert', () => {
  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const editorSource = readFileSync(new URL('../src/views/InvoiceEditor.tsx', import.meta.url), 'utf8')

  assert.match(appSource, /snapshot: snapshotCorrectionConfirmed \? freshSnapshot : previousSnapshot \?\? freshSnapshot/)
  assert.match(appSource, /title: 'Snapshot-Korrektur bestätigen'/)
  assert.match(appSource, /oldValue: oldSnapshot \? structuredClone\(oldSnapshot\) : null/)
  assert.match(appSource, /newValue: structuredClone\(newSnapshot\)/)
  assert.match(editorSource, /Snapshot-Korrektur aktivieren/)
  assert.match(editorSource, /finalized && snapshotCorrection/)
})

test('Backup-Import lehnt ungültige Feldtypen und Fachwerte ab', () => {
  assert.throws(() => parseBackup(corruptBackup((data) => {
    const invoices = data.invoices as Array<Record<string, unknown>>
    invoices[0].items = 'keine Liste'
  })), /invoices\[0\]\.items.*Array/)

  assert.throws(() => parseBackup(corruptBackup((data) => {
    const invoices = data.invoices as Array<Record<string, unknown>>
    invoices[0].status = 'cancelled'
  })), /invoices\[0\]\.status/)

  assert.throws(() => parseBackup(corruptBackup((data) => {
    const invoices = data.invoices as Array<Record<string, unknown>>
    invoices[0].dueDate = '2026-02-30'
  })), /invoices\[0\]\.dueDate.*Kalenderdatum/)

  const nonFiniteAmount = serializeBackup(validImportState()).replace('"unitPrice": 30', '"unitPrice": 1e309')
  assert.throws(() => parseBackup(nonFiniteAmount), /invoices\[0\]\.items\[0\]\.unitPrice.*endliche Zahl/)
})

test('Backup-Import lehnt doppelte IDs und ungültige Referenzen ab', () => {
  assert.throws(() => parseBackup(corruptBackup((data) => {
    const guardians = data.guardians as Array<Record<string, unknown>>
    guardians.push(structuredClone(guardians[0]))
  })), /guardians\[1\]\.id.*doppelt/)

  assert.throws(() => parseBackup(corruptBackup((data) => {
    const students = data.students as Array<Record<string, unknown>>
    students[0].guardianIds = ['guardian-missing']
  })), /students\[0\]\.guardianIds\[0\].*unbekannte/)

  assert.throws(() => parseBackup(corruptBackup((data) => {
    const invoices = data.invoices as Array<Record<string, unknown>>
    invoices[0].studentIds = ['student-missing']
  })), /invoices\[0\]\.studentIds\[0\].*unbekannte/)

  assert.throws(() => parseBackup(corruptBackup((data) => {
    const invoices = data.invoices as Array<Record<string, unknown>>
    const items = invoices[0].items as Array<Record<string, unknown>>
    items[0].studentId = 'student-missing'
  })), /invoices\[0\]\.items\[0\]\.studentId.*unbekannte/)
})

test('finalisierte Historie darf gelöschte Stammdaten über den Snapshot referenzieren', () => {
  const state = validImportState()
  state.invoices[0].snapshot = {
    issuer: structuredClone(state.settings.issuer),
    guardians: [{ id: 'guardian-a', name: 'Alex Beispiel', email: 'alex@example.de', street: 'Beispielweg 1', postalCode: '12345', city: 'Beispielstadt' }],
    students: [{ id: 'student-a', name: 'Anna' }],
    accountHolder: state.settings.accountHolder,
    iban: state.settings.iban,
    bic: state.settings.bic,
    bankName: state.settings.bankName,
    legalText: state.settings.defaultLegalText,
  }
  state.guardians = []
  state.students = []

  const restored = parseBackup(serializeBackup(state))
  assert.deepEqual(restored.invoices[0]?.guardianIds, ['guardian-a'])
  assert.deepEqual(restored.invoices[0]?.studentIds, ['student-a'])
})

test('ältere Backups erhalten stabile Kinderkennzeichen in Speicherreihenfolge', () => {
  const legacy = JSON.parse(serializeBackup(emptyState()))
  legacy.app = 'gitarrenrechnungen'
  legacy.data.students = [student('student-a', 'Anna', ''), student('student-b', 'Ben', '')]
  legacy.data.settings.numberPattern = '{YYYY}-{NNNN}'
  delete legacy.data.nextStudentCodeIndex
  const restored = parseBackup(JSON.stringify(legacy))
  assert.deepEqual(restored.students.map((item) => item.billingCode), ['a', 'b'])
  assert.equal(restored.nextStudentCodeIndex, 2)
  assert.equal(restored.settings.numberPattern, '{YYYY}-{K}-{NNNN}')
})

test('ältere Kombinationszähler werden auf segmentierte Schlüssel migriert', () => {
  const state = emptyState()
  state.students = [student('student-a', 'Anna', 'a'), student('student-b', 'Ben', 'b'), student('student-ab', 'Zora', 'ab')]
  state.invoices = [invoice({ studentIds: ['student-a', 'student-b'], number: '2026-ab-0003', sequence: 3 })]
  state.counters = { '2026:ab': 4 }
  const restored = parseBackup(serializeBackup(state))
  assert.equal(restored.counters['2026:a+b'], 4)
  assert.equal(restored.counters['2026:ab'], 4)
})

test('ältere Rechnungspositionen erhalten einen Typ ohne Preis- oder Titeländerung', () => {
  const state = emptyState()
  state.students = [student('student-a', 'Anna', 'a')]
  state.nextStudentCodeIndex = 1
  state.invoices = [invoice({
    items: [{
      ...createLessonItem('student-a', '2026-08-05', defaultSettings, 'legacy-item'),
      lessonType: 'duo',
      description: 'Gitarrenunterricht (Duo)',
      unitPrice: 17,
    }],
  })]
  const legacy = JSON.parse(serializeBackup(state))
  delete legacy.data.invoices[0].items[0].lessonType
  const restoredItem = parseBackup(JSON.stringify(legacy)).invoices[0]?.items[0]
  assert.equal(restoredItem?.lessonType, 'duo')
  assert.equal(restoredItem?.description, 'Gitarrenunterricht (Duo)')
  assert.equal(restoredItem?.unitPrice, 17)
})

test('manuelle Theme-Auswahl bleibt nach einem Reload erhalten', () => {
  withMockLocalStorage(() => {
    const state = emptyState()
    state.settings.theme = 'dark'
    saveState(state)
    assert.equal(loadReadyState().settings.theme, 'dark')
  })
})

test('beschädigte lokale Daten bleiben für die Wiederherstellung unangetastet', () => {
  const storageKey = 'gitarrenrechnungen-state-v2'
  const invalidState = validImportState()
  invalidState.invoices[0].status = 'cancelled' as Invoice['status']
  const corruptValues = ['{"schemaVersion":2', JSON.stringify(invalidState)]

  corruptValues.forEach((rawData) => withMockLocalStorage(() => {
    localStorage.setItem(storageKey, rawData)
    const loaded = loadState()
    if (loaded.status !== 'recovery') assert.fail('Beschädigte Daten wurden als normaler Zustand geladen.')
    assert.equal(loaded.rawData, rawData)
    assert.ok(loaded.error)
    assert.equal(localStorage.getItem(storageKey), rawData)
  }))

  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const recoverySource = readFileSync(new URL('../src/views/StorageRecovery.tsx', import.meta.url), 'utf8')
  assert.match(appSource, /useEffect\(\(\) => \{\s+if \(recovery\) return\s+setSaveStateLabel/)
  assert.match(appSource, /<StorageRecovery/)
  assert.match(recoverySource, /Beschädigte Rohdaten exportieren/)
  assert.match(recoverySource, /JSON-Backup wiederherstellen/)
})

test('Entwürfe lassen sich aus der Detailansicht nur mit vollständigen aktuellen Daten finalisieren', () => {
  const state = validImportState()
  const draft = invoice({
    number: null,
    sequence: null,
    status: 'draft',
    guardianIds: ['guardian-a'],
    studentIds: ['student-a'],
    items: [createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-finalization')],
  })
  assert.deepEqual(invoiceFinalizationErrors(state, draft), [])
  assert.match(invoiceFinalizationErrors(state, { ...draft, guardianIds: [] }).join(' '), /empfangende Person/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, guardianIds: ['guardian-missing'] }).join(' '), /Stammdaten/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, studentIds: [] }).join(' '), /Kind/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, studentIds: ['student-missing'] }).join(' '), /Stammdaten/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, items: [] }).join(' '), /Position/)
  assert.match(invoiceFinalizationErrors(state, { ...draft, items: [{ ...draft.items[0], description: '' }] }).join(' '), /vollständig/)

  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(appSource, /invoiceFinalizationErrors\(state, invoice\)/)
  assert.match(appSource, /Vorläufige konservative Fachregel/)
})

test('Einstellungen werden gebündelt automatisch gespeichert', () => {
  const source = readFileSync(new URL('../src/views/Settings.tsx', import.meta.url), 'utf8')
  assert.match(source, /SETTINGS_AUTOSAVE_DELAY_MS = 600/)
  assert.match(source, /window\.setTimeout\(\(\) => persist\(form\), SETTINGS_AUTOSAVE_DELAY_MS\)/)
  assert.match(source, /Die IBAN-Prüfsumme ist nicht gültig/)
  assert.doesNotMatch(source, /if \(!isValidIban\([^)]*\)\) return/)
})

test('Modal-Formulare verknüpfen ihre Footer-Buttons mit dem nativen Submit', () => {
  const peopleSource = readFileSync(new URL('../src/views/People.tsx', import.meta.url), 'utf8')
  const editorSource = readFileSync(new URL('../src/views/InvoiceEditor.tsx', import.meta.url), 'utf8')
  assert.match(peopleSource, /type="submit" form=\{GUARDIAN_FORM_ID\}/)
  assert.match(peopleSource, /type="submit" form=\{STUDENT_FORM_ID\}/)
  assert.match(editorSource, /type="submit" form=\{INVOICE_EDITOR_FORM_ID\}/)
  assert.match(editorSource, /onSubmit=\{\(event\) => \{ event\.preventDefault\(\); submit\(false\) \}\}/)
  assert.match(editorSource, /<textarea/)
})

test('Mengenfeld akzeptiert Hundertstelwerte und bietet Viertelschritt-Steuerung', () => {
  const source = readFileSync(new URL('../src/views/InvoiceEditor.tsx', import.meta.url), 'utf8')
  assert.match(source, /const MIN_QUANTITY = 0\.01/)
  assert.match(source, /const MAX_QUANTITY = 99\.99/)
  assert.match(source, /const QUANTITY_INCREMENT = 0\.25/)
  assert.match(source, /min=\{MIN_QUANTITY\} max=\{MAX_QUANTITY\} step="0\.01"/)
  assert.match(source, /event\.key === 'ArrowUp' \|\| event\.key === 'ArrowDown'/)
  assert.match(source, /className="quantity-stepper"/)
})

test('Kinderliste startet mit aktivem Aktiv-Filter', () => {
  const source = readFileSync(new URL('../src/views/People.tsx', import.meta.url), 'utf8')
  const stylesheet = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(source, /\[onlyActiveStudents, setOnlyActiveStudents\] = useState\(true\)/)
  assert.match(source, /Nur aktive Kinder anzeigen/)
  assert.match(source, /!onlyActiveStudents \|\| student\.active/)
  assert.match(source, /switch-row switch-row--compact people-active-filter[\s\S]*type="checkbox"[\s\S]*<i \/>/)
  assert.match(stylesheet, /\.switch-row input:checked \+ i \{[^}]*background: var\(--primary\);/)
  assert.match(stylesheet, /\.switch-row input:checked \+ i::after \{[^}]*background: var\(--on-primary\);[^}]*transform: translate\(20px, -2px\);/)
  assert.match(stylesheet, /\.switch-row strong \{[^}]*font-size: \.9rem;/)
  assert.match(stylesheet, /\.switch-row small \{[^}]*font-size: \.75rem;/)
  assert.match(stylesheet, /\.people-active-filter\.switch-row--compact \{[^}]*min-height: 60px;[^}]*padding: var\(--space-2\) var\(--space-4\);/)
  assert.doesNotMatch(stylesheet, /\.people-active-filter > i \{[^}]*transform:/)
})

test('Zeitpunkt des letzten Backup-Exports wird persistiert', () => {
  withMockLocalStorage(() => {
    assert.equal(loadLastBackupAt(), null)
    const exportedAt = recordBackupExport(new Date('2026-08-20T12:32:00.000Z'))
    assert.equal(exportedAt, '2026-08-20T12:32:00.000Z')
    assert.equal(loadLastBackupAt(), exportedAt)
  })
})

test('sichtbare App-Version entspricht dem neuesten Changelog-Eintrag', () => {
  assert.ok(Array.isArray(changelog))
  assert.equal(changelog[0]?.version, APP_VERSION)
  assert.ok((changelog[0]?.changes.length ?? 0) >= 1)
  assert.ok(changelog.length >= 2)
})

test('nicht unterstütztes Backup wird abgelehnt', () => {
  assert.throws(() => parseBackup('{"schemaVersion":99}'), /unterstütztes Backup-Format/)
})
