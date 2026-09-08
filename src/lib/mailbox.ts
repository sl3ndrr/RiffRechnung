// One optional ASCII dot-atom mailbox; see docs/product-decisions.md.
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

export function buildMailto(recipients: string[], subject: string, body: string): string {
  for (const recipient of recipients) {
    if (!recipient || mailboxError(recipient)) throw new Error(`E-Mail nicht geöffnet: ungültige Empfängeradresse ${JSON.stringify(recipient)}. ${MAILBOX_ERROR}`)
  }
  if ([...subject].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('E-Mail nicht geöffnet: Der Betreff enthält Steuerzeichen.')
  // Encode EACH mailbox before joining. ?, &, # and % in a valid local part
  // remain mailbox characters and can never become URI query delimiters.
  const to = recipients.map((recipient) => recipient.split('@').map(encodeURIComponent).join('@')).join(',')
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
