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
  schemaVersion: 2
  guardians: Guardian[]
  students: Student[]
  invoices: Invoice[]
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
