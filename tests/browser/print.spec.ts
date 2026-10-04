import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readdir, writeFile } from 'node:fs/promises'
import type { AppState, InvoiceDraft } from '../../src/types'
import { documentAt, documentDraft, documentFamily } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { serializeBackup } from '../../src/lib/storage'
import { buildEpcPayload } from '../../src/lib/paymentData'
import { invoiceTotal } from '../../src/lib/money'
import { selectInvoice } from '../../src/lib/documents'
import { euro } from '../../src/lib/utils'
import { p11Cases, p11State } from '../p11PrintFixtures'
import { monthlyPrintState } from '../invoicePrintFixtures'

async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const storageModule = '/src/lib/storage.ts'
    const { StorageSession } = await import(storageModule)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
}

function printableState(itemCount: number, freeText = ''): AppState {
  const state = documentFamily()
  state.guardians[0] = {
    ...state.guardians[0],


    name: 'Familie mit einem außergewöhnlich langen, mehrteiligen Namen für den echten Seitenumbruch',
    address: {
      street: 'Sehr langer Straßenname mit mehreren eindeutig lesbaren Bestandteilen und Hausnummer 12345',
      postalCode: '12345',
      city: 'Eine Stadt mit einem langen zusammengesetzten Ortsnamen',
    },
  }
  const base = documentDraft()
  const draft: InvoiceDraft = {
    ...base,
    freeText,
    items: Array.from({ length: itemCount }, (_, index) => ({
      ...base.items[0],
      id: `print-item-${index}`,
      serviceDate: `2026-09-${String(index % 28 + 1).padStart(2, '0')}`,
      description: `Unterrichtsposition ${index + 1}: ausführliche, unveränderte Beschreibung für die echte PDF-Ausgabe und den Seitenumbruch`,
    })),
  }
  return saveInvoiceDraft(state, draft, true, documentAt)
}

async function createPdf(page: Page, state: AppState, invoiceId: string, label: string, testInfo: TestInfo): Promise<{ pages: number; text: string; flowText: string; payload: string; groups: Array<{ title: string; descriptions: string[]; subtotal: string }>; paperColor: string; paperBackground: string }> {
  const rendering = await page.context().newPage()
  try {
    await rendering.goto('/')
    await rendering.evaluate(async ({ state, invoiceId }) => {
      const harnessModule = '/tests/browser/documentPrintHarness.tsx'
      const { mountDocument } = await import(harnessModule)
      mountDocument(state, invoiceId)
      await document.fonts.ready
    }, { state, invoiceId })
    await expect.poll(() => rendering.evaluate(() => document.documentElement.dataset.documentReady)).toBe(invoiceId)
    const structure = await rendering.locator('.invoice-paper').evaluate((paper) => ({
      groups: [...paper.querySelectorAll('.invoice-month-group')].map((group) => ({
        title: group.querySelector('.invoice-group-heading')!.textContent!,
        descriptions: [...group.querySelectorAll('.invoice-item-row td:nth-child(2)')].map((cell) => cell.textContent!),
        subtotal: group.querySelector('.invoice-subtotal-row')?.textContent ?? '',
      })),
      paperColor: getComputedStyle(paper).color, paperBackground: getComputedStyle(paper).backgroundColor,
    }))
    const pdf = await rendering.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    const path = testInfo.outputPath(`${label}.pdf`)
    await writeFile(path, pdf)
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' })
    const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1] ?? 0)
    const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' })
    const flowText = execFileSync('pdftotext', ['-raw', path, '-'], { encoding: 'utf8' })
    const prefix = testInfo.outputPath(`${label}-page`)
    execFileSync('pdftoppm', ['-png', '-f', '1', '-l', String(Math.max(1, pages)), path, prefix])
    const images = (await readdir(testInfo.outputDir)).filter((name) => name.startsWith(`${label}-page-`) && name.endsWith('.png')).sort()
    for (const image of [images.at(0), images.at(-1)].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)) {
      await testInfo.attach(image, { path: testInfo.outputPath(image), contentType: 'image/png' })
    }
    await testInfo.attach(`${label}.pdf`, { body: pdf, contentType: 'application/pdf' })
    const payload = await rendering.evaluate(() => document.documentElement.dataset.giroPayload ?? '')
    return { pages, text, flowText, payload, ...structure }
  } finally {
    await rendering.close()
  }
}


for (const twoMonths of [false, true]) test(`AP4 Browser/PDF: ${twoMonths ? 'zwei Monate mit Zwischensummen' : 'ein Monat ohne doppelte Zwischensumme'}, immer hell`, async ({ page }, testInfo) => {
  const state = monthlyPrintState(twoMonths)
  state.settings.theme = 'dark'
  await page.emulateMedia({ colorScheme: 'dark' })
  const invoice = selectInvoice(state, state.invoices[0])
  const before = structuredClone(state)
  const pdf = await createPdf(page, state, invoice.id, `ap4-${twoMonths ? 'zwei' : 'ein'}-monate`, testInfo)
  expect(pdf.pages).toBe(1)
  expect(pdf.paperColor).toBe('rgb(11, 27, 63)'); expect(pdf.paperBackground).toBe('rgb(255, 255, 255)')
  expect(pdf.groups.map((group) => group.title)).toEqual(twoMonths ? ['August 2026', 'September 2026'] : ['September 2026'])
  expect(pdf.groups.map((group) => group.descriptions.length)).toEqual(twoMonths ? [1, 3] : [3])
  const text = pdf.text.replace(/\s+/g, ' ')
  if (twoMonths) {
    expect(text).toMatch(/Zwischensumme August: 20,00 €/)
    expect(text).toMatch(/Zwischensumme September: 60,00 €/)
  } else expect(pdf.text).not.toContain('Zwischensumme')
  expect(text).toMatch(new RegExp(`Summe ${twoMonths ? '80' : '60'},00 € Privatrechnung`))
  expect(pdf.payload).toBe(buildEpcPayload(invoice, state.settings, invoiceTotal(invoice)))
  expect(state).toEqual(before)
})

test('AP4 Browser/PDF: mehrseitiger Entwurf behält das Wasserzeichen über den Monatsflächen', async ({ page }, testInfo) => {
  const issued = monthlyPrintState(true, 28), source = selectInvoice(issued, issued.invoices[0])
  const state = saveInvoiceDraft(documentFamily(), { ...documentDraft(), studentIds: source.studentIds, recipients: source.recipients, items: source.items }, false, documentAt)
  const pdf = await createPdf(page, state, state.invoices[0].id, 'ap4-mehrseitiger-entwurf', testInfo)
  expect(pdf.pages).toBeGreaterThan(1)
  expect(pdf.groups.map((group) => group.title)).toEqual(['August 2026', 'September 2026'])
  for (const text of pdf.text.split('\f').filter((text) => text.trim())) expect(text).toContain('ENTWURF')
  expect(pdf.payload).toBe('')
})

test('AP4 Browser/PDF: Legacy-Gesamtsumme erzwingt flache Ausgabe mit unveränderten Positionsbeträgen und Reihenfolge', async ({ page }, testInfo) => {
  const state = monthlyPrintState(), version = state.documentVersions[0]
  version.content.items[0].serviceDate = '2026-09-01'
  version.content.items[1].serviceDate = '2026-08-25'
  version.content.items.forEach((item, i) => { item.description = `Legacyposition ${i + 1}` })
  Object.assign(version.amounts, { calculation: 'legacy-v1', source: 'legacy-output', itemCents: [1999, 2000, 2000, 2000], totalCents: 8001 })
  const pdf = await createPdf(page, state, state.invoices[0].id, 'ap4-legacy-fallback', testInfo)
  expect(pdf.groups).toEqual([])
  expect(pdf.text).not.toMatch(/Zwischensumme|August 2026/)
  const text = pdf.text.replace(/\s+/g, ' ')
  expect(text).toMatch(/Legacyposition 1 .*?19,99 € .*?Legacyposition 2 .*?Legacyposition 3 .*?Legacyposition 4/)
  expect(text).toMatch(/Summe 80,01 € Privatrechnung/)
  expect(pdf.payload).toContain('EUR80.01')
})

test('AP4 Browser/PDF: fehlende und ungültige Leistungsdaten bilden die letzte Gruppe', async ({ page }, testInfo) => {
  const state = monthlyPrintState(), items = state.documentVersions[0].content.items
  items[0].serviceDate = ''; items[1].serviceDate = '2026-02-30'
  items.forEach((item, i) => { item.description = `Datumstest ${i + 1}` })
  const pdf = await createPdf(page, state, state.invoices[0].id, 'ap4-ohne-leistungsdatum', testInfo)
  expect(pdf.groups.map((group) => group.title)).toEqual(['September 2026', 'Ohne gültiges Leistungsdatum'])
  expect(pdf.groups.at(-1)!.descriptions).toEqual(['Datumstest 1', 'Datumstest 2'])
  expect(pdf.text.replace(/\s+/g, ' ')).toMatch(/Zwischensumme ohne Leistungsdatum: 40,00 €/)
  expect(pdf.flowText.replace(/\s+/g, '')).toContain('2026-02-30')
  expect(pdf.pages).toBe(1)
})

test('AP4 Browser/PDF: lange Positionszeilen bleiben ganz, Tabellenkopf wiederholt sich und der Abschluss bleibt bei der letzten Position', async ({ page }, testInfo) => {
  const state = monthlyPrintState(true, 60), items = state.documentVersions[0].content.items
  items.forEach((item, i) => { item.description = `Zeilenanfang-${i + 1}: ${'Ausführliche Unterrichtsleistung mit nachvollziehbarem Inhalt. '.repeat(6)} Zeilenende-${i + 1}.` })
  const pdf = await createPdf(page, state, state.invoices[0].id, 'ap4-lange-positionen', testInfo)
  const pages = pdf.text.split('\f').filter((text) => text.trim())
  expect(pdf.pages).toBeGreaterThan(3)
  for (const [i] of items.entries()) {
    const containing = pages.filter((text) => text.includes(`Zeilenanfang-${i + 1}:`))
    expect(containing).toHaveLength(1)
    expect(containing[0]).toMatch(new RegExp(`Zeilenende-\\s*${i + 1}\\.`))
  }
  for (const text of pages.filter((text) => text.includes('Zeilenanfang-'))) expect(text.replace(/\s+/g, ' ')).toContain('Datum Leistung Menge Einzelpreis Betrag')
  const finalPage = pages.find((text) => /\bSumme\b/.test(text))!
  expect(finalPage).toMatch(/Zeilenende-\s*60\./)
  expect(finalPage).toContain('Privatrechnung'); expect(finalPage).toContain('Zahlbar bis')
  expect(finalPage).toContain('Kontoinhaber:'); expect(finalPage).toContain('Mit Banking-App scannen')
})

test('P09 Browser/PDF: ein-, zwei- und mehrseitige Rechnungen behalten Text, Wasserzeichen und Seitenzahlen', async ({ page }, testInfo) => {
  const cases = [
    { label: 'p09-eine-seite', items: 1, freeText: 'Hinweis Zeile 1\nHinweis Zeile 2', expectedPages: 1 },
    { label: 'p09-zwei-seiten', items: 10, freeText: 'Mehrzeiliger Hinweis\nfür den zweiten Beleg', expectedPages: 2 },
    { label: 'p09-mindestens-fuenf-seiten', items: 108, freeText: Array.from({ length: 28 }, (_, index) => `Freitextzeile ${index + 1}: vollständig drucken und bei Bedarf auf die Folgeseite umbrechen.`).join('\n'), expectedPages: 5 },
  ] as const

  for (const example of cases) {
    const state = printableState(example.items, example.freeText)
    const invoice = state.invoices[0]
    const pdf = await createPdf(page, state, invoice.id, example.label, testInfo)
    const normalizedPdfText = pdf.text.replace(/\s+/g, ' ').trim()
    expect(pdf.pages).toBeGreaterThanOrEqual(example.expectedPages)
    if (example.expectedPages < 5) expect(pdf.pages).toBe(example.expectedPages)
    const finalPage = pdf.text.split('\f').find((text) => /\bSumme\b/.test(text))!
    expect(finalPage).toContain('Privatrechnung'); expect(finalPage).toContain('Zahlbar bis')
    expect(finalPage).toContain('Kontoinhaber:'); expect(finalPage).toContain('Mit Banking-App scannen')
    expect(pdf.text).toContain(invoice.number!)
    expect(pdf.text).toContain('Synthetisches Studio')
    expect(pdf.text).toContain('DE02 1203 0000 0000 2020 51')
    expect(pdf.text.replace(/\s+/g, ' ')).toContain('Hiermit stelle ich die folgenden Leistungen in Rechnung.')
    expect(pdf.text).toContain('Unterrichtsposition 1')
    expect(normalizedPdfText).toContain(example.freeText.split('\n').at(-1)!)
    if (example.label === 'p09-eine-seite') expect(pdf.text).toMatch(/Hinweis Zeile 1\s*\n\s*Hinweis Zeile 2/)
    for (let pageNumber = 1; pageNumber <= pdf.pages; pageNumber++) {
      expect(pdf.text).toContain(`Seite ${pageNumber} von ${pdf.pages}`)
    }
  }

  const draft = printableState(2, 'Entwurfsfreitext')
  draft.invoices[0] = { ...draft.invoices[0], number: null, sequence: null, status: 'draft', versionId: undefined, snapshot: undefined, issuedAmounts: undefined }
  const draftPdf = await createPdf(page, draft, draft.invoices[0].id, 'p09-entwurf', testInfo)
  expect(draftPdf.text).toContain('ENTWURF')
})

for (const example of p11Cases) test(`P11 Browser/PDF: ${example}, eingefrorene Anschriften und Beträge`, async ({ page }, testInfo) => {
  const state = p11State(example)
  const invoice = selectInvoice(state, state.invoices[0])
  const snapshot = state.documentVersions[0].outputSnapshot
  const expectedPayload = buildEpcPayload(invoice, state.settings, invoiceTotal(invoice))
  // Re-output must survive later changes in every current master-data source.
  state.guardians.forEach((person) => { person.name = 'HEUTIGER EMPFÄNGER'; person.address.street = 'HEUTIGE ANSCHRIFT' })
  state.students.forEach((person) => { person.name = 'HEUTIGE LERNENDE' })
  state.settings.issuer.name = 'HEUTIGER ABSENDER'
  Object.assign(state.settings, { accountHolder: 'HEUTIGES KONTO', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bankName: 'HEUTIGE BANK', defaultLegalText: 'ALTER RECHTSTEXT' })
  const pdf = await createPdf(page, state, invoice.id, `p11-${example}`, testInfo)
  const normalized = pdf.text.replace(/\s+/g, ' ').trim()
  // Layout extraction interleaves the adjacent metadata into wrapped addresses.
  // Preserve the whole-name assertion using the PDF's ordinary text flow.
  const recipientText = pdf.flowText.replace(/\s+/g, ' ').trim()
  for (const recipient of snapshot.recipients) {
    expect(recipientText).toContain(recipient.name)
    if (recipient.street) expect(recipientText).toContain(recipient.street)
    const place = [recipient.postalCode, recipient.city].filter(Boolean).join(' ')
    if (place) expect(recipientText).toContain(place)
  }
  if (example === 'identische-anschriften') expect(normalized.split('Testweg 2')).toHaveLength(3)
  expect(normalized).toContain(invoice.number!)
  expect(normalized).toContain(euro.format(invoiceTotal(invoice)).replace(/\s+/g, ' '))
  expect(normalized).toContain('DE02 1203 0000 0000 2020 51')
  expect(pdf.payload).toBe(expectedPayload)
  expect(pdf.text).not.toMatch(/HEUTIG|ALTER RECHTSTEXT|Seitenzahl im Seitenrand|Kein GiroCode|Ohne GiroCode|BIC:|Bank:|–/)
  const pages = pdf.text.split('\f').filter((text) => text.trim())
  const sumPage = pages.findIndex((text) => /\bSumme\b/.test(text))
  expect(pages.flatMap((text, i) => text.includes('Privatrechnung') ? [i] : [])).toEqual([sumPage])
  expect(normalized.split('Privatrechnung')).toHaveLength(2)
  expect(normalized).toMatch(/Summe [\d.,]+ € Privatrechnung/)
  expect(normalized.split(snapshot.issuer.name)).toHaveLength(2)
  expect(normalized).toContain(invoice.freeText.split('\n').at(-1)!)
  if (example === 'mehrseitig' || example === 'zwei-anschriften') {
    expect(normalized).toMatch(/Testkind A .*?P11 Position 1:/)
    expect(normalized).toMatch(/Testkind B .*?P11 Position 2:/)
    expect(normalized).toContain('0,75 Std.')
    expect(normalized).toContain('2 Pauschale')
    expect(normalized).toContain('3 Stück')
    expect(normalized).toContain(`P11 Position ${invoice.items.length}:`)
  }
  if (example === 'mehrseitig') expect(pdf.pages).toBeGreaterThanOrEqual(5)
  if (example === 'langer-hinweis') expect(pdf.pages).toBeGreaterThanOrEqual(2)
  for (let i = 1; i <= pdf.pages; i++) expect(pdf.text).toContain(`Seite ${i} von ${pdf.pages}`)
  // Word boxes verify that ordinary text stays inside the content area and
  // cannot overlap the page-number footer. Images are reviewed separately.
  const bbox = execFileSync('pdftotext', ['-bbox', testInfo.outputPath(`p11-${example}.pdf`), '-'], { encoding: 'utf8' })
  const boxPages = [...bbox.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)]
  expect(boxPages).toHaveLength(pdf.pages)
  for (const match of boxPages) {
    const width = Number(match[1]), height = Number(match[2]), margin = 20 * 72 / 25.4, bottom = height - 22 * 72 / 25.4
    const words = [...match[3].matchAll(/<word xMin="(-?[\d.]+)" yMin="(-?[\d.]+)" xMax="(-?[\d.]+)" yMax="(-?[\d.]+)">([^<]*)<\/word>/g)]
    expect(words.length).toBeGreaterThan(0)
    for (const word of words) {
      const [xMin, yMin, xMax, yMax] = word.slice(1, 5).map(Number)
      expect(xMin, word[5]).toBeGreaterThanOrEqual(margin - 2)
      expect(xMax, word[5]).toBeLessThanOrEqual(width - margin + 2)
      expect(yMin, word[5]).toBeGreaterThanOrEqual(0)
      if (yMin >= bottom) expect(word[5]).toMatch(new RegExp(`^(Seite|von|\\d+|Rechnung|${invoice.number!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})$`))
      else expect(yMax, word[5]).toBeLessThanOrEqual(bottom + 2)
    }
  }
  await testInfo.attach(`p11-${example}-checks.json`, { body: Buffer.from(JSON.stringify({ recipients: snapshot.recipients, number: invoice.number, totalCents: state.documentVersions[0].amounts.totalCents, payload: pdf.payload, pages: pdf.pages }, null, 2)), contentType: 'application/json' })
})

test('P11 Browser/PDF: fehlendes historisches Konto bleibt leer trotz aktueller Zahlungsdaten', async ({ page }, testInfo) => {
  const state = p11State('zwei-anschriften')
  Object.assign(state.documentVersions[0].outputSnapshot, { accountHolder: '', iban: '', bic: '', bankName: '' })
  Object.assign(state.settings, { accountHolder: 'AKTUELLES KONTO', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bankName: 'AKTUELLE BANK' })
  const pdf = await createPdf(page, state, state.invoices[0].id, 'p11-historisch-ohne-konto', testInfo)
  expect(pdf.payload).toBe('')
  expect(pdf.text).not.toMatch(/AKTUELLE|DE89|Kontoinhaber:|IBAN:|BIC:|Bank:|Kein GiroCode|–/)
  expect(pdf.text).toContain('Empfaenger A')
  expect(pdf.text).toContain('Empfaenger B')
  expect(pdf.text).toContain('38,58')
})

test('P01 Browser/PDF: genau eine Privatzeile auf der Seite der Endsumme, auch mehrseitig', async ({ page }, testInfo) => {
  for (const count of [1, 108]) {
    const issued = printableState(count, 'Unveränderter freier Rechtstext')
    const pdf = await createPdf(page, issued, issued.invoices[0].id, `p01-privat-${count}`, testInfo)
    const pages = pdf.text.split('\f').filter((text) => text.trim())
    const finalPage = pages.findIndex((text) => /\bSumme\b/.test(text))
    expect(pages.flatMap((text, i) => text.includes('Privatrechnung') ? [i] : [])).toEqual([finalPage])
    expect(pdf.text.split('Privatrechnung')).toHaveLength(2)
    expect(pdf.text.replace(/\s+/g, ' ')).toMatch(/Summe .*?Privatrechnung Zahlbar bis/)
    expect(pdf.text).not.toMatch(/Steuernummer:|Steuerbefreiung|Kleinbetragsrechnung/)
    expect(pdf.text).toContain('Unveränderter freier Rechtstext')
  }
})

test('P01 Browser/PDF: Entwurf und Abschluss ohne Anschriften haben dieselbe Privatzeile', async ({ page }, testInfo) => {
  for (const price of [249.99, 250, 250.01]) {
    const state = documentFamily()
    state.guardians[0].address = { street: '', postalCode: '', city: '' }
    state.settings.issuer.street = ''; state.settings.issuer.postalCode = ''; state.settings.issuer.city = ''
    const draft = { ...documentDraft(), items: documentDraft().items.map((item) => ({ ...item, quantity: 1, unitPrice: price })) }
    for (const finalize of [false, true]) {
      const output = saveInvoiceDraft(state, draft, finalize, documentAt)
      const pdf = await createPdf(page, output, output.invoices[0].id, `p01-${price}-${finalize}`, testInfo)
      expect(pdf.text.split('Privatrechnung')).toHaveLength(2)
      expect(pdf.text).not.toMatch(/Steuernummer:|Steuerbefreiung|Kleinbetragsrechnung/)
      expect(pdf.text.includes('ENTWURF')).toBe(!finalize)
    }
  }
})

test('P09 Browser: nur ein optionaler Rechnungshinweis wird unverändert gespeichert', async ({ page }) => {
  const saved = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  await seed(page, saved)
  await page.getByRole('button', { name: /^Rechnungen/ }).first().click()
  await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten' })
  await expect(editor.getByRole('combobox', { name: 'Rechnungsart' })).toHaveCount(0)
  await expect(editor.getByRole('group', { name: 'Steuerangaben im Druck' })).toHaveCount(0)
  await expect(editor.getByRole('textbox', { name: /Fußzeile \/ Rechtstext/ })).toHaveCount(0)
  await expect(editor.getByLabel('Einleitung', { exact: true })).toHaveCount(0)
  await editor.getByLabel('Freitext / Hinweis', { exact: true }).fill('Eigener Hinweis zu § 19')
  await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('riffrechnung-state-v4')!).data.invoices[0])
  expect(Object.hasOwn(persisted, 'legalText')).toBe(false)
  expect(persisted.freeText).toBe('Eigener Hinweis zu § 19')
  expect(persisted).not.toHaveProperty('taxPresentation')
  expect(persisted).not.toHaveProperty('invoiceKind')
})

test('P09 Browser: abgelehnte QR-Erzeugung und ein verspäteter früherer Auftrag bleiben isoliert', async ({ page }) => {
  const single = printableState(2)
  const rendering = await page.context().newPage()
  try {
    await rendering.goto('/')
    await rendering.evaluate(async ({ state, invoiceId }) => {
      const harnessModule = '/tests/browser/documentPrintHarness.tsx'
      const { mountDocument } = await import(harnessModule)
      mountDocument(state, invoiceId, { rejectGiroCode: true })
    }, { state: single, invoiceId: single.invoices[0].id })
    await expect.poll(() => rendering.evaluate(() => document.documentElement.dataset.documentError)).toMatch(/Synthetische QR-Erzeugung abgelehnt/)
    await expect(rendering.locator('.invoice-qr img')).toHaveCount(0)
  } finally {
    await rendering.close()
  }

  let pair = printableState(2)
  const secondDraft = {
    ...documentDraft(),
    invoiceDate: '2026-09-02',
    dueDate: '2026-09-16',
    items: [{ ...documentDraft().items[0], id: 'second-print-item', serviceDate: '2026-09-02', unitPrice: 81, description: 'Zweiter gebundener Druckauftrag' }],
  }
  pair = saveInvoiceDraft(pair, secondDraft, true, documentAt)
  const second = pair.invoices[1]
  const expectedPayload = buildEpcPayload(second, pair.settings, invoiceTotal(second))

  const race = await page.context().newPage()
  try {
    await race.goto('/')
    await race.evaluate(async ({ state, firstId, secondId }) => {
      const harnessModule = '/tests/browser/documentPrintHarness.tsx'
      const { mountDocumentRace } = await import(harnessModule)
      mountDocumentRace(state, firstId, secondId)
    }, { state: pair, firstId: pair.invoices[0].id, secondId: second.id })
    await expect.poll(() => race.evaluate(() => document.documentElement.dataset.firstEncoderStarted)).toBe('yes')
    await expect.poll(() => race.evaluate(() => document.documentElement.dataset.firstEncoderReleased)).toBe('yes')
    await expect.poll(() => race.evaluate(() => document.documentElement.dataset.documentReady)).toBe(second.id)
    expect(await race.evaluate(() => document.documentElement.dataset.giroPayload)).toBe(expectedPayload)
    await expect(race.locator('.invoice-paper')).toContainText(second.number!)
    await expect(race.locator('.invoice-paper')).toContainText('81,00')
    await expect(race.locator('.invoice-qr img')).toHaveCount(1)
  } finally {
    await race.close()
  }
})

test('P09 Browser: ungültige historische BIC bietet den bewussten Druck ohne GiroCode', async ({ page }, testInfo) => {
  const state = printableState(2)
  state.invoices[0].snapshot!.bic = 'UNGÜLTIG!'
  state.documentVersions[0].outputSnapshot.bic = 'UNGÜLTIG!'
  await seed(page, state)
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printCalls = String(Number(document.documentElement.dataset.printCalls ?? '0') + 1) } })
  await page.getByRole('button', { name: /^Rechnungen/ }).first().click()
  await page.getByRole('button', { name: state.invoices[0].number!, exact: true }).click()
  await page.getByRole('button', { name: 'PDF / Drucken', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'GiroCode nicht verfügbar' })
  await expect(dialog).toContainText('BIC')
  expect(await page.evaluate(() => document.documentElement.dataset.printCalls)).toBeUndefined()
  await dialog.getByRole('button', { name: 'Ohne GiroCode drucken', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.printCalls)).toBe('1')
  await expect(page.locator('.print-root')).not.toContainText(/Ohne GiroCode gedruckt|GiroCode nicht verfügbar|Seitenzahl im Seitenrand/)
  await expect(page.locator('.print-root .invoice-qr img')).toHaveCount(0)
  await expect(page.locator('.print-root')).toContainText('DE02 1203 0000 0000 2020 51')
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
  const path = testInfo.outputPath('p11-qr-fallback.pdf')
  await writeFile(path, pdf)
  const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' })
  expect(text).not.toMatch(/Ohne GiroCode|GiroCode nicht verfügbar|Seitenzahl im Seitenrand|Mit Banking-App scannen/)
  expect(text).toContain('DE02 1203 0000 0000 2020 51')
  expect(text).toContain(state.invoices[0].number!)
  execFileSync('pdftoppm', ['-png', path, testInfo.outputPath('p11-qr-fallback-page')])
  await testInfo.attach('p11-qr-fallback.pdf', { body: pdf, contentType: 'application/pdf' })
})

