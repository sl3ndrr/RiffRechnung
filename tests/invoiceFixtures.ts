import { legacyFixture } from './documentFixtures'
import { captureLegacyDocuments } from '../src/lib/importState'
import assert from 'node:assert/strict'
import type { Invoice, Student } from '../src/types'
import { defaultSettings, emptyState } from '../src/lib/defaults'
import { loadState, serializeBackup } from '../src/lib/storage'
import { createLessonItem } from '../src/lib/invoiceDrafts'

export const student = (id: string, name: string, billingCode: string): Student => ({
  id,
  name,
  billingCode,
  guardianIds: [],

  active: true,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
})

export const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'invoice-test',
  number: '2026-a-0001',
  sequence: 1,
  year: 2026,
  invoiceDate: '2026-08-01',
  dueDate: '2026-08-15',
  period: 'August 2026',
  status: 'sent',
  recipients: ([]).map((id) => ({ type: 'guardian' as const, id })),
  studentIds: ['student-a'],
  recipientStrategy: 'joint',
  items: [],
  freeText: '',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
})

export function withMockLocalStorage(run: () => void): void {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const entries = new Map<string, string>()
  const localStorageMock: Storage = {
    get length() { return entries.size },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock })

  try {
    run()
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

export function loadReadyState() {
  const loaded = loadState()
  if (loaded.status !== 'ready') assert.fail(`Unerwarteter Recovery-Zustand: ${loaded.error}`)
  return loaded.state
}

export function validImportState() {
  const state = emptyState()
  state.guardians.push({
    id: 'guardian-a',
    name: 'Alex Beispiel',
    email: 'alex@example.de',
    phone: '0123456789',
    address: { street: 'Beispielweg 1', postalCode: '12345', city: 'Beispielstadt' },

    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  })
  state.students.push({ ...student('student-a', 'Anna', 'a'), guardianIds: ['guardian-a'] })
  state.nextStudentCodeIndex = 1
  state.invoices.push(invoice({
    recipients: (['guardian-a']).map((id) => ({ type: 'guardian' as const, id })),
    items: [createLessonItem('student-a', '2026-08-05', defaultSettings, 'item-a')],
  }))
  const current = captureLegacyDocuments(legacyFixture(state))
  current.schemaVersion = 15
  current.settings = {
    ...current.settings,
    issuer: { name: 'Synthetisches Studio', street: 'Testweg 1', postalCode: '12345', city: 'Teststadt', email: 'studio@example.de', phone: '' },
    accountHolder: 'Synthetisches Studio',
    iban: 'DE02120300000000202051',
  }
  return current
}

export function corruptBackup(mutate: (data: Record<string, unknown>) => void): string {
  const backup = JSON.parse(serializeBackup(validImportState())) as { data: Record<string, unknown> }
  mutate(backup.data)
  return JSON.stringify(backup)
}
