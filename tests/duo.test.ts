import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppState } from '../src/types'
import { createDuoDrafts, applyDuoLessonChange, previewDuoLessonChange, setDuoTotal } from '../src/lib/duo'
import { groupCentsInput, previewDuo, duoForInvoice } from '../src/lib/duoModel'
import { changeInvoiceStatus, finalizeDuoGroup, saveInvoiceDraft } from '../src/lib/invoiceActions'
import { createCorrectionDraft, selectInvoice, snapshotFor, activeInvoices, archiveInvoice } from '../src/lib/documents'
import { deleteInvoiceDraftState, prepareInvoiceCopy } from '../src/lib/commands'
import { requireSuccess } from '../src/lib/result'
import { inspectImport } from '../src/lib/importState'
import { invoiceTotalCents } from '../src/lib/money'
import { invoicePdfTitle, invoicesToCsv, buildEpcPayload, mailtoUrl } from '../src/lib/utils'
import { validateBackupState } from '../src/lib/validation'
import { serializeBackup, parseBackup, StorageSession, STORAGE_KEY, PREVIOUS_STORAGE_KEY, loadState } from '../src/lib/storage'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { DocumentHistory } from '../src/components/DocumentHistory'
import { documentAt, editable } from './documentFixtures'
import { duoFamily, duoDrafts, duoLesson, households } from './duoFixtures'
import { createDemoState } from '../src/lib/defaults'
import { memoryStorage, seedState, sharedLock } from './storageHarness'

function finish(state: AppState): AppState {
  const group = state.duoGroups![0], preview = previewDuo(state, group.id)
  return finalizeDuoGroup(state, group.id, preview.token, preview.invoices.map((invoice) => invoice.id), documentAt)
}
function roundtrip(state: AppState): AppState {
  const imported = parseBackup(serializeBackup(state))
  assert.deepEqual(imported, state)
  const storage = memoryStorage()
  seedState(imported, storage)
  const loaded = loadState(storage)
  assert.equal(loaded.status, 'ready')
  if (loaded.status === 'ready') assert.deepEqual(loaded.state, state)
  return imported
}

test('AP2: gemeinsame Basis erzeugt zwei gespeicherte unabhängige Entwürfe ohne Empfänger-/Textübernahme', () => {
  const state = duoFamily(), before = structuredClone(state)
  const result = createDuoDrafts(state, ['s-a', 's-b'], duoLesson, undefined, documentAt)
  assert.deepEqual(state, before)
  assert.equal(result.duoGroups!.length, 1)
  assert.equal(new Set(result.invoices.flatMap((invoice) => [invoice.id, ...invoice.items.map((item) => item.id)])).size, 4)
  assert.equal(result.documentVersions.length, 0)
  assert.deepEqual(result.counters, {})
  result.invoices.forEach((invoice, index) => {
    assert.deepEqual(invoice.studentIds, [index === 0 ? 's-a' : 's-b'])
    assert.deepEqual(invoice.guardianIds, [])
    assert.equal(invoice.recipientStrategy, 'joint')
    assert.equal(invoice.items[0].unitPrice, state.settings.duoRate)
    assert.equal(invoice.items[0].lessonType, 'duo')
    assert.equal(invoice.introText + invoice.freeText + invoice.legalText, '')
    assert.equal(invoice.number, null)
  })
  roundtrip(result)
  assert.throws(() => createDuoDrafts(state, ['s-a', 's-a'], duoLesson), /verschiedene/)
  assert.throws(() => createDuoDrafts(state, ['s-a', 's-b'], duoLesson, undefined, documentAt, () => 'collision'), /eindeutige|doppelt/)
})

test('AP2: eigener Preis, exakte Cent-Summe und ausdrücklicher Gruppenbetrag ohne Halbierung', () => {
  const state = duoDrafts(), group = state.duoGroups![0]
  assert.deepEqual(state.invoices.map(invoiceTotalCents), [758, 1502])
  assert.equal(previewDuo(state, group.id).totalCents, 2260)
  for (const total of [2259, 2261]) {
    const wrong = setDuoTotal(state, group.id, total), before = structuredClone(wrong)
    assert.match(previewDuo(wrong, group.id).errors.join(' '), /Differenz -?0,01/)
    assert.throws(() => finish(wrong), /Differenz/)
    assert.deepEqual(wrong, before)
  }
  const issued = finish(setDuoTotal(state, group.id, 2260))
  assert.deepEqual(issued.invoices.map((invoice) => invoice.number), ['2026-aur-0001', '2026-bas-0001'])
  assert.equal(issued.documentVersions.length, 2)
  assert.equal(new Set(issued.invoices.map((invoice) => invoice.versionId)).size, 2)
  assert.equal(issued.invoiceAdministration.length, 2)
  assert.equal(activeInvoices(issued).length, 2)
  assert.deepEqual(issued.documentVersions.map((version) => version.amounts.totalCents), [758, 1502])
  assert.equal(groupCentsInput('22,60'), 2260)
  assert.equal(groupCentsInput(''), undefined)
  assert.throws(() => groupCentsInput('22.601'), /Nachkommastellen/)
  assert.throws(() => groupCentsInput('-1'), /Eurobetrag/)
  roundtrip(issued)
})

test('AP2: Vorschau und Abschluss teilen Snapshots; Einzelabschluss, ungeprüfte Preise und veraltete Vorschau gesperrt', () => {
  const state = duoDrafts(), group = state.duoGroups![0], preview = previewDuo(state, group.id)
  assert.deepEqual(preview.errors, [])
  assert.throws(() => finalizeDuoGroup(state, group.id, preview.token, []), /Preis/)
  assert.throws(() => finalizeDuoGroup(state, group.id, preview.token, [preview.invoices[0].id, preview.invoices[0].id]), /Preis/)
  assert.throws(() => changeInvoiceStatus(state, state.invoices[0].id, 'sent'), /gemeinsamen Vorschau/)
  assert.throws(() => saveInvoiceDraft(state, editable(state.invoices[0]), true), /gemeinsamen Vorschau/)
  const changed = structuredClone(state)
  changed.settings.issuer.street = 'Neue Anschrift 77'
  assert.throws(() => finalizeDuoGroup(changed, group.id, preview.token, preview.invoices.map((invoice) => invoice.id)), /nicht mehr aktuell/)
  const issued = finish(state)
  issued.invoices.forEach((invoice, index) => {
    assert.deepEqual(invoice.snapshot, preview.invoices[index].snapshot)
    assert.deepEqual(invoice.snapshot, snapshotFor(state, state.invoices[index]))
    assert.deepEqual(invoice.items, preview.invoices[index].items)
  })
  assert.throws(() => finish(issued), /Finalisierte/)
  const before = structuredClone(state)
  assert.throws(() => finalizeDuoGroup(state, group.id, preview.token, preview.invoices.map((invoice) => invoice.id), documentAt, () => 'same-version'), /eindeutige Identität/)
  assert.deepEqual(state, before)
})

test('AP2: zwei Lernende, ausdrückliche Empfänger, vollständige Ziele und gemeinsame Haushalte werden geprüft', () => {
  const state = duoDrafts()
  for (const mutate of [
    (next: AppState) => { next.invoices[1].guardianIds = [] },
    (next: AppState) => { next.invoices[1].studentIds = ['s-a']; next.invoices[1].items[0].studentId = 's-a' },
    (next: AppState) => { next.invoices[1].items[0].description = '' },
    (next: AppState) => { next.guardians[1].address.street = '' },
    (next: AppState) => { next.settings.iban = '' },
  ]) {
    const next = structuredClone(state)
    mutate(next)
    const before = structuredClone(next)
    assert.throws(() => finish(next))
    assert.deepEqual(next, before)
    assert.deepEqual(next.counters, {})
  }
  const shared = duoFamily()
  shared.students[1].guardianIds.push('g-a')
  assert.throws(() => createDuoDrafts(shared, ['s-a', 's-b'], duoLesson), /gemeinsame Rechnung/)
  // The existing joint case still creates exactly one claim.
  const single = editable(state.invoices[0]); delete single.id
  single.studentIds.push('s-b')
  const joint = saveInvoiceDraft(shared, single, true, documentAt)
  assert.equal(activeInvoices(joint).length, 1)
  assert.equal(joint.documentVersions.length, 1)
})

test('AP2: Basisänderung nur nach gebundener Differenzbestätigung, individuelle Angaben bleiben erhalten', () => {
  const state = duoDrafts(), group = state.duoGroups![0]
  const lesson = { ...duoLesson, description: 'Neue neutrale Leistung', serviceDate: '2026-09-26', quantity: 1 }
  const review = previewDuoLessonChange(state, group.id, lesson)
  assert.equal(review.differences.length, 6)
  assert.throws(() => applyDuoLessonChange(state, group.id, lesson, review.token, false), /bestätigen/)
  assert.throws(() => applyDuoLessonChange(state, group.id, { ...lesson, quantity: 2 }, review.token, true), /erneut/)
  const result = applyDuoLessonChange(state, group.id, lesson, review.token, true, '2026-09-25T12:00:00.000Z')
  result.invoices.forEach((invoice, i) => {
    assert.deepEqual(invoice.guardianIds, state.invoices[i].guardianIds)
    assert.equal(invoice.items[0].unitPrice, state.invoices[i].items[0].unitPrice)
    assert.equal(invoice.introText, state.invoices[i].introText)
    assert.equal(invoice.freeText, state.invoices[i].freeText)
    assert.equal(invoice.legalText, state.invoices[i].legalText)
    assert.equal(invoice.items[0].description, lesson.description)
    assert.equal(invoice.updatedAt, '2026-09-25T12:00:00.000Z')
    assert.equal(invoice.createdAt, state.invoices[i].createdAt)
  })
  roundtrip(result)
  const removed = structuredClone(state); removed.invoices[1].items = []
  assert.throws(() => previewDuoLessonChange(removed, group.id, lesson), /Position wurde entfernt/)
})

test('AP2 Leak: jede Ausgabe enthält nur den eigenen Haushalt, keine Notizen oder Gruppenkennung', () => {
  const state = roundtrip(finish(duoDrafts())), group = state.duoGroups![0]
  state.invoices.forEach((raw, i) => {
    const invoice = selectInvoice(state, raw), own = households[i], foreign = households[1 - i]
    const print = renderToStaticMarkup(createElement(InvoicePrint, { invoice, guardians: state.guardians, students: state.students, settings: state.settings, includeGiroCode: false }))
    const history = renderToStaticMarkup(createElement(DocumentHistory, { state, invoice, onSelect: () => {}, onCorrection: () => {}, onAllocatePayment: () => {}, onResolveConflicts: () => {} }))
    const outputs = [print, history, invoicePdfTitle(invoice, state.students), buildEpcPayload(invoice, state.settings, invoiceTotalCents(invoice) / 100), JSON.stringify(raw.snapshot), JSON.stringify(state.documentVersions[i]), decodeURIComponent(mailtoUrl(invoice, state.guardians, state.students)), invoicesToCsv([invoice], state.guardians, state.students), invoice.introText, invoice.freeText, invoice.legalText, ...invoice.items.map((item) => item.description)]
    assert.ok(print.includes(own.student) && print.includes(own.guardian))
    for (const output of outputs) {
      for (const marker of [foreign.student, foreign.guardian, `-${foreign.code}-`, foreign.intro, foreign.free, foreign.legal, foreign.note, own.note, 'GEHEIM_', group.id]) assert.ok(!output.includes(marker), `Leak ${marker}: ${output}`)
    }
    const csv = invoicesToCsv([invoice], state.guardians, state.students).split('\r\n')
    const headers = csv[0].split(';'), row = csv[1].split(';')
    for (const [column, expected] of [['Empfänger', own.guardian], ['Kind(er)', own.student], ['Korrekturgrund', '']]) {
      const index = headers.findIndex((cell) => cell.includes(column))
      assert.ok(index >= 0)
      assert.equal(row[index], `"${expected}"`)
    }
  })
  assert.ok(serializeBackup(state).includes(households[0].note))
  assert.ok(serializeBackup(state).includes(households[1].note))
  const leak = duoDrafts(); leak.invoices[0].freeText = households[1].student
  assert.throws(() => finish(leak), /anderen Haushalts/)
})

test('AP2: Zahlung nur auf A, Korrektur und Archivierung nur auf B; Kopien und Korrekturen ohne Gruppenbindung', () => {
  let state = finish(duoDrafts())
  const [a, b] = state.invoices
  const bOriginal = structuredClone(b), aOriginal = structuredClone(state.documentVersions[0])
  state = changeInvoiceStatus(state, a.id, 'paid', documentAt, '2026-09-25')
  assert.deepEqual(state.invoices.find((invoice) => invoice.id === b.id), bOriginal)
  assert.equal(state.payments.length, 1)
  assert.equal(state.payments[0].sourceVersionId, a.versionId)
  state = createCorrectionDraft(state, b.id, 'Nur Bastian: Preis berichtigt', documentAt)
  const draft = state.invoices.at(-1)!
  assert.equal(duoForInvoice(state, draft.id), undefined)
  state = saveInvoiceDraft(state, { ...editable(draft), items: draft.items.map((item) => ({ ...item, unitPrice: 25 })) }, true, documentAt)
  assert.deepEqual(state.documentVersions[0], aOriginal)
  assert.equal(activeInvoices(state).length, 2)
  assert.equal(state.payments.length, 1)
  state = archiveInvoice(state, b.id)
  assert.equal(state.invoiceAdministration.find((admin) => admin.versionId === a.versionId)!.archived, false)
  const copy = requireSuccess(prepareInvoiceCopy(state, a.id))
  assert.equal('duoGroupId' in copy, false)
  const csv = invoicesToCsv([selectInvoice(state, state.invoices.at(-1)!)], state.guardians, state.students)
  assert.match(csv, /Nur Bastian/)
  assert.ok(!csv.includes(households[0].student))
  roundtrip(state)
})

test('AP2 Leak: vorhandene Demo-Duos Jonas/Elif und Sophie/Noah übernehmen keine Partnernotizen oder Geschwister', () => {
  for (const names of [['Jonas Schneider', 'Elif Yılmaz'], ['Sophie Hoffmann', 'Noah Wagner']]) {
    let state = createDemoState(new Date('2026-09-25T12:00:00.000Z'))
    const students = names.map((name) => state.students.find((student) => student.name === name)!)
    students.forEach((student, i) => assert.ok(student.note.includes(names[1 - i].split(' ')[0])))
    const originals = structuredClone(state.documentVersions)
    state = createDuoDrafts(state, students.map((student) => student.id), duoLesson, undefined, documentAt)
    const group = state.duoGroups!.at(-1)!
    for (const [i, target] of group.targets.entries()) {
      const draft = editable(state.invoices.find((invoice) => invoice.id === target.invoiceId)!)
      // Deliberate selection of ALL eligible guardians still means one claim per learner.
      draft.guardianIds = [...students[i].guardianIds]
      state = saveInvoiceDraft(state, draft, false, documentAt)
    }
    const preview = previewDuo(state, group.id)
    state = finalizeDuoGroup(state, group.id, preview.token, preview.invoices.map((invoice) => invoice.id), documentAt)
    assert.deepEqual(state.documentVersions.slice(0, originals.length), originals)
    for (const [i, target] of group.targets.entries()) {
      const invoice = selectInvoice(state, state.invoices.find((entry) => entry.id === target.invoiceId)!)
      assert.deepEqual(invoice.snapshot!.students.map((student) => student.name), [names[i]])
      assert.deepEqual(invoice.snapshot!.guardians.map((guardian) => guardian.id), students[i].guardianIds)
      const version = state.documentVersions.find((entry) => entry.id === invoice.versionId)!
      const html = renderToStaticMarkup(createElement(InvoicePrint, { invoice, guardians: state.guardians, students: state.students, settings: state.settings, includeGiroCode: false }))
      for (const output of [html, JSON.stringify(version), invoicePdfTitle(invoice, state.students), decodeURIComponent(mailtoUrl(invoice, state.guardians, state.students)), invoicesToCsv([invoice], state.guardians, state.students)]) {
        assert.ok(!output.includes(names[1 - i]))
        assert.ok(!output.includes(students[i].note))
        assert.ok(!output.includes(group.id))
      }
    }
    roundtrip(state)
  }
})

test('AP2: Löschen oder fehlender Importpartner lässt die andere Rechnung eigenständig bestehen', () => {
  const state = duoDrafts(9999), survivor = structuredClone(state.invoices[1])
  const next = requireSuccess(deleteInvoiceDraftState(state, state.invoices[0].id))
  assert.deepEqual(next.invoices, [survivor])
  assert.throws(() => previewDuo(next, next.duoGroups![0].id), /Partnerentwurf fehlt/)
  const imported = roundtrip(next)
  assert.equal(changeInvoiceStatus(imported, survivor.id, 'sent', documentAt).documentVersions.length, 1)
  const missing = structuredClone(state); missing.invoices.pop()
  assert.equal(roundtrip(missing).invoices.length, 1)
})

test('AP2 Schema 7→8: keine rückwirkenden Gruppen oder Änderungen an historischen Originalen; Roharchiv und Idempotenz', async () => {
  const issued = finish(duoDrafts())
  const legacy: Record<string, unknown> = { ...issued, schemaVersion: 7 }
  delete legacy.duoGroups
  const raw = '\uFEFF' + JSON.stringify(legacy, null, 2) + '\r\n'
  const preview = requireSuccess(inspectImport(raw))
  assert.equal(preview.report?.fromSchema, 7)
  assert.equal(preview.report?.toSchema, 8)
  assert.equal('duoGroups' in preview.state, false)
  assert.deepEqual(preview.state.documentVersions, issued.documentVersions)
  assert.deepEqual(preview.state.invoices, issued.invoices)
  assert.deepEqual(preview.report?.changes, [{ path: 'schemaVersion', before: 7, after: 8, reason: 'Optionaler Duo-Verwaltungsrahmen; keine Gruppen, Texte, Personen oder Preise aus Altbeständen abgeleitet.' }])
  assert.equal(requireSuccess(inspectImport(serializeBackup(preview.state))).report, null)
  const storage = memoryStorage(), session = new StorageSession({ storage, lock: sharedLock() })
  await session.restore(raw)
  const archive = [...storage.entries].find(([key]) => key.includes('-recovery-'))!
  assert.equal(JSON.parse(archive[1]).sourceRaw, raw)
  assert.deepEqual(roundtrip(session.state), preview.state)
  assert.equal(inspectImport(JSON.stringify({ ...legacy, duoGroups: [] })).ok, false)
  assert.equal(inspectImport(JSON.stringify({ ...issued, schemaVersion: 9 })).ok, false)
  for (const mutate of [
    (next: AppState) => { next.duoGroups![0].targets[1].invoiceId = next.duoGroups![0].targets[0].invoiceId },
    (next: AppState) => { next.duoGroups![0].totalCents = .1 },
    (next: AppState) => { Object.assign(next.duoGroups![0], { foreign: true }) },
  ]) {
    const next = structuredClone(issued); mutate(next)
    assert.throws(() => validateBackupState(next))
  }
})

test('AP2 Speicher: Quota/Schreibfehler an jedem lokalen Schritt erzeugt keine Forderung und verbraucht keine Nummer', async () => {
  for (const failure of ['write', 'security-write', PREVIOUS_STORAGE_KEY, STORAGE_KEY]) {
    const state = duoDrafts(), storage = memoryStorage()
    seedState(state, storage)
    const session = new StorageSession({ storage, lock: sharedLock() }), before = storage.getItem(STORAGE_KEY)
    storage.fail = failure
    await assert.rejects(session.change(finish))
    assert.equal(storage.getItem(STORAGE_KEY), before)
    assert.deepEqual(session.state, state)
    assert.deepEqual(new StorageSession({ storage, lock: sharedLock() }).state, state)
    storage.fail = null
    await session.change(finish)
    assert.equal(session.state.documentVersions.length, 2)
    assert.deepEqual(session.state.invoices.map((invoice) => invoice.sequence), [1, 1])
  }
})

test('AP2 Speicher: zwei Tabs, Validierungsfehler und Doppelklick sind atomar', async () => {
  const state = duoDrafts(), storage = memoryStorage(), lock = sharedLock()
  seedState(state, storage)
  const a = new StorageSession({ storage, lock }), b = new StorageSession({ storage, lock })
  const before = storage.getItem(STORAGE_KEY)
  await assert.rejects(a.change((current) => { current.invoices[1].guardianIds = []; return finish(current) }))
  assert.equal(storage.getItem(STORAGE_KEY), before)
  assert.deepEqual(a.state, state)
  const outcomes = await Promise.allSettled([a.change(finish), a.change(finish)])
  assert.deepEqual(outcomes.map((result) => result.status), ['fulfilled', 'rejected'])
  await assert.rejects(b.change(finish), /anderen Tab/)
  assert.equal(a.state.documentVersions.length, 2)
  assert.equal(a.revision!.revision, 2)
  assert.deepEqual(a.state.invoices.map((invoice) => invoice.sequence), [1, 1])
  assert.deepEqual(b.state, state)
})
