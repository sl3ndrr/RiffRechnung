import test from 'node:test'
import assert from 'node:assert/strict'
import { changeThemeState, deleteGuardianState, deleteInvoiceDraftState, deleteStudentState, saveInvoiceState, saveStudentState } from '../src/lib/commands'
import { archiveInvoice, createCorrectionDraft } from '../src/lib/documents'
import { invoiceDraftFields } from '../src/lib/invoiceDrafts'
import { requireSuccess } from '../src/lib/result'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { validateBackupState } from '../src/lib/validation'
import { prepareUndoChangeState, undoChangeState, type UndoChange } from '../src/lib/undo'
import { createDemoState } from '../src/lib/defaults'
import { undoAt, undoFixture } from './undoFixtures'

for (const kind of ['draft', 'guardian', 'student'] as const) {
  test(`3.AP5: ${kind} wird gezielt mit identischem Inhalt wiederhergestellt; Replay abgelehnt`, () => {
    const initial = undoFixture()
    const original = structuredClone(initial)
    const change: UndoChange = { kind, id: kind === 'draft' ? initial.invoices[0].id : kind === 'guardian' ? 'g1' : 's1' }
    const prepared = requireSuccess(prepareUndoChangeState(initial, change))
    const deleted = prepared.state
    const interim = requireSuccess(changeThemeState(deleted, 'dark'))
    const restored = requireSuccess(undoChangeState(interim, prepared.undo, undoAt))
    assert.deepEqual(restored.invoices, original.invoices)
    assert.deepEqual(restored.students, original.students)
    assert.deepEqual(restored.guardians, original.guardians)
    assert.deepEqual(restored.counters, original.counters)
    assert.equal(restored.nextStudentCodeIndex, original.nextStudentCodeIndex)
    assert.equal(restored.settings.theme, 'dark')
    assert.deepEqual(restored.audit.map((event) => event.label), ['Löschen rückgängig gemacht', kind === 'draft' ? 'Rechnungsentwurf gelöscht'
      : kind === 'guardian' ? 'Erziehungsberechtigte Person gelöscht' : 'Lernende Person gelöscht'])
    assert.equal(undoChangeState(restored, prepared.undo).ok, false)
    assert.deepEqual(initial, original, 'Erfassung und Undo verändern ihre Eingabe nicht')
    validateBackupState(restored)
    assertOriginalsPreserved(interim, restored)
  })
}

test('3.AP5: Lernendenkennung bleibt gleich, neue Kennung und Zähler bleiben erhalten', () => {
  const initial = undoFixture()
  const { state, undo } = requireSuccess(prepareUndoChangeState(initial, { kind: 'student', id: 's1' }))
  const interim = requireSuccess(saveStudentState(state, { ...initial.students[0], id: 's3', name: 'Neues Kind', billingCode: '' }))
  const restored = requireSuccess(undoChangeState(interim, undo))
  assert.deepEqual(restored.students.map((student) => [student.id, student.billingCode]), [['s1', 'a'], ['s2', 'b'], ['s3', 'c']])
  assert.equal(restored.nextStudentCodeIndex, 3)
})

test('3.AP5: Umkehrung erhält zwischenzeitliche Namens- und Freitextänderungen', () => {
  const initial = undoFixture()
  const { state, undo } = requireSuccess(prepareUndoChangeState(initial, { kind: 'guardian', id: 'g1' }))
  const interim = { ...state, students: state.students.map((student) => ({ ...student, name: 'Neuer Name' })),
    invoices: state.invoices.map((invoice) => ({ ...invoice, freeText: 'Neuer Hinweis' })) }
  const restored = requireSuccess(undoChangeState(interim, undo))
  assert.equal(restored.students[0].name, 'Neuer Name')
  assert.equal(restored.invoices[0].freeText, 'Neuer Hinweis')
  assert.deepEqual(restored.invoices[0].recipients, initial.invoices[0].recipients)
})

test('3.AP5: fehlende Person, Lernende oder Entwurf lehnen atomar ab', () => {
  const initial = undoFixture()
  const cases = [
    { change: { kind: 'draft', id: initial.invoices[0].id } as UndoChange, conflict: (state: typeof initial) => requireSuccess(deleteGuardianState(state, 'g1')) },
    { change: { kind: 'guardian', id: 'g1' } as UndoChange, conflict: (state: typeof initial) => requireSuccess(deleteStudentState(state, 's1')) },
    { change: { kind: 'student', id: 's1' } as UndoChange, conflict: (state: typeof initial) => requireSuccess(deleteGuardianState(state, 'g1')) },
    { change: { kind: 'student', id: 's1' } as UndoChange, conflict: (state: typeof initial) => requireSuccess(deleteInvoiceDraftState(state, initial.invoices[0].id)) },
    { change: { kind: 'guardian', id: 'g1' } as UndoChange, conflict: (state: typeof initial) => requireSuccess(deleteInvoiceDraftState(state, initial.invoices[0].id)) },
  ]
  for (const entry of cases) {
    const { state, undo } = requireSuccess(prepareUndoChangeState(initial, entry.change))
    const interim = entry.conflict(state)
    const original = structuredClone(interim)
    const result = undoChangeState(interim, undo)
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.errors[0].message, /Rückgängig nicht möglich/)
    assert.deepEqual(interim, original)
  }
})

test('3.AP5: geänderte Positionen, Zuordnungen und Finalisierung werden nicht überschrieben', () => {
  const initial = undoFixture()
  const deletion = requireSuccess(prepareUndoChangeState(initial, { kind: 'student', id: 's1' }))
  const changed = { ...deletion.state, invoices: deletion.state.invoices.map((invoice) => ({ ...invoice, items: invoice.items.map((item) => ({ ...item, description: 'Neue Position' })) })) }
  assert.equal(undoChangeState(changed, deletion.undo).ok, false)
  const finalized = requireSuccess(saveInvoiceState(deletion.state, { id: initial.invoices[0].id, ...invoiceDraftFields(deletion.state.invoices[0]) }, true, undoAt))
  assert.equal(undoChangeState(finalized, deletion.undo).ok, false)
  const guardian = requireSuccess(prepareUndoChangeState(initial, { kind: 'guardian', id: 'g1' }))
  const reassigned = requireSuccess(saveStudentState(guardian.state, { ...guardian.state.students[0], guardianIds: [], selfPayer: true }))
  assert.equal(undoChangeState(reassigned, guardian.undo).ok, false)
})

test('3.AP5: wiederhergestellte Entwürfe prüfen die aktuelle Empfängerberechtigung', () => {
  const initial = undoFixture()
  const { state, undo } = requireSuccess(prepareUndoChangeState(initial, { kind: 'draft', id: initial.invoices[0].id }))
  const interim = requireSuccess(saveStudentState(state, { ...state.students[0], guardianIds: ['g2'] }))
  assert.equal(undoChangeState(interim, undo).ok, false)
})

test('3.AP5: gelöschte Selbstzahler erhalten Empfängerreferenz und Entwurfspositionen zurück', () => {
  let state = undoFixture()
  state = { ...state, invoices: [] }
  state = requireSuccess(saveStudentState(state, { ...state.students[0], guardianIds: [], selfPayer: true }))
  state = requireSuccess(saveInvoiceState(state, { ...invoiceDraftFields(undoFixture().invoices[0]), studentIds: ['s1'],
    recipients: [{ type: 'student', id: 's1' }], items: [undoFixture().invoices[0].items[0]] }, false, undoAt))
  const prepared = requireSuccess(prepareUndoChangeState(state, { kind: 'student', id: 's1' }))
  const restored = requireSuccess(undoChangeState(prepared.state, prepared.undo))
  assert.deepEqual(restored.invoices, state.invoices)
  assert.deepEqual(restored.students, state.students)
})

test('3.AP5: Archivierung in beide Richtungen erhält Originale und spätere Verwaltungshistorie', () => {
  const initial = undoFixture()
  const finalized = requireSuccess(saveInvoiceState(initial, { id: initial.invoices[0].id, ...invoiceDraftFields(initial.invoices[0]) }, true, undoAt))
  for (const archived of [true, false]) {
    const before = archived ? finalized : archiveInvoice(finalized, finalized.invoices[0].id, true)
    const prepared = requireSuccess(prepareUndoChangeState(before, { kind: 'archive', id: before.invoices[0].id, archived }))
    const interim = { ...prepared.state, invoiceAdministration: prepared.state.invoiceAdministration.map((admin) => ({ ...admin, resolutions: [...admin.resolutions, { at: undoAt, reason: 'Zwischenzeitliche Klärung' }] })) }
    const restored = requireSuccess(undoChangeState(interim, prepared.undo))
    assert.equal(restored.invoiceAdministration[0].archived, !archived)
    assert.deepEqual(restored.invoiceAdministration[0].resolutions, interim.invoiceAdministration[0].resolutions)
    assert.deepEqual(restored.documentVersions, before.documentVersions)
    assert.deepEqual(restored.invoices, before.invoices)
    assert.deepEqual(restored.counters, before.counters)
    assertOriginalsPreserved(interim, restored)
    const again = archiveInvoice(restored, restored.invoices[0].id, archived)
    assert.equal(undoChangeState(again, prepared.undo).ok, false, 'Replay auch nach erneutem Archivwechsel gesperrt')
    assert.equal(undoChangeState(archiveInvoice(prepared.state, prepared.state.invoices[0].id, !archived), prepared.undo).ok, false)
  }
  assert.equal(prepareUndoChangeState(initial, { kind: 'archive', id: initial.invoices[0].id, archived: true }).ok, false)
  assert.equal(prepareUndoChangeState(finalized, { kind: 'draft', id: finalized.invoices[0].id }).ok, false)
  const first = requireSuccess(prepareUndoChangeState(finalized, { kind: 'archive', id: finalized.invoices[0].id, archived: true }))
  const second = requireSuccess(prepareUndoChangeState(first.state, { kind: 'archive', id: finalized.invoices[0].id, archived: false }))
  const third = requireSuccess(prepareUndoChangeState(second.state, { kind: 'archive', id: finalized.invoices[0].id, archived: true }))
  assert.equal(undoChangeState(third.state, first.undo).ok, false, 'Späterer Archivwechsel bleibt auch bei demselben Flag geschützt')
})

test('3.AP5: finale Belege und Korrekturentwürfe bleiben bei Personen-Undo unverändert', () => {
  const initial = undoFixture()
  let state = requireSuccess(saveInvoiceState(initial, { id: initial.invoices[0].id, ...invoiceDraftFields(initial.invoices[0]) }, true, undoAt))
  state = createCorrectionDraft(state, state.invoices[0].id, 'Testkorrektur', undoAt)
  for (const change of [{ kind: 'guardian', id: 'g1' }, { kind: 'student', id: 's1' }] as const) {
    const prepared = requireSuccess(prepareUndoChangeState(state, change))
    const restored = requireSuccess(undoChangeState(prepared.state, prepared.undo))
    assert.deepEqual(prepared.state.invoices, state.invoices)
    assert.deepEqual(restored.invoices, state.invoices)
    assertOriginalsPreserved(state, restored)
  }
})

test('3.AP5: voneinander unabhängige Undo-Pakete und Demo-Bestand funktionieren', () => {
  const demo = createDemoState()
  const drafts = demo.invoices.filter((invoice) => invoice.status === 'draft')
  assert.ok(drafts.length)
  const first = requireSuccess(prepareUndoChangeState(demo, { kind: 'draft', id: drafts[0].id }))
  const second = requireSuccess(prepareUndoChangeState(first.state, { kind: 'guardian', id: demo.guardians[0].id }))
  const restoredGuardian = requireSuccess(undoChangeState(second.state, second.undo))
  const restoredDraft = requireSuccess(undoChangeState(restoredGuardian, first.undo))
  assert.deepEqual(restoredDraft.invoices, demo.invoices)
  assert.deepEqual(restoredDraft.guardians, demo.guardians)
  validateBackupState(restoredDraft)
})

test('3.AP5: Korrekturentwurf mit bereits historisch fehlender Person ist identisch wiederherstellbar', () => {
  const initial = undoFixture()
  let state = requireSuccess(saveInvoiceState(initial, { id: initial.invoices[0].id, ...invoiceDraftFields(initial.invoices[0]) }, true, undoAt))
  state = createCorrectionDraft(state, state.invoices[0].id, 'Historische Lücke', undoAt)
  state = requireSuccess(deleteGuardianState(state, 'g1'))
  const original = state.invoices[1]
  const prepared = requireSuccess(prepareUndoChangeState(state, { kind: 'draft', id: original.id }))
  const restored = requireSuccess(undoChangeState(prepared.state, prepared.undo))
  assert.deepEqual(restored.invoices[1], original)
  assert.deepEqual(restored.documentVersions, state.documentVersions)
  assertOriginalsPreserved(state, restored)
})
