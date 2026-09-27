import { useEffect, useState } from 'react'
import type { AppState, DuoLesson, Invoice } from '../types'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { InvoicePrint } from '../components/InvoicePrint'
import { applyDuoLessonChange, createDuoDrafts, previewDuoLessonChange, setDuoTotal } from '../lib/duo'
import { duoInvoices, groupCentsInput, previewDuo } from '../lib/duoModel'
import { finalizeDuoGroup } from '../lib/invoiceActions'
import { commandResult } from '../lib/result'
import { localToday } from '../lib/calendar'
import { euro } from '../lib/utils'
import { decimalInputText, invoiceTotalCents } from '../lib/money'
import { itemNumberInput } from '../lib/values'

interface Props {
  state: AppState
  groupId: string
  onClose: () => void
  onGroup: (id: string) => void
  onEdit: (invoice: Invoice) => void
  onCommit: (producer: (state: AppState) => AppState, label: string) => Promise<boolean>
}
const labels = { serviceDate: 'Termin', description: 'Leistung', quantity: 'Menge', unit: 'Einheit' }

export function DuoWorkflow({ state, groupId, onClose, onGroup, onEdit, onCommit }: Props) {
  const group = state.duoGroups?.find((entry) => entry.id === groupId)
  const initialLesson = group?.lesson ?? { serviceDate: localToday(), description: 'Gitarrenunterricht (Duo)', quantity: 1, unit: 'Std.' as const }
  const [lesson, setLesson] = useState<DuoLesson>(initialLesson)
  const [quantity, setQuantity] = useState(decimalInputText(initialLesson.quantity))
  const [students, setStudents] = useState(['', ''])
  const [total, setTotal] = useState(group?.totalCents === undefined ? '' : decimalInputText(group.totalCents / 100))
  const [errors, setErrors] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState<string[]>([])
  const [review, setReview] = useState<ReturnType<typeof previewDuoLessonChange> | null>(null)
  const [discard, setDiscard] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setConfirmed([]) }, [state])
  const invoices = group ? duoInvoices(state, group) : []
  const editable = invoices.every((invoice) => invoice.status === 'draft')
  const preview = group && invoices.length === 2 && editable ? commandResult(() => previewDuo(state, groupId)) : null
  const dirty = JSON.stringify(lesson) !== JSON.stringify(initialLesson) || quantity !== decimalInputText(initialLesson.quantity) || total !== (group?.totalCents === undefined ? '' : decimalInputText(group.totalCents / 100)) || (!group && students.some(Boolean))
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const close = () => dirty ? setDiscard(true) : onClose()
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setErrors([])
    try { await action() } catch (error) { setErrors([error instanceof Error ? error.message : 'Duo-Aktion fehlgeschlagen.']) }
    finally { setBusy(false) }
  }
  const checkedLesson = () => {
    const value = itemNumberInput(quantity, 'quantity')
    if (value === null) throw new Error('Bitte eine gültige Menge eingeben.')
    return { ...lesson, quantity: value }
  }
  const create = () => void run(async () => {
    const basis = checkedLesson(), cents = groupCentsInput(total)
    let id = ''
    if (await onCommit((current) => { const next = createDuoDrafts(current, students, basis, cents); id = next.duoGroups!.at(-1)!.id; return next }, 'Zwei Duo-Entwürfe angelegt')) onGroup(id)
  })
  const checkChanges = () => void run(async () => { setReview(previewDuoLessonChange(state, groupId, checkedLesson())) })
  const saveTotal = () => void run(async () => {
    const cents = groupCentsInput(total)
    if (await onCommit((current) => setDuoTotal(current, groupId, cents), 'Duo-Gruppenbetrag ausdrücklich festgelegt')) setTotal(cents === undefined ? '' : decimalInputText(cents / 100))
  })
  const finalize = () => void run(async () => {
    if (!preview?.ok) return
    if (await onCommit((current) => finalizeDuoGroup(current, groupId, preview.value.token, confirmed), 'Zwei eigenständige Duo-Rechnungen finalisiert')) onClose()
  })
  return <>
    <Modal open onClose={close} title={group ? 'Duo-Rechnungen prüfen' : 'Duo · zwei Haushalte'} eyebrow="Eine Leistung · zwei Forderungen" size="large" initialFocus="title" footer={<>
      <button type="button" className="button button--text" onClick={close}>Schließen</button>
      {!group ? <button type="button" className="button button--primary" disabled={busy} onClick={create}>Zwei Entwürfe anlegen</button> : preview?.ok && <button type="button" className="button button--primary" disabled={busy || dirty || preview.value.errors.length > 0 || confirmed.length !== 2} onClick={finalize}>Beide Rechnungen verbindlich abschließen</button>}
    </>}>
      <p>Jeder Haushalt erhält eine eigene Rechnung mit eigenem Preis. Es wird kein Gesamtpreis halbiert. Ein gemeinsamer Haushalt benötigt eine gemeinsame Rechnung.</p>
      {errors.length > 0 && <div role="alert" className="form-errors">{errors.join(' ')}</div>}
      {!group && <div className="form-grid form-grid--2">{students.map((value, i) => <label className="field" key={i}><span>Lernende Person {i + 1}</span><select value={value} onChange={(event) => setStudents((current) => current.map((id, index) => index === i ? event.target.value : id))}><option value="">Bitte ausdrücklich wählen</option>{state.students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>)}</div>}
      {editable && <section className="form-section" aria-label="Gemeinsame Arbeitsgrundlage">
        <h3>Gemeinsame Arbeitsgrundlage</h3>
        <p>Nur Termin, Leistungsbeschreibung, Menge und Einheit. Empfänger, Preise und Rechnungstexte werden pro Rechnung bearbeitet.</p>
        <div className="form-grid form-grid--2">
          <label className="field"><span>Gemeinsamer Termin</span><input type="date" value={lesson.serviceDate} onChange={(event) => setLesson({ ...lesson, serviceDate: event.target.value })} /></label>
          <label className="field"><span>Gemeinsame Leistung</span><input value={lesson.description} onChange={(event) => setLesson({ ...lesson, description: event.target.value })} /></label>
          <label className="field"><span>Gemeinsame Menge</span><input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label className="field"><span>Gemeinsame Einheit</span><select value={lesson.unit} onChange={(event) => setLesson({ ...lesson, unit: event.target.value as DuoLesson['unit'] })}><option>Std.</option><option>Pauschale</option><option>Stück</option></select></label>
        </div>
        {group && invoices.length === 2 && <button type="button" className="button button--tonal" disabled={busy} onClick={checkChanges}>Änderungen vergleichen</button>}
        {review && <div role="region" aria-label="Unterschiede der gemeinsamen Leistung">
          <table><thead><tr><th>Rechnung</th><th>Angabe</th><th>Bisher</th><th>Danach</th></tr></thead><tbody>{review.differences.map((difference) => <tr key={`${difference.invoiceId}-${difference.field}`}><td>{invoices.findIndex((invoice) => invoice.id === difference.invoiceId) + 1}</td><td>{labels[difference.field as keyof typeof labels]}</td><td>{difference.before}</td><td>{difference.after}</td></tr>)}</tbody></table>
          <p>Preise, Empfänger und individuelle Rechnungstexte bleiben erhalten.</p>
          <button type="button" className="button button--tonal" disabled={busy} onClick={() => void run(async () => { const basis = checkedLesson(); if (await onCommit((current) => applyDuoLessonChange(current, groupId, basis, review.token, true), 'Gemeinsame Duo-Leistung nach Vergleich übernommen')) { setLesson(basis); setQuantity(decimalInputText(basis.quantity)); setReview(null) } })}>Angezeigte Unterschiede ausdrücklich übernehmen</button>
        </div>}
        <label className="field"><span>Ausdrücklicher Gruppenbetrag (EUR, optional)</span><input inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} /><small>Leer: kein Gruppenbetrag. Ausgefüllt: beide Zielbeträge müssen exakt diese Summe ergeben.</small></label>
        {group && <button type="button" className="button button--tonal" disabled={busy} onClick={saveTotal}>Gruppenbetrag speichern</button>}
      </section>}
      {group && invoices.length < 2 && <p role="status">Partnerentwurf fehlt. Die verbleibende Rechnung bleibt eigenständig; ein Gruppenbetrag sperrt ihren Einzelabschluss nicht.</p>}
      {invoices.map((invoice, index) => <section className="form-section" aria-label={`Zielrechnung ${index + 1}`} key={invoice.id}>
        <h3>Rechnung {index + 1}: {state.students.find((student) => student.id === invoice.studentIds[0])?.name ?? 'Zuordnung prüfen'}</h3>
        <p>Eigener Betrag: <strong>{euro.format(invoiceTotalCents(invoice) / 100)}</strong> · {invoice.number ?? 'Nummer wird beim Abschluss vergeben'}</p>
        {invoice.status === 'draft' && <button type="button" className="button button--tonal" onClick={() => onEdit(invoice)}>Rechnung {index + 1} getrennt bearbeiten</button>}
      </section>)}
      {preview && !preview.ok && <p role="alert">{preview.errors.map((error) => error.message).join(' ')}</p>}
      {preview?.ok && <section aria-label="Vollständige Duo-Vorschau">
        <h3>Beide vollständigen Ausgaben vor dem Abschluss</h3>
        {preview.value.errors.length > 0 && <div className="form-errors" role="alert"><ul>{preview.value.errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
        {preview.value.invoices.map((invoice, i) => <section aria-label={`Ausgabe Rechnung ${i + 1}`} key={invoice.id}>
          <div className="duo-paper-scroll"><InvoicePrint invoice={invoice} guardians={state.guardians} students={state.students} settings={state.settings} includeGiroCode={false} pendingNumberLabel="wird beim Abschluss vergeben" /></div>
          <label className="duo-confirm"><input type="checkbox" checked={confirmed.includes(invoice.id)} onChange={(event) => setConfirmed((current) => event.target.checked ? [...current, invoice.id] : current.filter((id) => id !== invoice.id))} />Rechnung {i + 1}: eigene Einzelpreise, Betrag {euro.format(invoiceTotalCents(invoice) / 100)}, Empfänger und vollständige Ausgabe geprüft</label>
        </section>)}
      </section>}
    </Modal>
    <ConfirmDialog open={discard} title="Ungespeicherte Arbeitsgrundlage verwerfen?" message="Deine noch nicht übernommenen Eingaben werden verworfen. Gespeicherte Zielrechnungen bleiben erhalten." cancelLabel="Weiter bearbeiten" confirmLabel="Verwerfen" onCancel={() => setDiscard(false)} onConfirm={onClose} />
  </>
}
