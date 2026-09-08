import { decimalInputText } from '../lib/money'
import { draftAmountChange, previewCents } from '../lib/money'
import { correctionErrors, reassignCorrectionStudent } from '../lib/documents'
import { applyItemNumberInput, itemNumberInput, adjustQuantity as adjustedQuantity, MIN_QUANTITY, MAX_QUANTITY, QUANTITY_INCREMENT } from '../lib/values'
import { invoiceDraftErrors } from '../lib/invoiceActions'
import { useEffect, useMemo, useState } from 'react'
import { Calendar, CircleDollarSign, FileCheck2, Minus, Plus, Save, Send, Trash2 } from 'lucide-react'
import type { AppState, Guardian, InvoiceDraft, LessonType, Settings, Student } from '../types'
import { FINALIZED_INVOICE_BLOCKED, SPLIT_INVOICE_BLOCKED } from '../lib/safety'
import { Modal } from '../components/Modal'
import { applyLessonType, billingPeriodFromItems, calculateDueDate, createLessonItem, euro, germanIbanError, invoiceFinalizationErrors, isFooterTextWithinLimit, itemTotal, limitFooterText, MAX_FOOTER_TEXT_LENGTH } from '../lib/utils'

const INVOICE_EDITOR_FORM_ID = 'invoice-editor-form'
interface InvoiceEditorProps {
  state: AppState
  open: boolean
  draft: InvoiceDraft
  guardians: Guardian[]
  students: Student[]
  settings: Settings
  editing: boolean
  finalized: boolean
  invoiceNumber?: string | null
  onClose: () => void
  onSave: (draft: InvoiceDraft, finalize: boolean) => void
}

export function InvoiceEditor({ state, open, draft, guardians, students, settings, editing, finalized, invoiceNumber, onClose, onSave }: InvoiceEditorProps) {
  const [form, setForm] = useState<InvoiceDraft>(draft)
  const [numberInputs, setNumberInputs] = useState<Record<string, Partial<Record<'quantity' | 'unitPrice', string>>>>({})
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    setForm(structuredClone(draft))
    setNumberInputs({})
    setErrors([])
  }, [draft, open])

  const linkedGuardianIds = useMemo(() => new Set(form.studentIds.flatMap((id) => students.find((student) => student.id === id)?.guardianIds ?? [])), [form.studentIds, students])
  const eligibleGuardians = linkedGuardianIds.size ? guardians.filter((guardian) => linkedGuardianIds.has(guardian.id)) : guardians
  const cents = previewCents(form)
  const total = cents === null ? null : cents / 100
  const change = draftAmountChange(draft)
  const calculatedPeriod = billingPeriodFromItems(form.items, form.invoiceDate)
  const footerTextValid = isFooterTextWithinLimit(form.legalText)

  const selectStudent = (student: Student) => {
    setForm((current) => {
      const isSelected = current.studentIds.includes(student.id)
      const studentIds = isSelected ? current.studentIds.filter((id) => id !== student.id || Boolean(current.correction && current.items.some((item) => item.studentId === id))) : [...current.studentIds, student.id]
      const guardianIds = isSelected
        ? current.guardianIds.filter((id) => studentIds.some((studentId) => students.find((item) => item.id === studentId)?.guardianIds.includes(id)))
        : [...new Set([...current.guardianIds, ...student.guardianIds])]
      const items = isSelected && !current.correction
        ? current.items.filter((item) => item.studentId !== student.id)
        : current.items.length ? current.items : [createLessonItem(student.id, current.invoiceDate, settings)]
      return { ...current, studentIds, guardianIds, items, period: billingPeriodFromItems(items, current.invoiceDate) }
    })
  }

  const updateItem = (id: string, key: string, value: string | number) => {
    setForm((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, [key]: value } : item) }))
  }

  const updateNumber = (id: string, field: 'quantity' | 'unitPrice', raw: string) => {
    setNumberInputs((current) => ({ ...current, [id]: { ...current[id], [field]: raw } }))
    setForm((current) => ({ ...current, items: current.items.map((item) => item.id === id ? applyItemNumberInput(item, field, raw) : item) }))
  }

  const adjustQuantity = (id: string, direction: 1 | -1) => {
    const item = form.items.find((entry) => entry.id === id)
    if (item) updateNumber(id, 'quantity', String(adjustedQuantity(item.quantity, direction)))
  }

  const updateServiceDate = (id: string, serviceDate: string) => {
    setForm((current) => {
      const items = current.items.map((item) => item.id === id ? { ...item, serviceDate } : item)
      return { ...current, items, period: billingPeriodFromItems(items, current.invoiceDate) }
    })
  }

  const updateLessonType = (id: string, lessonType: LessonType) => {
    setNumberInputs((current) => ({ ...current, [id]: { ...current[id], unitPrice: undefined } }))
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? applyLessonType(item, lessonType, settings) : item),
    }))
  }

  const updateInvoiceDate = (invoiceDate: string) => {
    setForm((current) => ({
      ...current,
      invoiceDate,
      dueDate: calculateDueDate(invoiceDate, settings.paymentTermDays),
      period: billingPeriodFromItems(current.items, invoiceDate),
    }))
  }

  const addItem = () => {
    const studentId = form.studentIds[0]
    if (!studentId) {
      setErrors(['Wähle zuerst mindestens ein Kind aus.'])
      return
    }
    setForm((current) => {
      const items = [...current.items, createLessonItem(studentId, current.invoiceDate, settings)]
      return { ...current, items, period: billingPeriodFromItems(items, current.invoiceDate) }
    })
  }

  const submit = (finalize: boolean) => {
    const invalidNumbers = form.items.some((item) => (['quantity', 'unitPrice'] as const).some((field) => itemNumberInput(numberInputs[item.id]?.[field] ?? decimalInputText(item[field]), field) === null))
    const nextErrors = finalized ? [FINALIZED_INVOICE_BLOCKED] : invoiceDraftErrors(state, form)
    if (invalidNumbers) nextErrors.push('Bitte die Preise und Mengen vervollständigen. Ungültige Zwischenwerte werden nicht gespeichert.')
    if (finalize) {
      nextErrors.push(...correctionErrors(state, form))
      nextErrors.push(...invoiceFinalizationErrors({ guardians, students }, form))
      const ibanError = germanIbanError(settings.iban)
      if (ibanError) nextErrors.push(ibanError)
    }
    setErrors(nextErrors)
    if (!nextErrors.length) {
      const normalized = { ...form, period: calculatedPeriod, legalText: limitFooterText(form.legalText) }
      onSave(normalized, finalize)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={finalized ? `Rechnung ${invoiceNumber ?? ''} bearbeiten` : form.correction ? 'Korrekturentwurf bearbeiten' : editing ? 'Entwurf bearbeiten' : 'Neue Rechnung'}
      eyebrow="Rechnungseditor"
      size="large"
      footer={
        <>
          <div className="modal-total"><span>Gesamt</span><strong>{total === null ? 'Ungültiger Betrag' : euro.format(total)}</strong></div>
          <button className="button button--text" type="button" onClick={onClose}>Abbrechen</button>
          {finalized ? (
            <button className="button button--primary" type="submit" form={INVOICE_EDITOR_FORM_ID} disabled><Save aria-hidden="true" /> Änderungen speichern</button>
          ) : (
            <><button className="button button--tonal" type="submit" form={INVOICE_EDITOR_FORM_ID}>Als Entwurf speichern</button><button className="button button--primary" type="button" disabled={Boolean(form.correction && ([...correctionErrors(state, form), ...invoiceFinalizationErrors(state, form)].length))} onClick={() => submit(true)}><Send aria-hidden="true" /> Finalisieren</button></>
          )}
        </>
      }
    >
      <form className="invoice-form" id={INVOICE_EDITOR_FORM_ID} onSubmit={(event) => { event.preventDefault(); submit(false) }}>
        {editing && change.changed && <p role="status" className="notice">Dezimalberechnung prüfen: bisher {euro.format(change.before / 100)}, jetzt {change.after === null ? 'ungültiger Betrag' : euro.format(change.after / 100)}. Positionsbeträge werden einzeln kaufmännisch auf Cent gerundet. Speichern oder Finalisieren übernimmt die hier angezeigten neuen Beträge; Originalbelege bleiben erhalten.</p>}
        <p className="muted">Mengen: 0,01–99,99 (bis 2 Nachkommastellen). Preise in EUR je Einheit; gespeicherte Untercentpräzision bleibt erhalten. Gesamt höchstens 999.999.999,99 EUR.</p>
        {finalized && <div className="revision-banner"><FileCheck2 aria-hidden="true" /><div><strong>Finalisierte Rechnung</strong><p>{FINALIZED_INVOICE_BLOCKED}</p></div></div>}
        {errors.length > 0 && <div className="form-errors" role="alert"><strong>Bitte noch prüfen:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}

        {form.correction && <section className="form-section" aria-label="Korrektur und Neuzuordnung">
          <p>Originalbeleg und reservierte Nummer bleiben erhalten. Jede Position wird übernommen. Finalisierung erst nach gültiger Zuordnung.</p>
          <label className="field"><span>Korrekturgrund</span><textarea value={form.correction.reason} onChange={(event) => setForm({ ...form, correction: { ...form.correction!, reason: event.target.value } })} /></label>
          {form.studentIds.map((id) => <label className="field" key={id}><span>Kind neu zuordnen: {students.find((student) => student.id === id)?.name ?? `Gelöschtes Kind (${id})`}</span><select value={id} onChange={(event) => setForm((current) => reassignCorrectionStudent(current, id, event.target.value))}>{!students.some((student) => student.id === id) && <option value={id}>Zuordnung erforderlich</option>}{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>)}
          {form.guardianIds.filter((id) => !guardians.some((guardian) => guardian.id === id)).map((id) => <label className="field" key={id}><span>Gelöschte empfangende Person ({id}) ersetzen</span><select value={id} onChange={(event) => setForm((current) => ({ ...current, guardianIds: [...new Set(current.guardianIds.map((old) => old === id ? event.target.value : old))] }))}><option value={id}>Zuordnung erforderlich</option>{guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}</option>)}</select></label>)}
        </section>}
        <section className="form-section">
          <div className="form-section__heading"><span>1</span><div><h3>Für wen?</h3><p>Kinder und Rechnungsempfänger auswählen.</p></div></div>
          <fieldset className="chip-fieldset" disabled={finalized}><legend>Kind(er)</legend><div className="choice-chips">{students.filter((student) => student.active || form.studentIds.includes(student.id)).map((student) => <label className={form.studentIds.includes(student.id) ? 'choice-chip is-selected' : 'choice-chip'} key={student.id}><input type="checkbox" checked={form.studentIds.includes(student.id)} onChange={() => selectStudent(student)} /><span className="avatar">{student.name.slice(0, 1)}</span>{student.name}</label>)}</div>{!students.length && <p className="field-hint field-hint--warning">Lege zuerst unter „Familien“ ein Kind an.</p>}{finalized && <p className="field-hint">Die Kindzuordnung bleibt gesperrt, weil sie Bestandteil des Rechnungsnummernkreises ist.</p>}</fieldset>
          <fieldset className="chip-fieldset"><legend>Empfänger</legend><div className="choice-chips">{eligibleGuardians.map((guardian) => <label className={form.guardianIds.includes(guardian.id) ? 'choice-chip is-selected' : 'choice-chip'} key={guardian.id}><input type="checkbox" checked={form.guardianIds.includes(guardian.id)} onChange={() => setForm((current) => ({ ...current, guardianIds: current.guardianIds.includes(guardian.id) ? current.guardianIds.filter((id) => id !== guardian.id) : [...current.guardianIds, guardian.id] }))} /><span className="avatar avatar--warm">{guardian.name.slice(0, 1)}</span>{guardian.name}</label>)}</div></fieldset>
          {form.guardianIds.length > 1 && (finalized ? <p className="field-hint">Die vorhandene Rechnungsnummer bleibt eine gemeinsame Rechnung für die ausgewählten Empfänger:innen.</p> : <fieldset className="segmented-field"><legend>Bei mehreren Empfänger:innen</legend><div className="segmented-control"><label className={form.recipientStrategy === 'joint' ? 'is-selected' : ''}><input type="radio" name="recipient-strategy" checked={form.recipientStrategy === 'joint'} onChange={() => setForm({ ...form, recipientStrategy: 'joint' })} />Eine gemeinsame Rechnung</label><label className={form.recipientStrategy === 'separate' ? 'is-selected' : ''}><input type="radio" name="recipient-strategy" disabled checked={form.recipientStrategy === 'separate'} onChange={() => setForm({ ...form, recipientStrategy: 'separate' })} />Je Person eine Rechnung</label></div><p className="field-hint">{SPLIT_INVOICE_BLOCKED}</p></fieldset>)}
        </section>

        <section className="form-section">
          <div className="form-section__heading"><span>2</span><div><h3>Zeitraum & Fälligkeit</h3><p>Die formalen Angaben der Rechnung.</p></div></div>
          <div className="form-grid form-grid--3">
            <label className="field"><span>Rechnungsdatum</span><div className="input-with-icon"><Calendar aria-hidden="true" /><input type="date" value={form.invoiceDate} onChange={(event) => updateInvoiceDate(event.target.value)} /></div></label>
            <label className="field"><span>Fällig am</span><div className="input-with-icon"><Calendar aria-hidden="true" /><input type="date" value={form.dueDate} readOnly /></div><small>{settings.paymentTermDays} Tage nach Rechnungsdatum</small></label>
            <label className="field"><span>Leistungszeitraum</span><input type="text" value={calculatedPeriod} readOnly /><small>Automatisch aus den Positionsdaten</small></label>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__heading form-section__heading--action"><span>3</span><div><h3>Positionen</h3><p>Unterricht, Pauschalen oder sonstige Leistungen.</p></div><button className="button button--tonal" type="button" onClick={addItem}><Plus aria-hidden="true" /> Position</button></div>
          <div className="editor-items">
            {form.items.map((item, index) => (
              <div className="editor-item" key={item.id}>
                <span className="editor-item__number">{String(index + 1).padStart(2, '0')}</span>
                <label className="field field--date"><span>Datum</span><input type="date" value={item.serviceDate} onChange={(event) => updateServiceDate(item.id, event.target.value)} /></label>
                <label className="field field--lesson-type"><span>Art</span><select value={item.lessonType} onChange={(event) => updateLessonType(item.id, event.target.value as LessonType)}><option value="solo">Solo</option><option value="duo">Duo</option></select></label>
                <label className="field field--description"><span>Beschreibung</span><input type="text" value={item.description} onChange={(event) => updateItem(item.id, 'description', event.target.value)} placeholder="z. B. Akkordwechsel (Solo)" /></label>
                {form.studentIds.length > 1 && <label className="field field--student"><span>Kind</span><select value={item.studentId} onChange={(event) => updateItem(item.id, 'studentId', event.target.value)}>{form.studentIds.map((id) => <option key={id} value={id}>{students.find((student) => student.id === id)?.name}</option>)}</select></label>}
                <div className="field field--quantity"><span id={`quantity-label-${item.id}`}>Menge</span><div className="quantity-stepper"><input aria-labelledby={`quantity-label-${item.id}`} type="text" inputMode="decimal" aria-invalid={itemNumberInput(numberInputs[item.id]?.quantity ?? String(item.quantity), 'quantity') === null} value={numberInputs[item.id]?.quantity ?? String(item.quantity)} onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); adjustQuantity(item.id, event.key === 'ArrowUp' ? 1 : -1) } }} onChange={(event) => updateNumber(item.id, 'quantity', event.target.value)} /><button type="button" onClick={() => adjustQuantity(item.id, 1)} disabled={item.quantity >= MAX_QUANTITY} aria-label={`Menge für Position ${index + 1} um ${QUANTITY_INCREMENT} erhöhen`}><Plus aria-hidden="true" /></button><button type="button" onClick={() => adjustQuantity(item.id, -1)} disabled={item.quantity <= MIN_QUANTITY} aria-label={`Menge für Position ${index + 1} um ${QUANTITY_INCREMENT} verringern`}><Minus aria-hidden="true" /></button></div></div>
                <label className="field field--unit"><span>Einheit</span><select value={item.unit} onChange={(event) => updateItem(item.id, 'unit', event.target.value)}><option>Std.</option><option>Pauschale</option><option>Stück</option></select></label>
                <label className="field field--price"><span>Einzelpreis</span><div className="input-with-suffix"><input type="text" inputMode="decimal" aria-invalid={itemNumberInput(numberInputs[item.id]?.unitPrice ?? decimalInputText(item.unitPrice), 'unitPrice') === null} value={numberInputs[item.id]?.unitPrice ?? decimalInputText(item.unitPrice)} onChange={(event) => updateNumber(item.id, 'unitPrice', event.target.value)} /><span>€</span></div></label>
                <div className="editor-item__total"><span>Betrag</span><strong>{previewCents({ items: [item] }) === null ? 'Ungültiger Betrag' : euro.format(itemTotal(item))}</strong></div>
                <button className="icon-button icon-button--small editor-item__delete" type="button" onClick={() => setForm((current) => { const items = current.items.filter((candidate) => candidate.id !== item.id); return { ...current, items, period: billingPeriodFromItems(items, current.invoiceDate) } })} aria-label={`Position ${index + 1} löschen`}><Trash2 aria-hidden="true" /></button>
              </div>
            ))}
            {!form.items.length && <button className="add-position-placeholder" type="button" onClick={addItem}><CircleDollarSign aria-hidden="true" /><strong>Erste Position ergänzen</strong><span>Datum, Thema, Menge und Preis erfassen</span></button>}
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__heading"><span>4</span><div><h3>Textbausteine</h3><p>Individuelle Hinweise für diese Rechnung.</p></div></div>
          <div className="form-grid form-grid--2">
            <label className="field"><span id="invoice-intro-label">Einleitung</span><textarea aria-labelledby="invoice-intro-label" rows={4} value={form.introText} onChange={(event) => setForm({ ...form, introText: event.target.value })} /></label>
            <label className="field"><span id="invoice-note-label">Freitext / Hinweis</span><textarea aria-labelledby="invoice-note-label" rows={4} value={form.freeText} onChange={(event) => setForm({ ...form, freeText: event.target.value })} placeholder="Optional" /></label>
            <label className="field field--full"><span>Fußzeile / Rechtstext</span><textarea rows={2} maxLength={MAX_FOOTER_TEXT_LENGTH} value={form.legalText} onChange={(event) => setForm({ ...form, legalText: event.target.value })} aria-invalid={!footerTextValid} /><small className="field-counter">{form.legalText.length} / {MAX_FOOTER_TEXT_LENGTH} Zeichen</small>{form.legalText.length >= MAX_FOOTER_TEXT_LENGTH && <small className="field-warning" role="status">Zeichenlimit erreicht. Nutze für längere rechnungsspezifische Angaben das Feld „Freitext / Hinweis“.</small>}</label>
          </div>
        </section>
      </form>
    </Modal>
  )
}

