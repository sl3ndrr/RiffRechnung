import { test, expect, type Locator, type Page } from '@playwright/test'
import type { AppState } from '../../src/types'
import { documentAt, documentDraft, documentFamily } from '../documentFixtures'
import { changeInvoiceStatus, saveInvoiceDraft } from '../../src/lib/invoiceActions'
import { parseBackup, serializeBackup, STORAGE_KEY } from '../../src/lib/storage'

async function seed(page: Page, state: AppState) {
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
}

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 100 && !await target.evaluate((element) => element === document.activeElement); index++) await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
}

function contrast(foreground: string, background: string) {
  const luminance = (value: string) => {
    const [r, g, b] = value.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number).map((channel) => {
      const normalized = channel / 255
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4
    })
    return .2126 * r + .7152 * g + .0722 * b
  }
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + .05) / (darker + .05)
}

async function textContrast(locator: Locator) {
  const pairs = await locator.evaluateAll((elements) => elements.map((element) => {
    let ancestor: Element | null = element
    let background = 'rgba(0, 0, 0, 0)'
    while (ancestor && background === 'rgba(0, 0, 0, 0)') {
      background = getComputedStyle(ancestor).backgroundColor
      ancestor = ancestor.parentElement
    }
    return [getComputedStyle(element).color, background]
  }))
  for (const [foreground, background] of pairs) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
}

for (const width of [320, 390, 900, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`P12: lesbare Positionen, Zusatzfelder und Tastatur bei ${width}px / ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      const family = documentFamily()
      family.settings.theme = theme
      const draft = { ...documentDraft(), studentIds: ['s-a', 's-b'], recipients: [{ type: 'guardian' as const, id: 'g-a' }, { type: 'guardian' as const, id: 'g-b' }] }
      await seed(page, saveInvoiceDraft(family, draft, false, documentAt))
      await page.getByRole('button', { name: 'Entwurf', exact: true }).click()
      await expect(page.locator('.position-summary')).toContainText('Originaler Unterricht')
      await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
      const editor = page.getByRole('dialog', { name: 'Entwurf bearbeiten', exact: true })
      expect(await editor.locator('.modal__footer').evaluate((footer) => {
        const bounds = footer.getBoundingClientRect()
        return [...footer.querySelectorAll('button')].every((button) => {
          const rect = button.getBoundingClientRect()
          return rect.left >= bounds.left && rect.right <= bounds.right && button.scrollWidth <= button.clientWidth + 1
        })
      })).toBe(true)
      const item = editor.locator('.editor-item').first()
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
      for (const label of ['Datum', 'Beschreibung', 'Menge', 'Einheit', 'Art', 'Lernende Person']) await expect(item.getByLabel(label, { exact: true })).toBeVisible()
      await expect(item.getByRole('textbox', { name: 'Einzelpreis €', exact: true })).toBeVisible()
      const geometry = await item.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return [...element.querySelectorAll('.field, .editor-item__total')].every((field) => {
          const rect = field.getBoundingClientRect()
          return rect.left >= bounds.left && rect.right <= bounds.right && field.scrollWidth <= field.clientWidth + 1
        }) && element.scrollWidth <= element.clientWidth + 1
      })
      expect(geometry).toBe(true)
      await textContrast(item.locator('.field > span, .editor-item__total span, .editor-item__total strong'))
      const quantity = item.getByRole('textbox', { name: 'Menge', exact: true })
      await tabTo(page, quantity)
      const focus = await item.locator('.quantity-stepper').evaluate((element) => {
        const style = getComputedStyle(element)
        return { visible: style.outlineStyle === 'solid', color: style.outlineColor, background: style.backgroundColor }
      })
      expect(focus.visible).toBe(true)
      expect(contrast(focus.color, focus.background)).toBeGreaterThanOrEqual(3)
      await quantity.press('ArrowUp')
      await expect(quantity).toHaveValue('1')
      await quantity.press('ArrowDown')
      await expect(quantity).toHaveValue('0.75')
      await quantity.fill('0.01')
      await expect(item.getByRole('button', { name: /verringern$/ })).toBeDisabled()
      await quantity.fill('99.99')
      await expect(item.getByRole('button', { name: /erhöhen$/ })).toBeDisabled()
      await quantity.fill('1.25')
      await tabTo(page, item.getByLabel('Einheit', { exact: true }))
      await item.getByLabel('Einheit', { exact: true }).selectOption('Stück')
      await tabTo(page, item.getByLabel('Art', { exact: true }))
      await item.getByLabel('Art', { exact: true }).selectOption('duo')
      await tabTo(page, item.getByLabel('Lernende Person', { exact: true }))
      await item.getByLabel('Lernende Person', { exact: true }).selectOption('s-b')
      await item.getByLabel('Datum', { exact: true }).fill('2026-09-02')
      await item.getByLabel('Beschreibung', { exact: true }).fill('Gemeinsame Übung')
      const price = item.getByRole('textbox', { name: 'Einzelpreis €', exact: true })
      await price.fill('12,50')
      await expect(item.locator('.editor-item__total strong')).toHaveText('15,63 €')
      await item.screenshot({ path: testInfo.outputPath(`position-${width}-${theme}.png`) })
      // Enter from a normal input uses the native form submit and preserves every field.
      await price.press('Enter')
      await expect(editor).not.toBeVisible()
      await page.reload()
      const stored = parseBackup((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
      expect(stored.invoices[0].items[0]).toMatchObject({ serviceDate: '2026-09-02', description: 'Gemeinsame Übung', quantity: 1.25, unitPrice: 12.5, unit: 'Stück', lessonType: 'duo', studentId: 's-b' })
      expect(stored.invoices[0].recipients).toEqual(draft.recipients)
      expect(stored.invoices[0].number).toBeNull()
    })
  }
}

for (const width of [320, 390, 1280]) {
  test(`P12: offen, bezahlt und abgeleitete Überfälligkeit bleiben bei ${width}px sichtbar`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'))
    let state = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt)
    state = saveInvoiceDraft(state, { ...documentDraft(), invoiceDate: '2026-09-02', dueDate: '2026-09-03', items: documentDraft().items.map((item) => ({ ...item, id: `${item.id}-overdue` })) }, true, documentAt)
    state = saveInvoiceDraft(state, { ...documentDraft(), invoiceDate: '2026-09-03', items: documentDraft().items.map((item) => ({ ...item, id: `${item.id}-paid` })) }, true, documentAt)
    state = changeInvoiceStatus(state, state.invoices[2].id, 'paid', documentAt, '2026-09-07')
    await seed(page, state)
    const actions = page.getByRole('button', { name: 'Aktionen für 2026-0003-a öffnen', exact: true })
    await tabTo(page, actions)
    await actions.press('Enter')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    expect(await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const last = element.lastElementChild!.getBoundingClientRect()
      const hit = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2)
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && Boolean(hit && element.contains(hit))
    })).toBe(true)
    await page.keyboard.press('Escape')
    await expect(actions).toBeFocused()
    await page.getByRole('button', { name: '2026-0003-a', exact: true }).press('Enter')
    await expect(page.locator('.position-summary')).toHaveCount(0)
    await page.keyboard.press('Escape')
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
      const visible = page.locator('.invoice-list-table .status-chip:visible')
      await expect(visible).toHaveText(['Bezahlt', 'Überfällig', width < 640 ? 'Offen' : 'Versendet'])
      await textContrast(visible)
      expect(await page.locator('.invoice-list-table').evaluate((element) => element.scrollWidth <= element.parentElement!.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`liste-${width}-${theme}.png`) })
    }
  })
}

test('P12: Systemtheme, Bewegungspräferenzen und Aktiv-Filter mit sichtbarem Fokus', async ({ page }, testInfo) => {
  const state = documentFamily()
  state.settings.theme = 'system'
  state.students[1].active = false
  await seed(page, state)
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await page.getByRole('button', { name: 'Personen', exact: true }).first().click()
    const filter = page.getByRole('checkbox', { name: /Nur aktive Lernende anzeigen/ })
    await expect(filter).toBeChecked()
    await expect(page.locator('.student-card')).toHaveCount(1)
    await tabTo(page, filter)
    const track = filter.locator('xpath=..').locator('i')
    expect(await track.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
    const knob = await track.evaluate((element) => [getComputedStyle(element, '::after').backgroundColor, getComputedStyle(element).backgroundColor])
    expect(contrast(knob[0], knob[1])).toBeGreaterThanOrEqual(3)
    await textContrast(filter.locator('xpath=..').locator('strong, small'))
    await filter.press('Space')
    await expect(filter).not.toBeChecked()
    await expect(page.locator('.student-card')).toHaveCount(2)
    await page.screenshot({ path: testInfo.outputPath(`personen-fokus-${theme}.png`) })
    await filter.press('Space')
  }
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).first().click()
  await page.getByRole('checkbox', { name: /Bewegungen reduzieren/ }).check()
  await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/reduce-motion/)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Rechnungen', exact: true }).first().click()
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  expect(await page.locator('.topbar, .modal-layer, .modal, .surface').evaluateAll((elements) => elements.every((element) => {
    const style = getComputedStyle(element)
    return style.backdropFilter === 'none' && style.boxShadow === 'none'
  }))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Neue Rechnung', exact: true })).toBeFocused()
})
