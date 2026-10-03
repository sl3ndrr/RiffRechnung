import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppState } from '../src/types'
import { InvoicePrint } from '../src/components/InvoicePrint'
import { selectInvoice } from '../src/lib/documents'
import { resolveGiroCode } from '../src/lib/printJob'
import { p11Cases, p11State } from './p11PrintFixtures'

function print(state: AppState): string {
  return renderToStaticMarkup(createElement(InvoicePrint, {
    invoice: selectInvoice(state, state.invoices[0]), guardians: state.guardians,
    students: state.students, settings: state.settings, includeGiroCode: false,
  }))
}

test('P11: jeder Empfänger behält seine eigene vorhandene Anschrift, auch identisch oder unvollständig', () => {
  for (const example of p11Cases) {
    const state = p11State(example), version = state.documentVersions[0], output = print(state)
    const addresses = [...output.matchAll(/<div class="invoice-address">(.*?)<\/div>/g)].map((match) => match[1])
    assert.equal(state.invoices.length, 1)
    assert.equal(state.documentVersions.length, 1)
    assert.equal(addresses.length, version.outputSnapshot.recipients.length)
    version.outputSnapshot.recipients.forEach((recipient, i) => {
      assert.ok(addresses[i].includes(`<strong>${recipient.name}</strong>`))
      if (recipient.street) assert.ok(addresses[i].includes(`<span>${recipient.street}</span>`))
      const place = [recipient.postalCode, recipient.city].filter(Boolean).join(' ')
      if (place) assert.ok(addresses[i].includes(`<span>${place}</span>`))
      if (!recipient.street && !place) assert.equal(addresses[i], `<strong>${recipient.name}</strong>`)
    })
    assert.doesNotMatch(output, /Zwischensumme|invoice-group|invoice-subtotal|invoice-item-row--tint|Seitenzahl im Seitenrand|Kein GiroCode|Ohne GiroCode|>–</)
    assert.equal((output.match(/class="invoice-address invoice-issuer"/g) ?? []).length, 1)
    assert.equal((output.match(/Privatrechnung/g) ?? []).length, 1)
    assert.doesNotMatch(output, /<dt>BIC:<\/dt>|<dt>Bank:<\/dt>|Vielen Dank|Sehr geehrte/)
  }
})

test('P11: einfache Tabelle erhält Personen, Einzelmengen und Einheiten; Endsumme summiert ausschließlich Geld', () => {
  const state = p11State('zwei-anschriften'), output = print(state)
  const rows = [...output.matchAll(/<tr class="invoice-item-row">(.*?)<\/tr>/g)].map((match) => match[1])
  assert.equal(rows.length, 3)
  for (const [i, name] of ['Testkind A', 'Testkind B', 'Testkind A'].entries()) assert.ok(rows[i].includes(name))
  for (const [i, quantity] of ['0,75 Std.', '2 Pauschale', '3 Stück'].entries()) assert.ok(rows[i].includes(quantity))
  assert.equal(state.documentVersions[0].amounts.totalCents, 3858)
  assert.match(output, /<tr class="invoice-total-row"><td colSpan="4">Summe<\/td><td>38,58.*?<\/td><\/tr><tr class="invoice-private-row">/)
})

test('P11: Wiederausgabe und GiroCode verwenden ausschließlich eingefrorene Nummer, Beträge, Empfänger und Konto', () => {
  const state = p11State('zwei-anschriften'), original = print(state)
  const selected = selectInvoice(state, state.invoices[0])
  const code = resolveGiroCode(selected, state.settings, true)
  assert.equal(code.kind, 'ready')
  if (code.kind !== 'ready') throw new Error('GiroCode fehlt')
  assert.match(code.payload, /EUR38\.58/)
  state.settings.issuer.name = 'HEUTIGER ABSENDER'
  Object.assign(state.settings, { accountHolder: 'HEUTIGES KONTO', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bankName: 'HEUTIGE BANK', defaultLegalText: 'ALTER RECHTSTEXT' })
  state.guardians.forEach((person) => { person.name = 'HEUTIGER EMPFÄNGER'; person.address.street = 'HEUTIGE ANSCHRIFT' })
  state.students.forEach((person) => { person.name = 'HEUTIGE LERNENDE' })
  state.invoices[0].items[0].unitPrice = 999
  state.invoices[0].number = 'HEUTIGE NUMMER'
  Object.assign(state.invoices[0], { introText: 'ALTE EINLEITUNG', legalText: 'ALTER RECHTSTEXT' })
  assert.equal(print(state), original)
  assert.deepEqual(resolveGiroCode(selectInvoice(state, state.invoices[0]), state.settings, true), code)
})

test('P11: historische leere Kontodaten bleiben leer; vorhandene BIC und Bank werden kompakt ausgegeben', () => {
  const state = p11State('ein-empfaenger'), snapshot = state.documentVersions[0].outputSnapshot
  snapshot.bic = 'BYLADEM1001'; snapshot.bankName = 'Synthetische Bank'
  assert.match(print(state), /BIC:<\/dt><dd class="mono">BYLADEM1001/)
  assert.match(print(state), /Bank:<\/dt><dd>Synthetische Bank/)
  Object.assign(snapshot, { accountHolder: '', iban: '', bic: '', bankName: '' })
  Object.assign(state.settings, { accountHolder: 'AKTUELLES KONTO', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bankName: 'AKTUELLE BANK' })
  assert.doesNotMatch(print(state), /Kontoinhaber:|IBAN:|BIC:|Bank:|AKTUELLE|DE89|>–</)
  assert.equal(resolveGiroCode(selectInvoice(state, state.invoices[0]), state.settings, true).kind, 'unavailable')
})

test('P11: lückenhafte historische Lernendennamen erzeugen keine leere Zeile und keine heutige Ergänzung', () => {
  const state = p11State('zwei-anschriften')
  state.documentVersions[0].outputSnapshot.students = [state.documentVersions[0].outputSnapshot.students[0]]
  state.students[1].name = 'HEUTIGE ERGÄNZUNG'
  const output = print(state)
  assert.match(output, /class="invoice-item-student">Testkind A<\/span>/)
  assert.doesNotMatch(output, /HEUTIGE ERGÄNZUNG|class="invoice-item-student"><\/span>|Unterricht für:/)
})
