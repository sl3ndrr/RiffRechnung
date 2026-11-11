import { test, expect, type Page } from '@playwright/test'
import { documentFamily } from '../documentFixtures'
import { serializeBackup } from '../../src/lib/storage'
import { navigateToInvoices } from './navigation'

async function openEditor(page: Page, count: number) {
  const state = documentFamily()
  for (let i = 2; i < count - state.guardians.length; i++) {
    state.students.push({
      ...state.students[0],
      id: `extra-${i}`,
      name: `Weitere Person ${i}`,
      billingCode: `x${String.fromCharCode(97 + i)}`,
    })
  }
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
  await navigateToInvoices(page)
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  return page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
}

for (const count of [12, 13])
  test(`Personensuche bei ${count} angebotenen Personen`, async ({ page }) => {
    const editor = await openEditor(page, count)
    const search = editor.getByRole('searchbox', { name: 'Personen suchen' })
    await expect(search).toHaveCount(count > 12 ? 1 : 0)
    if (count === 12) return
    const learners = editor.getByRole('group', { name: 'Lernende', exact: true })
    const recipients = editor.getByRole('group', { name: 'Rechnungsempfänger', exact: true })
    await search.fill('tEsTkInD')
    await expect(learners.locator('.choice-chip')).toHaveCount(2)
    await expect(recipients.locator('.choice-chip')).toHaveCount(0)
    await learners.locator('.choice-chip').filter({ hasText: 'Testkind A' }).click()
    await search.fill('empFAENGER b')
    await expect(learners.locator('.choice-chip')).toHaveCount(1)
    await expect(learners.locator('.choice-chip')).toContainText('Testkind A')
    await expect(recipients.locator('.choice-chip')).toHaveCount(2)
    await expect(recipients.getByRole('checkbox').nth(0)).toBeChecked()
    await expect(recipients.getByRole('checkbox').nth(1)).toBeChecked()
    await recipients.locator('.choice-chip').filter({ hasText: 'Empfaenger A' }).click()
    await expect(recipients.locator('.choice-chip')).toHaveCount(1)
    await search.fill('kein Treffer')
    await expect(learners.locator('.choice-chip')).toHaveCount(1)
    await expect(recipients.locator('.choice-chip')).toHaveCount(1)
    await search.fill('')
    await expect(learners.locator('.choice-chip')).toHaveCount(11)
  })

test('Feldhilfen sind zugeordnet und Untercent-Hinweis erscheint nur bei Bedarf', async ({ page }) => {
  const editor = await openEditor(page, 12)
  await editor.getByRole('group', { name: 'Lernende', exact: true }).locator('.choice-chip').first().click()
  const quantity = editor.getByRole('textbox', { name: 'Menge', exact: true })
  const price = editor.getByRole('textbox', { name: 'Einzelpreis €', exact: true })
  await expect(quantity).toHaveAccessibleDescription('0,01 bis 99,99')
  await expect(price).toHaveAccessibleDescription('EUR je Einheit')
  await expect(editor.getByText(/Gesamt höchstens|Mengen:/)).toHaveCount(0)
  await price.fill('10,123')
  await expect(price).toHaveAccessibleDescription('EUR je Einheit; gespeicherte Untercentpräzision bleibt erhalten.')
  await price.fill('10,12')
  await expect(price).toHaveAccessibleDescription('EUR je Einheit')
  await price.fill('999999999')
  await quantity.fill('2')
  await editor.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('999.999.999,99 EUR')
})
