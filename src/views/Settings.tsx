import { useCallback, useEffect, useRef, useState } from 'react'
import { ArchiveRestore, CheckCircle2, CloudOff, Download, FileJson, FolderSync, HardDrive, History, Moon, Palette, Save, ShieldCheck, Sun, Upload } from 'lucide-react'
import type { AppState, Settings as SettingsType, ThemeMode } from '../types'
import { formatInvoiceNumber, formatIban, isFooterTextWithinLimit, isValidIban, limitFooterText, MAX_FOOTER_TEXT_LENGTH } from '../lib/utils'

const SETTINGS_AUTOSAVE_DELAY_MS = 600

interface SettingsProps {
  state: AppState
  folderSupported: boolean
  folderConnected: boolean
  folderName: string
  onSave: (settings: SettingsType) => void
  onExport: () => void
  onImport: (file: File) => void
  onConnectFolder: () => void
  onDisconnectFolder: () => void
  onBackupNow: () => void
  onReset: () => void
}

export function Settings({ state, folderSupported, folderConnected, folderName, onSave, onExport, onImport, onConnectFolder, onDisconnectFolder, onBackupNow, onReset }: SettingsProps) {
  const [form, setForm] = useState<SettingsType>(state.settings)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending'>('saved')
  const lastSubmitted = useRef(JSON.stringify(state.settings))
  const formRef = useRef(form)
  formRef.current = form
  const footerTextValid = isFooterTextWithinLimit(form.defaultLegalText)
  const footerTextLimitReached = form.defaultLegalText.length >= MAX_FOOTER_TEXT_LENGTH

  const persist = useCallback((next: SettingsType) => {
    const normalized = { ...next, defaultLegalText: limitFooterText(next.defaultLegalText) }
    lastSubmitted.current = JSON.stringify(normalized)
    onSave(normalized)
    setSaveStatus('saved')
  }, [onSave])

  useEffect(() => {
    const serialized = JSON.stringify(state.settings)
    if (serialized !== lastSubmitted.current) {
      lastSubmitted.current = serialized
      setForm(state.settings)
    }
    setSaveStatus(JSON.stringify(formRef.current) === serialized ? 'saved' : 'pending')
  }, [state.settings])

  useEffect(() => {
    const serialized = JSON.stringify(form)
    if (serialized === lastSubmitted.current) {
      setSaveStatus('saved')
      return
    }
    setSaveStatus('pending')
    const timer = window.setTimeout(() => persist(form), SETTINGS_AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [form, persist])

  const setTheme = (theme: ThemeMode) => {
    const next = { ...form, theme }
    setForm(next)
    persist(next)
  }

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div><p className="eyebrow">Konfiguration</p><h1>Einstellungen</h1><p>Absender, Konto, Nummernkreis, Darstellung und Datensicherung.</p></div>
        <button className={`button ${saveStatus === 'saved' ? 'button--success' : 'button--primary'} button--large`} onClick={() => persist(form)} disabled={saveStatus === 'saved'} aria-live="polite">{saveStatus === 'saved' ? <CheckCircle2 aria-hidden="true" /> : <Save aria-hidden="true" />}{saveStatus === 'saved' ? 'Automatisch gespeichert' : 'Jetzt speichern'}</button>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Einstellungsbereiche"><a href="#profile">Rechnungssteller</a><a href="#payment">Bankverbindung</a><a href="#numbering">Rechnungen</a><a href="#appearance">Darstellung</a><a href="#backup">Backup & Import</a><a href="#history">Änderungsverlauf</a></nav>
        <div className="settings-content">
          <section id="profile" className="surface settings-section">
            <div className="settings-section__heading"><span><ShieldCheck aria-hidden="true" /></span><div><h2>Rechnungssteller</h2><p>Diese Angaben erscheinen im Briefkopf und werden beim Finalisieren eingefroren.</p></div></div>
            <div className="form-grid form-grid--2">
              <label className="field field--full"><span>Name / Geschäftsbezeichnung</span><input value={form.issuer.name} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, name: event.target.value } })} /></label>
              <label className="field field--full"><span>Straße & Hausnummer</span><input value={form.issuer.street} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, street: event.target.value } })} /></label>
              <label className="field"><span>PLZ</span><input value={form.issuer.postalCode} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, postalCode: event.target.value } })} /></label>
              <label className="field"><span>Ort</span><input value={form.issuer.city} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, city: event.target.value } })} /></label>
              <label className="field"><span>E-Mail</span><input type="email" value={form.issuer.email} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, email: event.target.value } })} /></label>
              <label className="field"><span>Telefon</span><input type="tel" value={form.issuer.phone} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, phone: event.target.value } })} /></label>
            </div>
          </section>

          <section id="payment" className="surface settings-section">
            <div className="settings-section__heading"><span><HardDrive aria-hidden="true" /></span><div><h2>Bankverbindung, Zahlungsziel & GiroCode</h2><p>Aus diesen Daten entstehen Fälligkeit und EPC-QR-Code auf finalisierten Rechnungen.</p></div></div>
            <div className="form-grid form-grid--2">
              <label className="field"><span>Kontoinhaber</span><input value={form.accountHolder} onChange={(event) => setForm({ ...form, accountHolder: event.target.value })} /></label>
              <label className="field"><span>Bank</span><input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} /></label>
              <label className="field field--full"><span>IBAN</span><input className="mono" value={formatIban(form.iban)} onChange={(event) => setForm({ ...form, iban: event.target.value })} aria-invalid={Boolean(form.iban && !isValidIban(form.iban))} />{form.iban && !isValidIban(form.iban) && <small className="field-error">Die IBAN ist ungültig oder gehört nicht zum unterstützten SEPA-Zahlungsraum.</small>}</label>
              <label className="field"><span>BIC (optional im EPC-QR)</span><input className="mono" value={form.bic} onChange={(event) => setForm({ ...form, bic: event.target.value.toUpperCase() })} /></label>
              <label className="field"><span>Standard-Zahlungsziel (Tage)</span><input type="number" min="0" step="1" value={form.paymentTermDays} onChange={(event) => setForm({ ...form, paymentTermDays: Math.max(0, Math.trunc(Number(event.target.value))) })} /><small>Wird bei neuen Rechnungen zum Rechnungsdatum addiert.</small></label>
            </div>
            <div className="info-banner"><ShieldCheck aria-hidden="true" /><p>Der QR-Code füllt eine SEPA-Überweisung in unterstützten Banking-Apps aus. Ob sie als Echtzeitüberweisung ausgeführt wird, entscheidet die Banking-App bzw. die zahlende Person.</p></div>
          </section>

          <section id="numbering" className="surface settings-section">
            <div className="settings-section__heading"><span><FileJson aria-hidden="true" /></span><div><h2>Rechnungsvorgaben</h2><p>Jedes Kind bzw. jede Kindkombination hat einen eigenen fortlaufenden Nummernkreis.</p></div></div>
            <div className="form-grid form-grid--3">
              <label className="field field--wide"><span>Nummernmuster</span><input className="mono" value={form.numberPattern} onChange={(event) => setForm({ ...form, numberPattern: event.target.value })} /><small>Platzhalter: {'{YYYY}'}, {'{YY}'}, {'{K}'} für das Kind und {'{NNNN}'}</small></label>
              <div className="number-preview"><span>Vorschau · Kind a</span><strong>{formatInvoiceNumber(form, 23, new Date().getFullYear(), 'a')}</strong></div>
              <label className="field"><span>Standardpreis Solo</span><div className="input-with-suffix"><input type="number" min="0" step="0.01" value={form.privateRate} onChange={(event) => setForm({ ...form, privateRate: Number(event.target.value) })} /><span>€</span></div><small>Je Einheit/Stunde für neue Positionen</small></label>
              <label className="field"><span>Standardpreis Duo</span><div className="input-with-suffix"><input type="number" min="0" step="0.01" value={form.duoRate} onChange={(event) => setForm({ ...form, duoRate: Number(event.target.value) })} /><span>€</span></div><small>Je Einheit/Stunde für neue Positionen</small></label>
              <label className="switch-row switch-row--compact"><span><strong>Jährlich neu zählen</strong><small>Je Kalenderjahr bei 1 beginnen</small></span><input type="checkbox" checked={form.resetNumberAnnually} onChange={(event) => setForm({ ...form, resetNumberAnnually: event.target.checked })} /><i /></label>
              <label className="field field--full"><span>Standard-Fußzeile / Rechtstext</span><textarea rows={3} maxLength={MAX_FOOTER_TEXT_LENGTH} value={form.defaultLegalText} onChange={(event) => setForm({ ...form, defaultLegalText: event.target.value })} aria-invalid={!footerTextValid} aria-describedby="footer-text-help footer-text-count" /><small id="footer-text-help">Der Text erscheint links neben der Seitenzahl und darf höchstens zwei Zeilen belegen. „Privatrechnung“ ist frei editierbar; bitte die Formulierung an deine steuerliche Situation anpassen.</small><small className="field-counter" id="footer-text-count">{form.defaultLegalText.length} / {MAX_FOOTER_TEXT_LENGTH} Zeichen</small>{footerTextLimitReached && <small className="field-warning" role="status">Zeichenlimit erreicht. Für längere oder individuelle Texte nutze in der Rechnung das Feld „Freitext / Hinweis“.</small>}</label>
            </div>
            <div className="info-banner"><FileJson aria-hidden="true" /><p>Das erste angelegte Kind erhält <strong>a</strong>, das zweite <strong>b</strong> usw. Bei einer gemeinsamen Rechnung für mehrere Kinder werden die Kennzeichen kombiniert, zum Beispiel <strong>ab</strong>. Das Kennzeichen wird beim Löschen oder Bearbeiten nicht verschoben.</p></div>
          </section>

          <section id="appearance" className="surface settings-section">
            <div className="settings-section__heading"><span><Palette aria-hidden="true" /></span><div><h2>Darstellung</h2><p>Das Rechnungs-PDF bleibt unabhängig davon immer hell.</p></div></div>
            <fieldset className="theme-picker"><legend>Farbschema</legend>{([['system', Palette, 'System'], ['light', Sun, 'Hell'], ['dark', Moon, 'Dunkel']] as const).map(([value, Icon, label]) => <label className={form.theme === value ? 'is-selected' : ''} key={value}><input type="radio" name="theme" checked={form.theme === value} onChange={() => setTheme(value)} /><Icon aria-hidden="true" /><span>{label}</span></label>)}</fieldset>
            <label className="switch-row"><span><strong>Bewegungen reduzieren</strong><small>Expressive Übergänge auf kurze Überblendungen begrenzen</small></span><input type="checkbox" checked={form.reducedMotion} onChange={(event) => { const next = { ...form, reducedMotion: event.target.checked }; setForm(next); persist(next) }} /><i /></label>
          </section>

          <section id="backup" className="surface settings-section settings-section--backup">
            <div className="settings-section__heading"><span><FolderSync aria-hidden="true" /></span><div><h2>Backup & Import</h2><p>Eine vollständige JSON-Datei ist dein unabhängiger Reset- und Restore-Weg.</p></div></div>
            <div className="backup-grid">
              <article><span className="backup-icon"><Download aria-hidden="true" /></span><h3>Manuelles Backup</h3><p>Alle Familien, Rechnungen, Einstellungen und der Änderungsverlauf in einer Datei.</p><button className="button button--tonal" onClick={onExport}><Download aria-hidden="true" /> JSON exportieren</button></article>
              <article><span className="backup-icon"><Upload aria-hidden="true" /></span><h3>Backup wiederherstellen</h3><p>Ersetzt den aktuellen Datenstand nach einer Sicherheitsabfrage vollständig.</p><label className="button button--tonal file-button"><Upload aria-hidden="true" /> JSON importieren<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = '' }} /></label></article>
              <article className={folderConnected ? 'is-connected' : ''}><span className="backup-icon">{folderConnected ? <FolderSync aria-hidden="true" /> : <CloudOff aria-hidden="true" />}</span><h3>Lokaler Auto-Backup-Ordner</h3><p>{!folderSupported ? 'Dieser Browser unterstützt die Ordnerauswahl nicht.' : folderConnected ? `Verbunden: ${folderName}. Bei Änderungen wird die Backup-Datei aktualisiert.` : 'Chromium kann nach deiner Auswahl bei jeder Änderung lokal schreiben.'}</p>{folderSupported && (folderConnected ? <div className="button-row"><button className="button button--tonal" onClick={onBackupNow}>Backup jetzt</button><button className="button button--text" onClick={onDisconnectFolder}>Trennen</button></div> : <button className="button button--tonal" onClick={onConnectFolder}><FolderSync aria-hidden="true" /> Ordner wählen</button>)}</article>
            </div>
            <div className="info-banner"><HardDrive aria-hidden="true" /><p>Die App spricht keine Cloud-API an. Wählst du einen lokal synchronisierten Drive-Ordner, übernimmt ausschließlich die installierte Desktop-Synchronisation das spätere Hochladen. Die Ordnerfunktion ist derzeit vor allem in Chromium-Browsern verfügbar.</p></div>
          </section>

          <section id="history" className="surface settings-section">
            <div className="settings-section__heading"><span><History aria-hidden="true" /></span><div><h2>Änderungsverlauf</h2><p>Die letzten lokalen Aktionen helfen dabei, Änderungen nachzuvollziehen.</p></div></div>
            <div className="history-list">
              {state.audit.slice(0, 12).map((event) => <div key={event.id}><span><i /><strong>{event.label}</strong></span><time dateTime={event.at}>{new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(event.at))}</time></div>)}
              {!state.audit.length && <p>Noch keine Änderungen protokolliert.</p>}
            </div>
            {state.voidedInvoiceNumbers.length > 0 && <div className="number-register"><div><h3>Reservierte Rechnungsnummern</h3><p>Nummern gelöschter oder zurück in Entwurf versetzter Rechnungen bleiben dauerhaft belegt.</p></div>{state.voidedInvoiceNumbers.map((entry) => <div className="number-register__row" key={`${entry.number}-${entry.deletedAt}`}><span><strong>{entry.number}</strong><small>{entry.recipient} · {entry.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</small></span><time dateTime={entry.deletedAt}>{entry.reason === 'reopened' ? 'zurückgesetzt' : 'gelöscht'} {new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(entry.deletedAt))}</time></div>)}</div>}
          </section>

          <section className="danger-zone"><div><ArchiveRestore aria-hidden="true" /><span><strong>Alle lokalen Daten zurücksetzen</strong><p>Löscht Stammdaten, Rechnungen und Einstellungen in diesem Browser.</p></span></div><button className="button button--danger-outline" onClick={onReset}>Daten zurücksetzen</button></section>
        </div>
      </div>
    </div>
  )
}
