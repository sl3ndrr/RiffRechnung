// One optional ASCII dot-atom mailbox; see docs/technical.md.
export const MAILBOX_ERROR = 'Bitte genau eine E-Mail-Adresse ohne Anzeigenamen, Leer- oder Steuerzeichen eingeben (z. B. vorname+unterricht@example.de).'

export function mailboxError(value: string): string | null {
  if (value === '') return null
  if (value.length > 254) return MAILBOX_ERROR
  const parts = value.split('@')
  if (parts.length !== 2) return MAILBOX_ERROR
  const [local, domain] = parts
  if (local.length > 64 || !/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/.test(local)) return MAILBOX_ERROR
  const labels = domain.split('.')
  if (labels.length < 2 || labels.some((label) => label.length > 63 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) return MAILBOX_ERROR
  return null
}
