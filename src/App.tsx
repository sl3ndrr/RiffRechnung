import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, BookUser, Download, FilePlus2, LayoutDashboard, Menu, MessageSquareText, Moon, Palette, ReceiptText, Search, Settings as SettingsIcon, Sun, Upload, UserRound, X } from 'lucide-react'
import type { AppState, AuditEvent, Guardian, Invoice, InvoiceDraft, InvoiceStatus, PageKey, Settings as SettingsType, Student, ToastMessage } from './types'
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
import { createEmptyInvoiceDraft, emptyState } from './lib/defaults'
import { clearDirectoryHandle, inspectBackupDirectory, loadLastBackupAt, loadState, parseBackup, persistState, readDirectoryHandle, recordBackupExport, serializeBackup, STORAGE_KEY, storeDirectoryHandle, type StorageRecoveryState, validateBackupState, writeBackupToDirectory } from './lib/storage'
import { billingPeriodFromItems, calculateDueDate, downloadText, invoicePdfTitle, isInvoiceSetupComplete, parseDate, statusLabel, studentCodeForIndex, uid } from './lib/utils'
import { changeInvoiceStatus, saveInvoiceDraft } from './lib/invoiceActions'
import { assertOriginalsPreserved, assertReplacementAllowed, demoBlockedReason, FINALIZED_INVOICE_BLOCKED, isFinalizedInvoice, loadDemoState } from './lib/safety'
import { updateSettings } from './lib/settings'
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

function App() {
  const [initialLoad] = useState(loadState)
  const [state, setState] = useState<AppState>(() => initialLoad.status === 'ready' ? initialLoad.state : emptyState())
  const [recovery, setRecovery] = useState<StorageRecoveryState | null>(() => initialLoad.status === 'recovery' ? initialLoad : null)
  const stateRef = useRef(state)
  stateRef.current = state
  const [settingsTouched, setSettingsTouched] = useState(false)
  const [folderChecked, setFolderChecked] = useState(false)
  const [page, setPage] = useState<PageKey>('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [editor, setEditor] = useState<InvoiceEditorState>({ open: false, draft: createEmptyInvoiceDraft(state.settings), editing: false, finalized: false, invoiceNumber: null })
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [saveStateLabel, setSaveStateLabel] = useState<'saved' | 'saving' | 'error'>('saved')
  const [localSaveError, setLocalSaveError] = useState<string | null>(null)
  const [fileBackupStatus, setFileBackupStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [fileBackupError, setFileBackupError] = useState<string | null>(null)
  const [saveRetry, setSaveRetry] = useState(0)
  const [externalChangeDetected, setExternalChangeDetected] = useState(false)
  const [savedAt, setSavedAt] = useState(() => new Date())
  const [lastBackupAt, setLastBackupAt] = useState(loadLastBackupAt)
  const [folderConnected, setFolderConnected] = useState(false)
  const [folderName, setFolderName] = useState('')
  const folderHandle = useRef<FileSystemDirectoryHandle | null>(null)
  const backupImportInput = useRef<HTMLInputElement | null>(null)
  const printRequestRef = useRef<PrintRequest | null>(null)
  const firstSave = useRef(true)
  const persistedUpdatedAt = useRef(initialLoad.status === 'ready' ? initialLoad.persistedUpdatedAt : null)
  const forceLocalOverwrite = useRef(initialLoad.status === 'recovery')
  const persistenceQueue = useRef(Promise.resolve())
  const broadcastChannel = useRef<BroadcastChannel | null>(null)
  const tabId = useRef(uid('tab'))

  const toast = useCallback((message: string, tone: ToastMessage['tone'] = 'info') => {
    const id = uid('toast')
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200)
  }, [])

  const commit = useCallback((producer: (current: AppState) => AppState, label: string, entityType: AuditEvent['entityType'], entityId?: string): boolean => {
    try {
      const current = stateRef.current
      const next = producer(current)
      if (next === current) return false
      assertOriginalsPreserved(current, next)
      validateBackupState(next)
      const at = new Date().toISOString()
      const committed: AppState = {
        ...next,
        updatedAt: at,
        audit: [{ id: uid('event'), at, label, entityType, entityId }, ...next.audit].slice(0, 200),
      }
      stateRef.current = committed
      setState(committed)
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Änderung konnte nicht übernommen werden.', 'error')
      return false
    }
  }, [toast])

  useEffect(() => {
    if (recovery) return
    const includeFileBackup = !firstSave.current && Boolean(folderHandle.current)
    setSaveStateLabel('saving')
    setLocalSaveError(null)
    if (includeFileBackup) {
      setFileBackupStatus('saving')
      setFileBackupError(null)
    }
    const timer = window.setTimeout(() => {
      persistenceQueue.current = persistenceQueue.current.then(async () => {
        const result = await persistState(state, folderHandle.current, includeFileBackup, persistedUpdatedAt.current, forceLocalOverwrite.current)
        if (result.local.status === 'saved') {
          persistedUpdatedAt.current = state.updatedAt
          forceLocalOverwrite.current = false
          setExternalChangeDetected(false)
          broadcastChannel.current?.postMessage({ source: tabId.current, updatedAt: state.updatedAt })
          setSavedAt(new Date())
          setSaveStateLabel('saved')
        } else {
          setSaveStateLabel('error')
          setLocalSaveError(result.local.error ?? 'Lokales Speichern ist fehlgeschlagen.')
          if (result.local.status === 'conflict') setExternalChangeDetected(true)
        }
        if (result.fileBackup.status === 'saved') {
          setFileBackupStatus('saved')
          setFileBackupError(null)
        } else if (result.fileBackup.status === 'error') {
          setFileBackupStatus('error')
          setFileBackupError(result.fileBackup.error ?? 'Das Datei-Backup ist fehlgeschlagen.')
        }
        firstSave.current = false
      })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [recovery, saveRetry, state])

  useEffect(() => {
    const markExternalChange = (updatedAt?: string) => {
      if (!updatedAt || updatedAt !== persistedUpdatedAt.current) setExternalChangeDetected(true)
    }
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('riffrechnung-state')
    broadcastChannel.current = channel
    if (channel) channel.onmessage = (event: MessageEvent<{ source?: string; updatedAt?: string }>) => {
      if (event.data.source !== tabId.current) markExternalChange(event.data.updatedAt)
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      if (!event.newValue) return markExternalChange()
      try {
        const stored = JSON.parse(event.newValue) as { updatedAt?: string }
        markExternalChange(stored.updatedAt)
      } catch {
        markExternalChange()
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      channel?.close()
      if (broadcastChannel.current === channel) broadcastChannel.current = null
    }
  }, [])

  useEffect(() => {
    readDirectoryHandle().then(async (handle) => {
      if (handle) {
        folderHandle.current = handle
        setFolderConnected(true)
        setFolderName(handle.name)
        setFileBackupStatus('error')
        setFileBackupError(await inspectBackupDirectory(handle))
      }
      setFolderChecked(true)
    }).catch((error: unknown) => {
      setFileBackupStatus('error')
      setFileBackupError(error instanceof Error ? error.message : 'Backup-Ordner konnte nicht geprüft werden.')
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
    if (isFinalizedInvoice(invoice)) return toast(FINALIZED_INVOICE_BLOCKED, 'error')
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

  const saveInvoice = (draft: InvoiceDraft, finalize: boolean) => {
    let savedId: string | null = null
    const saved = commit((current) => {
      const next = saveInvoiceDraft(current, draft, finalize)
      savedId = next.invoices.at(-1)?.id ?? null
      return next
    }, finalize ? 'Rechnung finalisiert' : 'Rechnungsentwurf gespeichert', 'invoice', draft.id)
    if (!saved) return
    setEditor((current) => ({ ...current, open: false }))
    setPage('invoices')
    setSelectedInvoiceId(savedId)
    toast(finalize ? 'Rechnung finalisiert.' : 'Entwurf gespeichert.', 'success')
  }

  const setInvoiceStatus = (invoice: Invoice, status: InvoiceStatus) => {
    if (commit((current) => changeInvoiceStatus(current, invoice.id, status), `Rechnungsstatus auf ${statusLabel[status]} gesetzt`, 'invoice', invoice.id)) {
      toast('Status aktualisiert.', 'success')
    }
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

  const requestDeleteInvoice = (invoice: Invoice) => {
    if (isFinalizedInvoice(invoice)) return toast(FINALIZED_INVOICE_BLOCKED, 'error')
    setConfirmation({
      title: 'Entwurf löschen?',
      message: 'Der Entwurf und seine Positionen werden dauerhaft aus diesem Browser entfernt. Es wurde noch keine Rechnungsnummer verbraucht.',
      label: 'Entwurf löschen', danger: true,
      action: () => {
        if (!commit((current) => ({ ...current, invoices: current.invoices.filter((item) => item.id !== invoice.id) }), 'Rechnungsentwurf gelöscht', 'invoice', invoice.id)) return
        setSelectedInvoiceId(null)
        toast('Entwurf gelöscht.', 'success')
      },
    })
  }

  const saveGuardian = (guardian: Guardian) => {
    const exists = state.guardians.some((item) => item.id === guardian.id)
    if (!commit((current) => ({ ...current, guardians: exists ? current.guardians.map((item) => item.id === guardian.id ? guardian : item) : [...current.guardians, guardian] }), exists ? 'Elternteil aktualisiert' : 'Elternteil angelegt', 'person', guardian.id)) return
    toast(exists ? 'Kontakt aktualisiert.' : 'Kontakt angelegt.', 'success')
  }

  const saveStudent = (student: Student) => {
    const exists = state.students.some((item) => item.id === student.id)
    if (!commit((current) => {
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
    }, exists ? 'Kind aktualisiert' : 'Kind angelegt', 'person', student.id)) return
    toast(exists ? 'Kind aktualisiert.' : 'Kind angelegt.', 'success')
  }

  const deleteGuardian = (guardian: Guardian) => setConfirmation({
    title: `${guardian.name} löschen?`,
    message: 'Die Person wird aus Stammdaten, Zuordnungen und offenen Entwürfen entfernt. Finalisierte Rechnungen behalten ihren eingefrorenen Empfängerstand.',
    label: 'Kontakt löschen', danger: true,
    action: () => {
      if (!commit((current) => ({
        ...current,
        guardians: current.guardians.filter((item) => item.id !== guardian.id),
        students: current.students.map((student) => ({ ...student, guardianIds: student.guardianIds.filter((id) => id !== guardian.id) })),
        invoices: current.invoices.map((invoice) => invoice.status === 'draft' ? { ...invoice, guardianIds: invoice.guardianIds.filter((id) => id !== guardian.id) } : invoice),
      }), 'Elternteil gelöscht', 'person', guardian.id)) return
      toast('Kontakt gelöscht.', 'success')
    },
  })

  const deleteStudent = (student: Student) => setConfirmation({
    title: `${student.name} löschen?`,
    message: 'Das Kind und zugehörige Positionen in offenen Entwürfen werden entfernt. Finalisierte Rechnungen bleiben unverändert nachvollziehbar.',
    label: 'Kind löschen', danger: true,
    action: () => {
      if (!commit((current) => ({
        ...current,
        students: current.students.filter((item) => item.id !== student.id),
        invoices: current.invoices.map((invoice) => invoice.status === 'draft' ? { ...invoice, studentIds: invoice.studentIds.filter((id) => id !== student.id), items: invoice.items.filter((item) => item.studentId !== student.id) } : invoice),
      }), 'Kind gelöscht', 'person', student.id)) return
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
    try {
      setLastBackupAt(recordBackupExport())
    } catch {
      setLastBackupAt(new Date().toISOString())
    }
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
        action: () => {
          try {
            assertReplacementAllowed(stateRef.current)
            stateRef.current = imported
            setState(imported)
            setRecovery(null)
            setPage('dashboard')
            setSelectedInvoiceId(null)
            toast('Backup zur lokalen Wiederherstellung übernommen.', 'info')
          } catch (error) { toast(error instanceof Error ? error.message : 'Wiederherstellung gesperrt.', 'error') }
        },
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Die Backup-Datei konnte nicht gelesen werden.', 'error')
    }
  }

  const connectFolder = async () => {
    if (!window.showDirectoryPicker) return
    const previouslyChecked = folderChecked
    setFolderChecked(false)
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' })
      folderHandle.current = handle
      setFolderConnected(true)
      setFolderName(handle.name)
      setFileBackupStatus('saving')
      setFileBackupError(null)
      const inspection = await inspectBackupDirectory(handle)
      await storeDirectoryHandle(handle)
      setFolderChecked(true)
      setFileBackupStatus('error')
      setFileBackupError(inspection)
      toast('Backup-Ordner nur zur Prüfung verbunden. Die Dateien bleiben unverändert.', 'info')
    } catch (error) {
      setFolderChecked(previouslyChecked)
      if (error instanceof DOMException && error.name === 'AbortError') return
      const message = error instanceof Error ? error.message : 'Ordner konnte nicht verbunden werden.'
      setFileBackupStatus('error')
      setFileBackupError(message)
      toast(message, 'error')
    }
  }

  const disconnectFolder = async () => {
    try { await clearDirectoryHandle() } catch (error) {
      toast(error instanceof Error ? error.message : 'Backup-Ordner konnte nicht getrennt werden.', 'error')
      return
    }
    setFolderChecked(true)
    folderHandle.current = null
    setFolderConnected(false)
    setFolderName('')
    setFileBackupStatus('idle')
    setFileBackupError(null)
    toast('Backup-Ordner getrennt.', 'info')
  }

  const backupNow = async () => {
    const handle = folderHandle.current
    if (!handle) return exportBackup()
    setFileBackupStatus('saving')
    setFileBackupError(null)
    try {
      if (externalChangeDetected || localSaveError) throw new Error('Backup gesperrt: Der lokale Stand hat einen Speicherkonflikt oder Speicherfehler. Bitte neu laden oder separat JSON exportieren.')
      await writeBackupToDirectory(handle, state)
      setFileBackupStatus('saved')
      toast('Backup-Datei aktualisiert.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backup fehlgeschlagen.'
      setFileBackupStatus('error')
      setFileBackupError(message)
      toast(message, 'error')
    }
  }

  const resetAll = () => setConfirmation({
    title: 'Alle lokalen Daten löschen?',
    message: 'Stammdaten, Rechnungen, Einstellungen und Änderungsverlauf werden in diesem Browser gelöscht. Erstelle vorher bei Bedarf ein JSON-Backup.',
    label: 'Alles zurücksetzen', danger: true,
    action: () => {
      try { assertReplacementAllowed(stateRef.current) } catch (error) {
        toast(error instanceof Error ? error.message : 'Zurücksetzen gesperrt.', 'error')
        return
      }
      folderHandle.current = null
      setFolderConnected(false)
      setFolderName('')
      setFolderChecked(false)
      void clearDirectoryHandle().then(() => setFolderChecked(true)).catch(() => {
        toast('Gespeicherter Backup-Ordner konnte nicht getrennt werden. Demo bleibt gesperrt.', 'error')
      })
      const next = emptyState()
      stateRef.current = next
      setState(next)
      setSelectedInvoiceId(null)
      setPage('dashboard')
      toast('Lokale Daten zurückgesetzt. Der Backup-Ordner wurde getrennt.', 'success')
    },
  })

  const saveSettings = useCallback((settings: SettingsType) => commit((current) => ({
    ...current, settings: updateSettings(current.settings, settings),
  }), 'Einstellungen aktualisiert', 'settings'), [commit])
  const loadDemo = () => {
    try {
      const stored = loadState()
      if (stored.status !== 'ready') throw new Error('Beispieldaten sind gesperrt: Vorhandene Rohdaten müssen zuerst gesichert werden.')
      const storedReason = demoBlockedReason(stored.state, folderChecked, Boolean(folderHandle.current), settingsTouched)
      if (storedReason) throw new Error(storedReason)
      const demo = loadDemoState(stateRef.current, folderChecked, Boolean(folderHandle.current), settingsTouched)
      stateRef.current = demo
      setState(demo)
      toast('Beispieldaten geladen.', 'success')
    } catch (error) { toast(error instanceof Error ? error.message : 'Demo gesperrt.', 'error') }
  }
  const openInvoice = (id: string) => { setSelectedInvoiceId(id); setPage('invoices') }
  const setCurrentPage = (next: PageKey) => { setPage(next); setMobileNav(false) }
  const nextTheme = state.settings.theme === 'system' ? 'light' : state.settings.theme === 'light' ? 'dark' : 'system'
  const toggleTheme = () => saveSettings({ ...state.settings, theme: nextTheme })
  const themeNames = { system: 'System', light: 'Hell', dark: 'Dunkel' } as const
  const themeToggleLabel = `Aktuelles Farbschema: ${themeNames[state.settings.theme]}. Als Nächstes ${themeNames[nextTheme]} aktivieren.`
  const ThemeToggleIcon = state.settings.theme === 'system' ? Palette : state.settings.theme === 'light' ? Sun : Moon
  const backupStatusLabel = lastBackupAt ? `Letztes Backup: ${backupDateFormatter.format(new Date(lastBackupAt))}` : 'Noch kein Backup'
  const fileBackupLabel = folderConnected
    ? fileBackupStatus === 'saving' ? 'Datei-Backup speichert …' : fileBackupStatus === 'error' ? 'Ordnerbackup schreibgeschützt' : fileBackupStatus === 'saved' ? 'Datei-Backup gespeichert' : `Backup-Ordner: ${folderName}`
    : backupStatusLabel
  const persistenceErrorText = [localSaveError ? `Lokaler Speicher: ${localSaveError}` : '', fileBackupError ? `Datei-Backup: ${fileBackupError}` : ''].filter(Boolean).join(' ')

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
          <div className="topbar__end"><div className="topbar__storage-status"><span className={`save-indicator ${saveStateLabel === 'saving' ? 'is-saving' : saveStateLabel === 'error' ? 'is-error' : ''}`}><i />{saveStateLabel === 'saving' ? 'Speichert …' : saveStateLabel === 'error' ? 'Lokal nicht gespeichert' : `Lokal gespeichert ${savedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}</span><span className={`backup-indicator ${fileBackupStatus === 'error' ? 'is-error' : ''}`}>{fileBackupLabel}</span></div><button className="icon-button" onClick={toggleTheme} aria-label={themeToggleLabel} title={themeToggleLabel}><ThemeToggleIcon aria-hidden="true" /></button><button className="button button--primary topbar-new" onClick={openNewInvoice}><FilePlus2 aria-hidden="true" /><span>Neue Rechnung</span></button></div>
        </header>

        {externalChangeDetected && <section className="external-update" role="alert"><div><strong>Änderungen in einem anderen Tab erkannt</strong><p>Dieser Tab zeigt nicht mehr den aktuellen Datenstand. Lade neu, bevor du weiterarbeitest.</p></div><button className="button button--tonal" type="button" onClick={() => window.location.reload()}>Aktuellen Stand neu laden</button></section>}
        {persistenceErrorText && <section className="persistence-error" role="alert"><div><strong>Speichern fehlgeschlagen</strong><p>{persistenceErrorText}</p></div><div className="button-row"><button className="button button--tonal" type="button" onClick={() => setSaveRetry((current) => current + 1)}>Erneut versuchen</button><button className="button button--text" type="button" onClick={exportBackup}>JSON-Backup exportieren</button></div></section>}

        <main id="main-content" tabIndex={-1}>
          {page === 'dashboard' && <Dashboard state={state} onNavigate={setCurrentPage} onNewInvoice={openNewInvoice} onLoadDemo={loadDemo} demoBlockedReason={demoBlockedReason(state, folderChecked, folderConnected, settingsTouched)} onOpenInvoice={openInvoice} />}
          {page === 'invoices' && <Invoices state={state} selectedId={selectedInvoiceId} onSelect={setSelectedInvoiceId} onNew={openNewInvoice} onEdit={editInvoice} onDuplicate={duplicateInvoice} onDelete={requestDeleteInvoice} onSetStatus={setInvoiceStatus} onPrint={print} onToast={toast} />}
          {page === 'people' && <People state={state} onSaveGuardian={saveGuardian} onSaveStudent={saveStudent} onDeleteGuardian={deleteGuardian} onDeleteStudent={deleteStudent} />}
          {page === 'reports' && <Reports state={state} />}
          {page === 'about' && <About />}
          {page === 'settings' && <Settings state={state} folderSupported={Boolean(window.showDirectoryPicker)} folderConnected={folderConnected} folderName={folderName} onSave={saveSettings} onSetupStarted={() => setSettingsTouched(true)} onExport={exportBackup} onImport={importBackup} onConnectFolder={connectFolder} onDisconnectFolder={disconnectFolder} onBackupNow={backupNow} onReset={resetAll} />}
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
