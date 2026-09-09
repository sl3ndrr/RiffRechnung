import { test, expect, type Page } from '@playwright/test'
import { documentAt, documentDraft, documentFamily } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { serializeBackup } from '../../src/lib/storage'
import type { AppState } from '../../src/types'

async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const { StorageSession } = await import('/src/lib/storage.ts')
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
}

async function invoices(page: Page) {
  await page.getByRole('button', { name: /^Rechnungen(?:\s*\d+)?$/ }).first().click()
}

function contrast(foreground: string, background: string) {
  const rgb = (value: string) => value.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  const luminance = (value: string) => {
    const [red, green, blue] = rgb(value)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const [a, b] = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (a + 0.05) / (b + 0.05)
}

test('P10 Browser: Rechnungsdetails, Status und Rückkehr funktionieren mit Tastatur bei 390, 900 und 1280 Pixeln', async ({ page }) => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
  for (const width of [390, 900, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await seed(page, state)
    await invoices(page)
    const opener = page.getByRole('button', { name: '2026-a-0001', exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.invoice-detail')).toBeVisible()
    await expect(page.locator('.invoice-detail__header .icon-button')).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Forderungsstatus')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.reminder-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.invoice-detail')).toHaveCount(0)
    await expect(opener).toBeFocused()
  }
})

test('P10 Browser: verschachtelte Dialoge halten Fokus, Modalität und Scrollsperre', async ({ page }) => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  await seed(page, state)
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten' })
  await editor.getByLabel('Einleitung', { exact: true }).fill('Noch nicht gespeichert')
  await editor.getByRole('button', { name: 'Dialog schließen' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Ungespeicherte Rechnungsänderungen verwerfen?' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: 'Weiter bearbeiten' })).toBeFocused()
  await expect(page.locator('body')).toHaveClass(/modal-open/)
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel('Einleitung', { exact: true })).toHaveValue('Noch nicht gespeichert')
  await expect(page.locator('body')).toHaveClass(/modal-open/)
  await editor.getByRole('button', { name: 'Dialog schließen' }).click()
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveClass(/modal-open/)
  await page.reload()
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(editor.getByLabel('Einleitung', { exact: true })).not.toHaveValue('Noch nicht gespeichert')
})

test('P10 Browser: mobile Navigation ist geschlossen inert und stellt Fokus wieder her', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Navigation öffnen' })
  await expect(page.locator('#mobile-sidebar')).toHaveAttribute('inert', '')
  await trigger.focus()
  await page.keyboard.press('Enter')
  const close = page.getByRole('button', { name: 'Navigation schließen' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(trigger).toBeFocused()
  await expect(page.locator('#mobile-sidebar')).toHaveAttribute('inert', '')
})

test('P10 Browser: relevante Textkontraste erreichen in beiden Themes AA', async ({ page }) => {
  await page.goto('/')
  for (const theme of ['light', 'dark']) {
    await page.evaluate((nextTheme) => { document.documentElement.dataset.theme = nextTheme }, theme)
    const pairs = await page.evaluate(() => {
      const danger = document.createElement('button')
      danger.className = 'button button--danger'
      danger.textContent = 'Verwerfen'
      const version = document.querySelector<HTMLElement>('.sidebar__version')!
      const backup = document.querySelector<HTMLElement>('.backup-indicator')!
      document.body.append(danger)
      const result = [
        [getComputedStyle(danger).color, getComputedStyle(danger).backgroundColor],
        [getComputedStyle(version).color, getComputedStyle(document.querySelector('.sidebar')!).backgroundColor],
        [getComputedStyle(backup).color, getComputedStyle(document.querySelector('.topbar')!).backgroundColor],
      ]
      danger.remove()
      return result
    })
    for (const [foreground, background] of pairs) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
  }
})
