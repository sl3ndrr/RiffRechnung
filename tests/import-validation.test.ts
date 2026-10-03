import { legacyFixture } from './documentFixtures'
import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultSettings, emptyState } from '../src/lib/defaults'
import { loadLastBackupAt, parseBackup, recordBackupExport, serializeBackup } from '../src/lib/storage'
import { createLessonItem } from '../src/lib/invoiceDrafts'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { student, invoice, withMockLocalStorage, validImportState, corruptBackup } from './invoiceFixtures'

test('vollständiges Backup lässt sich wiederherstellen', () => {
  const state = emptyState()
  state.settings.issuer.name = 'Test Unterricht'
  state.students.push(student('student-a', 'Anna', 'a'))
  state.nextStudentCodeIndex = 1
  state.voidedInvoiceNumbers.push({ number: '2026-a-0004', sequence: 4, year: 2026, invoiceDate: '2026-08-01', deletedAt: '2026-08-20T12:00:00.000Z', amount: 90, recipient: 'Testfamilie' })
  const correctedSnapshot = {
    issuer: structuredClone(state.settings.issuer),
    recipients: [],
    students: [{ id: 'student-a', name: 'Anna' }],
    accountHolder: 'Neuer Kontoinhaber',
    iban: '',
    bic: '',
    bankName: '',
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
  assert.equal(restored.schemaVersion, 15)
  assert.equal(restored.settings.issuer.name, 'Test Unterricht')
  assert.equal(restored.students[0]?.billingCode, 'a')
  assert.equal(restored.voidedInvoiceNumbers[0]?.number, '2026-a-0004')
  assert.equal(restored.audit[0]?.snapshotCorrection?.newValue.accountHolder, 'Neuer Kontoinhaber')
})


test('finalisierte Inhalte und Snapshots bleiben auch bei angeforderter Korrektur unverändert', () => {
  const state = validImportState()
  const original = structuredClone(state)
  const draft = { ...state.invoices[0], recipients: (['guardian-other']).map((id) => ({ type: 'guardian' as const, id })) }
  assert.throws(() => saveInvoiceDraft(state, draft, false), /Finalisierte Belege/)
  const changed = structuredClone(state)
  changed.invoices[0].freeText = 'Nachträglicher Inhalt'
  assert.throws(() => assertOriginalsPreserved(state, changed), /Finalisierte Belege/)
  assert.deepEqual(state, original)
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
    recipients: ([{ id: 'guardian-a', name: 'Alex Beispiel', email: 'alex@example.de', street: 'Beispielweg 1', postalCode: '12345', city: 'Beispielstadt' }]).map((person) => ({ ...person, type: 'guardian' as const })),
    students: [{ id: 'student-a', name: 'Anna' }],
    accountHolder: state.settings.accountHolder,
    iban: state.settings.iban,
    bic: state.settings.bic,
    bankName: state.settings.bankName,
    }
  state.guardians = []
  state.students = []

  const restored = parseBackup(JSON.stringify(legacyFixture(state)))
  assert.deepEqual(restored.invoices[0].recipients.map((ref) => ref.id), ['guardian-a'])
  assert.deepEqual(restored.invoices[0]?.studentIds, ['student-a'])
})


test('ältere Backups erhalten stabile Kinderkennzeichen in Speicherreihenfolge', () => {
  const state = legacyFixture(emptyState())
  const legacy = JSON.parse(JSON.stringify({ app: 'gitarrenrechnungen', exportedAt: state.updatedAt, schemaVersion: 2, data: { ...state, schemaVersion: 2 } }))
  legacy.data.students = [student('student-a', 'Anna', ''), student('student-b', 'Ben', '')]
  legacy.data.settings.numberPattern = '{YYYY}-{NNNN}'
  delete legacy.data.nextStudentCodeIndex
  const restored = parseBackup(JSON.stringify(legacy))
  assert.deepEqual(restored.students.map((item) => item.billingCode), ['a', 'b'])
  assert.equal(restored.nextStudentCodeIndex, 2)
  assert.equal(Reflect.has(restored.settings, 'numberPattern'), false)
})


test('ältere Kombinationszähler werden auf segmentierte Schlüssel migriert', () => {
  const state = emptyState()
  state.students = [student('student-a', 'Anna', 'a'), student('student-b', 'Ben', 'b'), student('student-ab', 'Zora', 'ab')]
  state.invoices = [invoice({ studentIds: ['student-a', 'student-b'], number: '2026-ab-0003', sequence: 3 })]
  state.counters = { '2026:ab': 4 }
  const restored = parseBackup(JSON.stringify({ ...legacyFixture(state), schemaVersion: 2 }))
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
  const legacy = { app: 'riffrechnung', exportedAt: state.updatedAt, schemaVersion: 2, data: JSON.parse(JSON.stringify(legacyFixture(state))) }
  legacy.schemaVersion = 2
  legacy.data.schemaVersion = 2
  delete legacy.data.documentVersions
  delete legacy.data.invoiceAdministration
  delete legacy.data.payments
  delete legacy.data.invoices[0].items[0].lessonType
  const restoredItem = parseBackup(JSON.stringify(legacy)).invoices[0]?.items[0]
  assert.equal(restoredItem?.lessonType, 'duo')
  assert.equal(restoredItem?.description, 'Gitarrenunterricht (Duo)')
  assert.equal(restoredItem?.unitPrice, 17)
})


test('Zeitpunkt des letzten Backup-Exports wird persistiert', () => {
  withMockLocalStorage(() => {
    assert.equal(loadLastBackupAt(), null)
    const exportedAt = recordBackupExport(new Date('2026-08-20T12:32:00.000Z'))
    assert.equal(exportedAt, '2026-08-20T12:32:00.000Z')
    assert.equal(loadLastBackupAt(), exportedAt)
  })
})


test('nicht unterstütztes Backup wird abgelehnt', () => {
  assert.throws(() => parseBackup('{"schemaVersion":99}'), /unterstütztes Backup-Format/)
})
