import test from 'node:test'
import assert from 'node:assert/strict'
import type { InvoiceDraft } from '../src/types'
import { toggleDraftStudent } from '../src/lib/invoiceStudents'
import { documentAt, documentDraft, documentFamily, editable } from './documentFixtures'
import { prepareInvoiceCopy, saveStudentState } from '../src/lib/commands'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { requireSuccess } from '../src/lib/result'
import { createEmptyInvoiceDraft } from '../src/lib/invoiceDrafts'
import { invoiceFinalizationErrors } from '../src/lib/invoiceRules'
import { invoiceTotal } from '../src/lib/money'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { createCorrectionDraft, reassignCorrectionStudent } from '../src/lib/documents'
import { parseBackup, serializeBackup } from '../src/lib/storage'

function richDraft(): InvoiceDraft {
  const draft = documentDraft()
  return { ...draft, items: [draft.items[0], { ...draft.items[0], id: 'second-position', serviceDate: '2026-08-22',
    description: 'Individuelle Duo-Pauschale', quantity: 1.25, unit: 'Pauschale', unitPrice: 17.35, lessonType: 'duo' as const }] }
}

test('Kopie: Abwählen und Auswählen erhält sämtliche Positionsfelder', () => {
  const state = saveInvoiceDraft(documentFamily(), richDraft(), false)
  const source = structuredClone(state.invoices[0])
  const copy = requireSuccess(prepareInvoiceCopy(state, source.id, new Date(2026, 9, 5)))
  const cleared = toggleDraftStudent(copy, state.students[0], state.students, state.settings)
  assert.deepEqual(cleared.items, copy.items, 'Abwählen darf keine Position löschen')
  const replaced = toggleDraftStudent(cleared, state.students[1], state.students, state.settings)
  assert.deepEqual(replaced.items, copy.items.map((item) => ({ ...item, studentId: 's-b' })))
  assert.deepEqual(state.invoices[0], source)
})

for (const finalizeSource of [false, true]) for (const newFirst of [false, true]) {
  test(`Kopie: ${newFirst ? 'Auswählen→Abwählen' : 'Abwählen→Auswählen'}, Quelle ${finalizeSource ? 'final' : 'Entwurf'}, Speichern und Finalisieren`, () => {
    const family = documentFamily()
    family.students[0].guardianIds = ['g-a']
    family.students[1].guardianIds = ['g-b']
    const state = saveInvoiceDraft(family, richDraft(), finalizeSource, documentAt)
    const original = structuredClone(state)
    let copy = requireSuccess(prepareInvoiceCopy(state, state.invoices[0].id, new Date(2026, 9, 5)))
    const copiedItems = structuredClone(copy.items)
    if (newFirst) {
      copy = toggleDraftStudent(copy, state.students[1], state.students, state.settings)
      assert.deepEqual(copy.recipients, [], 'Kein Empfänger darf nur einem der ausgewählten Kinder zugeordnet sein')
      copy = toggleDraftStudent(copy, state.students[0], state.students, state.settings, original.invoices[0].studentIds)
    } else {
      copy = toggleDraftStudent(copy, state.students[0], state.students, state.settings)
      copy = toggleDraftStudent(copy, state.students[1], state.students, state.settings)
    }
    assert.deepEqual(copy.items, copiedItems.map((item) => ({ ...item, studentId: 's-b' })))
    assert.deepEqual(copy.studentIds, ['s-b'])
    assert.deepEqual(copy.recipients, [{ type: 'guardian', id: 'g-b' }])
    const saved = saveInvoiceDraft(state, copy, false, documentAt)
    assert.deepEqual(saved.counters, state.counters)
    const reopened = parseBackup(serializeBackup(saved))
    const final = saveInvoiceDraft(reopened, editable(reopened.invoices.at(-1)!), true, documentAt)
    assert.equal(invoiceTotal(final.invoices.at(-1)!), invoiceTotal(original.invoices[0]))
    assert.equal(final.documentVersions.at(-1)!.amounts.totalCents, 2927)
    assert.deepEqual(final.invoices[0], original.invoices[0])
    assert.deepEqual(final.documentVersions.slice(0, original.documentVersions.length), original.documentVersions)
    assertOriginalsPreserved(original, final)
  })
}

for (const newFirst of [false, true]) test(`Duo: nur ausgetauschte Person umhängen (${newFirst ? 'neu zuerst' : 'alt zuerst'})`, () => {
  let state = documentFamily()
  state = requireSuccess(saveStudentState(state, { ...state.students[1], id: 's-c', name: 'Testkind C', billingCode: '' }))
  const draft = { ...richDraft(), studentIds: ['s-a', 's-b'] }
  draft.items[1] = { ...draft.items[1], studentId: 's-b' }
  let next = newFirst ? toggleDraftStudent(draft, state.students[2], state.students, state.settings) : draft
  next = toggleDraftStudent(next, state.students[0], state.students, state.settings, draft.studentIds)
  if (!newFirst) {
    assert.deepEqual(next.items, draft.items)
    assert.ok(invoiceFinalizationErrors(state, next).some((error) => /Positionen.*zugeordnet/.test(error)))
    next = toggleDraftStudent(next, state.students[2], state.students, state.settings)
  }
  assert.deepEqual(next.items, [{ ...draft.items[0], studentId: 's-c' }, draft.items[1]])
  assert.equal(next.studentIds[0], 's-b', 'Neue Positionen werden weiter der ersten ausgewählten Person zugeordnet')
  assert.equal(next.recipients.filter((ref) => ref.id === 'g-a').length, 1)
  assert.deepEqual(invoiceFinalizationErrors(state, next), [])
})

test('Neue und bestehende Entwürfe: ohne Ersatz weder leere noch ausgefüllte Positionen löschen', () => {
  const state = documentFamily()
  const empty = createEmptyInvoiceDraft(state.settings)
  const first = toggleDraftStudent(empty, state.students[0], state.students, state.settings)
  assert.equal(first.items.length, 1)
  const cleared = toggleDraftStudent(first, state.students[0], state.students, state.settings)
  assert.deepEqual(cleared.items, first.items)
  const replaced = toggleDraftStudent(cleared, state.students[1], state.students, state.settings)
  assert.deepEqual(replaced.items, first.items.map((item) => ({ ...item, studentId: 's-b' })))
  const duo = { ...richDraft(), studentIds: ['s-a', 's-b'] }
  const deselected = toggleDraftStudent(duo, state.students[0], state.students, state.settings)
  assert.deepEqual(deselected.items, duo.items)
  const restored = toggleDraftStudent(deselected, state.students[0], state.students, state.settings)
  assert.deepEqual(restored.items, duo.items)
})

test('Mehrere mögliche Ersatzpersonen erfordern eine ausdrückliche Zuordnung', () => {
  let state = documentFamily()
  state = requireSuccess(saveStudentState(state, { ...state.students[1], id: 's-c', name: 'Testkind C', billingCode: '' }))
  const draft = documentDraft()
  let next = toggleDraftStudent(draft, state.students[1], state.students, state.settings, draft.studentIds)
  next = toggleDraftStudent(next, state.students[2], state.students, state.settings, draft.studentIds)
  next = toggleDraftStudent(next, state.students[0], state.students, state.settings, draft.studentIds)
  assert.deepEqual(next.items, draft.items)
  assert.ok(invoiceFinalizationErrors(state, next).some((error) => /Positionen.*zugeordnet/.test(error)))
})

test('Selbstzahler↔Erziehungsberechtigte und Empfängerbereinigung ohne Duplikate', () => {
  const state = documentFamily()
  state.students[1] = { ...state.students[1], selfPayer: true, guardianIds: [] }
  let draft = toggleDraftStudent(documentDraft(), state.students[0], state.students, state.settings)
  draft = toggleDraftStudent(draft, state.students[1], state.students, state.settings)
  assert.deepEqual(draft.recipients, [{ type: 'student', id: 's-b' }])
  assert.deepEqual(invoiceFinalizationErrors(state, draft), [])
  assert.equal(invoiceTotal(saveInvoiceDraft(state, draft, true, documentAt).invoices[0]), 7.58)
  draft = toggleDraftStudent(draft, state.students[1], state.students, state.settings)
  draft = toggleDraftStudent(draft, state.students[0], state.students, state.settings)
  assert.deepEqual(draft.recipients, [{ type: 'guardian', id: 'g-a' }, { type: 'guardian', id: 'g-b' }])
  assert.deepEqual(draft.items, documentDraft().items)
  assert.equal(invoiceTotal(saveInvoiceDraft(state, draft, true, documentAt).invoices[0]), 7.58)
  state.students[1].guardianIds = ['g-a']
  delete state.students[1].selfPayer
  const joint = toggleDraftStudent(draft, state.students[1], state.students, state.settings)
  assert.deepEqual(joint.recipients, [{ type: 'guardian', id: 'g-a' }])
  assert.deepEqual(invoiceFinalizationErrors(state, joint), [])
})

test('Korrekturen behalten ihre bestehende Neuzuordnung und das Original', () => {
  const state = saveInvoiceDraft(documentFamily(), richDraft(), true, documentAt)
  const original = structuredClone(state)
  const corrected = createCorrectionDraft(state, state.invoices[0].id, 'Person korrigieren', documentAt)
  const draft = editable(corrected.invoices.at(-1)!)
  assert.throws(() => toggleDraftStudent(draft, state.students[0], state.students, state.settings), /Korrekturen/)
  const reassigned = reassignCorrectionStudent(draft, 's-a', 's-b')
  assert.deepEqual(reassigned.correction, draft.correction)
  assert.deepEqual(reassigned.items, draft.items.map((item) => ({ ...item, studentId: 's-b' })))
  assert.deepEqual(reassigned.recipients, draft.recipients)
  const final = saveInvoiceDraft(corrected, reassigned, true, documentAt)
  assert.deepEqual(final.invoices[0], original.invoices[0])
  assertOriginalsPreserved(original, final)
})
