import { test, expect, type Page } from '@playwright/test'
import { serializeBackup, STORAGE_KEY } from '../../src/lib/storage'
import { createDemoState } from '../../src/lib/defaults'
import { dashboardFixture, dashboardNow } from '../dashboardFixtures'
import { invoiceTotalCents, sumCents } from '../../src/lib/money'
import { euro } from '../../src/lib/utils'
import { selectedInvoices } from '../../src/lib/documents'

const nav = (page: Page) => page.locator((page.viewportSize()?.width ?? 1280) <= 820 ? '.mobile-bottom-nav' : '.sidebar')
async function seed(page: Page, raw: string) {
  await page.clock.setFixedTime(dashboardNow)
  await page.goto('/')
  await page.evaluate(async (backup) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(backup)
  }, raw)
  await page.reload()
}

test('Reset: issued stock, cancel focus/trap, Escape, JSON backup, explicit confirmation and reload', async ({ page }) => {
  await seed(page, serializeBackup(dashboardFixture()))
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await nav(page).getByRole('button', { name: 'Einstellungen', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Daten zurücksetzen', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  const dialog = page.getByRole('alertdialog', { name: 'Alle lokalen Daten endgültig löschen?', exact: true })
  const cancel = dialog.getByRole('button', { name: 'Abbrechen', exact: true })
  await expect(cancel).toBeFocused()
  const final = dialog.getByRole('button', { name: 'Endgültig zurücksetzen', exact: true })
  await expect(final).toBeDisabled()
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before)
  await trigger.click()
  await dialog.getByRole('checkbox').check()
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Erst Backup erstellen', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/riffrechnung-backup-.*\.json/)
  await expect(dialog).toBeVisible()
  await expect(cancel).toBeFocused()
  await expect(final).toBeDisabled()
  await dialog.getByRole('checkbox').check()
  await final.click()
  await expect(page.locator('.dashboard-empty')).toBeVisible()
  await expect(page.getByText('Alle lokalen Daten wurden gelöscht.', { exact: true })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  await page.reload()
  await expect(page.locator('.dashboard-empty')).toBeVisible()
})

for (const width of [1440, 390]) for (const theme of ['light', 'dark'] as const) {
  test(`Monthly list and native dropdowns: ${width}px ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 })
    const state = createDemoState(dashboardNow)
    state.settings.theme = theme
    await seed(page, serializeBackup(state))
    await nav(page).getByRole('button', { name: 'Rechnungen', exact: true }).click()
    const rows = page.locator('.invoice-data-row')
    const headers = page.locator('.invoice-month-heading button')
    await expect(rows).toHaveCount(selectedInvoices(state).length)
    await expect(headers.first()).toHaveAttribute('aria-expanded', 'true')
    const firstMonth = selectedInvoices(state).filter((invoice) => invoice.invoiceDate.slice(0, 7) === '2026-09')
    await expect(headers.first()).toContainText(euro.format(sumCents(firstMonth.map(invoiceTotalCents)) / 100))
    await headers.first().press('Enter')
    await expect(headers.first()).toHaveAttribute('aria-expanded', 'false')
    const year = page.getByRole('combobox', { name: 'Jahr', exact: true })
    await year.selectOption('2025')
    await year.selectOption('all')
    await expect(headers.first()).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: 'Alle Monate öffnen', exact: true }).click()
    await expect(rows).toHaveCount(selectedInvoices(state).length)
    const scroll = page.getByRole('region', { name: 'Rechnungsliste nach Monaten', exact: true })
    await scroll.evaluate((node) => { node.scrollTop = 60 })
    expect(await headers.first().evaluate((node) => {
      const header = node.closest('th')!
      const tableHeader = node.closest('table')!.querySelector('thead')!
      return Math.abs(header.getBoundingClientRect().top - tableHeader.getBoundingClientRect().bottom) < 3
    })).toBe(true)
    await page.getByRole('searchbox', { name: 'Rechnungen durchsuchen' }).fill('Becker')
    const chips = page.getByRole('group', { name: 'Statusfilter', exact: true })
    const all = chips.getByRole('button', { name: /^Alle / })
    const count = Number((await all.textContent())!.match(/\d+$/)![0])
    await expect(rows).toHaveCount(count)
    await chips.getByRole('button', { name: /^Entwurf / }).click()
    const draftCount = Number((await chips.getByRole('button', { name: /^Entwurf / }).textContent())!.match(/\d+$/)![0])
    await expect(rows).toHaveCount(draftCount)
    const status = page.getByRole('combobox', { name: 'Status', exact: true })
    await expect(status).toHaveValue('draft')
    await year.selectOption('2025')
    await expect(rows).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Nichts gefunden', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click()
    for (const select of [status, year]) {
      await select.focus()
      expect(await select.evaluate((node) => getComputedStyle(node).transform)).toBe('none')
      expect(await select.evaluate((node) => getComputedStyle(node).colorScheme)).toBe(theme)
      await select.press('ArrowDown')
      await select.press('Escape')
      await select.selectOption('all')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`monthly-${width}-${theme}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
    await editor.getByRole('group', { name: 'Lernende', exact: true }).locator('label').first().click()
    for (const select of await editor.getByRole('combobox').all()) {
      await select.focus()
      expect(await select.evaluate((node) => getComputedStyle(node).transform)).toBe('none')
      expect(await select.evaluate((node) => getComputedStyle(node).colorScheme)).toBe(theme)
    }
  })
}
