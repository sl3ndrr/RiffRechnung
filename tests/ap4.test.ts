import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { selectInvoice } from '../src/lib/documents'
import { createCorrectionDraft } from '../src/lib/documents'
import { saveInvoiceDraft } from '../src/lib/invoiceActions'
import { hasPossibleTaxNotice, SMALL_BUSINESS_TAX_NOTICE, TAX_IDENTIFIER_LABELS } from '../src/lib/invoiceProfile'
import { inspectImport } from '../src/lib/importState'
import { serializeBackup } from '../src/lib/storage'
import { invoiceFinalizationErrors } from '../src/lib/utils'
import { validateBackupState } from '../src/lib/validation'
import { requireSuccess } from '../src/lib/result'
import type { AppState, InvoiceDraft, InvoiceKind, TaxNoticePosition } from '../src/types'
import { documentAt, documentDraft, documentFamily } from './documentFixtures'

test('AP4 Charakterisierung vor dem Umbau: Altbeleg ohne Ausgabeoptionen behält Kennung, Hinweis und Rechtstext in Druckreihenfolge', () => {
  const state = saveInvoiceDraft(documentFamily(), { ...documentDraft(), legalText: 'Historischer Rechtstext' }, true, documentAt)
  const invoice = selectInvoice(state, state.invoices[0])
  assert.equal(invoice.invoiceKind, undefined)
  const markup = renderToStaticMarkup(createElement(InvoicePrint, {
    invoice, guardians: state.guardians, students: state.students, settings: state.settings,
  }))
  assert.match(markup, /<section class="invoice-tax-data" aria-label="Steuerliche Angaben"><p><strong>Steuernummer:<\/strong> 12\/345\/67890<\/p><p>Steuerbefreiung für Kleinunternehmer \(§ 19 UStG\)\.<\/p><\/section>/)
  const renderedText = markup.replace(/<style[^>]*>[\s\S]*?<\/style>/gu, '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ')
  assert.match(renderedText, /Summe .*7,58.*Steuernummer: 12\/345\/67890 Steuerbefreiung für Kleinunternehmer \(§ 19 UStG\)\. Bitte überweisen Sie/)
  assert.match(renderedText, /Historischer Rechtstext Rechnung /)
  assert.equal(renderedText.split('Steuerbefreiung für Kleinunternehmer (§ 19 UStG).').length - 1, 1)
})

function ap4Draft(price: number, invoiceKind: InvoiceKind, showIdentifier: boolean, noticePosition: TaxNoticePosition = 'tax-block', showNoticeInDraft = true): InvoiceDraft {
  const draft = documentDraft()
  return {
    ...draft, invoiceKind, taxPresentation: { showIdentifier, noticePosition, showNoticeInDraft },
    items: [{ ...draft.items[0], quantity: 1, unitPrice: price }],
    legalText: 'Individueller Rechtstext',
  }
}

function printedText(state: AppState): string {
  const invoice = selectInvoice(state, state.invoices[0])
  return renderToStaticMarkup(createElement(InvoicePrint, {
    invoice, guardians: state.guardians, students: state.students, settings: state.settings,
  })).replace(/<style[^>]*>[\s\S]*?<\/style>/gu, '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ')
}

test('AP4: 249,99/250,00 ohne Kennung, 250,01 gesperrt; Hinweis bleibt genau einmal', () => {
  for (const price of [249.99, 250]) {
    const state = documentFamily()
    state.settings.taxIdentifier.value = ''
    const issued = saveInvoiceDraft(state, ap4Draft(price, 'small-amount', false), true, documentAt)
    const output = issued.documentVersions[0].outputSnapshot.taxOutput
    assert.deepEqual(output, { identifier: null, noticeText: SMALL_BUSINESS_TAX_NOTICE, noticePosition: 'tax-block' })
    assert.equal(printedText(issued).split(SMALL_BUSINESS_TAX_NOTICE).length - 1, 1)
    assert.doesNotMatch(printedText(issued), /Steuernummer:/)
    assert.equal(issued.documentVersions[0].amounts.totalCents, Math.round(price * 100))
  }
  const state = documentFamily()
  state.settings.taxIdentifier.value = ''
  assert.match(invoiceFinalizationErrors(state, ap4Draft(250.01, 'small-amount', false)).join(' '), /Standardrechnung erforderlich/)
  assert.throws(() => saveInvoiceDraft(state, ap4Draft(250.01, 'small-amount', false), true, documentAt), /Standardrechnung erforderlich/)
  assert.deepEqual(state.counters, {})
})

test('AP4: Standard verlangt Ausgabe und für jeden Kennungstyp eine gefüllte Feldangabe', () => {
  for (const kind of ['tax-number', 'vat-id', 'small-business-id'] as const) {
    const state = documentFamily()
    state.settings.taxIdentifier = { kind, value: '' }
    const errors = invoiceFinalizationErrors(state, ap4Draft(30, 'standard', false)).join(' ')
    assert.match(errors, /Standardrechnung: Steuerkennung ausgeben ist Pflicht/)
    assert.ok(errors.includes(TAX_IDENTIFIER_LABELS[kind]), errors)
    assert.match(errors, /Steuerliche Identifikationsangabe fehlt/)
    assert.throws(() => saveInvoiceDraft(state, ap4Draft(30, 'standard', true), true, documentAt), /Steuerliche Identifikationsangabe fehlt/)
  }
})

test('AP4: Block und Fußzeile frieren Ausgabe und Text ein, gespeicherte Einstellungen ändern keinen Alt-PDF-Text', () => {
  for (const noticePosition of ['tax-block', 'footer'] as const) {
    const issued = saveInvoiceDraft(documentFamily(), ap4Draft(30, 'standard', true, noticePosition), true, documentAt)
    const version = issued.documentVersions[0]
    assert.deepEqual(version.content.taxPresentation, { showIdentifier: true, showNoticeInDraft: true, noticePosition })
    assert.deepEqual(version.outputSnapshot.taxOutput, {
      identifier: { kind: 'tax-number', value: '12/345/67890' },
      noticeText: SMALL_BUSINESS_TAX_NOTICE, noticePosition,
    })
    const original = printedText(issued)
    assert.equal(original.split(SMALL_BUSINESS_TAX_NOTICE).length - 1, 1)
    assert.match(original, /Steuernummer: 12\/345\/67890/)
    if (noticePosition === 'footer') assert.match(original, /Individueller Rechtstext Steuerbefreiung/)
    issued.settings.taxIdentifier = { kind: 'vat-id', value: 'DE-SPAETER' }
    issued.settings.defaultLegalText = 'Späterer Vorgabetext'
    assert.equal(printedText(issued), original)
    assert.doesNotMatch(original, /DE-SPAETER|Späterer Vorgabetext/)
    const restored = requireSuccess(inspectImport(serializeBackup(issued)))
    assert.equal(restored.report, null)
    assert.deepEqual(restored.state.documentVersions[0].outputSnapshot.taxOutput, version.outputSnapshot.taxOutput)
    assert.equal(printedText(restored.state), original)
    const tampered = structuredClone(issued)
    delete tampered.documentVersions[0].outputSnapshot.taxOutput
    assert.throws(() => validateBackupState(tampered), /taxOutput|outputSnapshot/)
  }
})

test('AP4: Entwurf blendet beide Angaben aus, finaler Beleg nie den Befreiungshinweis', () => {
  const state = documentFamily()
  const draft = ap4Draft(30, 'small-amount', false, 'footer', false)
  const saved = saveInvoiceDraft(state, draft, false, documentAt)
  assert.deepEqual(saved.invoices[0].draftPrintSnapshot?.taxOutput, { identifier: null, noticeText: null, noticePosition: 'footer' })
  assert.match(printedText(saved), /ENTWURF/)
  assert.doesNotMatch(printedText(saved), /Steuernummer:|Steuerbefreiung für Kleinunternehmer/)
  const issued = saveInvoiceDraft(saved, { ...draft, id: saved.invoices[0].id }, true, documentAt)
  assert.equal(issued.invoices[0].snapshot?.taxOutput?.noticeText, SMALL_BUSINESS_TAX_NOTICE)
  assert.equal(printedText(issued).split(SMALL_BUSINESS_TAX_NOTICE).length - 1, 1)
})

test('AP4: Korrektur über der Kleinbetragsgrenze prüft erneut; Warnung verändert keinen Fußzeilentext', () => {
  const issued = saveInvoiceDraft(documentFamily(), ap4Draft(250, 'small-amount', false), true, documentAt)
  const corrected = createCorrectionDraft(issued, issued.invoices[0].id, 'Synthetische Korrektur', documentAt)
  const correction = corrected.invoices.find((invoice) => invoice.status === 'draft')!
  const changed: InvoiceDraft = {
    ...ap4Draft(250.01, 'small-amount', false), id: correction.id, correction: correction.correction,
    items: correction.items.map((item) => ({ ...item, quantity: 1, unitPrice: 250.01 })),
  }
  assert.throws(() => saveInvoiceDraft(corrected, changed, true, documentAt), /Standardrechnung erforderlich/)
  assert.equal(corrected.documentVersions.length, 1)
  assert.equal(hasPossibleTaxNotice('Eigener § 19 UStG Text'), true)
  assert.equal(hasPossibleTaxNotice('Kleinunternehmerregelung'), true)
  assert.equal(hasPossibleTaxNotice('Individueller Rechtstext'), false)
  assert.equal(documentFamily().settings.defaultLegalText, '')
})
