import type { Page } from '@playwright/test'

export async function navigateToInvoices(page: Page) {
  const navigation = page.locator((page.viewportSize()?.width ?? 1280) <= 820 ? '.mobile-bottom-nav' : '.sidebar')
  await navigation.getByRole('button', { name: 'Rechnungen', exact: true }).click()
}
