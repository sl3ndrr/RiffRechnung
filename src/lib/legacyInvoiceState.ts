import type { AppState } from '../types'

interface Change { path: string; before: unknown; after: unknown; reason: string }

/** Old raw fields and originals remain evidence; only new saves use derived-v1. */
export function migrateDerivedInvoiceState(state: AppState, changes: Change[] = []): AppState {
  state.schemaVersion = 14 as never
  changes.push({ path: 'schemaVersion', before: 13, after: 14,
    reason: 'Neue Arbeitsrechnungen ohne paralleles Jahr, Zeitraum oder Zahlungsstatus. Historische Rohangaben, Ausgabe, Zahlungen und Reservierungen unverändert; aktueller Zahlungsstand aus Zuordnungen, Zahlungstag nur aus bestätigten Zahlungen.' })
  return state
}

