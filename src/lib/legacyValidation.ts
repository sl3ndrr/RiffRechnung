import { cleanLegacyContacts } from './legacyContactsRecipients'
import { detachLegacyDuoGroups } from './legacyDuoV8V9'
import { validateLegacyStructure } from './validation'
import { stripLegacyTaxFields } from './legacyTaxFields'

/** Removed tax values are discarded; non-tax fields and invariants stay strict. */
export function validateLegacyV2Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(stripLegacyTaxFields(value).value), 2)
}

export function validateLegacyV3Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(stripLegacyTaxFields(value).value), 3)
}

export function validateLegacyV4Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(stripLegacyTaxFields(value).value), 4)
}

export function validateLegacyV5Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(stripLegacyTaxFields(value).value), 5)
}

export function validateLegacyV6Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(stripLegacyTaxFields(value).value), 6)
}

export function validateLegacyV7Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(stripLegacyTaxFields(value).value), 7)
}

export function validateLegacyV8Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(detachLegacyDuoGroups(stripLegacyTaxFields(value).value)), 8)
}

export function validateLegacyV9Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(detachLegacyDuoGroups(value)), 9)
}

export function validateLegacyV10Structure(value: unknown): void {
  validateLegacyStructure(cleanLegacyContacts(value), 10)
}


export function validateLegacyV11Structure(value: unknown): void {
  validateLegacyStructure(value, 11)
}
