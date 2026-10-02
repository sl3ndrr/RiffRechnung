import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readdir, writeFile } from 'node:fs/promises'
import type { AppState, InvoiceDraft } from '../../src/types'
import { documentAt, documentDraft, documentFamily } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { serializeBackup } from '../../src/lib/storage'
import { buildEpcPayload, invoiceTotal } from '../../src/lib/utils'

async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const storageModule = '/src/lib/storage.ts'
    const { StorageSession } = await import(storageModule)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
}

function printableState(itemCount: number, freeText = '', legalText = 'Rechtstext für die vollständige PDF-Ausgabe'): AppState {
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
    legalText,
    freeText,
    introText: 'Diese Einleitung enthält bewusst mehrere Zeilen.\nSie muss vollständig gedruckt werden.',
    items: Array.from({ length: itemCount }, (_, index) => ({
      ...base.items[0],
      id: `print-item-${index}`,
      serviceDate: `2026-09-${String(index % 28 + 1).padStart(2, '0')}`,
      description: `Unterrichtsposition ${index + 1}: ausführliche, unveränderte Beschreibung für die echte PDF-Ausgabe und den Seitenumbruch`,
    })),
  }
  return saveInvoiceDraft(state, draft, true, documentAt)
}

async function createPdf(page: Page, state: AppState, invoiceId: string, label: string, testInfo: TestInfo): Promise<{ pages: number; text: string }> {
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
    const pdf = await rendering.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    const path = testInfo.outputPath(`${label}.pdf`)
    await writeFile(path, pdf)
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' })
    const pages = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1] ?? 0)
    const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' })
    const prefix = testInfo.outputPath(`${label}-page`)
    execFileSync('pdftoppm', ['-png', '-f', '1', '-l', String(Math.max(1, pages)), path, prefix])
    const images = (await readdir(testInfo.outputDir)).filter((name) => name.startsWith(`${label}-page-`) && name.endsWith('.png')).sort()
    for (const image of [images.at(0), images.at(-1)].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)) {
      await testInfo.attach(image, { path: testInfo.outputPath(image), contentType: 'image/png' })
    }
    await testInfo.attach(`${label}.pdf`, { body: pdf, contentType: 'application/pdf' })
    return { pages, text }
  } finally {
    await rendering.close()
  }
}

test('P09 Browser/PDF: ein-, zwei- und mehrseitige Rechnungen behalten Text, Wasserzeichen und Seitenzahlen', async ({ page }, testInfo) => {
  const cases = [
    { label: 'p09-eine-seite', items: 1, freeText: 'Hinweis Zeile 1\nHinweis Zeile 2', expectedPages: 1 },
    { label: 'p09-zwei-seiten', items: 14, freeText: 'Mehrzeiliger Hinweis\nfür den zweiten Beleg', expectedPages: 2 },
    { label: 'p09-mindestens-fuenf-seiten', items: 108, freeText: Array.from({ length: 28 }, (_, index) => `Freitextzeile ${index + 1}: vollständig drucken und bei Bedarf auf die Folgeseite umbrechen.`).join('\n'), expectedPages: 5 },
  ] as const

  for (const example of cases) {
    const state = printableState(example.items, example.freeText)
    const invoice = state.invoices[0]
    const pdf = await createPdf(page, state, invoice.id, example.label, testInfo)
    const normalizedPdfText = pdf.text.replace(/\s+/g, ' ').trim()
    expect(pdf.pages).toBeGreaterThanOrEqual(example.expectedPages)
    if (example.expectedPages < 5) expect(pdf.pages).toBe(example.expectedPages)
    expect(pdf.text).toContain(invoice.number!)
    expect(pdf.text).toContain('Synthetisches Studio')
    expect(pdf.text).toContain('DE02 1203 0000 0000 2020 51')
    expect(pdf.text).toContain('Rechtstext für die vollständige PDF-Ausgabe')
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

test('P01 Browser/PDF: genau eine Privatzeile auf der Seite der Endsumme, auch mehrseitig', async ({ page }, testInfo) => {
  for (const count of [1, 108]) {
    const issued = printableState(count, '', 'Unveränderter freier Rechtstext')
    const pdf = await createPdf(page, issued, issued.invoices[0].id, `p01-privat-${count}`, testInfo)
    const pages = pdf.text.split('\f').filter((text) => text.trim())
    const finalPage = pages.findIndex((text) => /\bSumme\b/.test(text))
    expect(pages.flatMap((text, i) => text.includes('Privatrechnung') ? [i] : [])).toEqual([finalPage])
    expect(pdf.text.split('Privatrechnung')).toHaveLength(2)
    expect(pdf.text.replace(/\s+/g, ' ')).toMatch(/Summe .*?Privatrechnung Bitte überweisen Sie/)
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

test('P01 Browser: Steuerwahl entfällt; freier Rechtstext wird unverändert gespeichert', async ({ page }) => {
  const saved = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  await seed(page, saved)
  await page.getByRole('button', { name: /^Rechnungen/ }).first().click()
  await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten' })
  await expect(editor.getByRole('combobox', { name: 'Rechnungsart' })).toHaveCount(0)
  await expect(editor.getByRole('group', { name: 'Steuerangaben im Druck' })).toHaveCount(0)
  await editor.getByRole('textbox', { name: /Fußzeile \/ Rechtstext/ }).fill('Eigener Hinweis zu § 19')
  await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('riffrechnung-state-v4')!).data.invoices[0])
  expect(persisted.legalText).toBe('Eigener Hinweis zu § 19')
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
    await expect.poll(() => race.evaluate(() => document.documentElement.dataset.documentReady)).toBe(second.id)
    expect(await race.evaluate(() => document.documentElement.dataset.giroPayload)).toBe(expectedPayload)
    await expect(race.locator('.invoice-paper')).toContainText(second.number!)
    await expect(race.locator('.invoice-paper')).toContainText('81,00')
    await expect(race.locator('.invoice-qr img')).toHaveCount(1)
  } finally {
    await race.close()
  }
})

test('P09 Browser: ungültige historische BIC bietet den bewussten Druck ohne GiroCode', async ({ page }) => {
  const state = printableState(2)
  state.invoices[0].snapshot!.bic = 'UNGÜLTIG!'
  state.documentVersions[0].content.snapshot!.bic = 'UNGÜLTIG!'
  state.documentVersions[0].outputSnapshot.bic = 'UNGÜLTIG!'
  await seed(page, state)
  await page.evaluate(() => { window.print = () => undefined })
  await page.getByRole('button', { name: /^Rechnungen/ }).first().click()
  await page.getByRole('button', { name: state.invoices[0].number!, exact: true }).click()
  await page.getByRole('button', { name: 'PDF / Drucken', exact: true }).click()
  const dialog = page.getByRole('alertdialog', { name: 'GiroCode nicht verfügbar' })
  await expect(dialog).toContainText('BIC')
  await dialog.getByRole('button', { name: 'Ohne GiroCode drucken', exact: true }).click()
  await expect(page.locator('.print-root .invoice-girocode-notice')).toContainText('Ohne GiroCode gedruckt')
  await expect(page.locator('.print-root .invoice-qr img')).toHaveCount(0)
  await expect(page.locator('.print-root')).toContainText('DE02 1203 0000 0000 2020 51')
})
