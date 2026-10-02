import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import type { AppState } from '../../src/types'
import { duoDrafts, legacyDuoState, households } from '../duoFixtures'
import { documentAt, documentFamily, documentDraft } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
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
async function openDraft(page: Page, name: string) {
  await page.locator('.invoice-list-table tbody tr').filter({ hasText: name }).getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.locator('.invoice-detail').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  return page.getByRole('dialog', { name: 'Entwurf bearbeiten', exact: true })
}

test('P03 Browser: beide Erziehungsberechtigte ausdrücklich auf einer gemeinsamen Duo-Rechnung wählen', async ({ page }) => {
  const state = documentFamily()
  await seed(page, saveInvoiceDraft(state, { ...documentDraft(), guardianIds: [] }, false, documentAt))
  const editor = await openDraft(page, 'Testkind A')
  const audience = editor.getByRole('group', { name: 'Rechnungsempfänger' })
  await audience.locator('label.choice-chip').filter({ hasText: 'Empfaenger A' }).click()
  await audience.locator('label.choice-chip').filter({ hasText: 'Empfaenger B' }).click()
  await expect(audience.getByRole('checkbox', { name: /Empfaenger A/ })).toBeChecked()
  await expect(audience.getByRole('checkbox', { name: /Empfaenger B/ })).toBeChecked()
  await editor.getByLabel('Art', { exact: true }).selectOption('duo')
  await expect(editor.getByRole('textbox', { name: 'Einzelpreis €', exact: true })).toHaveValue('20')
  await editor.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await page.reload()
  const saved = await stateOf(page)
  expect(saved.invoices).toHaveLength(1)
  expect(saved.documentVersions).toHaveLength(1)
  expect(saved.invoices[0].snapshot?.guardians.map((person) => person.id)).toEqual(['g-a', 'g-b'])
  expect(saved.invoices[0].number).toBe('2026-a-0001')
  expect('duoGroups' in saved).toBe(false)
  await expect(page.getByRole('button', { name: 'Duo · zwei Haushalte', exact: true })).toHaveCount(0)
})

test('P03 Browser: alte Gruppenentwürfe im lokalen Klärungspfad übernehmen und einzeln abschließen', async ({ page }, testInfo) => {
  const old = legacyDuoState(), raw = JSON.stringify(old)
  await page.goto('/')
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lokale Daten benötigen Wiederherstellung' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
  await page.getByRole('button', { name: 'Altformat und Reparatur prüfen' }).click()
  await expect(page.getByText('Altformat 9 → Format 10:', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Wiederherstellung vorbereiten' }).click()
  await page.getByRole('button', { name: 'Wiederherstellung bestätigen' }).click()
  await expect(page.getByText(/Wiederherstellung lokal gespeichert/)).toBeVisible()
  await page.reload()
  const imported = await stateOf(page)
  expect(imported.invoices).toEqual(old.invoices)
  expect('duoGroups' in imported).toBe(false)
  await expect(page.getByRole('button', { name: 'Duo-Verknüpfung öffnen' })).toHaveCount(0)
  for (let i = 0; i < 2; i++) {
    const editor = await openDraft(page, households[i].student)
    await expect(editor.getByRole('group', { name: 'Lernende' }).getByRole('checkbox').first()).toBeEnabled()
    await expect(editor.getByRole('button', { name: 'Finalisieren', exact: true })).toBeEnabled()
    await editor.getByRole('button', { name: 'Finalisieren', exact: true }).click()
    await expect(editor).not.toBeVisible()
    const saved = await stateOf(page)
    expect(saved.documentVersions).toHaveLength(i + 1)
    if (i === 0) expect(saved.invoices.find((invoice) => invoice.id === old.invoices[1].id)).toEqual(old.invoices[1])
  }
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
      for (const marker of [households[i].student, households[i].guardian, households[i].intro, households[i].free, households[i].legal, i === 0 ? '7,58' : '15,02']) expect(text).toContain(marker)
      for (const marker of [households[1 - i].student, households[1 - i].guardian, 'GEHEIM_', old.duoGroups[0].id]) expect(text).not.toContain(marker)
      expect(await rendering.evaluate(() => document.documentElement.dataset.giroPayload)).toContain(issued.invoices[i].number!)
      await testInfo.attach(`p03-haushalt-${i + 1}.pdf`, { body: pdf, contentType: 'application/pdf' })
    } finally { await rendering.close() }
  }
})

test('P03 Browser: ungültige Gruppe lässt Eingangsbytes unverändert und bietet Originalexport', async ({ page }) => {
  const old = legacyDuoState()
  old.duoGroups[0].targets[1].invoiceId = old.duoGroups[0].targets[0].invoiceId
  const raw = JSON.stringify(old)
  await page.goto('/')
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw })
  await page.reload()
  await page.getByRole('button', { name: 'Altformat und Reparatur prüfen' }).click()
  await expect(page.getByText('Keine Übernahme möglich', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unveränderte Originaldatei exportieren' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Wiederherstellung vorbereiten' })).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
})

test('P03 Browser: unabhängige Entwürfe überstehen Speicherkonflikt und Quota ohne Partnerabschluss', async ({ page, context }) => {
  await seed(page, duoDrafts())
  const second = await context.newPage()
  await second.goto('/')
  const firstEditor = await openDraft(page, households[0].student), secondEditor = await openDraft(second, households[1].student)
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (target, value) {
      if (target === key) throw new DOMException('Synthetischer P03-Quotafehler', 'QuotaExceededError')
      return original.call(this, target, value)
    }
  }, STORAGE_KEY)
  await firstEditor.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(page.getByText('Synthetischer P03-Quotafehler', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before)
  await page.reload()
  const retry = await openDraft(page, households[0].student)
  await retry.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(retry).not.toBeVisible()
  await secondEditor.getByRole('button', { name: 'Finalisieren', exact: true }).click()
  await expect(second.locator('.external-update')).toBeVisible()
  const saved = await stateOf(second)
  expect(saved.documentVersions).toHaveLength(1)
  expect(saved.invoices.find((invoice) => invoice.id === 'duo-invoice-1')?.status).toBe('draft')
  await second.close()
})
