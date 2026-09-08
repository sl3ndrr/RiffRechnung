import type { AppState, Invoice, InvoiceDraft, InvoiceItem, InvoiceItemAllocation, InvoiceSplitPreview } from '../types'
import { freshId } from './identities'
import { saveInvoiceDraft } from './invoiceActions'
import { invoiceTotalCents, itemTotalCents, sumCents } from './money'
import { validateBackupState } from './validation'
import { billingPeriodFromItems, euro, uid } from './utils'

function allocationError(message: string): never {
  throw new Error(`Aufteilung unvollständig: ${message}`)
}

function allocatedItem(item: InvoiceItem, amountCents: number, sourceCents: number): InvoiceItem {
  if (amountCents === sourceCents) return structuredClone(item)
  return {
    ...structuredClone(item),
    description: `${item.description} (bestätigter Teilbetrag ${euro.format(amountCents / 100)} von ${euro.format(sourceCents / 100)})`,
    quantity: 1,
    unit: 'Pauschale',
    unitPrice: amountCents / 100,
  }
}

function containsName(text: string, name: string): boolean {
  return Boolean(name.trim()) && text.toLocaleLowerCase('de-DE').includes(name.trim().toLocaleLowerCase('de-DE'))
}

export function allocationCentsFromInput(input: string): number | null {
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(input)) return null
  const [whole, fraction = ''] = input.replace(',', '.').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export function previewInvoiceSplit(state: AppState, draft: InvoiceDraft, allocations: InvoiceItemAllocation[]): InvoiceSplitPreview {
  validateBackupState(state)
  if (draft.recipientStrategy !== 'separate' || draft.guardianIds.length < 2) allocationError('Mindestens zwei Empfänger:innen und „Je Person eine Rechnung“ auswählen.')
  if (draft.correction) allocationError('Korrekturen werden einzeln je bestehender Forderung bearbeitet; eine Korrektur darf nicht in mehrere Forderungen geteilt werden.')
  if (new Set(draft.guardianIds).size !== draft.guardianIds.length) allocationError('Empfänger:innen dürfen nicht doppelt vorkommen.')
  if (!draft.items.length) allocationError('Mindestens eine Position ergänzen.')
  const selectedGuardians = new Set(draft.guardianIds)
  const selectedStudents = new Set(draft.studentIds)
  const allocationByItem = new Map<string, InvoiceItemAllocation>()
  for (const allocation of allocations) {
    if (allocationByItem.has(allocation.itemId)) allocationError(`Position ${allocation.itemId} wurde mehrfach zugeordnet.`)
    allocationByItem.set(allocation.itemId, allocation)
  }
  if (allocationByItem.size !== draft.items.length || [...allocationByItem.keys()].some((id) => !draft.items.some((item) => item.id === id))) {
    allocationError('Jede vorhandene Position muss genau einmal zugeordnet werden; unbekannte Zuordnungen sind nicht zulässig.')
  }
  const itemStudentIds = new Set(draft.items.map((item) => item.studentId))
  if ([...selectedStudents].some((id) => !itemStudentIds.has(id))) allocationError('Jedes ausgewählte Kind benötigt mindestens eine zugeordnete Position.')

  const resultItems = new Map<string, InvoiceItem[]>()
  for (const item of draft.items) {
    if (!selectedStudents.has(item.studentId)) allocationError(`Position ${item.id} gehört keinem ausgewählten Kind.`)
    const student = state.students.find((entry) => entry.id === item.studentId)
    if (!student) allocationError(`Das Kind der Position ${item.id} fehlt in den aktuellen Stammdaten.`)
    const allocation = allocationByItem.get(item.id)
    if (!allocation?.parts.length) allocationError(`Position „${item.description || item.id}“ hat noch keine bestätigte Zuordnung.`)
    const usedRecipients = new Set<string>()
    const sourceCents = itemTotalCents(item)
    let allocatedCents = 0
    for (const part of allocation.parts) {
      if (!selectedGuardians.has(part.guardianId)) allocationError(`Eine Zuordnung von „${item.description || item.id}“ verweist auf eine nicht ausgewählte Person.`)
      if (usedRecipients.has(part.guardianId)) allocationError(`Eine Person kommt bei „${item.description || item.id}“ mehrfach vor.`)
      usedRecipients.add(part.guardianId)
      if (!student.guardianIds.includes(part.guardianId)) allocationError(`„${item.description || item.id}“ darf nur einer für ${student.name} hinterlegten Person zugeordnet werden.`)
      if (!Number.isSafeInteger(part.amountCents) || part.amountCents < 0 || (sourceCents > 0 && part.amountCents === 0)) allocationError(`Teilbeträge für „${item.description || item.id}“ müssen positive ganze Centbeträge sein.`)
      allocatedCents += part.amountCents
      if (!Number.isSafeInteger(allocatedCents)) allocationError(`Die Teilbeträge für „${item.description || item.id}“ überschreiten den sicheren Centbereich.`)
      resultItems.set(part.guardianId, [...(resultItems.get(part.guardianId) ?? []), allocatedItem(item, part.amountCents, sourceCents)])
    }
    if (allocatedCents !== sourceCents) allocationError(`Die bestätigten Teilbeträge für „${item.description || item.id}“ ergeben ${euro.format(allocatedCents / 100)} statt ${euro.format(sourceCents / 100)}.`)
  }

  const results = draft.guardianIds.map((guardianId) => {
    const items = resultItems.get(guardianId) ?? []
    const guardian = state.guardians.find((entry) => entry.id === guardianId)
    if (!guardian) allocationError(`Eine ausgewählte empfangende Person fehlt in den aktuellen Stammdaten (${guardianId}).`)
    if (!items.length) allocationError(`${guardian.name} hat keine Position. Person abwählen oder mindestens eine Leistung zuordnen.`)
    const studentIds = [...new Set(items.map((item) => item.studentId))]
    const foreignStudents = state.students.filter((student) => selectedStudents.has(student.id) && !studentIds.includes(student.id))
    const outputText = [draft.introText, draft.freeText, draft.legalText, ...items.map((item) => item.description)].join('\n')
    const leaked = foreignStudents.find((student) => containsName(outputText, student.name))
    if (leaked) allocationError(`Der Ausgabetext für ${guardian.name} nennt das nicht zugeordnete Kind ${leaked.name}. Text oder Zuordnung ausdrücklich trennen.`)
    return { guardianId, studentIds, items, totalCents: sumCents(items.map(itemTotalCents)) }
  })
  const sourceTotalCents = invoiceTotalCents(draft)
  const totalCents = sumCents(results.map((result) => result.totalCents))
  if (totalCents !== sourceTotalCents) allocationError(`Die Ergebnisrechnungen ergeben ${euro.format(totalCents / 100)} statt ${euro.format(sourceTotalCents / 100)}.`)
  return { results, sourceTotalCents, totalCents }
}

export function splitInvoiceDraft(
  state: AppState,
  draft: InvoiceDraft,
  allocations: InvoiceItemAllocation[],
  finalize: boolean,
  at = new Date().toISOString(),
  createId: (prefix: string) => string = uid,
): { state: AppState; invoiceIds: string[] } {
  const preview = previewInvoiceSplit(state, draft, allocations)
  const existing = draft.id ? state.invoices.find((invoice) => invoice.id === draft.id) : undefined
  if (draft.id && !existing) throw new Error('Der aufzuteilende Entwurf ist nicht mehr vorhanden. Bitte neu laden.')
  if (existing && (existing.status !== 'draft' || existing.number !== null || existing.snapshot)) throw new Error('Nur ein unveränderter Entwurf darf aufgeteilt werden.')
  let next: AppState = existing ? { ...state, invoices: state.invoices.filter((invoice) => invoice.id !== existing.id) } : state
  const occupiedItems = new Set(next.invoices.flatMap((invoice) => invoice.items.map((item) => item.id)))
  const invoiceIds: string[] = []
  for (const result of preview.results) {
    const items = result.items.map((item) => ({ ...item, id: freshId('item', occupiedItems, createId) }))
    const resultDraft: InvoiceDraft = {
      invoiceDate: draft.invoiceDate,
      dueDate: draft.dueDate,
      period: billingPeriodFromItems(items, draft.invoiceDate),
      guardianIds: [result.guardianId],
      studentIds: result.studentIds,
      recipientStrategy: 'separate',
      items,
      introText: draft.introText,
      freeText: draft.freeText,
      legalText: draft.legalText,
    }
    const before = new Set(next.invoices.map((invoice) => invoice.id))
    next = saveInvoiceDraft(next, resultDraft, finalize, at, createId)
    const created = next.invoices.find((invoice) => !before.has(invoice.id))
    if (!created) throw new Error('Die Aufteilung konnte keine neue Rechnung eindeutig bestimmen.')
    invoiceIds.push(created.id)
  }
  validateBackupState(next)
  return { state: next, invoiceIds }
}

export function needsHistoricalSplitReview(state: AppState, invoice: Invoice): boolean {
  if (invoice.recipientStrategy !== 'separate' || !invoice.versionId) return false
  return state.documentVersions.find((version) => version.id === invoice.versionId)?.provenance === 'oldest-available'
}
