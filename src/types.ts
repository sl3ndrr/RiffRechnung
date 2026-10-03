export type ThemeMode = 'system' | 'light' | 'dark'
export type PageKey = 'invoices' | 'people' | 'settings'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type RecipientStrategy = 'joint' | 'separate'
export type LessonType = 'solo' | 'duo'
export interface Address {
  street: string
  postalCode: string
  city: string
}

export interface Guardian {
  id: string
  name: string
  email: string
  phone: string
  address: Address
  createdAt: string
  updatedAt: string
}

export interface Student {
  id: string
  name: string
  billingCode: string
  guardianIds: string[]
  /** Absent means the historical billing mode through guardians. */
  selfPayer?: true
  /** Optional master data, including address parts. */
  contact?: { email: string; phone: string; address: Address }
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface InvoiceItem {
  id: string
  studentId: string
  serviceDate: string
  lessonType: LessonType
  description: string
  quantity: number
  unit: 'Std.' | 'Pauschale' | 'Stück'
  unitPrice: number
}

export interface IssuerSnapshot extends Address {
  name: string
  email: string
  phone: string
}

export interface GuardianSnapshot extends Address {
  id: string
  name: string
  email: string
}

export interface RecipientRef { type: 'guardian' | 'student'; id: string }
export interface RecipientSnapshot extends GuardianSnapshot { type: RecipientRef['type'] }

export interface StudentSnapshot {
  id: string
  name: string
}

export interface InvoiceSnapshot {
  issuer: IssuerSnapshot
  recipients: RecipientSnapshot[]
  students: StudentSnapshot[]
  accountHolder: string
  iban: string
  bic: string
  bankName: string
}

export interface Invoice {
  calculation?: 'decimal-v1'
  id: string
  number: string | null
  sequence: number | null
  /** Absent on historical records; new working values are derived. */
  stateModel?: 'derived-v1'
  /** Historical evidence or read-only projection, never new working values. */
  year?: number
  invoiceDate: string
  dueDate: string
  period?: string
  status: InvoiceStatus
  recipients: RecipientRef[]
  studentIds: string[]
  recipientStrategy: RecipientStrategy
  items: InvoiceItem[]
  freeText: string
  snapshot?: InvoiceSnapshot
  /** Frozen print data of a saved draft; distinct from an issued original. */
  draftPrintSnapshot?: InvoiceSnapshot
  /** Historical evidence or projection of confirmed allocated payments. */
  paidAt?: string
  sentAt?: string
  createdAt: string
  updatedAt: string
  versionId?: string
  correction?: { replacesId: string; reason: string }
  /** Output projection only; never accepted in persisted invoices. */
  issuedAmounts?: DocumentAmounts
  claimState?: 'active' | 'replaced'
  /** Read-only projection of the active claim; never persisted. */
  openAmountCents?: number
  archived?: boolean
}

export interface DocumentAmounts {
  itemCents: number[]
  totalCents: number
  legacyCalculatedTotalCents: number
  source: 'legacy-output' | 'number-register' | 'decimal-output'
  calculation: 'legacy-v1' | 'decimal-v1'
}

export type DocumentContent = Omit<Invoice, 'status' | 'paidAt' | 'sentAt' | 'updatedAt' | 'versionId' | 'correction' | 'issuedAmounts' | 'claimState' | 'archived' | 'openAmountCents' | 'snapshot' | 'draftPrintSnapshot' | 'period'>

export interface DocumentConflict {
  path: string
  message: string
  values: string[]
}

/** Permanent complete records, independent of the bounded activity feed. */
export interface DocumentVersion {
  id: string
  invoiceId: string
  originalId: string
  replacesId: string | null
  cancelsId: string | null
  reason: string
  provenance: 'issued' | 'oldest-available'
  sourceUpdatedAt: string
  /** Service/number/text inputs; frozen output fields exist only below. */
  content: DocumentContent
  outputSnapshot: InvoiceSnapshot
  outputPeriod: string
  amounts: DocumentAmounts
  conflicts: DocumentConflict[]
  snapshotHistory: AuditEvent[]
  registerEntries: VoidedInvoiceNumber[]
}

export interface InvoiceAdministration {
  versionId: string
  archived: boolean
  events: { at: string; status: Exclude<InvoiceStatus, 'draft'>; kind: 'imported' | 'status'; reason: string }[]
  resolutions: { at: string; reason: string }[]
}

export interface InvoicePayment {
  id: string
  sourceVersionId: string
  amountCents: number
  /** A confirmed business calendar day, never an automatically captured timestamp. */
  paidAt: string | null
  /** Separates a user-confirmed bank day from migrated, unconfirmed legacy data. */
  paymentDayStatus: 'confirmed' | 'unknown'
  /** Raw pre-P08 value retained for traceability; it never determines the confirmed payment day. */
  legacyPaymentDay?: string
  recordedAt: string
  provenance: 'recorded' | 'legacy-status'
  allocations: { versionId: string | null; at: string; reason: string }[]
}

export interface Settings {
  issuer: IssuerSnapshot
  accountHolder: string
  iban: string
  bic: string
  bankName: string
  privateRate: number
  duoRate: number
  paymentTermDays: number
  theme: ThemeMode
  reducedMotion: boolean
}

export interface AuditEvent {
  id: string
  at: string
  label: string
  entityType: 'invoice' | 'person' | 'settings' | 'backup' | 'system'
  entityId?: string
  snapshotCorrection?: {
    oldValue: InvoiceSnapshot | null
    newValue: InvoiceSnapshot
  }
}

export interface VoidedInvoiceNumber {
  number: string
  sequence: number | null
  year: number
  invoiceDate: string
  deletedAt: string
  reason?: 'deleted' | 'reopened'
  amount: number
  recipient: string
}

export interface AppState {
  schemaVersion: 15
  guardians: Guardian[]
  students: Student[]
  invoices: Invoice[]
  documentVersions: DocumentVersion[]
  invoiceAdministration: InvoiceAdministration[]
  payments: InvoicePayment[]
  historicalSnapshotCorrections: AuditEvent[]
  voidedInvoiceNumbers: VoidedInvoiceNumber[]
  settings: Settings
  counters: Record<string, number>
  nextStudentCodeIndex: number
  audit: AuditEvent[]
  updatedAt: string
}

export interface ToastMessage {
  id: string
  tone: 'success' | 'error' | 'info'
  message: string
}

export interface InvoiceDraft {
  id?: string
  correction?: { replacesId: string; reason: string }
  invoiceDate: string
  dueDate: string
  /** Accepted only for historical editor inputs; saves derive the period. */
  period?: string
  recipients: RecipientRef[]
  studentIds: string[]
  recipientStrategy: RecipientStrategy
  items: InvoiceItem[]
  freeText: string
}

