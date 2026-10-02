import type { AppState } from '../types'

interface Change { path: string; before: unknown; after: unknown; reason: string }

/** Validated old content copies are redundant; historical raw invoices stay intact. */
export function consolidateDocumentOutput(state: AppState, changes: Change[] = []): AppState {
  for (const [index, version] of state.documentVersions.entries()) {
    for (const field of ['snapshot', 'draftPrintSnapshot', 'period', 'legalText']) {
      if (!Object.hasOwn(version.content, field)) continue
      Reflect.deleteProperty(version.content, field)
      changes.push({ path: `documentVersions[${index}].content.${field}`, before: '[redundante Kopie]', after: null,
        reason: 'Bestehende output-Felder sind die verbindliche Ausgabequelle. Historische Rohangaben und Konflikte bleiben im bisherigen Beleg erhalten; keine neue Archivkopie.' })
    }
  }
  state.schemaVersion = 13
  changes.push({ path: 'schemaVersion', before: 12, after: 13, reason: 'Beleginhalt ohne doppelte Ausgabeinformationen; Ausgabe, Rohbelege, Beträge, Nummern und historische Nachweise unverändert.' })
  return state
}
