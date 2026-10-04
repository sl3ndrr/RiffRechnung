import { allocatePayment, createCorrectionDraft, resolveDocumentConflicts } from './lib/documents'
import { prepareUndoChangeState, undoChangeState, type UndoChange, type UndoPackage } from './lib/undo'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Guardian, Invoice, InvoiceDraft, InvoiceStatus, PageKey, Settings as SettingsType, Student, ThemeMode } from './types'
import { Invoices } from './views/Invoices'
import { Dashboard } from './views/Dashboard'
import { InvoiceEditor } from './views/InvoiceEditor'
import { People } from './views/People'
import { Settings } from './views/Settings'
import { StorageRecovery } from './views/StorageRecovery'
import { ImportReview, type ImportReviewData } from './views/ImportReview'
import { inspectImportBytes, type ImportPreview } from './lib/importState'
import { requireSuccess } from './lib/result'
import { prepareInvoiceCopy, prepareNewInvoice, saveGuardianState, saveInvoiceState, saveSettingsState, changeThemeState, saveStudentState, convertLegacyDraftState } from './lib/commands'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ToastRegion } from './components/ToastRegion'
import { InvoicePrint } from './components/InvoicePrint'
import { createEmptyInvoiceDraft, invoiceDraftFields } from './lib/invoiceDrafts'
import { downloadText } from './lib/downloads'
import { statusLabel } from './lib/invoiceOutput'
import { changeInvoiceStatus } from './lib/invoiceActions'
import { FINALIZED_INVOICE_BLOCKED, isFinalizedInvoice } from './lib/safety'
import { WorkspaceShell } from './components/WorkspaceShell'
import { useInvoicePrint } from './hooks/useInvoicePrint'
import { useLocalWorkspace } from './hooks/useLocalWorkspace'
import { useToasts } from './hooks/useToasts'

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
}

function App() {
  const [mode, setMode] = useState<'real' | 'demo'>('real')
  return <Workspace key={mode} mode={mode} onModeChange={setMode} />
}

function Workspace({ mode, onModeChange }: { mode: 'real' | 'demo'; onModeChange: (mode: 'real' | 'demo') => void }) {
  const [settingsEpoch, setSettingsEpoch] = useState(0)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [page, setPage] = useState<PageKey>('dashboard')
  const [invoiceInitialStatus, setInvoiceInitialStatus] = useState<'all' | 'unpaid'>('all')
  const [createPerson, setCreatePerson] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [editorDirty, setEditorDirty] = useState(false)
  const { toasts, toast, dismissToast, clearUndoToasts } = useToasts()
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [importReview, setImportReview] = useState<ImportReviewData | null>(null)
  const mainContentRef = useRef<HTMLElement | null>(null)

  const { session, state, stateRef, recovery, pendingWrites, commit, restore, reset, exportBackup,
    saveStateLabel, localSaveError, externalChangeDetected, savedAt, lastBackupAt } = useLocalWorkspace(mode, toast)
  const [editor, setEditor] = useState<InvoiceEditorState>({ open: false, draft: createEmptyInvoiceDraft(state.settings), editing: false })

  const { print, printRequest, handlePrintReady, handlePrintError } = useInvoicePrint(stateRef, toast, setConfirmation)

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!editorDirty && !settingsDirty && saveStateLabel !== 'saving' && saveStateLabel !== 'error') return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editorDirty, saveStateLabel, settingsDirty])

  const openNewInvoice = useCallback(() => {
    const result = prepareNewInvoice(stateRef.current)
    if (!result.ok) return toast(result.errors.map((error) => error.message).join(' '), 'error')
    setEditor({ open: true, draft: result.value, editing: false })
  }, [stateRef, toast])

  const editInvoice = (invoice: Invoice) => {
    // The editor is available for every draft. A legacy/output snapshot alone
    // must not hide a still editable draft; the domain command remains the
    // final guard against changes to issued documents.
    if (isFinalizedInvoice(invoice)) return toast(FINALIZED_INVOICE_BLOCKED, 'error')
    setEditor({
      open: true,
      editing: true,
      draft: {
        id: invoice.id,
        correction: invoice.correction,
        ...invoiceDraftFields(invoice),
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
    setEditor({ open: true, editing: false, draft: result.value })
  }

  const commitUndoChange = async (change: UndoChange, label: string, message: string, ariaLabel: string) => {
    let undo: UndoPackage | undefined
    const entityType = change.kind === 'guardian' || change.kind === 'student' ? 'person' : 'invoice'
    const saved = await commit((current) => {
      const prepared = requireSuccess(prepareUndoChangeState(current, change))
      undo = prepared.undo
      return prepared.state
    }, label, entityType, change.id, () => undo ? `${undo.token}-apply` : undefined)
    if (!saved || !undo) return false
    const captured = undo
    const undoLabel = change.kind === 'archive' ? 'Archivänderung rückgängig gemacht' : 'Löschen rückgängig gemacht'
    toast(`${message} Rückgängig möglich.`, 'success', { durationMs: 10_000, action: {
      label: 'Rückgängig', ariaLabel,
      onClick: async () => {
        if (await commit((current) => requireSuccess(undoChangeState(current, captured)), undoLabel, entityType, change.id, captured.token)) {
          toast(`${undoLabel}.`, 'success')
        }
      },
    } })
    return true
  }

  const requestDeleteInvoice = (invoice: Invoice) => {
    if (isFinalizedInvoice(invoice)) {
      const archived = stateRef.current.invoiceAdministration.find((entry) => entry.versionId === invoice.versionId)?.archived ?? false
      void commitUndoChange({ kind: 'archive', id: invoice.id, archived: !archived }, archived ? 'Beleg aus Archiv geholt' : 'Beleg archiviert',
        archived ? 'Beleg aus Archiv geholt.' : 'Beleg archiviert.', `Archivänderung von ${invoice.number} rückgängig machen`)
      return
    }
    setConfirmation({
      title: 'Entwurf löschen?',
      message: 'Der Entwurf und seine Positionen werden dauerhaft aus diesem Browser entfernt. Es wurde noch keine Rechnungsnummer verbraucht.',
      label: 'Entwurf löschen', danger: true,
      action: async () => {
        if (!await commitUndoChange({ kind: 'draft', id: invoice.id }, 'Rechnungsentwurf gelöscht', 'Entwurf gelöscht.', 'Löschen von Entwurf rückgängig machen')) return
        setSelectedInvoiceId(null)
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
      await commitUndoChange({ kind: 'guardian', id: guardian.id }, 'Erziehungsberechtigte Person gelöscht', 'Kontakt gelöscht.', `Löschen von ${guardian.name} rückgängig machen`)
    },
  })

  const deleteStudent = (student: Student) => setConfirmation({
    title: `${student.name} löschen?`,
    message: 'Die lernende Person und zugehörige Positionen in normalen Entwürfen werden entfernt. Originalbelege und Korrekturentwürfe bleiben erhalten; dort ist gegebenenfalls eine Neuzuordnung nötig.',
    label: 'Lernende Person löschen', danger: true,
    action: async () => {
      await commitUndoChange({ kind: 'student', id: student.id }, 'Lernende Person gelöscht', 'Lernende Person gelöscht.', `Löschen von ${student.name} rückgängig machen`)
    },
  })

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
    if (!await restore(preview.rawData)) return false
    clearUndoToasts()
    setSettingsEpoch((value) => value + 1)
    setSettingsDirty(false)
    setSelectedInvoiceId(null)
    setPage('dashboard')
    return true
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
        await reset()
        clearUndoToasts()
        setSettingsEpoch((value) => value + 1)
        setSelectedInvoiceId(null)
        setPage('dashboard')
        toast('Zurücksetzen lokal gespeichert.', 'success')
      } catch (error) { toast(error instanceof Error ? error.message : 'Zurücksetzen fehlgeschlagen.', 'error') }
    },
  })

  const saveSettings = useCallback((settings: Omit<SettingsType, 'theme'>) => commit((current) => requireSuccess(saveSettingsState(current, { ...settings, theme: current.settings.theme })), 'Einstellungen aktualisiert', 'settings'), [commit])
  const changeTheme = useCallback((theme: ThemeMode) => {
    void commit((current) => requireSuccess(changeThemeState(current, theme)), 'Farbschema geändert', 'settings')
  }, [commit])
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
  const setCurrentPage = (next: PageKey, afterNavigation?: () => void) => {
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
          afterNavigation?.()
          requestAnimationFrame(() => mainContentRef.current?.focus())
        },
      })
      return
    }
    const navigate = () => {
      if (next !== page) { setInvoiceInitialStatus('all'); setCreatePerson(false) }
      setPage(next)
      afterNavigation?.()
    }
    if (next !== page) guardSettings(navigate)
    else navigate()
  }
  const saveStatus = mode === 'demo' ? 'Demo – nur in dieser Sitzung' : externalChangeDetected ? 'Speicherkonflikt' : settingsDirty || saveStateLabel === 'saving' ? 'Ungespeicherte Änderungen …' : saveStateLabel === 'error' ? 'Lokal nicht gespeichert' : !session.revision ? 'Noch nichts lokal gespeichert' : `Lokal gespeichert ${savedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
  if (recovery) return (
    <>
      {localSaveError && <p role="alert">{localSaveError}</p>}
      <StorageRecovery recovery={recovery} onExport={exportRecoveryData} onImport={importBackup} onReview={reviewRecovery} onPrevious={reviewPrevious} onArchive={exportRecoveryArchive} />
      <ImportReview review={importReview} onClose={() => setImportReview(null)} onApply={recovery.readOnly ? undefined : confirmImport} />
      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} message={confirmation?.message ?? ''} cancelLabel={confirmation?.cancelLabel} confirmLabel={confirmation?.label} danger={confirmation?.danger} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); action?.() }} />
      <ToastRegion messages={toasts} onDismiss={dismissToast} />
    </>
  )

  return (
    <div className="app-shell">
      {mode === 'demo' && <section className="demo-banner motion-fade" role="status">Demo – nur in dieser Sitzung. <button className="button button--tonal" onClick={() => void switchMode()}>Demo verlassen</button></section>}
      <WorkspaceShell page={page} settings={state.settings} mode={mode} draftCount={state.invoices.filter((invoice) => invoice.status === 'draft').length} lastBackupAt={lastBackupAt} saveStateLabel={saveStateLabel} saveStatus={saveStatus} mainContentRef={mainContentRef} onNavigate={setCurrentPage} onThemeChange={changeTheme}>
        {externalChangeDetected && <section className="external-update" role="alert"><div><strong>Änderungen in einem anderen Tab erkannt</strong><p>Dieser Tab zeigt nicht mehr den aktuellen Datenstand. Lade neu, bevor du weiterarbeitest.</p></div><button className="button button--tonal" type="button" onClick={() => window.location.reload()}>Aktuellen Stand neu laden</button></section>}
        {localSaveError && <section className="persistence-error" role="alert"><div><strong>Speichern fehlgeschlagen</strong><p>{localSaveError}</p></div><div className="button-row"><button className="button button--tonal" type="button" onClick={() => { void setCurrentPage('settings') }}>Einstellungen prüfen</button><button className="button button--text" type="button" onClick={exportBackup}>JSON-Backup exportieren</button></div></section>}

        <main ref={mainContentRef} id="main-content" tabIndex={-1}>
          {page === 'dashboard' && <Dashboard state={state} mode={mode} lastBackupAt={lastBackupAt} onNavigate={setCurrentPage} onNew={openNewInvoice} onNewPerson={() => setCurrentPage('people', () => setCreatePerson(true))} onOpenInvoice={(id) => setCurrentPage('invoices', () => setSelectedInvoiceId(id))} onShowUnpaid={() => setCurrentPage('invoices', () => { setSelectedInvoiceId(null); setInvoiceInitialStatus('unpaid') })} onExport={exportBackup} onLoadDemo={mode === 'real' ? loadDemo : undefined} />}
          {page === 'invoices' && <Invoices initialStatus={invoiceInitialStatus} onNavigate={setCurrentPage} onLoadDemo={mode === 'real' ? loadDemo : undefined} state={state} selectedId={selectedInvoiceId} onSelect={setSelectedInvoiceId} onNew={openNewInvoice} onEdit={editInvoice} onDuplicate={duplicateInvoice} onDelete={requestDeleteInvoice} onSetStatus={setInvoiceStatus} onCorrection={startCorrection} onAllocatePayment={(paymentId, versionId, reason) => { void commit((current) => allocatePayment(current, paymentId, versionId, reason), 'Zahlung manuell zugeordnet', 'invoice') }} onResolveConflicts={(versionId, reason) => { void commit((current) => resolveDocumentConflicts(current, versionId, reason), 'Historische Abweichung geklärt', 'invoice') }} onPrint={print} />}
          {page === 'people' && <People initialCreate={createPerson ? state.guardians.length ? 'student' : 'guardian' : undefined} state={state} onSaveGuardian={saveGuardian} onSaveStudent={saveStudent} onDeleteGuardian={deleteGuardian} onDeleteStudent={deleteStudent} />}
          <div hidden={page !== 'settings'}><Settings key={settingsEpoch} state={state} onDirty={setSettingsDirty} onSave={saveSettings} onThemeChange={changeTheme} onExport={exportBackup} onImport={importBackup} onReset={resetAll} onPrevious={reviewPrevious} onArchive={exportRecoveryArchive} /></div>
        </main>
      </WorkspaceShell>

      <ImportReview review={importReview} onClose={() => setImportReview(null)} onApply={confirmImport} />
      <InvoiceEditor state={state} open={editor.open} draft={editor.draft} editing={editor.editing} guardians={state.guardians} students={state.students} settings={state.settings} onClose={requestCloseEditor} onDirtyChange={setEditorDirty} onSave={saveInvoice} onConvert={convertLegacyDraft} />
      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ''} message={confirmation?.message ?? ''} cancelLabel={confirmation?.cancelLabel} confirmLabel={confirmation?.label} danger={confirmation?.danger} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation?.action; setConfirmation(null); action?.() }} />
      <ToastRegion messages={toasts} onDismiss={dismissToast} />
      <div className="print-root"><InvoicePrint invoice={printRequest?.invoice ?? null} guardians={printRequest?.guardians ?? []} students={printRequest?.students ?? []} settings={printRequest?.settings ?? state.settings} requestId={printRequest?.id} includeGiroCode={printRequest?.includeGiroCode} onPrintReady={handlePrintReady} onPrintError={handlePrintError} /></div>
    </div>
  )
}

export default App
