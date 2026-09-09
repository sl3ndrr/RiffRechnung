import { decimalInputText } from '../lib/money'
import { mailboxError } from '../lib/mailbox'
import { parsePaymentTermInput } from '../lib/values'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArchiveRestore, CheckCircle2, CloudOff, Download, FileJson, FolderSync, HardDrive, History, Moon, Palette, Save, ShieldCheck, Sun, Upload } from 'lucide-react'
import type { AppState, Settings as SettingsType, ThemeMode } from '../types'
import { formatInvoiceNumber, formatIban, isFooterTextWithinLimit, germanIbanError, MAX_FOOTER_TEXT_LENGTH } from '../lib/utils'

import { applyStandardRateInput, parseStandardRate, settingsChangeErrors, STANDARD_RATE_ERROR } from '../lib/settings'
import { isFinalizedInvoice } from '../lib/safety'

import { SettingsBuffer } from '../lib/settingsBuffer'
import { invoiceSetupErrors, TAX_IDENTIFIER_LABELS, taxIdentifierInputError } from '../lib/invoiceProfile'
import { bicError } from '../lib/paymentData'

interface SettingsProps {
  state: AppState
  folderSupported: boolean
  folderConnected: boolean
  folderName: string
  onSave: (settings: SettingsType) => Promise<boolean>
  onDirty: (dirty: boolean) => void
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void
  onExport: () => void
  onImport: (file: File) => void
  onConnectFolder: () => void
  onDisconnectFolder: () => void
  onBackupNow: () => void
  onReset: () => void
  onPrevious: () => void
  onArchive: () => void
}

export function Settings({ state, folderSupported, folderConnected, folderName, onSave, onDirty, onRegisterFlush, onExport, onImport, onConnectFolder, onDisconnectFolder, onBackupNow, onReset, onPrevious, onArchive }: SettingsProps) {
  const [form, setForm] = useState<SettingsType>(state.settings)
  const [rateInputs, setRateInputs] = useState({ privateRate: decimalInputText(state.settings.privateRate), duoRate: decimalInputText(state.settings.duoRate) })
  const [paymentTermInput, setPaymentTermInput] = useState(String(state.settings.paymentTermDays))
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'invalid'>('saved')
  const [buffer] = useState(() => new SettingsBuffer(state.settings))
  const formRef = useRef(form)
  formRef.current = form
  const footerTextValid = isFooterTextWithinLimit(form.defaultLegalText)
  const footerTextLimitReached = form.defaultLegalText.length >= MAX_FOOTER_TEXT_LENGTH

  const ibanError = form.iban.trim() ? germanIbanError(form.iban) : null
  const currentBicError = form.bic.trim() ? bicError(form.bic) : null
  const replacementBlocked = state.invoices.some(isFinalizedInvoice) || state.voidedInvoiceNumbers.length > 0
  const emailError = mailboxError(form.issuer.email)
  const paymentTermError = parsePaymentTermInput(paymentTermInput) === null
  const invalidRateInput = Object.values(rateInputs).some((raw) => parseStandardRate(raw) === null)
  const setupErrors = invoiceSetupErrors(form)
  const taxIdentifierError = form.taxIdentifier.value ? taxIdentifierInputError(form.taxIdentifier) : null

  const setRate = (field: 'privateRate' | 'duoRate', raw: string) => {
    setRateInputs((current) => ({ ...current, [field]: raw }))
    setForm((current) => applyStandardRateInput(current, field, raw))
  }

  const validRef = useRef(true)
  validRef.current = !invalidRateInput && !paymentTermError && !emailError && footerTextValid && !settingsChangeErrors(state.settings, form).length
  buffer.update(form, validRef.current)

  const persist = useCallback(async () => {
    buffer.update(formRef.current, validRef.current)
    setSaveStatus(buffer.dirty ? 'pending' : 'saved')
    const saved = await buffer.flush(onSave)
    setSaveStatus(saved ? 'saved' : 'invalid')
    return saved
  }, [buffer, onSave])

  useLayoutEffect(() => {
    onRegisterFlush(persist)
    return () => onRegisterFlush(null)
  }, [onRegisterFlush, persist])

  useEffect(() => { void persist() }, [form, paymentTermInput, rateInputs, persist])

  useLayoutEffect(() => { onDirty(buffer.dirty) }, [buffer, form, paymentTermInput, rateInputs, saveStatus, onDirty])

  const setTheme = (theme: ThemeMode) => {
    const next = { ...form, theme }
    setForm(next)
    formRef.current = next
    void persist()
  }

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div><p className="eyebrow">Konfiguration</p><h1>Einstellungen</h1><p>Absender, Konto, Nummernkreis, Darstellung und Datensicherung.</p></div>
        <button className={`button ${saveStatus === 'saved' ? 'button--success' : 'button--primary'} button--large`} onClick={() => void persist()} disabled={saveStatus === 'saved' && !buffer.dirty} aria-live="polite">{saveStatus === 'saved' ? <CheckCircle2 aria-hidden="true" /> : <Save aria-hidden="true" />}{invalidRateInput || paymentTermError || emailError || !footerTextValid || saveStatus === 'invalid' ? 'Eingabe prüfen' : saveStatus === 'saved' ? 'Lokal gespeichert' : 'Jetzt speichern'}</button>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Einstellungsbereiche"><a href="#profile">Rechnungssteller</a><a href="#payment">Bankverbindung</a><a href="#numbering">Rechnungen</a><a href="#appearance">Darstellung</a><a href="#backup">Backup & Import</a><a href="#history">Änderungsverlauf</a></nav>
        <div className="settings-content" >
          <section id="profile" className="surface settings-section">
            <div className="settings-section__heading"><span><ShieldCheck aria-hidden="true" /></span><div><h2>Rechnungssteller</h2><p>Diese Angaben erscheinen im Briefkopf und werden beim Finalisieren eingefroren.</p></div></div>
            {setupErrors.length > 0 && <div className="form-errors" role="status"><strong>Für neue Finalisierungen fehlen:</strong><ul>{setupErrors.map((error) => <li key={error.field}>{error.message}</li>)}</ul></div>}
            <div className="form-grid form-grid--2">
              <label className="field field--full"><span>Name / Geschäftsbezeichnung</span><input value={form.issuer.name} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, name: event.target.value } })} /></label>
              <label className="field field--full"><span>Straße & Hausnummer</span><input value={form.issuer.street} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, street: event.target.value } })} /></label>
              <label className="field"><span>PLZ</span><input value={form.issuer.postalCode} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, postalCode: event.target.value } })} /></label>
              <label className="field"><span>Ort</span><input value={form.issuer.city} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, city: event.target.value } })} /></label>
              <label className="field"><span>E-Mail</span><input type="text" inputMode="email" aria-invalid={Boolean(emailError)} value={form.issuer.email} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, email: event.target.value } })} />{emailError && <small role="alert">{emailError}</small>}</label>
              <label className="field"><span>Telefon</span><input type="tel" value={form.issuer.phone} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, phone: event.target.value } })} /></label>
              <label className="field field--full"><span>Rechnungsprofil</span><select value={form.invoiceProfile} onChange={(event) => setForm({ ...form, invoiceProfile: event.target.value as SettingsType['invoiceProfile'] })}><option value="unconfigured">Bitte ausdrücklich auswählen</option><option value="small-business">Kleinunternehmer nach § 19 UStG</option></select><small>Dieses Paket unterstützt ausschließlich das ausdrücklich gewählte Kleinunternehmerprofil. Andere steuerliche Konstellationen werden nicht automatisch eingeordnet.</small></label>
              <label className="field"><span>Art der steuerlichen Identifikationsangabe</span><select value={form.taxIdentifier.kind} onChange={(event) => setForm({ ...form, taxIdentifier: { ...form.taxIdentifier, kind: event.target.value as SettingsType['taxIdentifier']['kind'] } })}>{Object.entries(TAX_IDENTIFIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>{TAX_IDENTIFIER_LABELS[form.taxIdentifier.kind]}</span><input value={form.taxIdentifier.value} aria-invalid={Boolean(taxIdentifierError)} onChange={(event) => setForm({ ...form, taxIdentifier: { ...form.taxIdentifier, value: event.target.value } })} />{taxIdentifierError && <small className="field-error" role="alert">{taxIdentifierError}</small>}</label>
            </div>
          </section>

          <section id="payment" className="surface settings-section">
            <div className="settings-section__heading"><span><HardDrive aria-hidden="true" /></span><div><h2>Bankverbindung, Zahlungsziel & GiroCode</h2><p>Aus diesen Daten entstehen Fälligkeit und EPC-QR-Code auf finalisierten Rechnungen.</p></div></div>
            <div className="form-grid form-grid--2">
              <label className="field"><span>Kontoinhaber</span><input value={form.accountHolder} onChange={(event) => setForm({ ...form, accountHolder: event.target.value })} /></label>
              <label className="field"><span>Bank</span><input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} /></label>
              <label className="field field--full"><span>IBAN</span><input className="mono" value={formatIban(form.iban)} onChange={(event) => setForm({ ...form, iban: event.target.value })} aria-invalid={Boolean(ibanError)} aria-describedby="iban-error" />{ibanError && <small id="iban-error" className="field-error">{ibanError}</small>}</label>
              <label className="field"><span>BIC (für deutsche Empfängerkonten im EPC-QR optional)</span><input className="mono" value={form.bic} aria-invalid={Boolean(currentBicError)} aria-describedby="bic-error" onChange={(event) => setForm({ ...form, bic: event.target.value.toUpperCase() })} />{currentBicError && <small id="bic-error" className="field-error" role="alert">{currentBicError}</small>}</label>
              <label className="field"><span>Standard-Zahlungsziel (Tage)</span><input type="text" inputMode="numeric" aria-invalid={paymentTermError} value={paymentTermInput} onChange={(event) => { const raw = event.target.value; setPaymentTermInput(raw); const value = parsePaymentTermInput(raw); if (value !== null) setForm({ ...form, paymentTermDays: value }) }} /><small>{paymentTermError ? 'Bitte eine ganze Anzahl Tage ab 0 eingeben; der letzte gültige Wert bleibt erhalten.' : 'Wird bei neuen Rechnungen zum Rechnungsdatum addiert.'}</small></label>
            </div>
            <div className="info-banner"><ShieldCheck aria-hidden="true" /><p>Für neue Verwendung werden ausschließlich deutsche Empfänger-IBANs unterstützt. Die Format- und Prüfsummenprüfung bestätigt weder Kontoinhaber noch Erreichbarkeit. Die BIC ist bei einem deutschen Empfängerkonto nach EPC v3.1 optional; daraus folgt keine Aussage über jeden möglichen Zahlerfall.</p></div>
          </section>

          <section id="numbering" className="surface settings-section">
            <div className="settings-section__heading"><span><FileJson aria-hidden="true" /></span><div><h2>Rechnungsvorgaben</h2><p>Jedes Kind bzw. jede Kindkombination hat einen eigenen fortlaufenden Nummernkreis.</p></div></div>
            <div className="form-grid form-grid--3">
              <label className="field field--wide"><span>Nummernmuster</span><input className="mono" value={form.numberPattern} onChange={(event) => setForm({ ...form, numberPattern: event.target.value })} /><small>Platzhalter: {'{YYYY}'}, {'{YY}'}, {'{K}'} für das Kind und {'{NNNN}'}</small></label>
              <div className="number-preview"><span>Vorschau · Kind a</span><strong>{formatInvoiceNumber(form, 23, new Date().getFullYear(), 'a')}</strong></div>
              <label className="field"><span>Standardpreis Solo</span><div className="input-with-suffix"><input type="text" inputMode="decimal" value={rateInputs.privateRate} onChange={(event) => setRate('privateRate', event.target.value)} aria-invalid={parseStandardRate(rateInputs.privateRate) === null} aria-describedby="privateRate-error" /><span>€</span></div><small>Je Einheit/Stunde für neue Positionen</small>{parseStandardRate(rateInputs.privateRate) === null && <small id="privateRate-error" className="field-error" role="alert">{STANDARD_RATE_ERROR}</small>}</label>
              <label className="field"><span>Standardpreis Duo</span><div className="input-with-suffix"><input type="text" inputMode="decimal" value={rateInputs.duoRate} onChange={(event) => setRate('duoRate', event.target.value)} aria-invalid={parseStandardRate(rateInputs.duoRate) === null} aria-describedby="duoRate-error" /><span>€</span></div><small>Je Einheit/Stunde für neue Positionen</small>{parseStandardRate(rateInputs.duoRate) === null && <small id="duoRate-error" className="field-error" role="alert">{STANDARD_RATE_ERROR}</small>}</label>
              <label className="switch-row switch-row--compact"><span><strong>Jährlich neu zählen</strong><small>Je Kalenderjahr bei 1 beginnen</small></span><input type="checkbox" checked={form.resetNumberAnnually} onChange={(event) => setForm({ ...form, resetNumberAnnually: event.target.checked })} /><i /></label>
              <label className="field field--full"><span>Standard-Fußzeile / Rechtstext</span><textarea rows={3} maxLength={MAX_FOOTER_TEXT_LENGTH} value={form.defaultLegalText} onChange={(event) => setForm({ ...form, defaultLegalText: event.target.value })} aria-invalid={!footerTextValid} aria-describedby="footer-text-help footer-text-count" /><small id="footer-text-help">Der Text wird zusätzlich im Dokument selbst gedruckt und darf höchstens zwei Zeilen umfassen. Änderungen über dieser Grenze werden nicht gespeichert oder gekürzt; nutze für längere Hinweise den Freitext der Rechnung.</small><small className="field-counter" id="footer-text-count">{form.defaultLegalText.length} / {MAX_FOOTER_TEXT_LENGTH} Zeichen</small>{footerTextLimitReached && <small className="field-warning" role="status">Zeichenlimit erreicht. Für längere oder individuelle Texte nutze in der Rechnung das Feld „Freitext / Hinweis“.</small>}</label>
            </div>
            <div className="info-banner"><FileJson aria-hidden="true" /><p>Das erste angelegte Kind erhält <strong>a</strong>, das zweite <strong>b</strong> usw. Bei einer gemeinsamen Rechnung für mehrere Kinder werden die Kennzeichen kombiniert, zum Beispiel <strong>ab</strong>. Das Kennzeichen wird beim Löschen oder Bearbeiten nicht verschoben.</p></div>
          </section>

          <section id="appearance" className="surface settings-section">
            <div className="settings-section__heading"><span><Palette aria-hidden="true" /></span><div><h2>Darstellung</h2><p>Das Rechnungs-PDF bleibt unabhängig davon immer hell.</p></div></div>
            <fieldset className="theme-picker"><legend>Farbschema</legend>{([['system', Palette, 'System'], ['light', Sun, 'Hell'], ['dark', Moon, 'Dunkel']] as const).map(([value, Icon, label]) => <label className={form.theme === value ? 'is-selected' : ''} key={value}><input type="radio" name="theme" checked={form.theme === value} onChange={() => setTheme(value)} /><Icon aria-hidden="true" /><span>{label}</span></label>)}</fieldset>
            <label className="switch-row"><span><strong>Bewegungen reduzieren</strong><small>Expressive Übergänge auf kurze Überblendungen begrenzen</small></span><input type="checkbox" checked={form.reducedMotion} onChange={(event) => { const next = { ...form, reducedMotion: event.target.checked }; setForm(next); formRef.current = next; void persist() }} /><i /></label>
          </section>

          <section id="backup" className="surface settings-section settings-section--backup">
            <div className="settings-section__heading"><span><FolderSync aria-hidden="true" /></span><div><h2>Backup & Import</h2><p>JSON-Export bleibt verfügbar. Eine Wiederherstellung erhält bekannte Originalbelege und Nummernreservierungen.</p></div></div>
            <div className="button-row"><button className="button button--tonal" onClick={onPrevious}>Vorherigen lokalen Stand prüfen</button><button className="button button--tonal" onClick={onArchive}>Wiederherstellungsarchiv exportieren</button></div>
            <div className="backup-grid">
              <article><span className="backup-icon"><Download aria-hidden="true" /></span><h3>Manuelles Backup</h3><p>Alle Familien, Rechnungen, Einstellungen und der Änderungsverlauf in einer Datei.</p><button className="button button--tonal" onClick={onExport}><Download aria-hidden="true" /> JSON exportieren</button></article>
              <article><span className="backup-icon"><Upload aria-hidden="true" /></span><h3>Backup wiederherstellen</h3><p>Führt eine geprüfte Sicherung nach Bestätigung als neuen Stand ein. Bekannte Originale bleiben geschützt.</p><label className="button button--tonal file-button"><Upload aria-hidden="true" /> JSON importieren<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = '' }} /></label></article>
              <article className={folderConnected ? 'is-connected' : ''}><span className="backup-icon">{folderConnected ? <FolderSync aria-hidden="true" /> : <CloudOff aria-hidden="true" />}</span><h3>Backup-Ordner</h3><p>{!folderSupported ? 'Dieser Browser unterstützt die Ordnerauswahl nicht.' : folderConnected ? `Verbunden: ${folderName}.` : 'Vor dem Verbinden werden vorhandene Sicherungen gelesen. Schreiben erhält frühere Versionen.'}</p>{folderSupported && (folderConnected ? <div className="button-row"><button className="button button--tonal" onClick={onBackupNow}>Jetzt sichern</button><button className="button button--tonal" onClick={onConnectFolder}>Ordner prüfen / Ziel wechseln</button><button className="button button--text" onClick={onDisconnectFolder}>Trennen</button></div> : <button className="button button--tonal" onClick={onConnectFolder}><FolderSync aria-hidden="true" /> Ordner wählen</button>)}</article>
            </div>
            <p className="field-hint" role="status">Neue versionierte Sicherungen erhalten bisherige Dateien. Bei Konflikten, fehlenden Berechtigungen oder fehlenden Browserfunktionen bleibt das Datei-Backup ausstehend; JSON-Export ist weiterhin möglich.</p>
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

          <section className="danger-zone"><div><ArchiveRestore aria-hidden="true" /><span><strong>Alle lokalen Daten zurücksetzen</strong><p>Bei ausgestellten Belegen oder reservierten Nummern bis zur Sicherung vollständiger Originalversionen gesperrt.</p></span></div><button className="button button--danger-outline" onClick={onReset} disabled={replacementBlocked}>Daten zurücksetzen</button></section>
        </div>
      </div>
    </div>
  )
}

