import { deleteGuardianState, deleteStudentState, deleteInvoiceDraftState, resetUnissuedState, recordActivity } from './lib/commands'
import { allocatePayment, archiveInvoice, createCorrectionDraft, resolveDocumentConflicts, selectInvoice } from './lib/documents'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BookUser, FilePlus2, Menu, Moon, Palette, ReceiptText, Search, Settings as SettingsIcon, Sun, X } from 'lucide-react'
import type { AppState, AuditEvent, Guardian, Invoice, InvoiceDraft, InvoiceStatus, PageKey, Settings as SettingsType, Student, ToastMessage } from './types'
import { Invoices } from './views/Invoices'
import { InvoiceEditor } from './views/InvoiceEditor'
import { People } from './views/People'
import { Settings } from './views/Settings'
import { StorageRecovery } from './views/StorageRecovery'
import { ImportReview, type ImportReviewData } from './views/ImportReview'
import { inspectImportBytes, type ImportPreview } from './lib/importState'
import { requireSuccess } from './lib/result'
import { prepareInvoiceCopy, prepareNewInvoice, saveGuardianState, saveInvoiceState, saveSettingsState, saveStudentState, convertLegacyDraftState } from './lib/commands'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ToastRegion } from './components/ToastRegion'
import { InvoicePrint } from './components/InvoicePrint'
import { createEmptyInvoiceDraft } from './lib/invoiceDrafts'
import { loadLastBackupAt, StorageSession, StorageConflict, recordBackupExport, STORAGE_KEY, LEGACY_STORAGE_KEY, type StorageRecoveryState } from './lib/storage'
import { downloadText } from './lib/downloads'
import { invoicePdfTitle, statusLabel } from './lib/invoiceOutput'
import { uid } from './lib/identities'
import { changeInvoiceStatus } from './lib/invoiceActions'
import { assertOriginalsPreserved, assertReplacementAllowed, FINALIZED_INVOICE_BLOCKED, isFinalizedInvoice } from './lib/safety'
import { APP_VERSION } from './version'
import { isCurrentPrintRequest, type PrintRequest } from './lib/printJob'

const navItems: Array<{ key: PageKey; label: string; icon: typeof ReceiptText }> = [
  { key: 'invoices', label: 'Rechnungen', icon: ReceiptText },
  { key: 'people', label: 'Personen', icon: BookUser },
  { key: 'settings', label: 'Einstellungen', icon: SettingsIcon },
]

const backupDateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface Confirmation {
  title: string
  message: string
  label: string
  cancelLabel?: string
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
  const [page, setPage] = useState<PageKey>('invoices')
  const [mobileNav, setMobileNav] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 820px)').matches)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [editor, setEditor] = useState<InvoiceEditorState>({ open: false, draft: createEmptyInvoiceDraft(state.settings), editing: false, finalized: false, invoiceNumber: null })
  const [editorDirty, setEditorDirty] = useState(false)
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [importReview, setImportReview] = useState<ImportReviewData | null>(null)
  const [saveStateLabel, setSaveStateLabel] = useState<'saved' | 'saving' | 'error'>('saved')
  const [localSaveError, setLocalSaveError] = useState<string | null>(null)
  const [externalChangeDetected, setExternalChangeDetected] = useState(false)
  const [savedAt, setSavedAt] = useState(() => new Date())
  const [lastBackupAt, setLastBackupAt] = useState(() => mode === 'real' ? loadLastBackupAt() : null)
  const printRequestRef = useRef<PrintRequest | null>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const mobileCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const mainContentRef = useRef<HTMLElement | null>(null)

  const toast = useCallback((message: string, tone: ToastMessage['tone'] = 'info') => {
    const id = uid('toast')
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200)
  }, [])

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
  }, [session, toast])

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
    const warn = (event: BeforeUnloadEvent) => {
      if (!editorDirty && !settingsDirty && saveStateLabel !== 'saving' && saveStateLabel !== 'error') return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editorDirty, saveStateLabel, settingsDirty])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)')
    const update = () => {
      setIsMobile(media.matches)
      if (!media.matches) setMobileNav(false)
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
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
    const result = prepareNewInvoice(stateRef.current)
    if (!result.ok) return toast(result.errors.map((error) => error.message).join(' '), 'error')
    setEditor({ open: true, draft: result.value, editing: false, finalized: false, invoiceNumber: null })
  }, [toast])

  const editInvoice = (invoice: Invoice) => {
    // The editor is available for every draft. A legacy/output snapshot alone
    // must not hide a still editable draft; the domain command remains the
    // final guard against changes to issued documents.
    if (invoice.status !== 'draft') return toast(FINALIZED_INVOICE_BLOCKED, 'error')
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
        recipients: structuredClone(invoice.recipients),
        studentIds: invoice.studentIds,
        recipientStrategy: invoice.recipientStrategy,
        items: structuredClone(invoice.items),
        freeText: invoice.freeText,
      },
    })
  }

  const saveInvoice = async (draft: InvoiceDraft, finalize: boolean) => {
    const saved = await commit((current) => requireSuccess(saveInvoiceState(current, draft, finalize)), finalize ? 'Rechnung finalisiert' : 'Rechnungsentwurf gespeichert', 'invoice', draft.id)
    if (!saved) return
    setEditor((current) => ({ ...current, open: false }))
    setEditorDirty(false)
    setPage('invoices')
    setSelectedInvoiceId(draft.id ?? stateRef.current.invoices.at(-1)?.id ?? null)
    toast(finalize ? 'Rechnung finalisiert.' : 'Entwurf gespeichert.', 'success')
  }

  const convertLegacyDraft = async (sourceId: string, reviewed: string[], guardianIds: string[], edited: InvoiceDraft) => {
    const saved = await commit((current) => requireSuccess(convertLegacyDraftState(current, sourceId, reviewed, guardianIds, edited)), 'Historischen Entwurf ausdrücklich übernommen', 'invoice', sourceId)
    if (!saved) return
    setEditor((current) => ({ ...current, open: false }))
    setEditorDirty(false)
    setPage('invoices')
    setSelectedInvoiceId(stateRef.current.invoices.find((invoice) => invoice.id === sourceId)?.id ?? stateRef.current.invoices.at(-1)?.id ?? null)
    toast('Gemeinsamer Entwurf übernommen. Bitte vor der Finalisierung nochmals prüfen.', 'success')
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
        if (!await commit((current) => requireSuccess(deleteInvoiceDraftState(current, invoice.id)), 'Rechnungsentwurf gelöscht', 'invoice', invoice.id)) return
        setSelectedInvoiceId(null)
        toast('Entwurf gelöscht.', 'success')
      },
    })
  }

  const saveGuardian = async (guardian: Guardian): Promise<boolean> => {
    const exists = stateRef.current.guardians.some((item) => item.id === guardian.id)
    const saved = await commit((current) => requireSuccess(saveGuardianState(current, guardian)), exists ? 'Erziehungsberechtigte Person aktualisiert' : 'Erziehungsberechtigte Person angelegt', 'person', guardian.id)
    if (saved) toast(exists ? 'Kontakt aktualisiert.' : 'Kontakt angelegt.', 'success')
    return saved
  }

  const saveStudent = async (student: Student): Promise<boolean> => {
    const exists = stateRef.current.students.some((item) => item.id === student.id)
    const saved = await commit((current) => requireSuccess(saveStudentState(current, student)), exists ? 'Lernende Person aktualisiert' : 'Lernende Person angelegt', 'person', student.id)
    if (saved) toast(exists ? 'Lernende Person aktualisiert.' : 'Lernende Person angelegt.', 'success')
    return saved
  }

  const deleteGuardian = (guardian: Guardian) => setConfirmation({
    title: `${guardian.name} löschen?`,
    message: 'Die Person wird aus Stammdaten, Zuordnungen und offenen Entwürfen entfernt. Finalisierte Rechnungen behalten ihren eingefrorenen Empfängerstand.',
    label: 'Kontakt löschen', danger: true,
    action: async () => {
      if (!await commit((current) => requireSuccess(deleteGuardianState(current, guardian.id)), 'Erziehungsberechtigte Person gelöscht', 'person', guardian.id)) return
      toast('Kontakt gelöscht.', 'success')
    },
  })

  const deleteStudent = (student: Student) => setConfirmation({
    title: `${student.name} löschen?`,
    message: 'Die lernende Person und zugehörige Positionen in normalen Entwürfen werden entfernt. Originalbelege und Korrekturentwürfe bleiben erhalten; dort ist gegebenenfalls eine Neuzuordnung nötig.',
    label: 'Lernende Person löschen', danger: true,
    action: async () => {
      if (!await commit((current) => requireSuccess(deleteStudentState(current, student.id)), 'Lernende Person gelöscht', 'person', student.id)) return
      toast('Lernende Person gelöscht.', 'success')
    },
  })

  const print = (invoice: Invoice) => {
    const current = stateRef.current
    const request: PrintRequest = {
      id: uid('print'),
      invoice: selectInvoice(current, current.invoices.find((entry) => entry.id === invoice.id) ?? invoice),
      guardians: structuredClone(current.guardians),
      students: structuredClone(current.students),
      settings: structuredClone(current.settings),
      includeGiroCode: true,
    }
    printRequestRef.current = request
    setPrintRequest(request)
  }

  const handlePrintReady = useCallback(async (requestId: string, invoiceId: string) => {
    const request = printRequestRef.current
    if (!isCurrentPrintRequest(request, requestId, invoiceId)) return
    try {
      await document.fonts?.ready
    } catch {
      // A printable fallback font is still better than crossing into another job.
    }
    if (!isCurrentPrintRequest(printRequestRef.current, requestId, invoiceId)) return

    printRequestRef.current = null
    const previousTitle = document.title
    const restoreTitle = () => {
      document.title = previousTitle
      setPrintRequest((current) => current?.id === requestId ? null : current)
    }
    document.title = invoicePdfTitle(request.invoice, request.students)
    window.addEventListener('afterprint', restoreTitle, { once: true })
    try {
      window.print()
    } catch {
      window.removeEventListener('afterprint', restoreTitle)
      restoreTitle()
      toast('Druckdialog konnte nicht geöffnet werden.', 'error')
    }
  }, [toast])

  const handlePrintError = useCallback((requestId: string, invoiceId: string, message: string) => {
    const request = printRequestRef.current
    if (!isCurrentPrintRequest(request, requestId, invoiceId)) return
    setConfirmation({
      title: 'GiroCode nicht verfügbar',
      message: `${message} Die Rechnung selbst ist vollständig und kann bewusst ohne GiroCode gedruckt werden. Bankdaten, Betrag und Verwendungszweck bleiben unverändert aus diesem Druckauftrag.`,
      label: 'Ohne GiroCode drucken',
      action: () => {
        const pending = printRequestRef.current
        if (!isCurrentPrintRequest(pending, requestId, invoiceId)) return
        const fallback = { ...pending, includeGiroCode: false, giroCodeFallbackReason: message }
        printRequestRef.current = fallback
        setPrintRequest(fallback)
      },
    })
  }, [])

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

  const applyRestore = async (preview: ImportPreview): Promise<boolean> => {
    setSaveStateLabel('saving')
    try {
      const restored = await session.restore(preview.rawData)
      stateRef.current = restored
      setState(restored)
      setRecovery(null)
      setSettingsEpoch((value) => value + 1)
      setSettingsDirty(false)
      setLocalSaveError(null)
      setSaveStateLabel('saved')
      setSavedAt(new Date())
      setSelectedInvoiceId(null)
      setPage('invoices')
      toast(`Wiederherstellung lokal gespeichert, Revision ${session.revision?.revision ?? 'Demo'}. Der vorherige Stand und die Eingangsdaten bleiben bereinigt gesichert.`, 'success')
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
      message: `${preview.state.students.length} Lernende, ${preview.state.invoices.length} Rechnungen. ${preview.envelope ? `Bestand ${preview.envelope.datasetId}, Revision ${preview.envelope.revision}.` : 'Ohne Bestands-ID: Mit der Bestätigung ordnest du dieses Altbackup ausdrücklich zu; eine gemeinsame Herkunft ist nicht nachgewiesen.'} Ungespeicherte Einstellungen werden bei erfolgreicher Wiederherstellung verworfen. Der aktuelle Stand und die Eingangsdaten werden bereinigt lokal aufbewahrt. Abgeschaffte Zahler-IBAN sowie interne Personen- und Zahlungsnotizen werden auch aus internen Kopien endgültig entfernt. Ausstellerkonto, Rechnungshinweis und bekannte Originalbelege bleiben erhalten.`,
      label: 'Wiederherstellung bestätigen', danger: true,
      action: async () => { if (await applyRestore(preview)) setImportReview(null) },
    })
  }

  const resetAll = () => setConfirmation({
    title: 'Lokalen Bestand zurücksetzen?', message: 'Der bisherige Stand bleibt als vorherige lokale Version erhalten. Ungespeicherte Einstellungen werden bei erfolgreichem Zurücksetzen verworfen.', label: 'Zurücksetzen', danger: true,
    action: async () => {
      try {
        assertReplacementAllowed(session.state)
        const next = await session.change((current) => requireSuccess(resetUnissuedState(current)), 'reset')
        setState(next)
        setSettingsEpoch((value) => value + 1)
        stateRef.current = next
        setSelectedInvoiceId(null)
        setPage('invoices')
        toast('Zurücksetzen lokal gespeichert.', 'success')
      } catch (error) { toast(error instanceof Error ? error.message : 'Zurücksetzen fehlgeschlagen.', 'error') }
    },
  })

  const saveSettings = useCallback((settings: SettingsType) => commit((current) => requireSuccess(saveSettingsState(current, settings)), 'Einstellungen aktualisiert', 'settings'), [commit])
  const guardSettings = (action: () => void | Promise<void>): void => {
    if (pendingWrites.current) { toast('Bitte den laufenden Speichervorgang abwarten.', 'info'); return }
    if (!settingsDirty) { void action(); return }
    setConfirmation({
      title: 'Ungespeicherte Einstellungen verwerfen?',
      message: 'Die Eingaben wurden noch nicht gespeichert. „Weiter bearbeiten“ erhält alle Formularwerte. Speichere sie mit „Jetzt speichern“, bevor du die Einstellungen verlässt.',
      label: 'Verwerfen', cancelLabel: 'Weiter bearbeiten', danger: true,
      action: () => {
        setSettingsEpoch((value) => value + 1)
        setSettingsDirty(false)
        return action()
      },
    })
  }
  const switchMode = () => guardSettings(async () => {
    await session.idle()
    onModeChange(mode === 'real' ? 'demo' : 'real')
  })
  const loadDemo = () => { void switchMode() }
  const closeEditor = () => {
    setEditor((current) => ({ ...current, open: false }))
    setEditorDirty(false)
  }
  const requestCloseEditor = () => {
    if (!editor.open || !editorDirty) return closeEditor()
    setConfirmation({
      title: 'Ungespeicherte Rechnungsänderungen verwerfen?',
      message: 'Die Eingaben wurden noch nicht gespeichert oder finalisiert. „Weiter bearbeiten“ erhält alle Formularwerte. „Verwerfen“ ändert keinen gespeicherten Beleg.',
      label: 'Verwerfen',
      cancelLabel: 'Weiter bearbeiten',
      danger: true,
      action: closeEditor,
    })
  }
  const setCurrentPage = async (next: PageKey) => {
    if (editor.open && editorDirty && next !== page) {
      setConfirmation({
        title: 'Ungespeicherte Rechnungsänderungen verwerfen?',
        message: 'Die Eingaben wurden noch nicht gespeichert oder finalisiert. „Weiter bearbeiten“ erhält alle Formularwerte. „Verwerfen“ ändert keinen gespeicherten Beleg.',
        label: 'Verwerfen',
        cancelLabel: 'Weiter bearbeiten',
        danger: true,
        action: () => {
          closeEditor()
          setPage(next)
          setMobileNav(false)
          requestAnimationFrame(() => mainContentRef.current?.focus())
        },
      })
      return
    }
    const navigate = () => {
      setPage(next)
      setMobileNav(false)
      if (isMobile && mobileNav) requestAnimationFrame(() => mainContentRef.current?.focus())
    }
    if (next !== page) guardSettings(navigate)
    else navigate()
  }
  const openMobileNav = useCallback(() => {
    setMobileNav(true)
    requestAnimationFrame(() => mobileCloseButtonRef.current?.focus())
  }, [])
  const closeMobileNav = useCallback(() => {
    setMobileNav(false)
    requestAnimationFrame(() => mobileMenuButtonRef.current?.focus())
  }, [])
  useEffect(() => {
    if (!mobileNav) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      event.preventDefault()
      closeMobileNav()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closeMobileNav, mobileNav])
  const themeNames = { system: 'System', light: 'Hell', dark: 'Dunkel' } as const
  const themeToggleLabel = `Farbschema in Einstellungen bearbeiten. Aktuell: ${themeNames[state.settings.theme]}.`
  const ThemeToggleIcon = state.settings.theme === 'system' ? Palette : state.settings.theme === 'light' ? Sun : Moon
  const backupStatusLabel = lastBackupAt ? `Letzter JSON-Export: ${backupDateFormatter.format(new Date(lastBackupAt))}` : 'Noch kein Backup'
  if (recovery) return (
    <>
      {localSaveError && <p role="alert">{localSaveError}</p>}
      <StorageRecovery recovery={recovery} onExport={exportRecoveryData} onImport={importBackup} onReview={reviewRecovery} onPrevious={reviewPrevious} onArchive={exportRecoveryArchive} />
      <ImportReview review={importReview} onClose={() => setImportReview(null)} onApply={recovery.readOnly ? undefined : confirmImport} />
      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} message={confirmation?.message ?? ''} cancelLabel={confirmation?.cancelLabel} confirmLabel={confirmation?.label} danger={confirmation?.danger} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); action?.() }} />
      <ToastRegion messages={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
    </>
  )

  return (
    <div className="app-shell">
      {mode === 'demo' && <section className="demo-banner" role="status">Demo – nur in dieser Sitzung. <button className="button button--tonal" onClick={() => void switchMode()}>Demo verlassen</button></section>}
      <a href="#main-content" className="skip-link">Zum Inhalt springen</a>
      <aside id="mobile-sidebar" className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`} inert={isMobile && !mobileNav}>
        <div className="brand"><span className="brand__mark" aria-hidden="true">🧾</span><div><strong>RiffRechnung</strong><small>Rechnungen</small></div><button ref={mobileCloseButtonRef} className="icon-button mobile-only" onClick={closeMobileNav} aria-label="Navigation schließen"><X aria-hidden="true" /></button></div>
        <nav aria-label="Hauptnavigation">{navItems.map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} aria-label={label} key={key} onClick={() => setCurrentPage(key)}><Icon aria-hidden="true" /><span>{label}</span>{key === 'invoices' && state.invoices.filter((invoice) => invoice.status === 'draft').length > 0 && <b>{state.invoices.filter((invoice) => invoice.status === 'draft').length}</b>}</button>)}</nav>
        <div className="sidebar__privacy"><span><ShieldDot /></span><div><strong>Nur auf diesem Gerät</strong><small>Keine automatische Cloud-Übertragung</small></div></div>
        <a className="sidebar__version" href="https://github.com/sl3ndrr/RiffRechnung/blob/main/docs/about.md" target="_blank" rel="noreferrer" aria-label={`Info öffnen (neuer Tab), aktuelle Version ${APP_VERSION}`}>Info · Version {APP_VERSION}</a>
        <div className="sidebar__secondary-actions">
        </div>
      </aside>
      {mobileNav && <button className="nav-scrim" aria-label="Navigation schließen" onClick={closeMobileNav} />}

      <div className="app-main" inert={isMobile && mobileNav}>
        <header className="topbar">
          <button ref={mobileMenuButtonRef} className="icon-button mobile-only" onClick={openMobileNav} aria-label="Navigation öffnen" aria-controls="mobile-sidebar" aria-expanded={mobileNav}><Menu aria-hidden="true" /></button>
          <button className="topbar-search" onClick={async () => { await setCurrentPage('invoices'); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#invoice-search')?.focus()) }}><Search aria-hidden="true" /><span>Rechnungen durchsuchen</span></button>
          <div className="topbar__end"><div className="topbar__storage-status" role="status" aria-live="polite"><span className={`save-indicator ${saveStateLabel === 'saving' ? 'is-saving' : saveStateLabel === 'error' ? 'is-error' : ''}`}><i />{mode === 'demo' ? 'Demo – nur in dieser Sitzung' : externalChangeDetected ? 'Speicherkonflikt' : settingsDirty || saveStateLabel === 'saving' ? 'Ungespeicherte Änderungen …' : saveStateLabel === 'error' ? 'Lokal nicht gespeichert' : !session.revision ? 'Noch nichts lokal gespeichert' : `Lokal gespeichert ${savedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}</span><span className="backup-indicator">{backupStatusLabel}</span></div><button className="icon-button" onClick={() => { void setCurrentPage('settings'); requestAnimationFrame(() => document.getElementById('appearance')?.scrollIntoView()) }} aria-label={themeToggleLabel} title={themeToggleLabel}><ThemeToggleIcon aria-hidden="true" /></button><button className="button button--primary topbar-new" onClick={openNewInvoice} aria-label="Neue Rechnung erstellen"><FilePlus2 aria-hidden="true" /><span>Neue Rechnung</span></button></div>
        </header>

        {externalChangeDetected && <section className="external-update" role="alert"><div><strong>Änderungen in einem anderen Tab erkannt</strong><p>Dieser Tab zeigt nicht mehr den aktuellen Datenstand. Lade neu, bevor du weiterarbeitest.</p></div><button className="button button--tonal" type="button" onClick={() => window.location.reload()}>Aktuellen Stand neu laden</button></section>}
        {localSaveError && <section className="persistence-error" role="alert"><div><strong>Speichern fehlgeschlagen</strong><p>{localSaveError}</p></div><div className="button-row"><button className="button button--tonal" type="button" onClick={() => { void setCurrentPage('settings') }}>Einstellungen prüfen</button><button className="button button--text" type="button" onClick={exportBackup}>JSON-Backup exportieren</button></div></section>}

        <main ref={mainContentRef} id="main-content" tabIndex={-1}>
          {page === 'invoices' && <Invoices onNavigate={setCurrentPage} onLoadDemo={mode === 'real' ? loadDemo : undefined} state={state} selectedId={selectedInvoiceId} onSelect={setSelectedInvoiceId} onNew={openNewInvoice} onEdit={editInvoice} onDuplicate={duplicateInvoice} onDelete={requestDeleteInvoice} onSetStatus={setInvoiceStatus} onCorrection={startCorrection} onAllocatePayment={(paymentId, versionId, reason) => { void commit((current) => allocatePayment(current, paymentId, versionId, reason), 'Zahlung manuell zugeordnet', 'invoice') }} onResolveConflicts={(versionId, reason) => { void commit((current) => resolveDocumentConflicts(current, versionId, reason), 'Historische Abweichung geklärt', 'invoice') }} onPrint={print} />}
          {page === 'people' && <People state={state} onSaveGuardian={saveGuardian} onSaveStudent={saveStudent} onDeleteGuardian={deleteGuardian} onDeleteStudent={deleteStudent} />}
          <div hidden={page !== 'settings'}><Settings key={settingsEpoch} state={state} onDirty={setSettingsDirty} onSave={saveSettings} onExport={exportBackup} onImport={importBackup} onReset={resetAll} onPrevious={reviewPrevious} onArchive={exportRecoveryArchive} /></div>
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile Hauptnavigation" inert={isMobile && mobileNav}>{navItems.slice(0, 4).map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} aria-label={label} key={key} onClick={() => setCurrentPage(key)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>

      <ImportReview review={importReview} onClose={() => setImportReview(null)} onApply={confirmImport} />
      <InvoiceEditor state={state} open={editor.open} draft={editor.draft} editing={editor.editing} finalized={editor.finalized} invoiceNumber={editor.invoiceNumber} guardians={state.guardians} students={state.students} settings={state.settings} onClose={requestCloseEditor} onDirtyChange={setEditorDirty} onSave={saveInvoice} onConvert={convertLegacyDraft} />
      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} message={confirmation?.message ?? ''} cancelLabel={confirmation?.cancelLabel} confirmLabel={confirmation?.label} danger={confirmation?.danger} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); action?.() }} />
      <ToastRegion messages={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
      <div className="print-root"><InvoicePrint invoice={printRequest?.invoice ?? null} guardians={printRequest?.guardians ?? []} students={printRequest?.students ?? []} settings={printRequest?.settings ?? state.settings} requestId={printRequest?.id} includeGiroCode={printRequest?.includeGiroCode} giroCodeFallbackReason={printRequest?.giroCodeFallbackReason} onPrintReady={handlePrintReady} onPrintError={handlePrintError} /></div>
    </div>
  )
}

function ShieldDot() {
  return <span className="shield-dot" aria-hidden="true"><i /></span>
}

export default App

