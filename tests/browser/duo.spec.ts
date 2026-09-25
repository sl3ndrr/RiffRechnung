import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import type { AppState } from '../../src/types'
import { duoDrafts, duoFamily, households } from '../duoFixtures'
import { parseBackup, serializeBackup, STORAGE_KEY } from '../../src/lib/storage'

async function stateOf(page: Page): Promise<AppState> {
  return parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
}
async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
}
async function invoices(page: Page) {
  await page.getByRole('button', { name: /^Rechnungen(?:\s*\d+)?$/ }).first().click()
}
async function openGroup(page: Page) {
  await invoices(page)
  await page.locator('.invoice-list-table tbody tr').filter({ hasText: households[0].student }).getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.getByRole('button', { name: 'Duo-Verknüpfung öffnen' }).click()
  return page.getByRole('dialog', { name: 'Duo-Rechnungen prüfen', exact: true })
}
async function confirmBoth(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Duo-Rechnungen prüfen', exact: true })
  await dialog.getByRole('checkbox', { name: /^Rechnung 1: eigene/ }).check()
  await dialog.getByRole('checkbox', { name: /^Rechnung 2: eigene/ }).check()
}

test('AP2 Browser/PDF: gemeinsame Erfassung, getrennte Bearbeitung, Reload, vollständige Vorschau und zwei private Ausgaben', async ({ page }, testInfo) => {
  await seed(page, duoFamily())
  await invoices(page)
  await page.getByRole('button', { name: 'Duo · zwei Haushalte', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Duo · zwei Haushalte', exact: true })
  await dialog.getByLabel('Lernende Person 1').selectOption('s-a')
  await dialog.getByLabel('Lernende Person 2').selectOption('s-b')
  await dialog.getByLabel('Gemeinsamer Termin').fill('2026-09-25')
  await dialog.getByLabel('Gemeinsame Leistung').fill('Rhythmusarbeit (Duo)')
  await dialog.getByLabel('Gemeinsame Menge').fill('0,75')
  await dialog.getByLabel('Ausdrücklicher Gruppenbetrag').fill('22,60')
  await dialog.getByRole('button', { name: 'Zwei Entwürfe anlegen' }).click()
  dialog = page.getByRole('dialog', { name: 'Duo-Rechnungen prüfen', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Beide Rechnungen verbindlich abschließen' })).toBeDisabled()
  for (let i = 0; i < 2; i++) {
    await dialog.getByRole('button', { name: `Rechnung ${i + 1} getrennt bearbeiten` }).click()
    const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten', exact: true })
    await expect(editor.getByRole('button', { name: 'Finalisieren', exact: true })).toBeDisabled()
    await expect(editor.getByLabel('Einleitung', { exact: true })).toHaveValue('')
    await expect(editor.getByLabel('Freitext / Hinweis', { exact: true })).toHaveValue('')
    await editor.locator('label.choice-chip').filter({ hasText: households[i].guardian }).click()
    await editor.getByRole('textbox', { name: 'Einzelpreis €', exact: true }).fill(i === 0 ? '10,10' : '20,02')
    await editor.getByLabel('Einleitung', { exact: true }).fill(households[i].intro)
    await editor.getByLabel('Freitext / Hinweis', { exact: true }).fill(households[i].free)
    await editor.getByRole('textbox', { name: /^Fußzeile \/ Rechtstext \d+ \/ \d+ Zeichen$/ }).fill(households[i].legal)
    await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
    await expect(editor).not.toBeVisible()
  }
  const drafts = await stateOf(page)
  expect(drafts.invoices).toHaveLength(2)
  expect(drafts.invoices.every((invoice) => invoice.number === null)).toBe(true)
  await page.reload()
  dialog = await openGroup(page)
  const previewTexts: string[] = []
  for (let i = 0; i < 2; i++) {
    const output = dialog.getByRole('region', { name: `Ausgabe Rechnung ${i + 1}`, exact: true })
    await expect(output).toContainText('wird beim Abschluss vergeben')
    await expect(output).toContainText(households[i].guardian)
    await expect(output).toContainText(households[i].student)
    await expect(output).toContainText(households[i].intro)
    await expect(output).toContainText(households[i].free)
    await expect(output).toContainText(households[i].legal)
    await expect(output).not.toContainText(households[1 - i].student)
    await expect(output).not.toContainText('GEHEIM_')
    previewTexts.push(await output.locator('.invoice-paper').innerText())
  }
  await confirmBoth(page)
  await dialog.getByRole('button', { name: 'Beide Rechnungen verbindlich abschließen' }).click()
  await expect(dialog).not.toBeVisible()
  await page.reload()
  const issued = await stateOf(page)
  expect(issued.documentVersions.map((version) => version.amounts.totalCents)).toEqual([758, 1502])
  expect(issued.invoices.map((invoice) => invoice.number)).toEqual(['2026-aur-0001', '2026-bas-0001'])
  for (let i = 0; i < 2; i++) {
    const rendering = await page.context().newPage()
    try {
      await rendering.goto('/')
      await rendering.evaluate(async ({ state, invoiceId }) => {
        const path = '/tests/browser/documentPrintHarness.tsx'
        const { mountDocument } = await import(path)
        mountDocument(state, invoiceId)
      }, { state: issued, invoiceId: issued.invoices[i].id })
      await expect.poll(() => rendering.evaluate(() => document.documentElement.dataset.documentReady)).toBe(issued.invoices[i].id)
      const pdf = await rendering.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
      const text = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf, encoding: 'utf8' })
      for (const marker of [households[i].student, households[i].guardian, households[i].intro, households[i].free, households[i].legal, i === 0 ? '7,58' : '15,02']) {
        expect(text).toContain(marker)
        expect(previewTexts[i]).toContain(marker)
      }
      for (const marker of [households[1 - i].student, households[1 - i].guardian, households[1 - i].intro, households[1 - i].free, households[1 - i].legal, 'GEHEIM_', issued.duoGroups![0].id, `-${households[1 - i].code}-`]) expect(text).not.toContain(marker)
      expect(await rendering.evaluate(() => document.documentElement.dataset.giroPayload)).toContain(issued.invoices[i].number!)
      expect(await rendering.evaluate(() => document.documentElement.dataset.giroPayload)).not.toContain(`-${households[1 - i].code}-`)
      await testInfo.attach(`duo-haushalt-${i + 1}.pdf`, { body: pdf, contentType: 'application/pdf' })
    } finally { await rendering.close() }
  }
})

test('AP2 Browser: Basisvergleich schützt Einzelpreise und Texte; Gruppenbetrag sperrt mit Centdifferenz', async ({ page }) => {
  await seed(page, duoDrafts(2260))
  const dialog = await openGroup(page), before = await stateOf(page)
  await dialog.getByLabel('Gemeinsame Leistung').fill('Geprüfte neue Rhythmusarbeit')
  await dialog.getByRole('button', { name: 'Änderungen vergleichen' }).click()
  const differences = dialog.getByRole('region', { name: 'Unterschiede der gemeinsamen Leistung' })
  await expect(differences).toContainText('Rhythmusarbeit (Duo)')
  await expect(differences).toContainText('Geprüfte neue Rhythmusarbeit')
  expect((await stateOf(page)).invoices).toEqual(before.invoices)
  await differences.getByRole('button', { name: 'Angezeigte Unterschiede ausdrücklich übernehmen' }).click()
  await expect(differences).not.toBeVisible()
  const after = await stateOf(page)
  after.invoices.forEach((invoice, i) => {
    expect(invoice.items[0].description).toBe('Geprüfte neue Rhythmusarbeit')
    expect(invoice.items[0].unitPrice).toBe(before.invoices[i].items[0].unitPrice)
    expect(invoice.introText).toBe(before.invoices[i].introText)
    expect(invoice.freeText).toBe(before.invoices[i].freeText)
    expect(invoice.legalText).toBe(before.invoices[i].legalText)
    expect(invoice.guardianIds).toEqual(before.invoices[i].guardianIds)
  })
  await dialog.getByLabel('Ausdrücklicher Gruppenbetrag').fill('22,61')
  await dialog.getByRole('button', { name: 'Gruppenbetrag speichern' }).click()
  await expect(dialog).toContainText('Differenz -0,01')
  await confirmBoth(page)
  await expect(dialog.getByRole('button', { name: 'Beide Rechnungen verbindlich abschließen' })).toBeDisabled()
  expect((await stateOf(page)).documentVersions).toHaveLength(0)
})

test('AP2 Browser: Quota vor Hauptabschluss und zwei echte Tabs erzeugen keine halbe Gruppe', async ({ page, context }) => {
  await seed(page, duoDrafts())
  const second = await context.newPage()
  await second.goto('/')
  const firstDialog = await openGroup(page), secondDialog = await openGroup(second)
  await confirmBoth(page)
  await confirmBoth(second)
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (target, value) {
      if (target === key) throw new DOMException('Synthetischer AP2-Quotafehler', 'QuotaExceededError')
      return original.call(this, target, value)
    }
  }, STORAGE_KEY)
  await firstDialog.getByRole('button', { name: 'Beide Rechnungen verbindlich abschließen' }).click()
  await expect(page.getByText('Synthetischer AP2-Quotafehler', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before)
  expect((await stateOf(page)).documentVersions).toHaveLength(0)
  // Reload removes the injected write failure; the other real tab retains its old revision.
  await page.reload()
  const retry = await openGroup(page)
  await confirmBoth(page)
  await retry.getByRole('button', { name: 'Beide Rechnungen verbindlich abschließen' }).click()
  await expect(retry).not.toBeVisible()
  await secondDialog.getByRole('button', { name: 'Beide Rechnungen verbindlich abschließen' }).click()
  await expect(second.locator('.external-update')).toBeVisible()
  expect((await stateOf(second)).documentVersions).toHaveLength(2)
  expect((await stateOf(second)).invoices.map((invoice) => invoice.sequence)).toEqual([1, 1])
  await second.close()
})
