export function contactPartError(value: string | undefined, label: string): string | null {
  if (!value?.trim()) return `${label} fehlt.`
  if (value.trim().length > 120) return `${label} darf höchstens 120 Zeichen lang sein.`
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) return `${label} darf keine Steuerzeichen enthalten.`
  return null
}

export function contactName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`
}
