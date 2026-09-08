export type ThemeMode = 'system' | 'light' | 'dark'
export type PageKey = 'dashboard' | 'invoices' | 'people' | 'reports' | 'about' | 'settings'
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
  iban: string
  paymentNote: string
  createdAt: string
  updatedAt: string
}

export interface Student {
  id: string
  name: string
  billingCode: string
  guardianIds: string[]
  note: string
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

export interface StudentSnapshot {
  id: string
  name: string
}

export interface InvoiceSnapshot {
  issuer: IssuerSnapshot
  guardians: GuardianSnapshot[]
  students: StudentSnapshot[]
  accountHolder: string
  iban: string
  bic: string
  bankName: string
  legalText: string
}

export interface Invoice {
  id: string
  number: string | null
  sequence: number | null
  year: number
  invoiceDate: string
  dueDate: string
  period: string
  status: InvoiceStatus
  guardianIds: string[]
  studentIds: string[]
  recipientStrategy: RecipientStrategy
  items: InvoiceItem[]
  introText: string
  freeText: string
  legalText: string
  snapshot?: InvoiceSnapshot
  paidAt?: string
  sentAt?: string
  createdAt: string
  updatedAt: string
  versionId?: string
  correction?: { replacesId: string; reason: string }
  /** Output projection only; never accepted in persisted invoices. */
  issuedAmounts?: DocumentAmounts
  claimState?: 'active' | 'replaced'
  archived?: boolean
}

export interface DocumentAmounts {
  itemCents: number[]
  totalCents: number
  legacyCalculatedTotalCents: number
  source: 'legacy-output' | 'number-register'
  calculation: 'legacy-v1'
}

export type DocumentContent = Omit<Invoice, 'status' | 'paidAt' | 'sentAt' | 'updatedAt' | 'versionId' | 'correction' | 'issuedAmounts' | 'claimState' | 'archived'>

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
  content: DocumentContent
  outputSnapshot: InvoiceSnapshot
  outputPeriod: string
  outputLegalText: string
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
  paidAt: string | null
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
  numberPattern: string
  resetNumberAnnually: boolean
  paymentTermDays: number
  defaultLegalText: string
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
  schemaVersion: 4
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
  period: string
  guardianIds: string[]
  studentIds: string[]
  recipientStrategy: RecipientStrategy
  items: InvoiceItem[]
  introText: string
  freeText: string
  legalText: string
}
