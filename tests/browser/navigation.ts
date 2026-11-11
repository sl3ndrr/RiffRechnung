import { expect, type Page } from '@playwright/test'

export async function confirmBackupImport(page: Page) {
  await expect(page.getByRole('dialog')).toBeVisible()
  const fileImport = page.getByRole('dialog', { name: 'Backup wiederherstellen', exact: true })
  if (await fileImport.count()) {
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await fileImport.getByRole('button', { name: 'Wiederherstellen', exact: true }).click()
  } else {
    // Local recovery keeps its existing explicit confirmation.
    await page.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
    await page.getByRole('button', { name: 'Wiederherstellung bestätigen', exact: true }).click()
  }
}

export async function navigateToInvoices(page: Page) {
  const navigation = page.locator((page.viewportSize()?.width ?? 1280) <= 820 ? '.mobile-bottom-nav' : '.sidebar')
  await navigation.getByRole('button', { name: 'Rechnungen', exact: true }).click()
}
