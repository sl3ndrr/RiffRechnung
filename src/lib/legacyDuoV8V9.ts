import { backupArray, backupObject, backupCalendarDate, backupString, backupEnum, backupInteger, knownKeys, invalidBackup } from './validation'
import { validId, validQuantity } from './values'

/** Schema 8/9 only: group metadata is evidence, never a working model. */
export function detachLegacyDuoGroups(value: unknown): Record<string, unknown> {
  const state = structuredClone(backupObject(value, 'data'))
  if (state.schemaVersion !== 8 && state.schemaVersion !== 9) throw new Error('Duo-Altformatadapter unterstützt nur Schema 8/9.')
  if (state.duoGroups !== undefined) validateDuoGroups(state.duoGroups)
  Reflect.deleteProperty(state, 'duoGroups')
  return state
}

function registerId(value: unknown, path: string, ids: Set<string>): void {
  if (!validId(value) || ids.has(value)) invalidBackup(path, 'benötigt eine eindeutige gültige ID')
  ids.add(value as string)
}

function validateDuoGroups(value: unknown): void {
  const groups = new Set<string>(), invoices = new Set<string>(), items = new Set<string>()
  backupArray(value, 'duoGroups').forEach((entry, index) => {
    const path = `duoGroups[${index}]`, group = backupObject(entry, path)
    knownKeys(group, path, 'id targets lesson totalCents')
    registerId(group.id, `${path}.id`, groups)
    const targets = backupArray(group.targets, `${path}.targets`)
    if (targets.length !== 2) invalidBackup(`${path}.targets`, 'benötigt genau zwei verschiedene Zielrechnungen')
    targets.forEach((entry, i) => {
      const p = `${path}.targets[${i}]`, target = backupObject(entry, p)
      knownKeys(target, p, 'invoiceId itemId')
      registerId(target.invoiceId, `${p}.invoiceId`, invoices)
      registerId(target.itemId, `${p}.itemId`, items)
      // Missing partners/items are valid: deleting a draft must not delete its partner.
    })
    const lesson = backupObject(group.lesson, `${path}.lesson`)
    knownKeys(lesson, `${path}.lesson`, 'serviceDate description quantity unit')
    backupCalendarDate(lesson.serviceDate, `${path}.lesson.serviceDate`)
    backupString(lesson.description, `${path}.lesson.description`, true)
    if (!validQuantity(lesson.quantity)) invalidBackup(`${path}.lesson.quantity`, 'benötigt eine gültige Menge')
    backupEnum(lesson.unit, `${path}.lesson.unit`, ['Std.', 'Pauschale', 'Stück'])
    if (group.totalCents !== undefined) backupInteger(group.totalCents, `${path}.totalCents`, 0)
  })
}



