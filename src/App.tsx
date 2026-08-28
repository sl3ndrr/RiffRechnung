import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, BookUser, Download, FilePlus2, LayoutDashboard, Menu, MessageSquareText, Moon, Palette, ReceiptText, Search, Settings as SettingsIcon, Sun, Upload, UserRound, X } from 'lucide-react'
import type { AppState, AuditEvent, Guardian, Invoice, InvoiceDraft, InvoiceSnapshot, InvoiceStatus, PageKey, Settings as SettingsType, Student, ToastMessage } from './types'
import { Dashboard } from './views/Dashboard'
import { Invoices } from './views/Invoices'
import { InvoiceEditor } from './views/InvoiceEditor'
import { People } from './views/People'
import { Reports } from './views/Reports'
import { Settings } from './views/Settings'
import { About } from './views/About'
import { StorageRecovery } from './views/StorageRecovery'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ChangelogModal } from './components/ChangelogModal'
import { ToastRegion } from './components/ToastRegion'
import { InvoicePrint } from './components/InvoicePrint'
import { createDemoState, createEmptyInvoiceDraft, emptyState } from './lib/defaults'
import { clearDirectoryHandle, ensureWritePermission, loadLastBackupAt, loadState, parseBackup, readDirectoryHandle, recordBackupExport, saveState, serializeBackup, storeDirectoryHandle, type StorageRecoveryState, writeBackupToDirectory } from './lib/storage'
import { billingPeriodFromItems, calculateDueDate, downloadText, ensureStudentCodePattern, guardianName, invoiceFinalizationErrors, invoicePdfTitle, isInvoiceSetupComplete, limitFooterText, nextInvoiceAllocation, parseDate, reopenInvoiceAsDraft, statusLabel, studentCodeForIndex, uid } from './lib/utils'
import { APP_VERSION } from './version'

const navItems: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { key: 'invoices', label: 'Rechnungen', icon: ReceiptText },
  { key: 'people', label: 'Familien', icon: BookUser },
  { key: 'reports', label: 'Auswertung', icon: BarChart3 },
  { key: 'settings', label: 'Einstellungen', icon: SettingsIcon },
]

const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdTwAUVjtqiBcB572S5IR7OD71TFxW8CfuCS9V0j6Inpo9wgw/viewform?usp=header'
const backupDateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface Confirmation {
  title: string
  message: string
  label: string
  danger?: boolean
  action: () => void
}

interface InvoiceEditorState {
  open: boolean
  draft: InvoiceDraft
  editing: boolean
  finalized: boolean
  invoiceNumber: string | null
}

interface PrintRequest {
  id: string
  invoice: Invoice
}

type AuditEventDetails = Pick<AuditEvent, 'snapshotCorrection'>

function App() {
  const [initialLoad] = useState(loadState)
  const [state, setState] = useState<AppState>(() => initialLoad.status === 'ready' ? initialLoad.state : emptyState())
  const [recovery, setRecovery] = useState<StorageRecoveryState | null>(() => initialLoad.status === 'recovery' ? initialLoad : null)
  const [page, setPage] = useState<PageKey>('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [editor, setEditor] = useState<InvoiceEditorState>({ open: false, draft: createEmptyInvoiceDraft(state.settings), editing: false, finalized: false, invoiceNumber: null })
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [saveStateLabel, setSaveStateLabel] = useState<'saved' | 'saving'>('saved')
  const [savedAt, setSavedAt] = useState(() => new Date())
  const [lastBackupAt, setLastBackupAt] = useState(loadLastBackupAt)
  const [folderConnected, setFolderConnected] = useState(false)
  const [folderName, setFolderName] = useState('')
  const folderHandle = useRef<FileSystemDirectoryHandle | null>(null)
  const backupImportInput = useRef<HTMLInputElement | null>(null)
  const printRequestRef = useRef<PrintRequest | null>(null)
  const firstSave = useRef(true)

  const toast = useCallback((message: string, tone: ToastMessage['tone'] = 'info') => {
    const id = uid('toast')
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200)
  }, [])

  const commit = useCallback((producer: (current: AppState) => AppState, label: string, entityType: AuditEvent['entityType'], entityId?: string, eventDetails?: (current: AppState, next: AppState) => AuditEventDetails) => {
    setState((current) => {
      const at = new Date().toISOString()
      const next = producer(current)
      return {
        ...next,
        updatedAt: at,
        audit: [{ id: uid('event'), at, label, entityType, entityId, ...eventDetails?.(current, next) }, ...next.audit].slice(0, 200),
      }
    })
  }, [])

  useEffect(() => {
    if (recovery) return
    setSaveStateLabel('saving')
    const timer = window.setTimeout(async () => {
      try {
        saveState(state)
        setSavedAt(new Date())
        setSaveStateLabel('saved')
        if (!firstSave.current && folderHandle.current && await ensureWritePermission(folderHandle.current)) {
          await writeBackupToDirectory(folderHandle.current, state)
        }
      } catch {
        setSaveStateLabel('saved')
        toast('Lokales Speichern ist fehlgeschlagen. Bitte JSON-Backup erstellen.', 'error')
      }
      firstSave.current = false
    }, 450)
    return () => window.clearTimeout(timer)
  }, [recovery, state, toast])

  useEffect(() => {
    readDirectoryHandle().then(async (handle) => {
      if (handle && await ensureWritePermission(handle)) {
        folderHandle.current = handle
        setFolderConnected(true)
        setFolderName(handle.name)
      }
    })
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark = state.settings.theme === 'dark' || (state.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      root.style.colorScheme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151821' : '#f6f6fb')
    }
    apply()
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    root.classList.toggle('reduce-motion', state.settings.reducedMotion)
    return () => media.removeEventListener('change', apply)
  }, [state.settings.reducedMotion, state.settings.theme])

  const openNewInvoice = useCallback(() => {
    if (!isInvoiceSetupComplete(state.settings)) {
      setPage('settings')
      toast('Richte zuerst Absender & Konto mit deinem Namen und einer gültigen IBAN ein.', 'info')
      return
    }
    if (!state.students.length) {
      setPage('people')
      toast('Lege danach ein Kind mit einer erziehungsberechtigten Person an.', 'info')
      return
    }
    setEditor({ open: true, draft: createEmptyInvoiceDraft(state.settings), editing: false, finalized: false, invoiceNumber: null })
  }, [state.settings, state.students.length, toast])

  const editInvoice = (invoice: Invoice) => {
    setEditor({
      open: true,
      editing: true,
      finalized: Boolean(invoice.number),
      invoiceNumber: invoice.number,
      draft: {
        id: invoice.id,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        period: invoice.period,
        guardianIds: invoice.guardianIds,
        studentIds: invoice.studentIds,
        recipientStrategy: invoice.recipientStrategy,
        items: structuredClone(invoice.items),
        introText: invoice.introText,
        freeText: invoice.freeText,
        legalText: invoice.legalText,
      },
    })
  }

  const snapshotFor = (current: AppState, guardianIds: string[], studentIds: string[], legalText: string): InvoiceSnapshot => ({
    issuer: structuredClone(current.settings.issuer),
    guardians: guardianIds.flatMap((id) => {
      const guardian = current.guardians.find((item) => item.id === id)
      return guardian ? [{ id: guardian.id, name: guardian.name, email: guardian.email, ...guardian.address }] : []
    }),
    students: studentIds.flatMap((id) => {
      const student = current.students.find((item) => item.id === id)
      return student ? [{ id: student.id, name: student.name }] : []
    }),
    accountHolder: current.settings.accountHolder,
    iban: current.settings.iban,
    bic: current.settings.bic,
    bankName: current.settings.bankName,
    legalText,
  })

  const saveInvoice = (draft: InvoiceDraft, finalize: boolean, requestSnapshotCorrection = false, snapshotCorrectionConfirmed = false) => {
    const now = new Date().toISOString()
    const period = billingPeriodFromItems(draft.items, draft.invoiceDate)
    const existing = draft.id ? state.invoices.find((invoice) => invoice.id === draft.id) : undefined
    if (existing?.number) {
      if (requestSnapshotCorrection && !snapshotCorrectionConfirmed) {
        setConfirmation({
          title: 'Snapshot-Korrektur bestätigen',
          message: 'Die eingefrorenen Empfänger-, Absender- und Kontodaten dieser finalisierten Rechnung werden durch die aktuellen Werte ersetzt. Alter und neuer Snapshot sowie der Zeitpunkt werden im Änderungsverlauf protokolliert.',
          label: 'Snapshot korrigieren',
          action: () => saveInvoice(draft, finalize, true, true),
        })
        return
      }
      commit((current) => {
        const currentExisting = current.invoices.find((invoice) => invoice.id === existing.id)
        if (!currentExisting) return current
        const preservedStudentIds = currentExisting.studentIds
        const freshSnapshot = snapshotFor(current, draft.guardianIds, preservedStudentIds, draft.legalText)
        const previousSnapshot = currentExisting.snapshot
        return {
          ...current,
          invoices: current.invoices.map((invoice) => invoice.id === currentExisting.id ? {
            ...invoice,
            year: parseDate(draft.invoiceDate).getFullYear(),
            invoiceDate: draft.invoiceDate,
            dueDate: draft.dueDate,
            period,
            guardianIds: draft.guardianIds,
            studentIds: preservedStudentIds,
            recipientStrategy: 'joint',
            items: structuredClone(draft.items),
            introText: draft.introText,
            freeText: draft.freeText,
            legalText: draft.legalText,
            snapshot: snapshotCorrectionConfirmed ? freshSnapshot : previousSnapshot ?? freshSnapshot,
            updatedAt: now,
          } : invoice),
        }
      }, snapshotCorrectionConfirmed ? `Snapshot-Korrektur für Rechnung ${existing.number}` : `Finalisierte Rechnung ${existing.number} bearbeitet`, 'invoice', existing.id, snapshotCorrectionConfirmed ? (current, next) => {
        const oldSnapshot = current.invoices.find((invoice) => invoice.id === existing.id)?.snapshot
        const newSnapshot = next.invoices.find((invoice) => invoice.id === existing.id)?.snapshot
        return newSnapshot ? {
          snapshotCorrection: {
            oldValue: oldSnapshot ? structuredClone(oldSnapshot) : null,
            newValue: structuredClone(newSnapshot),
          },
        } : {}
      } : undefined)
      setEditor((current) => ({ ...current, open: false }))
      setPage('invoices')
      setSelectedInvoiceId(existing.id)
      toast(`Rechnung ${existing.number} aktualisiert.`, 'success')
      return
    }
    const recipientGroups = draft.recipientStrategy === 'separate' && draft.guardianIds.length > 1 ? draft.guardianIds.map((id) => [id]) : [draft.guardianIds]
    const createdIds = recipientGroups.map((_group, index) => index === 0 && existing ? existing.id : uid('invoice'))
    commit((current) => {
      const currentExisting = draft.id ? current.invoices.find((invoice) => invoice.id === draft.id) : undefined
      let working: AppState = { ...current, invoices: currentExisting ? current.invoices.filter((invoice) => invoice.id !== currentExisting.id) : [...current.invoices] }
      recipientGroups.forEach((guardianIds, index) => {
        const id = createdIds[index]
        const base: Invoice = {
          id,
          number: null,
          sequence: null,
          year: parseDate(draft.invoiceDate).getFullYear(),
          invoiceDate: draft.invoiceDate,
          dueDate: draft.dueDate,
          period,
          status: 'draft',
          guardianIds,
          studentIds: draft.studentIds,
          recipientStrategy: draft.recipientStrategy,
          items: structuredClone(draft.items),
          introText: draft.introText,
          freeText: draft.freeText,
          legalText: draft.legalText,
          createdAt: currentExisting?.createdAt ?? now,
          updatedAt: now,
        }
        if (finalize) {
          const allocation = nextInvoiceAllocation(working, draft.invoiceDate, draft.studentIds)
          base.number = allocation.number
          base.sequence = allocation.sequence
          base.status = 'sent'
          base.sentAt = now
          base.snapshot = snapshotFor(working, guardianIds, draft.studentIds, draft.legalText)
          working = { ...working, counters: { ...working.counters, [allocation.counterKey]: allocation.sequence + 1 } }
        }
        working = { ...working, invoices: [...working.invoices, base] }
      })
      return working
    }, finalize ? 'Rechnung finalisiert' : 'Rechnungsentwurf gespeichert', 'invoice', draft.id)
    setEditor((current) => ({ ...current, open: false }))
    setPage('invoices')
    setSelectedInvoiceId(createdIds[0] ?? null)
    toast(finalize ? `${createdIds.length > 1 ? `${createdIds.length} Rechnungen` : 'Rechnung'} finalisiert.` : 'Entwurf gespeichert.', 'success')
  }

  const applyInvoiceStatus = (invoice: Invoice, status: InvoiceStatus) => {
    // Vorläufige konservative Fachregel: Bis zur fachlichen Bestätigung zählen nur aktuelle Stammdaten und die vollständige Editor-Validierung.
    if (invoice.status === 'draft' && status !== 'draft') {
      const errors = invoiceFinalizationErrors(state, invoice)
      if (errors.length) {
        toast(`Finalisieren nicht möglich: ${errors.join(' ')}`, 'error')
        return
      }
    }
    let allocatedNumber = ''
    const reopenedNumber = status === 'draft' ? invoice.number ?? '' : ''
    commit((current) => {
      if (status === 'draft') {
        return reopenInvoiceAsDraft(current, invoice.id)
      }
      let counters = current.counters
      const invoices = current.invoices.map((candidate) => {
        if (candidate.id !== invoice.id) return candidate
        const now = new Date().toISOString()
        if (candidate.status === 'draft') {
          const allocation = nextInvoiceAllocation(current, candidate.invoiceDate, candidate.studentIds)
          allocatedNumber = allocation.number
          counters = { ...counters, [allocation.counterKey]: allocation.sequence + 1 }
          return {
            ...candidate,
            number: allocation.number,
            sequence: allocation.sequence,
            status,
            snapshot: snapshotFor(current, candidate.guardianIds, candidate.studentIds, candidate.legalText),
            sentAt: now,
            ...(status === 'paid' ? { paidAt: now } : {}),
            updatedAt: now,
          }
        }
        return {
          ...candidate,
          status,
          paidAt: status === 'paid' ? now : undefined,
          sentAt: candidate.sentAt ?? now,
          updatedAt: now,
        }
      })
      return { ...current, invoices, counters }
    }, status === 'draft' ? `Rechnung ${invoice.number ?? ''} in Entwurf zurückversetzt; Nummer reserviert` : status === 'paid' ? 'Rechnung als bezahlt markiert' : status === 'sent' ? 'Rechnung als versendet markiert' : `Rechnungsstatus auf ${statusLabel[status]} gesetzt`, 'invoice', invoice.id)
    toast(reopenedNumber ? `Rechnung ${reopenedNumber} ist wieder ein Entwurf; die Nummer bleibt reserviert.` : allocatedNumber ? `Rechnung ${allocatedNumber} finalisiert.` : 'Status aktualisiert.', 'success')
  }

  const setInvoiceStatus = (invoice: Invoice, status: InvoiceStatus) => {
    if (status === 'draft' && invoice.status !== 'draft') {
      setConfirmation({
        title: `Rechnung ${invoice.number ?? ''} zurück in Entwurf?`,
        message: 'Die bisherige Rechnungsnummer bleibt dauerhaft reserviert und der eingefrorene Rechnungsstand wird entfernt. Beim erneuten Finalisieren erhält der Entwurf eine neue Nummer. Bereits versendete oder gespeicherte PDFs werden dadurch nicht geändert.',
        label: 'In Entwurf zurücksetzen',
        danger: true,
        action: () => applyInvoiceStatus(invoice, 'draft'),
      })
      return
    }
    applyInvoiceStatus(invoice, status)
  }

  const duplicateInvoice = (invoice: Invoice) => {
    const sourceDate = parseDate(invoice.invoiceDate)
    const targetDate = new Date()
    const monthDelta = (targetDate.getFullYear() - sourceDate.getFullYear()) * 12 + targetDate.getMonth() - sourceDate.getMonth()
    const shiftDate = (value: string) => {
      const date = parseDate(value)
      if (Number.isNaN(date.getTime())) return targetDate.toISOString().slice(0, 10)
      date.setMonth(date.getMonth() + monthDelta)
      return date.toISOString().slice(0, 10)
    }
    const items = invoice.items.map((item) => ({ ...item, id: uid('item'), serviceDate: shiftDate(item.serviceDate) }))
    setEditor({ open: true, editing: false, finalized: false, invoiceNumber: null, draft: {
      invoiceDate: targetDate.toISOString().slice(0, 10),
      dueDate: calculateDueDate(targetDate.toISOString().slice(0, 10), state.settings.paymentTermDays),
      period: billingPeriodFromItems(items, targetDate.toISOString().slice(0, 10)),
      guardianIds: invoice.guardianIds.filter((id) => state.guardians.some((guardian) => guardian.id === id)),
      studentIds: invoice.studentIds.filter((id) => state.students.some((student) => student.id === id)),
      recipientStrategy: invoice.recipientStrategy,
      items,
      introText: invoice.introText,
      freeText: invoice.freeText,
      legalText: state.settings.defaultLegalText,
    } })
  }

  const requestDeleteInvoice = (invoice: Invoice) => setConfirmation({
    title: invoice.number ? `Rechnung ${invoice.number} löschen?` : 'Entwurf löschen?',
    message: invoice.number
      ? 'Der Beleg wird aus der Rechnungsliste entfernt. Seine Rechnungsnummer bleibt im Nummernregister dauerhaft reserviert und wird nicht erneut vergeben.'
      : 'Der Entwurf und seine Positionen werden dauerhaft aus diesem Browser entfernt. Es wurde noch keine Rechnungsnummer verbraucht.',
    label: invoice.number ? 'Rechnung löschen' : 'Entwurf löschen', danger: true,
    action: () => {
      commit((current) => ({
        ...current,
        invoices: current.invoices.filter((item) => item.id !== invoice.id),
        voidedInvoiceNumbers: invoice.number ? [{
          number: invoice.number,
          sequence: invoice.sequence,
          year: invoice.year,
          invoiceDate: invoice.invoiceDate,
          deletedAt: new Date().toISOString(),
          reason: 'deleted',
          amount: invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
          recipient: guardianName(invoice, current.guardians),
        }, ...current.voidedInvoiceNumbers] : current.voidedInvoiceNumbers,
      }), invoice.number ? `Finalisierte Rechnung ${invoice.number} gelöscht; Nummer reserviert` : 'Rechnungsentwurf gelöscht', 'invoice', invoice.id)
      setSelectedInvoiceId(null)
      toast(invoice.number ? `Rechnung ${invoice.number} gelöscht; Nummer bleibt reserviert.` : 'Entwurf gelöscht.', 'success')
    },
  })

  const saveGuardian = (guardian: Guardian) => {
    const exists = state.guardians.some((item) => item.id === guardian.id)
    commit((current) => ({ ...current, guardians: exists ? current.guardians.map((item) => item.id === guardian.id ? guardian : item) : [...current.guardians, guardian] }), exists ? 'Elternteil aktualisiert' : 'Elternteil angelegt', 'person', guardian.id)
    toast(exists ? 'Kontakt aktualisiert.' : 'Kontakt angelegt.', 'success')
  }

  const saveStudent = (student: Student) => {
    const exists = state.students.some((item) => item.id === student.id)
    commit((current) => {
      const existing = current.students.find((item) => item.id === student.id)
      if (existing) {
        return { ...current, students: current.students.map((item) => item.id === student.id ? { ...student, billingCode: existing.billingCode } : item) }
      }
      const billingCode = studentCodeForIndex(current.nextStudentCodeIndex)
      return {
        ...current,
        students: [...current.students, { ...student, billingCode }],
        nextStudentCodeIndex: current.nextStudentCodeIndex + 1,
      }
    }, exists ? 'Kind aktualisiert' : 'Kind angelegt', 'person', student.id)
    toast(exists ? 'Kind aktualisiert.' : 'Kind angelegt.', 'success')
  }

  const deleteGuardian = (guardian: Guardian) => setConfirmation({
    title: `${guardian.name} löschen?`,
    message: 'Die Person wird aus Stammdaten, Zuordnungen und offenen Entwürfen entfernt. Finalisierte Rechnungen behalten ihren eingefrorenen Empfängerstand.',
    label: 'Kontakt löschen', danger: true,
    action: () => {
      commit((current) => ({
        ...current,
        guardians: current.guardians.filter((item) => item.id !== guardian.id),
        students: current.students.map((student) => ({ ...student, guardianIds: student.guardianIds.filter((id) => id !== guardian.id) })),
        invoices: current.invoices.map((invoice) => invoice.status === 'draft' ? { ...invoice, guardianIds: invoice.guardianIds.filter((id) => id !== guardian.id) } : invoice),
      }), 'Elternteil gelöscht', 'person', guardian.id)
      toast('Kontakt gelöscht.', 'success')
    },
  })

  const deleteStudent = (student: Student) => setConfirmation({
    title: `${student.name} löschen?`,
    message: 'Das Kind und zugehörige Positionen in offenen Entwürfen werden entfernt. Finalisierte Rechnungen bleiben unverändert nachvollziehbar.',
    label: 'Kind löschen', danger: true,
    action: () => {
      commit((current) => ({
        ...current,
        students: current.students.filter((item) => item.id !== student.id),
        invoices: current.invoices.map((invoice) => invoice.status === 'draft' ? { ...invoice, studentIds: invoice.studentIds.filter((id) => id !== student.id), items: invoice.items.filter((item) => item.studentId !== student.id) } : invoice),
      }), 'Kind gelöscht', 'person', student.id)
      toast('Kind gelöscht.', 'success')
    },
  })

  const print = (invoice: Invoice) => {
    const request = { id: uid('print'), invoice }
    printRequestRef.current = request
    setPrintRequest(request)
  }

  const handlePrintReady = useCallback((requestId: string, invoiceId: string) => {
    const request = printRequestRef.current
    if (!request || request.id !== requestId || request.invoice.id !== invoiceId) return
    printRequestRef.current = null
    const previousTitle = document.title
    const restoreTitle = () => {
      document.title = previousTitle
      setPrintRequest((current) => current?.id === requestId ? null : current)
    }
    document.title = invoicePdfTitle(request.invoice, state.students)
    window.addEventListener('afterprint', restoreTitle, { once: true })
    try {
      window.print()
    } catch {
      window.removeEventListener('afterprint', restoreTitle)
      restoreTitle()
      toast('Druckdialog konnte nicht geöffnet werden.', 'error')
    }
  }, [state.students, toast])

  const handlePrintError = useCallback((requestId: string, invoiceId: string, message: string) => {
    const request = printRequestRef.current
    if (!request || request.id !== requestId || request.invoice.id !== invoiceId) return
    printRequestRef.current = null
    setPrintRequest((current) => current?.id === requestId ? null : current)
    toast(message, 'error')
  }, [toast])

  const exportBackup = () => {
    downloadText(`riffrechnung-backup-${new Date().toISOString().slice(0, 10)}.json`, serializeBackup(state))
    setLastBackupAt(recordBackupExport())
    toast('JSON-Backup heruntergeladen.', 'success')
  }

  const exportRecoveryData = () => {
    if (!recovery?.rawData) return
    downloadText(`riffrechnung-beschaedigte-lokaldaten-${new Date().toISOString().slice(0, 10)}.txt`, recovery.rawData, 'text/plain')
    toast('Beschädigte Rohdaten heruntergeladen.', 'success')
  }

  const importBackup = async (file: File) => {
    try {
      const imported = parseBackup(await file.text())
      setConfirmation({
        title: 'Backup wiederherstellen?',
        message: `Die Datei enthält ${imported.students.length} Kinder und ${imported.invoices.length} Rechnungen. Der aktuelle lokale Datenstand wird vollständig ersetzt.`,
        label: 'Daten ersetzen', danger: true,
        action: () => { setState(imported); setRecovery(null); setPage('dashboard'); setSelectedInvoiceId(null); toast('Backup erfolgreich wiederhergestellt.', 'success') },
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Die Backup-Datei konnte nicht gelesen werden.', 'error')
    }
  }

  const connectFolder = async () => {
    if (!window.showDirectoryPicker) return
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      if (!await ensureWritePermission(handle, true)) throw new Error('Keine Schreibberechtigung erteilt.')
      await storeDirectoryHandle(handle)
      await writeBackupToDirectory(handle, state)
      folderHandle.current = handle
      setFolderConnected(true)
      setFolderName(handle.name)
      toast('Backup-Ordner verbunden.', 'success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast(error instanceof Error ? error.message : 'Ordner konnte nicht verbunden werden.', 'error')
    }
  }

  const disconnectFolder = async () => {
    await clearDirectoryHandle()
    folderHandle.current = null
    setFolderConnected(false)
    setFolderName('')
    toast('Backup-Ordner getrennt.', 'info')
  }

  const backupNow = async () => {
    const handle = folderHandle.current
    if (!handle) return exportBackup()
    try {
      if (!await ensureWritePermission(handle, true)) throw new Error('Schreibberechtigung fehlt.')
      await writeBackupToDirectory(handle, state)
      toast('Backup-Datei aktualisiert.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Backup fehlgeschlagen.', 'error')
    }
  }

  const resetAll = () => setConfirmation({
    title: 'Alle lokalen Daten löschen?',
    message: 'Stammdaten, Rechnungen, Einstellungen und Änderungsverlauf werden in diesem Browser gelöscht. Erstelle vorher bei Bedarf ein JSON-Backup.',
    label: 'Alles zurücksetzen', danger: true,
    action: () => {
      folderHandle.current = null
      setFolderConnected(false)
      setFolderName('')
      void clearDirectoryHandle()
      setState(emptyState())
      setSelectedInvoiceId(null)
      setPage('dashboard')
      toast('Lokale Daten zurückgesetzt. Der Backup-Ordner wurde getrennt.', 'success')
    },
  })

  const saveSettings = useCallback((settings: SettingsType) => commit((current) => ({
    ...current,
    settings: {
      ...settings,
      defaultLegalText: limitFooterText(settings.defaultLegalText),
      numberPattern: ensureStudentCodePattern(settings.numberPattern),
    },
  }), 'Einstellungen aktualisiert', 'settings'), [commit])
  const loadDemo = () => {
    setState(createDemoState())
    toast('Beispieldaten geladen. Du kannst sie jederzeit zurücksetzen.', 'success')
  }
  const openInvoice = (id: string) => { setSelectedInvoiceId(id); setPage('invoices') }
  const setCurrentPage = (next: PageKey) => { setPage(next); setMobileNav(false) }
  const nextTheme = state.settings.theme === 'system' ? 'light' : state.settings.theme === 'light' ? 'dark' : 'system'
  const toggleTheme = () => saveSettings({ ...state.settings, theme: nextTheme })
  const themeNames = { system: 'System', light: 'Hell', dark: 'Dunkel' } as const
  const themeToggleLabel = `Aktuelles Farbschema: ${themeNames[state.settings.theme]}. Als Nächstes ${themeNames[nextTheme]} aktivieren.`
  const ThemeToggleIcon = state.settings.theme === 'system' ? Palette : state.settings.theme === 'light' ? Sun : Moon
  const backupStatusLabel = lastBackupAt ? `Letztes Backup: ${backupDateFormatter.format(new Date(lastBackupAt))}` : 'Noch kein Backup'

  if (recovery) return (
    <>
      <StorageRecovery recovery={recovery} onExport={exportRecoveryData} onImport={importBackup} />
      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} message={confirmation?.message ?? ''} confirmLabel={confirmation?.label} danger={confirmation?.danger} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); action?.() }} />
      <ToastRegion messages={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
    </>
  )

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Zum Inhalt springen</a>
      <aside className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
        <div className="brand"><span className="brand__mark" aria-hidden="true">🧾</span><div><strong>RiffRechnung</strong><small>Rechnungen</small></div><button className="icon-button mobile-only" onClick={() => setMobileNav(false)} aria-label="Navigation schließen"><X aria-hidden="true" /></button></div>
        <nav aria-label="Hauptnavigation">{navItems.map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} key={key} onClick={() => setCurrentPage(key)}><Icon aria-hidden="true" /><span>{label}</span>{key === 'invoices' && state.invoices.filter((invoice) => invoice.status === 'draft').length > 0 && <b>{state.invoices.filter((invoice) => invoice.status === 'draft').length}</b>}</button>)}</nav>
        <div className="sidebar__privacy"><span><ShieldDot /></span><div><strong>Nur auf diesem Gerät</strong><small>Keine automatische Cloud-Übertragung</small></div></div>
        <button className="sidebar__version" type="button" onClick={() => setChangelogOpen(true)} aria-label={`Versionshistorie öffnen, aktuelle Version ${APP_VERSION}`}>Version {APP_VERSION}</button>
        <div className="sidebar__secondary-actions">
          <button type="button" className={page === 'about' ? 'is-active' : ''} aria-current={page === 'about' ? 'page' : undefined} aria-label="Über mich" title="Über mich" onClick={() => setCurrentPage('about')}><UserRound aria-hidden="true" /><span>Über mich</span></button>
          <a href={FEEDBACK_URL} target="_blank" rel="noreferrer" aria-label="Feedbackformular öffnen (neuer Tab)" title="Feedback"><MessageSquareText aria-hidden="true" /><span>Feedback</span></a>
          <button type="button" aria-label="Backup exportieren" title="Backup exportieren" onClick={exportBackup}><Download aria-hidden="true" /><span>Backup exportieren</span></button>
          <button type="button" aria-label="Backup importieren" title="Backup importieren" onClick={() => backupImportInput.current?.click()}><Upload aria-hidden="true" /><span>Backup importieren</span></button>
          <input ref={backupImportInput} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importBackup(file) }} />
        </div>
      </aside>
      {mobileNav && <button className="nav-scrim" aria-label="Navigation schließen" onClick={() => setMobileNav(false)} />}

      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Navigation öffnen"><Menu aria-hidden="true" /></button>
          <button className="topbar-search" onClick={() => { setPage('invoices'); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#invoice-search')?.focus()) }}><Search aria-hidden="true" /><span>Rechnungen durchsuchen</span></button>
          <div className="topbar__end"><div className="topbar__storage-status"><span className={`save-indicator ${saveStateLabel === 'saving' ? 'is-saving' : ''}`}><i />{saveStateLabel === 'saving' ? 'Speichert …' : `Gespeichert ${savedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}</span><span className="backup-indicator">{backupStatusLabel}</span></div><button className="icon-button" onClick={toggleTheme} aria-label={themeToggleLabel} title={themeToggleLabel}><ThemeToggleIcon aria-hidden="true" /></button><button className="button button--primary topbar-new" onClick={openNewInvoice}><FilePlus2 aria-hidden="true" /><span>Neue Rechnung</span></button></div>
        </header>

        <main id="main-content" tabIndex={-1}>
          {page === 'dashboard' && <Dashboard state={state} onNavigate={setCurrentPage} onNewInvoice={openNewInvoice} onLoadDemo={loadDemo} onOpenInvoice={openInvoice} />}
          {page === 'invoices' && <Invoices state={state} selectedId={selectedInvoiceId} onSelect={setSelectedInvoiceId} onNew={openNewInvoice} onEdit={editInvoice} onDuplicate={duplicateInvoice} onDelete={requestDeleteInvoice} onSetStatus={setInvoiceStatus} onPrint={print} onToast={toast} />}
          {page === 'people' && <People state={state} onSaveGuardian={saveGuardian} onSaveStudent={saveStudent} onDeleteGuardian={deleteGuardian} onDeleteStudent={deleteStudent} />}
          {page === 'reports' && <Reports state={state} />}
          {page === 'about' && <About />}
          {page === 'settings' && <Settings state={state} folderSupported={Boolean(window.showDirectoryPicker)} folderConnected={folderConnected} folderName={folderName} onSave={saveSettings} onExport={exportBackup} onImport={importBackup} onConnectFolder={connectFolder} onDisconnectFolder={disconnectFolder} onBackupNow={backupNow} onReset={resetAll} />}
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile Hauptnavigation">{navItems.slice(0, 4).map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} key={key} onClick={() => setCurrentPage(key)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>

      <InvoiceEditor open={editor.open} draft={editor.draft} editing={editor.editing} finalized={editor.finalized} invoiceNumber={editor.invoiceNumber} guardians={state.guardians} students={state.students} settings={state.settings} onClose={() => setEditor((current) => ({ ...current, open: false }))} onSave={saveInvoice} />
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} message={confirmation?.message ?? ''} confirmLabel={confirmation?.label} danger={confirmation?.danger} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); action?.() }} />
      <ToastRegion messages={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
      <div className="print-root"><InvoicePrint invoice={printRequest?.invoice ?? null} guardians={state.guardians} students={state.students} settings={state.settings} requestId={printRequest?.id} onPrintReady={handlePrintReady} onPrintError={handlePrintError} /></div>
    </div>
  )
}

function ShieldDot() {
  return <span className="shield-dot" aria-hidden="true"><i /></span>
}

export default App
