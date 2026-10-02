import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { documentAt, documentDraft, documentFamily, editable } from './documentFixtures'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { prepareInvoiceCopy } from '../src/lib/commands'
import { createCorrectionDraft, selectInvoice } from '../src/lib/documents'
import { inspectImport, serializeMigrationReport } from '../src/lib/importState'
import { requireSuccess } from '../src/lib/result'
import { assertOriginalsPreserved } from '../src/lib/safety'
import { canonical } from '../src/lib/envelope'
import { stripLegacyTaxFields } from '../src/lib/legacyTaxFields'
import { StorageSession, STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_GUARD_KEY, serializeBackup } from '../src/lib/storage'
import { memoryStorage, sharedLock } from './storageHarness'
import { validateBackupState } from '../src/lib/validation'
import { invoiceSetupErrors } from '../src/lib/invoiceSetup'
import type { AppState } from '../src/types'

function print(state: AppState): string {
  return renderToStaticMarkup(createElement(InvoicePrint, { invoice: selectInvoice(state, state.invoices[0]), guardians: state.guardians, students: state.students, settings: state.settings }))
}

function oldTaxStock() {
  const issued = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  const stock = saveInvoiceDraft(issued, { ...documentDraft(), items: documentDraft().items.map((item) => ({ ...item, id: 'historical-draft-item' })) }, false, documentAt)
  const old = JSON.parse(JSON.stringify(stock))
  old.schemaVersion = 8
  old.settings.invoiceProfile = 'small-business'
  old.settings.taxIdentifier = { kind: 'tax-number', value: 'SYNTHETIC-TAX-SECRET' }
  const addSnapshot = (snapshot: Record<string, unknown>) => Object.assign(snapshot, {
    invoiceProfile: 'small-business', taxIdentifier: old.settings.taxIdentifier, invoiceKind: 'standard',
    taxOutput: { identifier: old.settings.taxIdentifier, noticeText: 'SYNTHETIC-TAX-NOTICE', noticePosition: 'footer' },
  })
  old.invoices[0].invoiceKind = 'standard'
  old.invoices[0].taxPresentation = { showIdentifier: true, showIdentifierInDraft: false, showNoticeInDraft: false, noticePosition: 'footer' }
  addSnapshot(old.invoices[0].snapshot)
  old.invoices[0].introText = 'Eigene Einleitung zu § 19'
  old.invoices[0].freeText = 'Eigener Kleinunternehmertext bleibt unverändert'
  old.invoices[0].legalText = 'Eigener Rechtstext zu § 19'
  old.invoices[0].snapshot.legalText = old.invoices[0].legalText
  old.documentVersions[0].outputLegalText = old.invoices[0].legalText
  old.documentVersions[0].outputSnapshot.legalText = old.invoices[0].legalText
  old.invoices[1].invoiceKind = 'small-amount'
  old.invoices[1].taxPresentation = old.invoices[0].taxPresentation
  addSnapshot(old.invoices[1].draftPrintSnapshot)
  old.documentVersions[0].content = structuredClone(old.invoices[0])
  for (const key of ['status', 'paidAt', 'sentAt', 'updatedAt', 'versionId']) delete old.documentVersions[0].content[key]
  addSnapshot(old.documentVersions[0].outputSnapshot)
  const event = { id: 'old-tax-snapshot', at: documentAt, label: 'Historische Snapshot-Korrektur', entityType: 'invoice', entityId: old.invoices[0].id,
    snapshotCorrection: { oldValue: structuredClone(old.invoices[0].snapshot), newValue: structuredClone(old.invoices[0].snapshot) } }
  old.audit.push(event)
  old.historicalSnapshotCorrections.push(event)
  old.documentVersions[0].snapshotHistory.push(event)
  old.documentVersions[0].conflicts.push({ path: 'snapshot', message: 'Historische Snapshot-Differenz', values: [JSON.stringify(old.invoices[0].snapshot)] })
  old.documentVersions[0].conflicts.push({ path: 'snapshot.taxIdentifier', message: 'Steuerkennung', values: ['SYNTHETIC-TAX-SECRET'] })
  return old
}

test('P01: unter, bei und über 250 Euro ohne Anschriften derselbe Abschluss; genau eine Privatzeile', () => {
  for (const price of [249.99, 250, 250.01]) {
    const state = documentFamily()
    state.settings.issuer.street = ''; state.settings.issuer.postalCode = ''; state.settings.issuer.city = ''
    state.guardians.forEach((guardian) => { guardian.address = { street: '', postalCode: '', city: '' } })
    const draft = { ...documentDraft(), legalText: '', items: documentDraft().items.map((item) => ({ ...item, quantity: 1, unitPrice: price })) }
    for (const finalize of [false, true]) {
      const result = saveInvoiceDraft(state, draft, finalize, documentAt)
      validateBackupState(result)
      const output = print(result)
      assert.equal(output.split('Privatrechnung').length - 1, 1)
      assert.match(output, /<tbody class="invoice-final-rows"><tr class="invoice-total-row">.*?<\/tr><tr class="invoice-private-row"><td colSpan="5">Privatrechnung<\/td><\/tr><\/tbody>/)
      assert.doesNotMatch(output, /Steuernummer|Steuerbefreiung|Kleinbetragsrechnung|Steuerliche Angaben/)
      if (finalize) assert.equal(result.documentVersions[0].amounts.totalCents, Math.round(price * 100))
    }
  }
})

test('P01: beide gemeinsamen Empfängeranschriften, GiroCode-Daten und Namen bleiben erhalten', () => {
  const issued = saveInvoiceDraft(documentFamily(), { ...documentDraft(), guardianIds: ['g-a', 'g-b'] }, true, documentAt)
  const output = print(issued)
  for (const text of ['Empfaenger A', 'Empfaenger B', 'Testweg 2', 'Testweg 3', 'DE02 1203 0000 0000 2020 51']) assert.ok(output.includes(text), text)
  const incomplete = structuredClone(issued.settings)
  incomplete.issuer.name = ''; incomplete.iban = ''
  assert.ok(invoiceSetupErrors(incomplete).some((error) => error.field === 'settings.issuer.name'))
  assert.ok(invoiceSetupErrors(incomplete).some((error) => error.field === 'settings.iban'))
})

test('P01: 8→9 entfernt nur benannte Steuerfelder und Steuer-Konfliktbelege; Quelle und Freitexte bleiben gleich', () => {
  const old = oldTaxStock(), raw = JSON.stringify(old)
  const preview = requireSuccess(inspectImport(raw))
  assert.equal(preview.report?.fromSchema, 8); assert.equal(preview.report?.toSchema, 9)
  assert.deepEqual(preview.state, { ...stripLegacyTaxFields(old).value, schemaVersion: 9 })
  assert.equal(JSON.stringify(old), raw)
  assert.equal(preview.rawData, raw)
  assert.doesNotMatch(serializeBackup(preview.state), /SYNTHETIC-TAX-SECRET|SYNTHETIC-TAX-NOTICE/)
  assert.doesNotMatch(serializeMigrationReport(preview), /SYNTHETIC-TAX-SECRET|SYNTHETIC-TAX-NOTICE/)
  assert.equal(print(preview.state).split('Privatrechnung').length - 1, 1)
  assert.equal(requireSuccess(inspectImport(JSON.stringify(preview.state))).report, null)
  for (const modify of [(state: AppState) => { state.invoices[0].items[0].unitPrice++ }, (state: AppState) => { state.documentVersions[0].outputSnapshot.iban = 'ANDERS' }]) {
    const next = structuredClone(preview.state); modify(next)
    assert.throws(() => assertOriginalsPreserved(preview.state, next))
  }
  const illegal = structuredClone(preview.state)
  Object.assign(illegal.settings, { taxIdentifier: old.settings.taxIdentifier })
  assert.throws(() => validateBackupState(illegal), /taxIdentifier/)
})

test('P01: unveränderte historische Gold-Quelle wird bereinigt; Nichtsteuerdaten bleiben gleich', () => {
  const raw = readFileSync('tests/fixtures/schema7-audit.json', 'utf8')
  const root = JSON.parse(raw)
  for (const source of [root.issuedCorrected, root.oldestSeparate]) {
    const preview = requireSuccess(inspectImport(JSON.stringify(source)))
    assert.deepEqual(preview.state, { ...stripLegacyTaxFields(source).value, schemaVersion: 9 })
    assert.doesNotMatch(serializeBackup(preview.state), /"(?:invoiceProfile|taxIdentifier|invoiceKind|taxPresentation|taxOutput)"\s*:/)
  }
})

test('P01: Kopie und Korrektur führen keine Steuerfelder wieder ein; Originalschutz bleibt streng', () => {
  const source = requireSuccess(inspectImport(JSON.stringify(oldTaxStock()))).state
  const version = source.documentVersions[0]
  // Resolve the retained, non-tax snapshot evidence through the existing administration path.
  source.invoiceAdministration[0].resolutions.push({ at: documentAt, reason: 'Historische Differenz geprüft' })
  const copy = requireSuccess(prepareInvoiceCopy(source, source.invoices[0].id))
  const saved = saveInvoiceDraft(source, copy, false, documentAt)
  const corrected = createCorrectionDraft(saved, source.invoices[0].id, 'Preisberichtigung', documentAt)
  const correction = corrected.invoices.find((invoice) => invoice.correction)!
  const finalized = saveInvoiceDraft(corrected, editable(correction), true, documentAt)
  assertOriginalsPreserved(source, finalized)
  assert.equal(canonical(finalized.documentVersions[0]), canonical(version))
  assert.doesNotMatch(serializeBackup(finalized), /"(?:invoiceProfile|taxIdentifier|invoiceKind|taxPresentation|taxOutput)"\s*:/)
})

test('P01: erfolgreiche Übernahme bereinigt Hauptbestand, Vorgänger, Legacy-Schlüssel und interne Archive', async () => {
  const storage = memoryStorage(), raw = JSON.stringify(oldTaxStock())
  for (const key of [STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY]) storage.setItem(key, raw)
  storage.setItem(LEGACY_GUARD_KEY, JSON.stringify(raw))
  storage.setItem(`${STORAGE_KEY}-recovery-old`, JSON.stringify({ previousRaw: raw, legacyRaw: raw, sourceRaw: raw,
    report: { changes: [{ path: 'settings.taxIdentifier', before: 'SYNTHETIC-TAX-SECRET', after: 'SYNTHETIC-TAX-SECRET' }, { path: 'documentVersions.version-old', before: null, after: oldTaxStock().documentVersions[0] }] } }))
  const session = new StorageSession({ storage, lock: sharedLock() })
  assert.equal(session.initial.status, 'recovery')
  await session.restore(raw)
  for (const [key, value] of storage.entries) assert.doesNotMatch(value, /SYNTHETIC-TAX-SECRET|SYNTHETIC-TAX-NOTICE/, key)
  assert.doesNotMatch(session.exportRecoveryArchive(), /SYNTHETIC-TAX-SECRET|SYNTHETIC-TAX-NOTICE/)
  assert.equal(new StorageSession({ storage, lock: sharedLock() }).state.schemaVersion, 9)
})

test('P01: fehlgeschlagene Speicherung und unlesbare Nebenstruktur lassen alle Ausgangsschlüssel unverändert', async () => {
  for (const failing of [STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_GUARD_KEY, 'security-write']) {
    const storage = memoryStorage(), raw = JSON.stringify(oldTaxStock())
    storage.setItem(STORAGE_KEY, raw); storage.setItem(PREVIOUS_STORAGE_KEY, raw)
    storage.setItem(LEGACY_STORAGE_KEY, raw); storage.setItem(LEGACY_GUARD_KEY, JSON.stringify(raw))
    const before = [...storage.entries]
    const session = new StorageSession({ storage, lock: sharedLock() }); storage.fail = failing
    await assert.rejects(session.restore(raw))
    assert.deepEqual([...storage.entries], before)
  }
  const storage = memoryStorage(), raw = JSON.stringify(oldTaxStock())
  storage.setItem(STORAGE_KEY, raw); storage.setItem(`${STORAGE_KEY}-recovery-broken`, '{"taxIdentifier":"SYNTHETIC-TAX-SECRET",beschädigt')
  const before = [...storage.entries]
  await assert.rejects(new StorageSession({ storage, lock: sharedLock() }).restore(raw), /nicht lesbar/)
  assert.deepEqual([...storage.entries], before)
})
