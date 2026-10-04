import { test, expect, type Page } from '@playwright/test'
import type { AppState } from '../../src/types'
import { saveInvoiceState } from '../../src/lib/commands'
import { invoiceDraftFields } from '../../src/lib/invoiceDrafts'
import { requireSuccess } from '../../src/lib/result'
import { serializeBackup, STORAGE_KEY } from '../../src/lib/storage'
import { undoAt, undoFixture } from '../undoFixtures'
import { navigateToInvoices } from './navigation'

const undoButton = (page: Page) => page.getByRole('button', { name: 'Löschen von Entwurf rückgängig machen', exact: true })
const stateOf = (page: Page): Promise<AppState> => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, STORAGE_KEY)

async function seed(page: Page, state = undoFixture()) {
  await page.clock.install({ time: new Date(undoAt) })
  await page.goto('/')
  await page.evaluate(async (raw) => {
    const path = '/src/lib/storage.ts'
    const { StorageSession } = await import(path)
    await new StorageSession().restore(raw)
  }, serializeBackup(state))
  await page.reload()
  await page.clock.pauseAt(new Date('2026-10-04T07:01:00.000Z'))
  return state
}

async function deleteDraft(page: Page) {
  await page.locator('.invoice-list-table').getByRole('button', { name: 'Entwurf', exact: true }).first().click()
  await page.locator('.invoice-detail__footer').getByRole('button', { name: 'Löschen', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Entwurf löschen?', exact: true }).getByRole('button', { name: 'Entwurf löschen', exact: true }).click()
  await expect(undoButton(page).last()).toBeVisible()
  await page.mouse.move(0, 0)
}

test('3.AP5: Entwurf-Undo vor Ablauf erhält ID, Inhalt, Nummernkreis und Zwischenänderung', async ({ page }) => {
  const initial = await seed(page)
  await navigateToInvoices(page)
  await deleteDraft(page)
  await expect(page.locator('.toast')).toContainText('Entwurf gelöscht. Rückgängig möglich.')
  expect((await stateOf(page)).invoices).toHaveLength(0)
  await page.clock.runFor(9000)
  await page.locator('.topbar').getByRole('radio', { name: 'Dunkel', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await undoButton(page).click()
  await expect.poll(async () => (await stateOf(page)).invoices.length).toBe(1)
  const restored = await stateOf(page)
  expect(restored.invoices).toEqual(initial.invoices)
  expect(restored.counters).toEqual(initial.counters)
  expect(restored.settings.theme).toBe('dark')
  expect(restored.audit.slice(0, 3).map((event) => event.label)).toEqual(['Löschen rückgängig gemacht', 'Farbschema geändert', 'Rechnungsentwurf gelöscht'])
  await expect(undoButton(page)).toHaveCount(0)
  await page.reload()
  expect((await stateOf(page)).invoices).toEqual(initial.invoices)
})

test('3.AP5: genau 10 Sekunden, anschließend kein Undo; normale Toasts weiter 4200 ms', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await deleteDraft(page)
  await page.clock.runFor(9999)
  await expect(undoButton(page)).toBeVisible()
  await page.clock.runFor(1)
  await expect(undoButton(page)).toHaveCount(0)
  expect((await stateOf(page)).invoices).toHaveLength(0)
  await page.locator('.sidebar').getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await page.getByRole('button', { name: 'JSON exportieren', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('JSON-Export')
  await page.mouse.move(0, 0)
  await page.clock.runFor(4199)
  await expect(page.locator('.toast')).toHaveCount(1)
  await page.clock.runFor(1)
  await expect(page.locator('.toast')).toHaveCount(0)
})

test('3.AP5: Hover pausiert den Timer und setzt mit Restzeit fort', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await deleteDraft(page)
  await page.clock.runFor(4000)
  await page.locator('.toast').hover()
  await expect(page.locator('.toast__progress')).toHaveCSS('animation-play-state', 'paused')
  await page.clock.runFor(20_000)
  await expect(undoButton(page)).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(page.locator('.toast__progress')).toHaveCSS('animation-play-state', 'running')
  await page.clock.runFor(5999)
  await expect(undoButton(page)).toBeVisible()
  await page.clock.runFor(1)
  await expect(undoButton(page)).toHaveCount(0)
})

test('3.AP5: Fokus und Hover überlappen; Wechsel zwischen Toastbuttons erhält die Pause', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await deleteDraft(page)
  await page.clock.runFor(3000)
  await undoButton(page).focus()
  await page.locator('.toast').hover()
  await page.mouse.move(0, 0)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Meldung schließen', exact: true })).toBeFocused()
  await page.clock.runFor(20_000)
  await expect(undoButton(page)).toBeVisible()
  await page.locator('.topbar').getByRole('radio', { name: 'System', exact: true }).focus()
  await page.clock.runFor(6999)
  await expect(undoButton(page)).toBeVisible()
  await page.clock.runFor(1)
  await expect(undoButton(page)).toHaveCount(0)
})

test('3.AP5: Keyboard-Undo hat sichtbaren Fokus und klaut bei Erscheinen keinen Fokus', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await deleteDraft(page)
  await expect(undoButton(page)).not.toBeFocused()
  await undoButton(page).focus()
  const focus = await undoButton(page).evaluate((element) => {
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
  })
  expect(focus.style).toBe('solid')
  expect(focus.width).toBeGreaterThanOrEqual(3)
  await page.clock.runFor(20_000)
  await page.keyboard.press('Space')
  await expect.poll(async () => (await stateOf(page)).invoices.length).toBe(1)
})

for (const [kind, name, confirmation] of [['guardian', 'Kontakt g1', 'Kontakt löschen'], ['student', 'Kind s1', 'Lernende Person löschen']] as const) {
  test(`3.AP5: ${kind}-Undo stellt Personen und Entwurfszuordnungen wieder her`, async ({ page }) => {
    const initial = await seed(page)
    await page.locator('.sidebar').getByRole('button', { name: 'Personen', exact: true }).click()
    await page.getByRole('button', { name: `${name} löschen`, exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: confirmation, exact: true }).click()
    const button = page.getByRole('button', { name: `Löschen von ${name} rückgängig machen`, exact: true })
    await expect(button).toBeVisible()
    await button.click()
    await expect.poll(async () => (await stateOf(page))[kind === 'guardian' ? 'guardians' : 'students'].length).toBe(2)
    const restored = await stateOf(page)
    expect(restored.guardians).toEqual(initial.guardians)
    expect(restored.students).toEqual(initial.students)
    expect(restored.invoices).toEqual(initial.invoices)
    expect(restored.nextStudentCodeIndex).toBe(initial.nextStudentCodeIndex)
  })
}

test('3.AP5: Archivieren und Zurückholen sind umkehrbar, Originale bleiben gleich', async ({ page }) => {
  const initial = undoFixture()
  const finalized = requireSuccess(saveInvoiceState(initial, { id: initial.invoices[0].id, ...invoiceDraftFields(initial.invoices[0]) }, true, undoAt))
  await seed(page, finalized)
  await navigateToInvoices(page)
  await page.getByRole('button', { name: finalized.invoices[0].number!, exact: true }).click()
  await page.locator('.invoice-detail__footer').getByRole('button', { name: 'Archivieren', exact: true }).click()
  const undo = page.getByRole('button', { name: `Archivänderung von ${finalized.invoices[0].number} rückgängig machen`, exact: true })
  await expect(undo).toBeVisible()
  await undo.click()
  await expect.poll(async () => (await stateOf(page)).invoiceAdministration[0].archived).toBe(false)
  await page.getByRole('button', { name: finalized.invoices[0].number!, exact: true }).click()
  await page.locator('.invoice-detail__footer').getByRole('button', { name: 'Archivieren', exact: true }).click()
  await page.getByLabel('Archivierte anzeigen', { exact: true }).check()
  await page.getByRole('button', { name: finalized.invoices[0].number!, exact: true }).click()
  await page.locator('.invoice-detail__footer').getByRole('button', { name: 'Aus Archiv holen', exact: true }).click()
  await undo.last().click()
  await expect.poll(async () => (await stateOf(page)).invoiceAdministration[0].archived).toBe(true)
  expect((await stateOf(page)).documentVersions).toEqual(finalized.documentVersions)
  expect((await stateOf(page)).invoices).toEqual(finalized.invoices)
})

test('3.AP5: fehlende zugehörige Person zeigt Fehler ohne Wiederherstellung', async ({ page }) => {
  await seed(page)
  await navigateToInvoices(page)
  await deleteDraft(page)
  await page.locator('.sidebar').getByRole('button', { name: 'Personen', exact: true }).click()
  await page.getByRole('button', { name: 'Kontakt g1 löschen', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Kontakt löschen', exact: true }).click()
  await undoButton(page).click()
  await expect(page.locator('.toast').filter({ hasText: 'Rückgängig nicht möglich' })).toBeVisible()
  const state = await stateOf(page)
  expect(state.invoices).toHaveLength(0)
  expect(state.guardians.map((guardian) => guardian.id)).toEqual(['g2'])
})

test('3.AP5: maximal letzte drei Undo-Toasts, unabhängige Timer und Doppelklick', async ({ page }) => {
  let state = undoFixture()
  for (let index = 0; index < 3; index++) state = requireSuccess(saveInvoiceState(state, {
    ...invoiceDraftFields(state.invoices[0]), items: state.invoices[0].items.map((item) => ({ ...item, id: `extra-${index}-${item.id}` })),
  }, false, undoAt))
  await seed(page, state)
  await navigateToInvoices(page)
  for (let index = 0; index < 4; index++) {
    await deleteDraft(page)
    if (index < 3) await page.clock.runFor(1000)
  }
  await expect(undoButton(page)).toHaveCount(3)
  await expect(page.locator('.toast')).toHaveCount(3)
  await page.clock.runFor(8000)
  await expect(undoButton(page)).toHaveCount(2)
  const target = undoButton(page).last()
  // Two same-turn activations exercise the claim guard before React unmounts.
  await target.evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click() })
  await expect.poll(async () => (await stateOf(page)).invoices.length).toBe(1)
  expect((await stateOf(page)).audit.filter((event) => event.label === 'Löschen rückgängig gemacht')).toHaveLength(1)
  await undoButton(page).click()
  await expect.poll(async () => (await stateOf(page)).invoices.length).toBe(2)
})

test('3.AP5: Dialog und Mobilnavigation verdecken Undo nicht; Dialog-Tab erreicht den Button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page)
  await navigateToInvoices(page)
  await deleteDraft(page)
  await page.getByRole('button', { name: 'Neue Rechnung', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Neue Rechnung', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Löschen von Entwurf rückgängig machen', exact: true })).toBeVisible()
  const box = await undoButton(page).boundingBox()
  const nav = await page.locator('.mobile-bottom-nav').boundingBox()
  expect(box!.y + box!.height).toBeLessThan(nav!.y)
  const top = await undoButton(page).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
  })
  expect(top).toBe(true)
  await dialog.getByRole('button', { name: 'Finalisieren', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(undoButton(page)).toBeFocused()
  await page.clock.runFor(20_000)
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await stateOf(page)).invoices.length).toBe(1)
})

test('3.AP5: reduzierte Bewegung versteckt Fortschritt, Dauer bleibt 10 Sekunden', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seed(page)
  await navigateToInvoices(page)
  await deleteDraft(page)
  await expect(page.locator('.toast__progress')).toBeHidden()
  await page.clock.runFor(9999)
  await expect(undoButton(page)).toBeVisible()
  await page.clock.runFor(1)
  await expect(undoButton(page)).toHaveCount(0)
})

test('3.AP5: Demo-Undo bleibt in der Sitzung und Unmount entfernt Timer', async ({ page }) => {
  await page.clock.install({ time: new Date(undoAt) })
  await page.goto('/')
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await page.getByRole('button', { name: 'Mit Beispieldaten testen', exact: true }).click()
  await navigateToInvoices(page)
  await deleteDraft(page)
  await undoButton(page).click()
  await expect(page.locator('.toast').filter({ hasText: 'Löschen rückgängig gemacht.' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before)
  await deleteDraft(page)
  await page.getByRole('button', { name: 'Demo verlassen', exact: true }).click()
  await page.clock.runFor(20_000)
  await expect(page.locator('.toast')).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before)
})
