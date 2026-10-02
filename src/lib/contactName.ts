export function contactNameError(value: string | undefined, label: string): string | null {
  if (!value?.trim()) return `${label} fehlt.`
  if (value.trim().length > 241) return `${label} darf höchstens 241 Zeichen lang sein.`
  if (Array.from(value).some((character) => {
    const code = character.codePointAt(0)!
    return code < 32 || code >= 127 && code <= 159
  })) return `${label} darf keine Steuerzeichen enthalten.`
  return null
}
