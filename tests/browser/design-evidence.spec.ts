import { test, expect } from '@playwright/test'
import { serializeBackup } from '../../src/lib/storage'
import { dashboardFixture, dashboardNow } from '../dashboardFixtures'

// Review evidence plus a regression check for unintended page overflow.
// Screenshots stay in the existing CI artifact directory, never in source.
for (const width of [1440, 1024, 390]) for (const theme of ['light', 'dark'] as const) {
  test(`Design evidence: ${width}px ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 })
    await page.clock.setFixedTime(dashboardNow)
    const state = dashboardFixture()
    state.settings.theme = theme
    await page.goto('/')
    await page.evaluate(async (raw) => {
      const path = '/src/lib/storage.ts'
      const { StorageSession } = await import(path)
      await new StorageSession().restore(raw)
    }, serializeBackup(state))
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    // Dashboard values animate in JavaScript; wait for their final fixture values.
    for (const [name, amount] of [['Bezahlt', '10,00'], ['Offen', '55,00'], ['Entwürfe (nicht finalisiert)', '7,58']]) {
      await expect(page.getByRole('article', { name, exact: true }).locator('.dashboard-stat__value')).toContainText(amount)
    }
    const capture = async (view: string) => {
      await page.evaluate(async () => {
        await document.fonts.ready
        for (const animation of document.getAnimations()) {
          try { animation.finish() } catch { /* Infinite saving indicator. */ }
        }
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const path = testInfo.outputPath(`${view}-${width}-${theme}.png`)
      await page.screenshot({ path, fullPage: true })
      await testInfo.attach(`${view}-${width}-${theme}`, { path, contentType: 'image/png' })
    }
    const navigation = page.locator(width <= 820 ? '.mobile-bottom-nav' : '.sidebar')
    await capture('dashboard')
    await navigation.getByRole('button', { name: 'Rechnungen', exact: true }).click()
    await capture('invoices')
    await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
    const learners = editor.getByRole('group', { name: 'Lernende', exact: true })
    await learners.locator('label').first().click()
    await expect(learners.getByRole('checkbox').first()).toBeChecked()
    await expect(editor.locator('.editor-item')).toHaveCount(1)
    await editor.locator('.editor-item').scrollIntoViewIfNeeded()
    await capture('editor')
    await page.keyboard.press('Escape')
    await page.getByRole('alertdialog', { name: 'Ungespeicherte Rechnungsänderungen verwerfen?', exact: true }).getByRole('button', { name: 'Verwerfen', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await navigation.getByRole('button', { name: 'Einstellungen', exact: true }).click()
    await capture('settings')
  })
}

