import { test, expect, type Locator, type Page } from '@playwright/test'
import { documentAt, documentDraft, documentFamily } from '../documentFixtures'
import { saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { serializeBackup, STORAGE_KEY } from '../../src/lib/storage'
import type { AppState } from '../../src/types'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
}

async function invoices(page: Page, mobile = false) {
  const navigation = mobile ? page.locator('.mobile-bottom-nav') : page.locator('.sidebar')
  await navigation.getByRole('button', { name: /^Rechnungen(?:\s*\d+)?$/ }).click()
}

async function tabTo(page: Page, target: Locator, maximumTabs = 80) {
  for (let index = 0; index < maximumTabs && !await target.evaluate((element) => element === document.activeElement); index++) {
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

async function finishAnimations(page: Page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try { animation.finish() } catch { /* Endlose Statusanimationen bleiben für den Screenshot unbeachtet. */ }
    }
  })
}

function contrast(foreground: string, background: string) {
  const rgb = (value: string) => {
    const normalized = value.trim()
    const channels = normalized.startsWith('#')
      ? [normalized.slice(1, 3), normalized.slice(3, 5), normalized.slice(5, 7)].map((channel) => Number.parseInt(channel, 16))
      : normalized.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number)
    return channels.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
  }
  const luminance = (value: string) => {
    const [red, green, blue] = rgb(value)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const [a, b] = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (a + 0.05) / (b + 0.05)
}

for (const width of [390, 900, 1280]) {
  test(`P10 Browser: Rechnungsdetails, Status und Rückkehr funktionieren mit Tab, Enter und Escape bei ${width} Pixeln`, async ({ page }) => {
    const state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
    await page.setViewportSize({ width, height: 900 })
    await seed(page, state)
    await invoices(page, width === 390)
    const opener = page.getByRole('button', { name: '2026-0001-a', exact: true })
    await tabTo(page, opener)
    await page.keyboard.press('Enter')
    await expect(page.locator('.invoice-detail')).toBeVisible()
    await expect(page.locator('.invoice-detail__header .icon-button')).toBeFocused()
    const openStatus = page.getByRole('button', { name: 'Versendet / offen', exact: true })
    await tabTo(page, openStatus)
    await page.keyboard.press('Enter')
    await expect(openStatus).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await expect(page.locator('.invoice-detail')).toHaveCount(0)
    await expect(opener).toBeFocused()
  })
}



test('P10 Browser: verschachtelte Dialoge halten Fokus, Modalität und Scrollsperre', async ({ page }) => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  await seed(page, state)
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).press('Enter')
  const editButton = page.getByRole('button', { name: 'Bearbeiten', exact: true })
  await editButton.click()
  const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten' })
  await editor.getByLabel('Freitext / Hinweis', { exact: true }).fill('Noch nicht gespeichert')
  await page.keyboard.press('Escape')
  const confirmation = page.getByRole('alertdialog', { name: 'Ungespeicherte Rechnungsänderungen verwerfen?' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: 'Weiter bearbeiten' })).toBeFocused()
  await expect(confirmation).toHaveAccessibleName('Ungespeicherte Rechnungsänderungen verwerfen?')
  await expect(confirmation).toHaveAccessibleDescription('Die Eingaben wurden noch nicht gespeichert oder finalisiert. „Weiter bearbeiten“ erhält alle Formularwerte. „Verwerfen“ ändert keinen gespeicherten Beleg.')
  const accessibilityTree = await confirmation.ariaSnapshot()
  expect(accessibilityTree).toContain('alertdialog "Ungespeicherte Rechnungsänderungen verwerfen?"')
  expect(accessibilityTree).toContain('button "Weiter bearbeiten"')
  expect(accessibilityTree).toContain('button "Verwerfen"')
  await expect(editor).toHaveAttribute('inert', '')
  await expect(page.locator('#root')).toHaveAttribute('inert', '')
  await expect(page.locator('body')).toHaveClass(/modal-open/)
  await page.keyboard.press('Shift+Tab')
  await expect(confirmation.getByRole('button', { name: 'Dialog schließen' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(confirmation.getByRole('button', { name: 'Verwerfen' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirmation.getByRole('button', { name: 'Dialog schließen' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(editor).toBeVisible()
  await expect(editor).not.toHaveAttribute('inert', '')
  const introduction = editor.getByLabel('Freitext / Hinweis', { exact: true })
  await expect(introduction).toBeFocused()
  await expect(introduction).toHaveValue('Noch nicht gespeichert')
  await expect(page.locator('#root')).toHaveAttribute('inert', '')
  await expect(page.locator('body')).toHaveClass(/modal-open/)
  await page.keyboard.press('Escape')
  await expect(confirmation.getByRole('button', { name: 'Weiter bearbeiten' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirmation.getByRole('button', { name: 'Verwerfen', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(editor).toHaveCount(0)
  await expect(editButton).toBeFocused()
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
  await expect(page.locator('body')).not.toHaveClass(/modal-open/)
  await page.reload()
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(editor.getByLabel('Freitext / Hinweis', { exact: true })).not.toHaveValue('Noch nicht gespeichert')
})

test('P10 Browser: interne Navigation schützt alle Editorwerte und Verwerfen speichert nichts', async ({ page }) => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  await seed(page, state)
  const storedBefore = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten' })
  await editor.getByLabel('Freitext / Hinweis', { exact: true }).fill('Ungespeicherter Freitext')
  const overview = page.locator('.sidebar nav button').filter({ hasText: 'Personen' })
  await overview.evaluate((element) => (element as HTMLButtonElement).click())
  const confirmation = page.getByRole('alertdialog', { name: 'Ungespeicherte Rechnungsänderungen verwerfen?' })
  await confirmation.getByRole('button', { name: 'Weiter bearbeiten' }).click()
  await expect(editor.getByLabel('Freitext / Hinweis', { exact: true })).toHaveValue('Ungespeicherter Freitext')
  await overview.evaluate((element) => (element as HTMLButtonElement).click())
  await confirmation.getByRole('button', { name: 'Verwerfen' }).click()
  await expect(page.getByRole('heading', { name: 'Personen', exact: true })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(storedBefore)
  await page.reload()
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  await expect(editor.getByLabel('Freitext / Hinweis', { exact: true })).not.toHaveValue('Ungespeicherter Freitext')
})


test('P10 Browser: Importbestätigung bleibt als oberster Dialog erreichbar', async ({ page }) => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  await seed(page, state)
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await page.locator('#backup input[type=file]').setInputFiles({
    name: 'synthetische-sicherung.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(state)),
  })
  const review = page.getByRole('dialog', { name: 'Import und Reparatur prüfen' })
  await review.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Backup als neuen Stand wiederherstellen?' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: 'Abbrechen' })).toBeFocused()
  await expect(review).toHaveAttribute('inert', '')
  await expect(page.locator('#root')).toHaveAttribute('inert', '')
  await expect(page.locator('body')).toHaveClass(/modal-open/)
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(review).toBeVisible()
  await expect(review).not.toHaveAttribute('inert', '')
  await expect(review.getByRole('button', { name: 'Wiederherstellung vorbereiten', exact: true })).toBeFocused()
  await expect(page.locator('body')).toHaveClass(/modal-open/)
})

test('P10 Browser: mobile Navigation ist geschlossen inert und stellt Fokus wieder her', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Navigation öffnen' })
  const sidebar = page.locator('#mobile-sidebar')
  await expect(sidebar).toHaveAttribute('inert', '')
  const hiddenInvoiceLink = sidebar.locator('button').filter({ hasText: 'Rechnungen' })
  expect(await hiddenInvoiceLink.evaluate((element) => {
    element.focus()
    return element === document.activeElement
  })).toBe(false)
  await tabTo(page, trigger)
  await page.keyboard.press('Enter')
  const close = page.locator('#mobile-sidebar').getByRole('button', { name: 'Navigation schließen' })
  await expect(close).toBeFocused()
  await expect(page.locator('.app-main')).toHaveAttribute('inert', '')
  await expect(page.locator('.mobile-bottom-nav')).toHaveAttribute('inert', '')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await tabTo(page, trigger)
  await page.keyboard.press('Enter')
  await expect(close).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(trigger).toBeFocused()
  await expect(sidebar).toHaveAttribute('inert', '')
  await expect(page.locator('.app-main')).not.toHaveAttribute('inert', '')
})

test('P10 Browser: relevante Textkontraste erreichen in beiden Themes AA', async ({ page }, testInfo) => {
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  await seed(page, state)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((nextTheme) => { document.documentElement.dataset.theme = nextTheme }, theme)
    const pairs = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return [
        [style.getPropertyValue('--on-error'), style.getPropertyValue('--error')],
        [style.getPropertyValue('--on-surface-variant'), style.getPropertyValue('--surface-container-low')],
        [style.getPropertyValue('--on-surface-variant'), style.getPropertyValue('--surface')],
      ]
    })
    for (const [foreground, background] of pairs) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
    await finishAnimations(page)
    await page.screenshot({ path: testInfo.outputPath(`kontrast-${theme}-kleine-texte.png`), fullPage: false })
    await invoices(page)
    await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten' })
    await editor.getByLabel('Freitext / Hinweis', { exact: true }).fill(`Kontrastprüfung ${theme}`)
    await page.keyboard.press('Escape')
    const confirmation = page.getByRole('alertdialog', { name: 'Ungespeicherte Rechnungsänderungen verwerfen?' })
    const danger = confirmation.getByRole('button', { name: 'Verwerfen', exact: true })
    const actualPair = await danger.evaluate((element) => {
      const style = getComputedStyle(element)
      return [style.color, style.backgroundColor]
    })
    expect(contrast(actualPair[0], actualPair[1])).toBeGreaterThanOrEqual(4.5)
    await finishAnimations(page)
    await page.screenshot({ path: testInfo.outputPath(`kontrast-${theme}-fehlerdialog.png`), fullPage: false })
    await danger.click()
    await page.getByRole('button', { name: 'Rechnungen', exact: true }).first().click()
  }
})

test('P10 Browser: Datei-, Chip- und Theme-Eingaben markieren das sichtbare Bedienelement', async ({ page }, testInfo) => {
  const outline = async (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).outlineStyle !== 'none' && Number.parseFloat(getComputedStyle(element).outlineWidth) >= 3)
  const state = saveInvoiceDraft(documentFamily(), documentDraft(), false, documentAt)
  await seed(page, state)
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  const themeInput = page.getByRole('radio', { checked: true })
  await tabTo(page, themeInput)
  const themeControl = themeInput.locator('xpath=..')
  await themeControl.scrollIntoViewIfNeeded()
  expect(await outline(themeControl)).toBe(true)
  await finishAnimations(page)
  await page.screenshot({ path: testInfo.outputPath('fokus-theme.png'), fullPage: false })
  const fileInput = page.locator('#backup input[type=file]')
  await tabTo(page, fileInput)
  const fileControl = fileInput.locator('xpath=..')
  await fileControl.scrollIntoViewIfNeeded()
  expect(await outline(fileControl)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('fokus-datei.png'), fullPage: false })
  await invoices(page)
  await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const chipInput = page.locator('.choice-chip input').first()
  await tabTo(page, chipInput)
  expect(await outline(chipInput.locator('xpath=..'))).toBe(true)
  await finishAnimations(page)
  await page.screenshot({ path: testInfo.outputPath('fokus-chip.png'), fullPage: false })
})

for (const width of [390, 1280]) {
  test(`P02 Browser: Rechnungen starten direkt, Navigation, Suche und Statusfilter bleiben bei ${width} Pixeln`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await seed(page, saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt))
    await expect(page.getByRole('heading', { name: 'Rechnungen', exact: true })).toBeVisible()
    const navigation = page.locator(width === 390 ? '.mobile-bottom-nav' : '.sidebar nav')
    await expect(navigation.getByRole('button')).toHaveCount(3)
    await expect(navigation.getByRole('button', { name: 'Rechnungen', exact: true })).toHaveAttribute('aria-current', 'page')
    await navigation.getByRole('button', { name: 'Personen', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Personen', exact: true })).toBeVisible()
    await navigation.getByRole('button', { name: 'Einstellungen', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
    await navigation.getByRole('button', { name: 'Rechnungen', exact: true }).click()
    const search = page.getByRole('searchbox', { name: 'Rechnungen durchsuchen' })
    const rows = page.locator('.invoice-list-table tbody tr')
    await search.fill('fehlt-in-allen-rechnungen')
    await expect(rows).toHaveCount(0)
    await search.fill('2026-0001-a')
    await expect(rows).toHaveCount(1)
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('paid')
    await expect(rows).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('all')
    await page.getByRole('button', { name: '2026-0001-a', exact: true }).click()
    await expect(page.getByRole('button', { name: 'PDF / Drucken', exact: true })).toBeVisible()
    await expect(page.getByLabel('Tatsächlicher Zahlungstag', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /CSV|Text kopieren|Übersicht|Auswertung|Über mich/ })).toHaveCount(0)
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
  })
}

test('P02 Browser: kompakte Einrichtung, ein isolierter Demo-Einstieg und Info-Link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Rechnungen', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Einrichtung', exact: true })).toBeVisible()
  const demo = page.getByRole('button', { name: 'Mit Beispieldaten testen', exact: true })
  await expect(demo).toHaveCount(1)
  await expect(page.getByRole('link', { name: /Info öffnen/ })).toHaveAttribute('href', 'https://github.com/sl3ndrr/RiffRechnung/blob/main/docs/about.md')
  await expect(page.getByRole('link', { name: /Info öffnen/ })).toHaveText(`Info · Version ${version}`)
  await expect(page.getByRole('link', { name: /Info öffnen/ })).toHaveAttribute('aria-label', `Info öffnen (neuer Tab), aktuelle Version ${version}`)
  await demo.click()
  await expect(page.getByRole('button', { name: 'Demo verlassen', exact: true })).toBeVisible()
  await expect(demo).toHaveCount(0)
  await page.getByRole('button', { name: 'Demo verlassen', exact: true }).click()
  await expect(demo).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Einrichtung', exact: true })).toBeVisible()
})
