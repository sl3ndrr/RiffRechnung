import { useId, useRef, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { Modal } from './Modal'

export function ResetDialog({ open, demo, onClose, onExport, onReset }: {
  open: boolean
  demo: boolean
  onClose: () => void
  onExport: () => void
  onReset: () => Promise<void>
}) {
  const descriptionId = useId()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const close = () => { if (!running.current) onClose() }
  const reset = async () => {
    if (!confirmed || running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    try { await onReset(); onClose() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Zurücksetzen fehlgeschlagen.'); cancelRef.current?.focus() }
    finally { running.current = false; setBusy(false) }
  }
  return <Modal open={open} title="Alle lokalen Daten endgültig löschen?" eyebrow="Unwiderrufliche Aktion" role="alertdialog" describedBy={descriptionId} size="small" onClose={close} footer={<>
    <button ref={cancelRef} data-dialog-initial-focus className="button button--text" type="button" onClick={close} disabled={busy}>Abbrechen</button>
    <button className="button button--tonal" type="button" disabled={busy} onClick={() => { try { onExport(); setConfirmed(false); cancelRef.current?.focus() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Backup konnte nicht exportiert werden.') } }}><Download aria-hidden="true" /> Erst Backup erstellen</button>
    <button className="button button--danger" type="button" onClick={() => void reset()} disabled={!confirmed || busy}><Trash2 aria-hidden="true" />{busy ? 'Zurücksetzen …' : 'Endgültig zurücksetzen'}</button>
  </>}>
    <p id={descriptionId}>{demo ? 'Alle Beispieldaten dieser Demo' : 'Alle lokalen Daten von RiffRechnung auf diesem Gerät'} werden unwiderruflich gelöscht: Rechnungen und Belegversionen, Zahlungen, Personen, Einstellungen, Nummernreservierungen und lokale Wiederherstellungskopien. Auch ungespeicherte Änderungen werden verworfen. Heruntergeladene Backups bleiben erhalten.</p>
    {demo && <p>Dein echter lokaler Bestand bleibt im Demo-Modus erhalten.</p>}
    <p>„Erst Backup erstellen“ startet den vorhandenen JSON-Export. Prüfe, dass die Datei heruntergeladen wurde. Danach kannst du hier erneut bestätigen.</p>
    <label className="reset-confirmation"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>Ich möchte alle {demo ? 'Beispieldaten' : 'lokalen Daten'} unwiderruflich löschen.</span></label>
    {error && <p className="field-error" role="alert">{error}</p>}
  </Modal>
}
