import { deleteGuardianState, deleteStudentState, recordActivity } from './lib/commands'
import { allocatePayment, archiveInvoice, createCorrectionDraft, resolveDocumentConflicts, selectInvoice } from './lib/documents'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, BookUser, Download, FilePlus2, LayoutDashboard, Menu, MessageSquareText, Moon, Palette, ReceiptText, Search, Settings as SettingsIcon, Sun, Upload, UserRound, X } from 'lucide-react'
import type { AppState, AuditEvent, Guardian, Invoice, InvoiceDraft, InvoiceItemAllocation, InvoiceStatus, PageKey, Settings as SettingsType, Student, ToastMessage } from './types'
import { Dashboard } from './views/Dashboard'
import { Invoices } from './views/Invoices'
import { InvoiceEditor } from './views/InvoiceEditor'
import { People } from './views/People'
import { Reports } from './views/Reports'
import { Settings } from './views/Settings'
import { About } from './views/About'
import { StorageRecovery } from './views/StorageRecovery'
import { ImportReview, type ImportReviewData } from './views/ImportReview'
import { inspectImportBytes, type ImportPreview } from './lib/importState'
import { requireSuccess } from './lib/result'
import { prepareInvoiceCopy, prepareNewInvoice, saveGuardianState, saveInvoiceState, saveSettingsState, saveStudentState, splitInvoiceState } from './lib/commands'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ChangelogModal } from './components/ChangelogModal'
import { ToastRegion } from './components/ToastRegion'
import { InvoicePrint } from './components/InvoicePrint'
import { createEmptyInvoiceDraft, emptyState } from './lib/defaults'
import { clearDirectoryHandle, ensureWritePermission, inspectBackupDirectory, loadLastBackupAt, StorageSession, StorageConflict, readDirectoryHandle, recordBackupExport, STORAGE_KEY, LEGACY_STORAGE_KEY, storeDirectoryHandle, type StorageRecoveryState } from './lib/storage'
import type { DirectoryInspection, DirectoryBinding } from './lib/backupDirectory'
import { FolderReview } from './views/FolderReview'
import { downloadText, invoicePdfTitle, statusLabel, uid } from './lib/utils'
import { changeInvoiceStatus } from './lib/invoiceActions'
import { assertOriginalsPreserved, assertReplacementAllowed, FINALIZED_INVOICE_BLOCKED, isFinalizedInvoice } from './lib/safety'
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
  action: () => void | Promise<void>
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
  const [mode, setMode] = useState<'real' | 'demo'>('real')
  return <Workspace key={mode} mode={mode} onModeChange={setMode} />
}

function Workspace({ mode, onModeChange }: { mode: 'real' | 'demo'; onModeChange: (mode: 'real' | 'demo') => void }) {
  const [session] = useState(() => new StorageSession({ mode }))
  const initialLoad = session.initial
  const [state, setState] = useState<AppState>(session.state)
  const [recovery, setRecovery] = useState<StorageRecoveryState | null>(() => initialLoad.status === 'recovery' ? initialLoad : null)
  const stateRef = useRef(state)
  stateRef.current = state
  const [settingsEpoch, setSettingsEpoch] = useState(0)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const pendingWrites = useRef(0)
  const pendingBackups = useRef(0)
  const settingsFlush = useRef<(() => Promise<boolean>) | null>(null)
  const [page, setPage] = useState<PageKey>('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [editor, setEditor] = useState<InvoiceEditorState>({ open: false, draft: createEmptyInvoiceDraft(state.settings), editing: false, finalized: false, invoiceNumber: null })
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [importReview, setImportReview] = useState<ImportReviewData | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [saveStateLabel, setSaveStateLabel] = useState<'saved' | 'saving' | 'error'>('saved')
  const [localSaveError, setLocalSaveError] = useState<string | null>(null)
  const [fileBackupStatus, setFileBackupStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle')
  const [fileBackupError, setFileBackupError] = useState<string | null>(null)
  const [externalChangeDetected, setExternalChangeDetected] = useState(false)
  const [savedAt, setSavedAt] = useState(() => new Date())
  const [lastBackupAt, setLastBackupAt] = useState(() => mode === 'real' ? loadLastBackupAt() : null)
  const [folderConnected, setFolderConnected] = useState(false)
  const [folderName, setFolderName] = useState('')
  const folderHandle = useRef<FileSystemDirectoryHandle | null>(null)
  const [folderReview, setFolderReview] = useState<{ handle: FileSystemDirectoryHandle; inspection: DirectoryInspection } | null>(null)
  const backupImportInput = useRef<HTMLInputElement | null>(null)
  const printRequestRef = useRef<PrintRequest | null>(null)

  const toast = useCallback((message: string, tone: ToastMessage['tone'] = 'info') => {
    const id = uid('toast')
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200)
  }, [])

  const runBackup = useCallback(async () => {
    if (mode === 'demo' || !session.directory) return
    pendingBackups.current++
    setFileBackupStatus('saving')
    setFileBackupError(null)
    try {
      await session.backup()
      pendingBackups.current--
      setFileBackupStatus(pendingBackups.current ? 'saving' : 'saved')
    } catch (error) {
      pendingBackups.current--
      setFileBackupStatus(error instanceof StorageConflict ? 'conflict' : 'error')
      setFileBackupError(error instanceof Error ? error.message : 'Datei-Backup fehlgeschlagen.')
    }
  }, [mode, session])

  const commit = useCallback(async (producer: (current: AppState) => AppState, label: string, entityType: AuditEvent['entityType'], entityId?: string): Promise<boolean> => {
    pendingWrites.current++
    setSaveStateLabel('saving')
    setLocalSaveError(null)
    try {
      const committed = await session.change((current) => {
        const next = producer(current)
        assertOriginalsPreserved(current, next)
        const at = new Date().toISOString()
        return recordActivity(next, { id: uid('event'), at, label, entityType, entityId })
      })
      stateRef.current = committed
      setState(committed)
      setSavedAt(new Date())
      pendingWrites.current--
      setSaveStateLabel(pendingWrites.current ? 'saving' : 'saved')
      setExternalChangeDetected(false)
      void runBackup()
      return true
    } catch (error) {
      pendingWrites.current--
      const message = error instanceof Error ? error.message : 'Änderung konnte nicht gespeichert werden.'
      setSaveStateLabel('error')
      setLocalSaveError(message)
      if (error instanceof StorageConflict) setExternalChangeDetected(true)
      toast(message, 'error')
      return false
    }
  }, [runBackup, session, toast])

  useEffect(() => {
    if (mode === 'demo') return
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== LEGACY_STORAGE_KEY && event.key !== null) return
      try { session.checkCurrent() } catch { setExternalChangeDetected(true) }
    }
    try { session.checkCurrent() } catch (error) {
      setExternalChangeDetected(true)
      setLocalSaveError(error instanceof Error ? error.message : 'Speicher muss geprüft werden.')
    }
    if (!navigator.locks) setLocalSaveError('Dieser Browser hat keine Web Locks. Speichern bleibt gesperrt; JSON-Export ist möglich.')
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [mode, session])

  useEffect(() => {
    if (mode === 'demo' || recovery) return
    let active = true
    readDirectoryHandle().then(async (binding) => {
      if (!binding || !active) return
      folderHandle.current = binding.handle
      setFolderConnected(true)
      setFolderName(binding.handle.name)
      try {
        await session.connect(binding)
        if (active) setFileBackupStatus('idle')
      } catch (error) {
        if (active) {
          setFileBackupStatus(error instanceof StorageConflict ? 'conflict' : 'error')
          setFileBackupError(error instanceof Error ? error.message : 'Ordnerverbindung muss erneut geprüft werden.')
        }
      }
    }).catch((error: unknown) => {
      if (active) { setFileBackupStatus('error'); setFileBackupError(error instanceof Error ? error.message : 'Backup-Ordner konnte nicht geprüft werden.') }
    })
    return () => { active = false }
  }, [mode, recovery, session])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!settingsDirty && saveStateLabel !== 'saving' && saveStateLabel !== 'error') return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveStateLabel, settingsDirty])

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
    const result = prepareNewInvoice(stateRef.current)
    if (!result.ok) return toast(result.errors.map((error) => error.message).join(' '), 'error')
    setEditor({ open: true, draft: result.value, editing: false, finalized: false, invoiceNumber: null })
  }, [toast])

  const editInvoice = (invoice: Invoice) => {
    if (isFinalizedInvoice(invoice)) return toast(FINALIZED_INVOICE_BLOCKED, 'error')
    setEditor({
      open: true,
      editing: true,
      finalized: Boolean(invoice.number),
      invoiceNumber: invoice.number,
      draft: {
        id: invoice.id,
        correction: invoice.correction,
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

  const saveInvoice = async (draft: InvoiceDraft, finalize: boolean, allocations?: InvoiceItemAllocation[]) => {
    let savedIds: string[] = []
    const saved = await commit((current) => {
      if (allocations) {
        const split = requireSuccess(splitInvoiceState(current, draft, allocations, finalize))
        savedIds = split.invoiceIds
        return split.state
      }
      const next = requireSuccess(saveInvoiceState(current, draft, finalize))
      savedIds = next.invoices.at(-1)?.id ? [next.invoices.at(-1)!.id] : []
      return next
    }, allocations ? finalize ? 'Aufgeteilte Rechnungen gemeinsam finalisiert' : 'Aufgeteilte Rechnungsentwürfe angelegt' : finalize ? 'Rechnung finalisiert' : 'Rechnungsentwurf gespeichert', 'invoice', draft.id)
    if (!saved) return
    setEditor((current) => ({ ...current, open: false }))
    setPage('invoices')
    setSelectedInvoiceId(savedIds[0] ?? null)
    toast(allocations ? `${savedIds.length} ${finalize ? 'Rechnungen finalisiert' : 'Entwürfe angelegt'}.` : finalize ? 'Rechnung finalisiert.' : 'Entwurf gespeichert.', 'success')
  }

  const startCorrection = async (invoice: Invoice, reason: string) => {
    let draftId: string | undefined
    if (await commit((current) => {
      const next = createCorrectionDraft(current, invoice.id, reason)
      draftId = next.invoices.at(-1)?.id
      return next
    }, 'Korrekturentwurf angelegt', 'invoice', invoice.id)) {
      const draft = stateRef.current.invoices.find((entry) => entry.id === draftId)
      if (draft) { setSelectedInvoiceId(draft.id); editInvoice(draft) }
    }
  }

  const setInvoiceStatus = async (invoice: Invoice, status: InvoiceStatus, paymentDay?: string) => {
    const message = status === 'paid' && paymentDay ? 'Vollzahlung mit Zahlungstag ' + paymentDay + ' erfasst' : 'Rechnungsstatus auf ' + statusLabel[status] + ' gesetzt'
    if (await commit((current) => changeInvoiceStatus(current, invoice.id, status, new Date().toISOString(), paymentDay), message, 'invoice', invoice.id)) {
      toast(status === 'paid' && paymentDay ? 'Zahlung erfasst.' : 'Status aktualisiert.', 'success')
    }
  }

  const duplicateInvoice = (invoice: Invoice) => {
    const result = prepareInvoiceCopy(stateRef.current, invoice.id)
    if (!result.ok) return toast(result.errors.map((error) => error.message).join(' '), 'error')
    setEditor({ open: true, editing: false, finalized: false, invoiceNumber: null, draft: result.value })
  }

  const requestDeleteInvoice = (invoice: Invoice) => {
    if (isFinalizedInvoice(invoice)) {
      const archived = stateRef.current.invoiceAdministration.find((entry) => entry.versionId === invoice.versionId)?.archived ?? false
      void commit((current) => archiveInvoice(current, invoice.id, !archived), archived ? 'Beleg aus Archiv geholt' : 'Beleg archiviert', 'invoice', invoice.id)
      return
    }
    setConfirmation({
      title: 'Entwurf löschen?',
      message: 'Der Entwurf und seine Positionen werden dauerhaft aus diesem Browser entfernt. Es wurde noch keine Rechnungsnummer verbraucht.',
      label: 'Entwurf löschen', danger: true,
      action: async () => {
        if (!await commit((current) => ({ ...current, invoices: current.invoices.filter((item) => item.id !== invoice.id) }), 'Rechnungsentwurf gelöscht', 'invoice', invoice.id)) return
        setSelectedInvoiceId(null)
        toast('Entwurf gelöscht.', 'success')
      },
    })
  }

  const saveGuardian = async (guardian: Guardian): Promise<boolean> => {
    const exists = stateRef.current.guardians.some((item) => item.id === guardian.id)
    const saved = await commit((current) => requireSuccess(saveGuardianState(current, guardian)), exists ? 'Elternteil aktualisiert' : 'Elternteil angelegt', 'person', guardian.id)
    if (saved) toast(exists ? 'Kontakt aktualisiert.' : 'Kontakt angelegt.', 'success')
    return saved
  }

  const saveStudent = async (student: Student): Promise<boolean> => {
    const exists = stateRef.current.students.some((item) => item.id === student.id)
    const saved = await commit((current) => requireSuccess(saveStudentState(current, student)), exists ? 'Kind aktualisiert' : 'Kind angelegt', 'person', student.id)
    if (saved) toast(exists ? 'Kind aktualisiert.' : 'Kind angelegt.', 'success')
    return saved
  }

  const deleteGuardian = (guardian: Guardian) => setConfirmation({
    title: `${guardian.name} löschen?`,
    message: 'Die Person wird aus Stammdaten, Zuordnungen und offenen Entwürfen entfernt. Finalisierte Rechnungen behalten ihren eingefrorenen Empfängerstand.',
    label: 'Kontakt löschen', danger: true,
    action: async () => {
      if (!await commit((current) => requireSuccess(deleteGuardianState(current, guardian.id)), 'Elternteil gelöscht', 'person', guardian.id)) return
      toast('Kontakt gelöscht.', 'success')
    },
  })

  const deleteStudent = (student: Student) => setConfirmation({
    title: `${student.name} löschen?`,
    message: 'Das Kind und zugehörige Positionen in normalen Entwürfen werden entfernt. Originalbelege und Korrekturentwürfe bleiben erhalten; dort ist gegebenenfalls eine Neuzuordnung nötig.',
    label: 'Kind löschen', danger: true,
    action: async () => {
      if (!await commit((current) => requireSuccess(deleteStudentState(current, student.id)), 'Kind gelöscht', 'person', student.id)) return
      toast('Kind gelöscht.', 'success')
    },
  })

  const print = (invoice: Invoice) => {
    const request = { id: uid('print'), invoice: selectInvoice(stateRef.current, stateRef.current.invoices.find((entry) => entry.id === invoice.id) ?? invoice) }
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
    downloadText(`riffrechnung-backup-${new Date().toISOString().slice(0, 10)}.json`, session.export())
    try {
      if (mode === 'real') setLastBackupAt(recordBackupExport())
    } catch {
      setLastBackupAt(new Date().toISOString())
    }
    toast('JSON-Export des zuletzt bestätigten Stands gestartet.', 'info')
  }

  const exportRecoveryData = () => {
    if (!recovery?.rawData) return
    downloadText(`riffrechnung-beschaedigte-lokaldaten-${new Date().toISOString().slice(0, 10)}.txt`, recovery.rawData, 'text/plain')
    toast('Beschädigte Rohdaten heruntergeladen.', 'success')
  }

  const reviewPrevious = () => {
    try {
      const raw = session.previousRaw()
      if (!raw) return toast('Keine vorherige lokale Version vorhanden.', 'info')
      const bytes = new TextEncoder().encode(raw)
      setImportReview({ bytes, result: inspectImportBytes(bytes) })
    } catch (error) { toast(error instanceof Error ? error.message : 'Vorherige Version nicht lesbar.', 'error') }
  }

  const exportRecoveryArchive = () => {
    try { downloadText('riffrechnung-wiederherstellungsarchiv.json', session.exportRecoveryArchive()) }
    catch (error) { toast(error instanceof Error ? error.message : 'Archiv konnte nicht exportiert werden.', 'error') }
  }

  const reviewRecovery = () => {
    if (!recovery) return
    const bytes = new TextEncoder().encode(recovery.rawData)
    setImportReview({ bytes, result: inspectImportBytes(bytes) })
  }

  const importBackup = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      setImportReview({ bytes, result: inspectImportBytes(bytes) })
    } catch (error) { toast(error instanceof Error ? error.message : 'Die Backup-Datei konnte nicht gelesen werden.', 'error') }
  }

  const applyRestore = async (preview: ImportPreview, backup = true): Promise<boolean> => {
    setSaveStateLabel('saving')
    try {
      const restored = await session.restore(preview.rawData)
      stateRef.current = restored
      setState(restored)
      setRecovery(null)
      setSettingsEpoch((value) => value + 1)
      setLocalSaveError(null)
      setSaveStateLabel('saved')
      setSavedAt(new Date())
      setSelectedInvoiceId(null)
      setPage('dashboard')
      toast(`Wiederherstellung lokal gespeichert, Revision ${session.revision?.revision ?? 'Demo'}. Der vorherige Stand und die Eingangsdaten bleiben gesichert.`, 'success')
      if (backup) void runBackup()
      return true
    } catch (error) {
      setSaveStateLabel('error')
      setLocalSaveError(error instanceof Error ? error.message : 'Wiederherstellung fehlgeschlagen.')
      toast(error instanceof Error ? error.message : 'Wiederherstellung fehlgeschlagen.', 'error')
      return false
    }
  }

  const confirmImport = (preview: ImportPreview) => {
    setConfirmation({
      title: 'Backup als neuen Stand wiederherstellen?',
      message: `${preview.state.students.length} Kinder, ${preview.state.invoices.length} Rechnungen. ${preview.envelope ? `Bestand ${preview.envelope.datasetId}, Revision ${preview.envelope.revision}.` : 'Ohne Bestands-ID: Mit der Bestätigung ordnest du dieses Altbackup ausdrücklich zu; eine gemeinsame Herkunft ist nicht nachgewiesen.'} Der aktuelle Stand und die unveränderten Eingangsdaten werden zuerst lokal aufbewahrt. Bekannte Originalbelege dürfen nicht verändert werden.`,
      label: 'Wiederherstellung bestätigen', danger: true,
      action: async () => { if (await applyRestore(preview)) setImportReview(null) },
    })
  }

  const inspectFolder = async (handle: FileSystemDirectoryHandle) => {
    const inspection = await inspectBackupDirectory(handle)
    setFolderReview({ handle, inspection })
  }

  const connectFolder = async () => {
    if (mode === 'demo' || !window.showDirectoryPicker) return
    try { await inspectFolder(await window.showDirectoryPicker({ mode: 'read' })) }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setFileBackupStatus('error')
      setFileBackupError(error instanceof Error ? error.message : 'Ordner konnte nicht gelesen werden.')
    }
  }

  const acceptFolder = async (restore?: ImportPreview) => {
    if (!folderReview || mode === 'demo') return
    const previousBinding = session.directory
    try {
      // Permission prompt remains tied to this explicit user action. Cancel/deny
      // leaves both the local state and all files untouched.
      if (!await ensureWritePermission(folderReview.handle, true)) throw new Error('Keine Schreibberechtigung. Der bisherige Bestand bleibt erhalten.')
      if (restore && !await applyRestore(restore, false)) return
      if (!session.revision) {
        const current = await session.change((value) => value)
        setState(current)
      }
      const binding: DirectoryBinding = {
        handle: folderReview.handle, datasetId: session.revision!.datasetId,
        legacyFiles: restore ? folderReview.inspection.entries.filter((entry) => entry.preview && !entry.preview.envelope && entry.raw === restore.rawData).map(({ name, fingerprint }) => ({ name, fingerprint })) : [],
      }
      await session.connect(binding)
      await storeDirectoryHandle(binding)
      folderHandle.current = binding.handle
      setFolderConnected(true)
      setFolderName(binding.handle.name)
      setFolderReview(null)
      await runBackup()
    } catch (error) {
      if (session.directory !== previousBinding) {
        session.disconnect()
        if (previousBinding) {
          try { await session.connect(previousBinding) } catch { /* Existing configuration stays in IndexedDB for explicit review. */ }
        }
      }
      setFileBackupStatus(error instanceof StorageConflict ? 'conflict' : 'error')
      setFileBackupError(error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.')
      toast(error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.', 'error')
    }
  }

  const disconnectFolder = async () => {
    if (mode === 'demo') return
    try {
      await session.idle()
      await clearDirectoryHandle()
      session.disconnect()
      folderHandle.current = null
      setFolderConnected(false)
      setFolderName('')
      setFileBackupStatus('idle')
      setFileBackupError(null)
    } catch (error) { toast(error instanceof Error ? error.message : 'Ordner konnte nicht getrennt werden.', 'error') }
  }

  const backupNow = async () => {
    if (mode === 'demo') return
    if (settingsFlush.current && !await settingsFlush.current()) return
    if (!folderHandle.current) return exportBackup()
    try {
      if (!await ensureWritePermission(folderHandle.current, true)) throw new Error('Schreibberechtigung fehlt. Bitte erneut freigeben oder JSON exportieren.')
      if (!session.directory) { await inspectFolder(folderHandle.current); return }
      await runBackup()
    } catch (error) { setFileBackupStatus('error'); setFileBackupError(error instanceof Error ? error.message : 'Backup fehlgeschlagen.') }
  }

  const resetAll = () => setConfirmation({
    title: 'Lokalen Bestand zurücksetzen?', message: 'Der bisherige Stand bleibt als vorherige lokale Version erhalten. Der Backup-Ordner wird zuvor getrennt.', label: 'Zurücksetzen', danger: true,
    action: async () => {
      try {
        assertReplacementAllowed(session.state)
        if (mode === 'real') await clearDirectoryHandle()
        session.disconnect()
        folderHandle.current = null
        setFolderConnected(false)
        const next = await session.change(() => emptyState(), 'reset')
        setState(next)
        setSettingsEpoch((value) => value + 1)
        stateRef.current = next
        setSelectedInvoiceId(null)
        setPage('dashboard')
        toast('Zurücksetzen lokal gespeichert.', 'success')
      } catch (error) { toast(error instanceof Error ? error.message : 'Zurücksetzen fehlgeschlagen.', 'error') }
    },
  })

  const saveSettings = useCallback((settings: SettingsType) => commit((current) => requireSuccess(saveSettingsState(current, settings)), 'Einstellungen aktualisiert', 'settings'), [commit])
  const switchMode = async () => {
    if (settingsFlush.current && !await settingsFlush.current()) return
    await session.idle()
    onModeChange(mode === 'real' ? 'demo' : 'real')
  }
  const loadDemo = () => { void switchMode() }
  const openInvoice = (id: string) => { setSelectedInvoiceId(id); void setCurrentPage('invoices') }
  const setCurrentPage = async (next: PageKey) => {
    if (page === 'settings' && settingsFlush.current && !await settingsFlush.current()) return
    setPage(next)
    setMobileNav(false)
  }
  const nextTheme = state.settings.theme === 'system' ? 'light' : state.settings.theme === 'light' ? 'dark' : 'system'
  const toggleTheme = async () => {
    if (settingsFlush.current && !await settingsFlush.current()) return
    if (await saveSettings({ ...stateRef.current.settings, theme: nextTheme })) setSettingsEpoch((value) => value + 1)
  }
  const themeNames = { system: 'System', light: 'Hell', dark: 'Dunkel' } as const
  const themeToggleLabel = `Aktuelles Farbschema: ${themeNames[state.settings.theme]}. Als Nächstes ${themeNames[nextTheme]} aktivieren.`
  const ThemeToggleIcon = state.settings.theme === 'system' ? Palette : state.settings.theme === 'light' ? Sun : Moon
  const backupStatusLabel = lastBackupAt ? `Letzter JSON-Export: ${backupDateFormatter.format(new Date(lastBackupAt))}` : 'Noch kein Backup'
  const fileBackupLabel = folderConnected
    ? fileBackupStatus === 'saving' ? 'Datei-Backup ausstehend …' : fileBackupStatus === 'conflict' ? 'Datei-Backup: Konflikt' : fileBackupStatus === 'error' ? 'Datei-Backup: Fehler' : fileBackupStatus === 'saved' ? 'Datei-Backup gespeichert' : `Datei-Backup ausstehend: ${folderName}`
    : backupStatusLabel
  const persistenceErrorText = [localSaveError ? `Lokaler Speicher: ${localSaveError}` : '', fileBackupError ? `Datei-Backup: ${fileBackupError}` : ''].filter(Boolean).join(' ')

  if (recovery) return (
    <>
      {localSaveError && <p role="alert">{localSaveError}</p>}
      <StorageRecovery recovery={recovery} onExport={exportRecoveryData} onImport={importBackup} onReview={reviewRecovery} onPrevious={reviewPrevious} onArchive={exportRecoveryArchive} />
      <ImportReview review={importReview} onClose={() => setImportReview(null)} onApply={recovery.readOnly ? undefined : confirmImport} />
      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} message={confirmation?.message ?? ''} confirmLabel={confirmation?.label} danger={confirmation?.danger} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); action?.() }} />
      <ToastRegion messages={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
    </>
  )

  return (
    <div className="app-shell">
      {mode === 'demo' && <section className="demo-banner" role="status">Demo – nur in dieser Sitzung. <button className="button button--tonal" onClick={() => void switchMode()}>Demo verlassen</button></section>}
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
          <button className="topbar-search" onClick={async () => { await setCurrentPage('invoices'); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#invoice-search')?.focus()) }}><Search aria-hidden="true" /><span>Rechnungen durchsuchen</span></button>
          <div className="topbar__end"><div className="topbar__storage-status" role="status" aria-live="polite"><span className={`save-indicator ${saveStateLabel === 'saving' ? 'is-saving' : saveStateLabel === 'error' ? 'is-error' : ''}`}><i />{mode === 'demo' ? 'Demo – nur in dieser Sitzung' : externalChangeDetected ? 'Speicherkonflikt' : settingsDirty || saveStateLabel === 'saving' ? 'Ungespeicherte Änderungen …' : saveStateLabel === 'error' ? 'Lokal nicht gespeichert' : !session.revision ? 'Noch nichts lokal gespeichert' : `Lokal gespeichert ${savedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}</span><span className={`backup-indicator ${fileBackupStatus === 'error' || fileBackupStatus === 'conflict' ? 'is-error' : ''}`}>{fileBackupLabel}</span></div><button className="icon-button" onClick={toggleTheme} aria-label={themeToggleLabel} title={themeToggleLabel}><ThemeToggleIcon aria-hidden="true" /></button><button className="button button--primary topbar-new" onClick={openNewInvoice}><FilePlus2 aria-hidden="true" /><span>Neue Rechnung</span></button></div>
        </header>

        {externalChangeDetected && <section className="external-update" role="alert"><div><strong>Änderungen in einem anderen Tab erkannt</strong><p>Dieser Tab zeigt nicht mehr den aktuellen Datenstand. Lade neu, bevor du weiterarbeitest.</p></div><button className="button button--tonal" type="button" onClick={() => window.location.reload()}>Aktuellen Stand neu laden</button></section>}
        {persistenceErrorText && <section className="persistence-error" role="alert"><div><strong>Speichern fehlgeschlagen</strong><p>{persistenceErrorText}</p></div><div className="button-row"><button className="button button--tonal" type="button" onClick={async () => { if (settingsFlush.current) await settingsFlush.current(); await backupNow() }}>Erneut versuchen</button><button className="button button--text" type="button" onClick={exportBackup}>JSON-Backup exportieren</button></div></section>}

        <main id="main-content" tabIndex={-1}>
          {page === 'dashboard' && <Dashboard state={state} onNavigate={setCurrentPage} onNewInvoice={openNewInvoice} onLoadDemo={loadDemo} demoBlockedReason={mode === 'demo' ? 'Du bist bereits in der isolierten Demo.' : null} onOpenInvoice={openInvoice} />}
          {page === 'invoices' && <Invoices state={state} selectedId={selectedInvoiceId} onSelect={setSelectedInvoiceId} onNew={openNewInvoice} onEdit={editInvoice} onDuplicate={duplicateInvoice} onDelete={requestDeleteInvoice} onSetStatus={setInvoiceStatus} onCorrection={startCorrection} onAllocatePayment={(paymentId, versionId, reason) => { void commit((current) => allocatePayment(current, paymentId, versionId, reason), 'Zahlung manuell zugeordnet', 'invoice') }} onResolveConflicts={(versionId, reason) => { void commit((current) => resolveDocumentConflicts(current, versionId, reason), 'Historische Abweichung geklärt', 'invoice') }} onPrint={print} onToast={toast} />}
          {page === 'people' && <People state={state} onSaveGuardian={saveGuardian} onSaveStudent={saveStudent} onDeleteGuardian={deleteGuardian} onDeleteStudent={deleteStudent} />}
          {page === 'reports' && <Reports state={state} />}
          {page === 'about' && <About />}
          <div hidden={page !== 'settings'}><Settings key={settingsEpoch} state={state} onDirty={setSettingsDirty} folderSupported={mode === 'real' && Boolean(window.showDirectoryPicker)} folderConnected={folderConnected} folderName={folderName} onSave={saveSettings} onRegisterFlush={(flush) => { settingsFlush.current = flush }} onExport={exportBackup} onImport={importBackup} onConnectFolder={connectFolder} onDisconnectFolder={disconnectFolder} onBackupNow={backupNow} onReset={resetAll} onPrevious={reviewPrevious} onArchive={exportRecoveryArchive} /></div>
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile Hauptnavigation">{navItems.slice(0, 4).map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} key={key} onClick={() => setCurrentPage(key)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>

      <FolderReview review={folderReview} current={session.revision} onClose={() => setFolderReview(null)} onChoose={connectFolder} onConnect={() => void acceptFolder()} onRestore={(preview) => setConfirmation({ title: 'Sicherung zuordnen und wiederherstellen?', message: 'Mit der Bestätigung wird die gewählte Sicherung als neuer lokaler Stand eingeführt. Altbackups ohne Bestands-ID werden ausdrücklich zugeordnet; eine gemeinsame Herkunft wird nicht behauptet. Vorhandene Originale und Rohdaten bleiben geschützt.', label: 'Zuordnung und Wiederherstellung bestätigen', action: async () => { await acceptFolder(preview) } })} />
      <ImportReview review={importReview} onClose={() => setImportReview(null)} onApply={confirmImport} />
      <InvoiceEditor state={state} open={editor.open} draft={editor.draft} editing={editor.editing} finalized={editor.finalized} invoiceNumber={editor.invoiceNumber} guardians={state.guardians} students={state.students} settings={state.settings} onClose={() => setEditor((current) => ({ ...current, open: false }))} onSave={saveInvoice} />
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
