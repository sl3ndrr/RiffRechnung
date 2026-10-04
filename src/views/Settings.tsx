import { decimalInputText } from '../lib/money'
import { mailboxError } from '../lib/mailbox'
import { parsePaymentTermInput } from '../lib/values'
import { useLayoutEffect, useRef, useState } from 'react'
import { ArchiveRestore, CheckCircle2, Download, FileJson, HardDrive, History, Monitor, Moon, Palette, Save, ShieldCheck, Sun, Upload } from 'lucide-react'
import { usePageEntrance, staggerStyle } from '../hooks/usePageEntrance'
import type { AppState, Settings as SettingsType, ThemeMode } from '../types'
import { formatInvoiceNumber } from '../lib/invoiceNumbering'
import { formatIban, germanIbanError } from '../lib/paymentData'

import { parseStandardRate, settingsChangeErrors, STANDARD_RATE_ERROR } from '../lib/settings'
import { isFinalizedInvoice } from '../lib/safety'

import { canonical } from '../lib/envelope'
import { invoiceSetupErrors } from '../lib/invoiceSetup'
import { bicError } from '../lib/paymentData'

type SettingsForm = Omit<SettingsType, 'theme'>

interface SettingsProps {
  visible: boolean
  state: AppState
  onSave: (settings: SettingsForm) => Promise<boolean>
  onThemeChange: (theme: ThemeMode) => void
  onDirty: (dirty: boolean) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
  onPrevious: () => void
  onArchive: () => void
}

export function Settings({ state, visible, onSave, onThemeChange, onDirty, onExport, onImport, onReset, onPrevious, onArchive }: SettingsProps) {
  const entrance = usePageEntrance(undefined, visible)
  const entryClass = entrance ? ' motion-fade motion-stagger page-entry' : ''
  const [form, setForm] = useState<SettingsForm>(() => {
    const editable = { ...state.settings }
    Reflect.deleteProperty(editable, 'theme')
    return editable
  })
  const [rateInputs, setRateInputs] = useState({ privateRate: decimalInputText(state.settings.privateRate), duoRate: decimalInputText(state.settings.duoRate) })
  const [paymentTermInput, setPaymentTermInput] = useState(String(state.settings.paymentTermDays))
  const [confirmed, setConfirmed] = useState(form)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const pendingSave = useRef(false)

  const ibanError = form.iban.trim() ? germanIbanError(form.iban) : null
  const currentBicError = form.bic.trim() ? bicError(form.bic) : null
  const replacementBlocked = state.invoices.some(isFinalizedInvoice) || state.voidedInvoiceNumbers.length > 0 || state.documentVersions.length > 0 || state.historicalSnapshotCorrections.length > 0 || state.payments.length > 0
  const emailError = mailboxError(form.issuer.email)
  const paymentTermError = parsePaymentTermInput(paymentTermInput) === null
  const invalidRateInput = Object.values(rateInputs).some((raw) => parseStandardRate(raw) === null)
  const settings = { ...form, theme: state.settings.theme }
  const setupErrors = invoiceSetupErrors(settings)

  const setRate = (field: 'privateRate' | 'duoRate', raw: string) => {
    setRateInputs((current) => ({ ...current, [field]: raw }))
    const value = parseStandardRate(raw)
    if (value !== null) setForm((current) => ({ ...current, [field]: value }))
  }

  const valid = !invalidRateInput && !paymentTermError && !emailError && !settingsChangeErrors({ ...confirmed, theme: state.settings.theme }, settings).length
  const dirty = !valid || canonical(form) !== canonical(confirmed)

  useLayoutEffect(() => { onDirty(dirty) }, [dirty, onDirty])

  const persist = async () => {
    if (pendingSave.current) return
    if (!valid) { setSaveError('Bitte die markierten Eingaben prüfen.'); return }
    const submitted = structuredClone(form)
    pendingSave.current = true
    setSaving(true)
    setSaveError(null)
    try {
      if (await onSave(submitted)) setConfirmed(submitted)
      else setSaveError('Einstellungen konnten nicht gespeichert werden. Deine Eingaben bleiben erhalten; bitte erneut speichern.')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden. Deine Eingaben bleiben erhalten.')
    } finally { pendingSave.current = false; setSaving(false) }
  }

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div><p className="eyebrow">Konfiguration</p><h1>Einstellungen</h1><p>Absender, Konto, Nummernkreis, Darstellung und Datensicherung. Änderungen mit „Jetzt speichern“ bestätigen; das Farbschema wird sofort gespeichert.</p></div>
        <button className={`button ${!dirty && !saveError ? 'button--success' : 'button--primary'} button--large`} onClick={() => void persist()} disabled={saving || (!dirty && !saveError)} aria-live="polite">{!dirty && !saveError ? <CheckCircle2 aria-hidden="true" /> : <Save aria-hidden="true" />}{saving ? 'Speichern …' : !valid ? 'Eingabe prüfen' : dirty || saveError ? 'Jetzt speichern' : 'Lokal gespeichert'}</button>
      </header>

      {saveError && <p className="form-errors" role="alert">{saveError}</p>}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Einstellungsbereiche"><a href="#profile">Rechnungssteller</a><a href="#payment">Bankverbindung</a><a href="#numbering">Rechnungen</a><a href="#appearance">Darstellung</a><a href="#backup">Backup & Import</a><a href="#history">Änderungsverlauf</a></nav>
        <div className="settings-content" >
          <section id="profile" className={`surface settings-section${entryClass}`} style={staggerStyle(0)}>
            <div className="settings-section__heading"><span><ShieldCheck aria-hidden="true" /></span><div><h2>Rechnungssteller</h2><p>Diese Angaben erscheinen im Briefkopf und werden beim Finalisieren eingefroren.</p></div></div>
            {setupErrors.length > 0 && <div className="form-errors" role="status"><strong>Für den Abschluss fehlen:</strong><ul>{setupErrors.map((error) => <li key={error.field}>{error.message}</li>)}</ul></div>}
            <div className="form-grid form-grid--2">
              <label className="field field--full"><span>Name / Geschäftsbezeichnung</span><input value={form.issuer.name} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, name: event.target.value } })} /></label>
              <label className="field field--full"><span>Straße & Hausnummer</span><input value={form.issuer.street} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, street: event.target.value } })} /></label>
              <label className="field"><span>PLZ</span><input value={form.issuer.postalCode} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, postalCode: event.target.value } })} /></label>
              <label className="field"><span>Ort</span><input value={form.issuer.city} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, city: event.target.value } })} /></label>
              <label className="field"><span>E-Mail</span><input type="text" inputMode="email" aria-invalid={Boolean(emailError)} value={form.issuer.email} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, email: event.target.value } })} />{emailError && <small role="alert">{emailError}</small>}</label>
              <label className="field"><span>Telefon</span><input type="tel" value={form.issuer.phone} onChange={(event) => setForm({ ...form, issuer: { ...form.issuer, phone: event.target.value } })} /></label>
            </div>
          </section>

          <section id="payment" className={`surface settings-section${entryClass}`} style={staggerStyle(1)}>
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

          <section id="numbering" className={`surface settings-section${entryClass}`} style={staggerStyle(2)}>
            <div className="settings-section__heading"><span><FileJson aria-hidden="true" /></span><div><h2>Rechnungsvorgaben</h2><p>Jede lernende Person bzw. Kombination von Lernenden hat einen eigenen jährlichen Nummernkreis im festen Format Jahr–Folge–Kennung.</p></div></div>
            <div className="form-grid form-grid--3">
              <div className="number-preview"><span>Vorschau · Kennzeichen a</span><strong>{formatInvoiceNumber(23, new Date().getFullYear(), 'a')}</strong></div>
              <label className="field"><span>Standardpreis Solo</span><div className="input-with-suffix"><input type="text" inputMode="decimal" value={rateInputs.privateRate} onChange={(event) => setRate('privateRate', event.target.value)} aria-invalid={parseStandardRate(rateInputs.privateRate) === null} aria-describedby="privateRate-error" /><span>€</span></div><small>Je Einheit/Stunde für neue Positionen</small>{parseStandardRate(rateInputs.privateRate) === null && <small id="privateRate-error" className="field-error" role="alert">{STANDARD_RATE_ERROR}</small>}</label>
              <label className="field"><span>Standardpreis Duo</span><div className="input-with-suffix"><input type="text" inputMode="decimal" value={rateInputs.duoRate} onChange={(event) => setRate('duoRate', event.target.value)} aria-invalid={parseStandardRate(rateInputs.duoRate) === null} aria-describedby="duoRate-error" /><span>€</span></div><small>Je Einheit/Stunde für neue Positionen</small>{parseStandardRate(rateInputs.duoRate) === null && <small id="duoRate-error" className="field-error" role="alert">{STANDARD_RATE_ERROR}</small>}</label>
            </div>
            <div className="info-banner"><FileJson aria-hidden="true" /><p>Die erste angelegte lernende Person erhält <strong>a</strong>, die zweite <strong>b</strong> usw. Bei einer gemeinsamen Rechnung für diese Lernenden werden die Kennzeichen segmentiert kombiniert, zum Beispiel <strong>a+b</strong>. <strong>ab</strong> kann dagegen das Kennzeichen einer einzelnen später angelegten Person sein. Das Kennzeichen wird beim Löschen oder Bearbeiten nicht verschoben.</p></div>
          </section>

          <section id="appearance" className={`surface settings-section${entryClass}`} style={staggerStyle(3)}>
            <div className="settings-section__heading"><span><Palette aria-hidden="true" /></span><div><h2>Darstellung</h2><p>Das Rechnungs-PDF bleibt unabhängig davon immer hell.</p></div></div>
            <fieldset className="theme-picker"><legend>Farbschema</legend>{([['light', Sun, 'Hell'], ['system', Monitor, 'System'], ['dark', Moon, 'Dunkel']] as const).map(([value, Icon, label]) => <label className={state.settings.theme === value ? 'is-selected' : ''} key={value}><input type="radio" name="theme" checked={state.settings.theme === value} onChange={() => onThemeChange(value)} /><Icon aria-hidden="true" /><span>{label}</span></label>)}</fieldset>
            <label className="switch-row"><span><strong>Bewegungen reduzieren</strong><small>Bewegungspräferenz für die Darstellung speichern</small></span><input type="checkbox" checked={form.reducedMotion} onChange={(event) => setForm({ ...form, reducedMotion: event.target.checked })} /><i /></label>
          </section>

          <section id="backup" className={`surface settings-section settings-section--backup${entryClass}`} style={staggerStyle(4)}>
            <div className="settings-section__heading"><span><Download aria-hidden="true" /></span><div><h2>Backup & Import</h2><p>JSON-Export bleibt verfügbar. Eine Wiederherstellung erhält bekannte Originalbelege und Nummernreservierungen.</p></div></div>
            <div className="button-row"><button className="button button--tonal" onClick={onPrevious}>Vorherigen lokalen Stand prüfen</button><button className="button button--tonal" onClick={onArchive}>Wiederherstellungsarchiv exportieren</button></div>
            <div className="backup-grid">
              <article><span className="backup-icon"><Download aria-hidden="true" /></span><h3>Manuelles Backup</h3><p>Exportiert den zuletzt gespeicherten Stand als Klartext-JSON-Datei mit Personen, Rechnungen, Rechnungshinweisen, Einstellungen, Belegversionen, Zahlungen und Änderungsverlauf.</p><button className="button button--tonal" onClick={onExport}><Download aria-hidden="true" /> JSON exportieren</button></article>
              <article><span className="backup-icon"><Upload aria-hidden="true" /></span><h3>Backup wiederherstellen</h3><p>Führt eine geprüfte Sicherung nach Bestätigung als neuen Stand ein. Bekannte Originale bleiben geschützt.</p><label className="button button--tonal file-button"><Upload aria-hidden="true" /> JSON importieren<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = '' }} /></label></article>
            </div>
          </section>

          <section id="history" className={`surface settings-section${entryClass}`} style={staggerStyle(5)}>
            <div className="settings-section__heading"><span><History aria-hidden="true" /></span><div><h2>Änderungsverlauf</h2><p>Die letzten lokalen Aktionen helfen dabei, Änderungen nachzuvollziehen.</p></div></div>
            <div className="history-list">
              {state.audit.slice(0, 12).map((event) => <div key={event.id}><span><i /><strong>{event.label}</strong></span><time dateTime={event.at}>{new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(event.at))}</time></div>)}
              {!state.audit.length && <p>Noch keine Änderungen protokolliert.</p>}
            </div>
            {state.voidedInvoiceNumbers.length > 0 && <div className="number-register"><div><h3>Reservierte Rechnungsnummern</h3><p>Nummern gelöschter oder zurück in Entwurf versetzter Rechnungen bleiben dauerhaft belegt.</p></div>{state.voidedInvoiceNumbers.map((entry) => <div className="number-register__row" key={`${entry.number}-${entry.deletedAt}`}><span><strong>{entry.number}</strong><small>{entry.recipient} · {entry.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</small></span><time dateTime={entry.deletedAt}>{entry.reason === 'reopened' ? 'zurückgesetzt' : 'gelöscht'} {new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(entry.deletedAt))}</time></div>)}</div>}
          </section>

          <section className="danger-zone"><div><ArchiveRestore aria-hidden="true" /><span><strong>Alle lokalen Daten zurücksetzen</strong><p>Nur für Bestände ohne ausgestellte Belege, historische Dokumentation oder reservierte Nummern. Bestehende Originale bleiben über Archivierung und geprüfte Wiederherstellung erhalten.</p></span></div><button className="button button--danger-outline" onClick={onReset} disabled={replacementBlocked}>Daten zurücksetzen</button></section>
        </div>
      </div>
    </div>
  )
}

