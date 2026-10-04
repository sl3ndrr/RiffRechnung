import { test, expect, type Page } from '@playwright/test'
import { emptyState } from '../../src/lib/defaults'
import { serializeBackup, STORAGE_KEY } from '../../src/lib/storage'

const hintKey = 'riffrechnung-theme-hint'
const switchGroup = (page: Page) => page.locator('.topbar').getByRole('radiogroup', { name: 'Farbschema' })
const option = (page: Page, name: string) => switchGroup(page).getByRole('radio', { name, exact: true })
const storedSettings = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data.settings, STORAGE_KEY)

test('3.AP1: alle Positionen, Systemwechsel zur Laufzeit, Metafarbe und Reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  for (const [label, theme, resolved] of [['Dunkel', 'dark', 'dark'], ['Hell', 'light', 'light'], ['System', 'system', 'light']] as const) {
    await option(page, label).click()
    await expect(option(page, label)).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-theme', resolved)
    expect((await storedSettings(page)).theme).toBe(theme)
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), hintKey)).toBe(theme)
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#151618')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f7f8')
  await option(page, 'Dunkel').click()
  await expect(option(page, 'Dunkel')).toBeChecked()
  await page.reload()
  await expect(option(page, 'Dunkel')).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('3.AP1: beide Auswahlen erhalten ungespeicherte Eingaben und Dirty-Zustand', async ({ page }) => {
  await page.goto('/')
  await page.locator('.sidebar').getByRole('button', { name: 'Einstellungen', exact: true }).click()
  const appearance = page.locator('#appearance')
  await option(page, 'Dunkel').click()
  await expect(appearance.getByRole('radio', { name: 'Dunkel', exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Lokal gespeichert', exact: true })).toBeDisabled()
  await expect(page.locator('.save-indicator')).not.toContainText('Ungespeicherte')
  const issuer = page.getByLabel('Name / Geschäftsbezeichnung', { exact: true })
  await issuer.fill('Ungespeicherte Eingabe')
  await page.getByRole('textbox', { name: /^IBAN\b/ }).fill('DE02 1203')
  await page.getByRole('textbox', { name: /^Standardpreis Solo\b/ }).fill('1,')
  await option(page, 'Hell').click()
  await expect(appearance.getByRole('radio', { name: 'Hell', exact: true })).toBeChecked()
  await expect(issuer).toHaveValue('Ungespeicherte Eingabe')
  await expect(page.getByRole('textbox', { name: /^IBAN\b/ })).toHaveValue('DE02 1203')
  await expect(page.getByRole('textbox', { name: /^Standardpreis Solo\b/ })).toHaveValue('1,')
  await expect(page.locator('.save-indicator')).toContainText('Ungespeicherte')
  await appearance.getByRole('radio', { name: 'Dunkel', exact: true }).click()
  await expect(option(page, 'Dunkel')).toBeChecked()
  expect((await storedSettings(page)).issuer.name).not.toBe('Ungespeicherte Eingabe')
  await page.locator('.sidebar').getByRole('button', { name: 'Personen', exact: true }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Ungespeicherte Einstellungen verwerfen?' })
  await confirmation.getByRole('button', { name: 'Weiter bearbeiten' }).click()
  await expect(confirmation).not.toBeVisible()
  await expect(issuer).toHaveValue('Ungespeicherte Eingabe')
  await page.getByRole('textbox', { name: /^IBAN\b/ }).fill('')
  await page.getByRole('textbox', { name: /^Standardpreis Solo\b/ }).fill('31')
  await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lokal gespeichert', exact: true })).toBeDisabled()
  await expect(option(page, 'Dunkel')).toBeChecked()
  expect((await storedSettings(page)).theme).toBe('dark')
  expect((await storedSettings(page)).issuer.name).toBe('Ungespeicherte Eingabe')
  await expect(page.locator('#history')).toContainText('Farbschema geändert')
})

test('3.AP1: Demo ändert weder echten Bestand noch Starthinweis', async ({ page }) => {
  await page.goto('/')
  await option(page, 'Hell').click()
  await expect(option(page, 'Hell')).toBeChecked()
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), hintKey)).toBe('light')
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await page.getByRole('button', { name: 'Mit Beispieldaten testen', exact: true }).click()
  await option(page, 'Dunkel').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before)
  expect(await page.evaluate((key) => localStorage.getItem(key), hintKey)).toBe('light')
  await page.getByRole('button', { name: 'Demo verlassen', exact: true }).click()
  await expect(option(page, 'Hell')).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('3.AP1: Pfeiltasten, eine Tab-Position und sichtbarer Fokus', async ({ page }) => {
  await page.goto('/')
  const group = switchGroup(page)
  await expect(group).toHaveAccessibleName('Farbschema')
  await expect(group.getByRole('radio')).toHaveCount(3)
  await option(page, 'System').focus()
  for (const [key, label] of [['ArrowLeft', 'Hell'], ['ArrowRight', 'System'], ['ArrowRight', 'Dunkel'], ['ArrowRight', 'Hell'], ['ArrowUp', 'Dunkel']] as const) {
    await page.keyboard.press(key)
    await expect(option(page, label)).toBeChecked()
    await expect(option(page, label)).toBeFocused()
  }
  const style = await option(page, 'Dunkel').locator('xpath=..').evaluate((element) => {
    const style = getComputedStyle(element)
    return { outline: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }
  })
  expect(style.outline).toBe('solid')
  expect(style.width).toBeGreaterThanOrEqual(3)
  await page.keyboard.press('Tab')
  expect(await group.evaluate((element) => element.contains(document.activeElement))).toBe(false)
})

test('3.AP1: Daumen respektiert beide Bewegungspräferenzen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const duration = () => page.locator('.theme-switch__thumb').evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration))
  expect(await duration()).toBeGreaterThan(0.01)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await duration()).toBeLessThanOrEqual(0.00001)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.locator('.sidebar').getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await page.getByLabel('Bewegungen reduzieren').check()
  await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/reduce-motion/)
  expect(await duration()).toBeLessThanOrEqual(0.00001)
})

for (const width of [320, 390, 820]) {
  test(`3.AP1: Topbar bleibt bei ${width}px bedienbar`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await option(page, 'Dunkel').click()
    await expect(option(page, 'Dunkel')).toBeChecked()
    const menu = await page.getByRole('button', { name: 'Navigation öffnen', exact: true }).boundingBox()
    const group = await switchGroup(page).boundingBox()
    const status = await page.locator('.topbar__storage-status').boundingBox()
    expect(menu && group && status).toBeTruthy()
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(status!.x)
    expect(status!.x + status!.width).toBeLessThanOrEqual(group!.x)
    expect(group!.x + group!.width).toBeLessThanOrEqual(width)
  })
}

for (const hint of ['dark', 'light', 'system', 'invalid', null]) {
  test(`3.AP1: Starthinweis ${hint} wirkt schon ohne App-Bundle`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript(({ key, hint }) => {
      if (hint === null) localStorage.removeItem(key)
      else localStorage.setItem(key, hint)
    }, { key: hintKey, hint })
    await page.route('**/src/main.tsx', (route) => route.abort())
    await page.goto('/')
    const resolved = hint === 'light' ? 'light' : 'dark'
    await expect(page.locator('html')).toHaveAttribute('data-theme', resolved)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', resolved === 'dark' ? '#151618' : '#f7f7f8')
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })
}

test('3.AP1: bestätigter Bestand korrigiert einen veralteten Starthinweis', async ({ page }) => {
  const state = emptyState()
  state.settings.theme = 'dark'
  state.settings.iban = 'DE02 1203'
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.evaluate((key) => localStorage.setItem(key, 'light'), hintKey)
  await page.reload()
  await expect(option(page, 'Dunkel')).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await option(page, 'Hell').click()
  await expect(option(page, 'Hell')).toBeChecked()
  expect((await storedSettings(page)).iban).toBe('DE02 1203')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), hintKey)).toBe('light')
})
