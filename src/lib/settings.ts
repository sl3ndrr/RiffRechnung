import type { Settings } from '../types'
import { cleanIban, ensureStudentCodePattern, germanIbanError, limitFooterText } from './utils'

export const STANDARD_RATE_ERROR = 'Bitte einen vollständigen, endlichen Preis ab 0 eingeben. Der letzte gültige Preis bleibt erhalten.'

export function parseStandardRate(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function applyStandardRateInput(settings: Settings, field: 'privateRate' | 'duoRate', raw: string): Settings {
  const value = parseStandardRate(raw)
  return value === null ? settings : { ...settings, [field]: value }
}

export function settingsChangeErrors(previous: Settings, next: Settings): string[] {
  const errors: string[] = []
  if (![next.privateRate, next.duoRate].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) errors.push(STANDARD_RATE_ERROR)
  const accountChanged = (['accountHolder', 'iban', 'bic', 'bankName'] as const).some((key) => previous[key] !== next[key])
  // An empty IBAN is an incomplete setup, never a finalizable bank account.
  if (accountChanged && cleanIban(next.iban)) {
    const error = germanIbanError(next.iban)
    if (error) errors.push(error)
  }
  return errors
}

export function updateSettings(previous: Settings, next: Settings): Settings {
  const errors = settingsChangeErrors(previous, next)
  if (errors.length) throw new Error(errors.join(' '))
  return { ...next, defaultLegalText: limitFooterText(next.defaultLegalText), numberPattern: ensureStudentCodePattern(next.numberPattern) }
}
