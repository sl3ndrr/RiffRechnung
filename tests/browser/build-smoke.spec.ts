import { test, expect } from '@playwright/test'

test('gebauter Stand zeigt Beispielrechnungen ohne Konsolenfehler', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Mit Beispieldaten testen', exact: true }).click()
  await page.locator('.sidebar').getByRole('button', { name: 'Rechnungen', exact: true }).click()
  await expect(page.locator('tbody .invoice-detail-link').first()).toBeVisible()
  expect(errors).toEqual([])
})
