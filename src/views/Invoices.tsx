import { invoiceTotalCents, sumCents } from '../lib/money'
import { outputItemTotal } from '../lib/invoiceOutput'
import { DocumentHistory, InvoiceCorrection, HistoricalSnapshotEvidence, type DocumentHistoryActions } from '../components/DocumentHistory'
import { activeInvoices, isActiveClaim, openCents, selectedInvoices, versionFor } from '../lib/documents'
import { needsHistoricalSplitReview } from '../lib/historicalSplit'
import { FINALIZED_INVOICE_BLOCKED, isFinalizedInvoice } from '../lib/safety'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronDown, Copy, Edit3, FilePlus2, MoreVertical, Printer, Search, Send, Trash2 } from 'lucide-react'
import type { AppState, Invoice, InvoiceStatus, PageKey } from '../types'
import { StatusChip } from '../components/StatusChip'
import { usePageEntrance, staggerStyle } from '../hooks/usePageEntrance'
import { useDetailMotion } from '../hooks/useDetailMotion'
import { EmptyState } from '../components/EmptyState'
import { calculateInvoiceMenuPosition, type InvoiceMenuAction, type InvoiceMenuPosition, runInvoiceMenuAction } from '../lib/invoiceMenu'
import { billingPeriodFromItems, effectiveStatus, guardianName, sortInvoices, statusLabel, studentName } from '../lib/invoiceOutput'
import { isInvoiceSetupComplete } from '../lib/invoiceSetup'
import { euro, formatDate, formatDateLong } from '../lib/utils'
import { invoiceTotal } from '../lib/money'

interface InvoicesProps extends DocumentHistoryActions {
  initialStatus?: 'all' | 'unpaid'
  state: AppState
  onNavigate: (page: PageKey) => void
  onLoadDemo?: () => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onNew: () => void
  onEdit: (invoice: Invoice) => void
  onDuplicate: (invoice: Invoice) => void
  onDelete: (invoice: Invoice) => void
  onSetStatus: (invoice: Invoice, status: InvoiceStatus, paymentDay?: string) => void
  onPrint: (invoice: Invoice) => void
}

export function Invoices({ state, initialStatus = 'all', onNavigate, onLoadDemo, selectedId, onSelect, onNew, onEdit, onDuplicate, onDelete, onSetStatus, onPrint, onCorrection, onAllocatePayment, onResolveConflicts }: InvoicesProps) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const invoices = useMemo(() => selectedInvoices(state), [state])
  const [status, setStatus] = useState<'all' | 'unpaid' | InvoiceStatus>(initialStatus)
  const [year, setYear] = useState('all')
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<{ invoiceId: string; trigger: HTMLButtonElement } | null>(null)
  const [menuPosition, setMenuPosition] = useState<InvoiceMenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const detailTriggerRef = useRef<HTMLElement | null>(null)
  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null
  const menuInvoice = menu ? invoices.find((invoice) => invoice.id === menu.invoiceId) ?? null : null
  const years = [...new Set(invoices.map((invoice) => String(invoice.year)))].sort().reverse()

  const searched = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    return sortInvoices(invoices.filter((invoice) => {
      if (!showArchived && state.invoiceAdministration.some((admin) => admin.versionId === invoice.versionId && admin.archived)) return false
      if (year !== 'all' && String(invoice.year) !== year) return false
      if (!needle) return true
      const haystack = [invoice.number, billingPeriodFromItems(invoice.items, invoice.invoiceDate), guardianName(invoice, state.guardians, state.students), studentName(invoice, state.students), ...invoice.items.map((item) => item.description)].join(' ').toLocaleLowerCase('de-DE')
      return haystack.includes(needle)
    }))
  }, [search, state, invoices, year, showArchived])
  const matchesStatus = useCallback((invoice: Invoice, filter: typeof status) => {
    if (filter === 'all') return true
    if (filter === 'unpaid') return !invoice.archived && isActiveClaim(state, invoice) && openCents(state, invoice) > 0
    return effectiveStatus(invoice) === filter
  }, [state])
  const filtered = useMemo(() => searched.filter((invoice) => matchesStatus(invoice, status)), [searched, status, matchesStatus])
  const statusFilters: Array<{ value: typeof status; label: string }> = [
    { value: 'all', label: 'Alle' }, { value: 'unpaid', label: 'Offen' },
    ...Object.entries(statusLabel).map(([value, label]) => ({ value: value as InvoiceStatus, label })),
  ]
  const statusCounts = new Map(statusFilters.map(({ value }) => [value, searched.filter((invoice) => matchesStatus(invoice, value)).length]))
  const months = useMemo(() => {
    const groups = new Map<string, Invoice[]>()
    for (const invoice of filtered) {
      const key = invoice.invoiceDate.slice(0, 7)
      const group = groups.get(key) ?? []
      group.push(invoice)
      groups.set(key, group)
    }
    return [...groups].map(([key, entries]) => ({ key, entries, total: sumCents(entries.map(invoiceTotalCents)) / 100,
      label: new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T12:00:00`)) }))
  }, [filtered])
  const invoiceIndices = useMemo(() => new Map(filtered.map((invoice, index) => [invoice.id, index])), [filtered])
  const currentMonth = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')

  const entrance = usePageEntrance(filtered)

  const updateMenuPosition = useCallback(() => {
    if (!menu || !menuRef.current) return
    if (!menu.trigger.isConnected) {
      setMenu(null)
      return
    }
    const anchorRect = menu.trigger.getBoundingClientRect()
    const menuRect = menuRef.current.getBoundingClientRect()
    setMenuPosition(calculateInvoiceMenuPosition(anchorRect, menuRect, {
      width: window.innerWidth,
      height: window.innerHeight,
    }))
  }, [menu])

  useLayoutEffect(() => {
    if (!menu) {
      setMenuPosition(null)
      return
    }
    updateMenuPosition()
  }, [menu, updateMenuPosition])

  useEffect(() => {
    if (!menu) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (menu.trigger.contains(target) || menuRef.current?.contains(target)) return
      setMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenu(null)
      menu.trigger.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [menu, updateMenuPosition])

  const toggleMenu = (button: HTMLButtonElement, invoice: Invoice) => {
    if (menu?.invoiceId === invoice.id) {
      setMenu(null)
      return
    }
    setMenuPosition(null)
    setMenu({ invoiceId: invoice.id, trigger: button })
  }

  const toggleMonth = (key: string, entries: Invoice[], trigger: HTMLButtonElement) => {
    if (entries.some((invoice) => invoice.id === selectedId)) detailTriggerRef.current = trigger
    if (entries.some((invoice) => invoice.id === menu?.invoiceId)) setMenu(null)
    setCollapsedMonths((current) => ({ ...current, [key]: !current[key] }))
  }

  const chooseMenuAction = (action: InvoiceMenuAction, invoice: Invoice) => {
    setMenu(null)
    runInvoiceMenuAction(action, invoice, { onEdit, onPrint, onDuplicate, onDelete })
  }

  const openDetails = useCallback((invoice: Invoice, trigger?: HTMLElement) => {
    detailTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    onSelect(invoice.id)
  }, [onSelect])
  const closeDetails = useCallback(() => {
    onSelect(null)
    requestAnimationFrame(() => detailTriggerRef.current?.focus())
  }, [onSelect])

  useEffect(() => {
    if (!selected) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape' || menu) return
      event.preventDefault()
      closeDetails()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closeDetails, menu, selected])

  return (
    <div className="page invoice-page">
      <header className="page-header">
        <div><p className="eyebrow">Verwaltung</p><h1>Rechnungen</h1><p>{state.invoices.length} Vorgänge · {euro.format(sumCents(activeInvoices(state).map(invoiceTotalCents)) / 100)} aktives Belegvolumen</p></div>
        <button className="button button--primary button--large" onClick={onNew}><FilePlus2 aria-hidden="true" /> Neue Rechnung</button>
      </header>

      {!state.invoices.length && (!isInvoiceSetupComplete(state.settings) || !state.students.length) && <section className="notice" aria-label="Einrichtung">
        <p>Für die erste Rechnung Absender und Konto hinterlegen und eine lernende Person anlegen.</p>
        <div className="button-row"><button className="button button--text" onClick={() => onNavigate('settings')}>Absender &amp; Konto</button><button className="button button--text" onClick={() => onNavigate('people')}>Personen anlegen</button></div>
      </section>}
      {onLoadDemo && <button className="button button--text" onClick={onLoadDemo}>Mit Beispieldaten testen</button>}

      <section className="filter-bar" aria-label="Rechnungen filtern"><label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archivierte anzeigen</label>
        <label className="search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Rechnungen durchsuchen</span>
          <input id="invoice-search" type="search" placeholder="Nummer, Rechnungsempfänger, Lernende oder Thema …" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="select-field select-field--compact"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">Alle Status</option><option value="unpaid">Noch nicht gezahlt</option>{Object.entries(statusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><ChevronDown aria-hidden="true" /></label>
        <label className="select-field select-field--compact"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">Alle Jahre</option>{years.map((item) => <option value={item} key={item}>{item}</option>)}</select><ChevronDown aria-hidden="true" /></label>
      </section>

      <div className="invoice-status-filters" role="group" aria-label="Statusfilter" aria-describedby="invoice-status-count-hint">
        {statusFilters.map(({ value, label }) => <button key={value} type="button" className={`invoice-filter-chip invoice-filter-chip--${value}`} aria-pressed={status === value} onClick={() => setStatus(value)}>{label} <span>{statusCounts.get(value)}</span></button>)}
      </div>
      <p className="sr-only" id="invoice-status-count-hint">Die Statuszähler berücksichtigen Suche, Jahr und Archivfilter. Wähle einen Status, um die entsprechenden Rechnungen anzuzeigen.</p>

      {!state.invoices.length ? (
        <section className="surface">
          <EmptyState icon={FilePlus2} title="Die erste Rechnung wartet" description="Sobald eine lernende Person angelegt ist, kannst du Unterrichtspositionen erfassen und die Rechnung finalisieren." />
        </section>
      ) : (
        <div className={`invoice-workspace ${selected ? 'invoice-workspace--detail' : ''}`}>
          <section className="surface invoice-list-card">
            <div className="invoice-list-summary"><span role="status">{filtered.length} Ergebnisse · {months.length} {months.length === 1 ? 'Monat' : 'Monate'}</span><div className="button-row">{months.length > 1 && <><button className="button button--text" type="button" onClick={() => setCollapsedMonths({})}>Alle Monate öffnen</button><button className="button button--text" type="button" onClick={(event) => { setMenu(null); detailTriggerRef.current = event.currentTarget; setCollapsedMonths((current) => ({ ...current, ...Object.fromEntries(months.map(({ key }) => [key, key !== currentMonth])) })) }}>Ältere Monate einklappen</button></>}{(search || status !== 'all' || year !== 'all' || showArchived) && <button className="button button--text" onClick={() => { setSearch(''); setStatus('all'); setYear('all'); setShowArchived(false) }}>Filter zurücksetzen</button>}</div></div>
            <div className="table-scroll invoice-month-scroll" tabIndex={0} role="region" aria-label="Rechnungsliste nach Monaten">
              <table className="data-table invoice-list-table">
                <thead><tr><th>Rechnung <span className="sr-only">(Rechnungsdatum, neueste zuerst)</span></th><th>Empfänger / Lernende</th><th>Zeitraum</th><th>Status</th><th className="align-right">Betrag</th><th><span className="sr-only">Aktion</span></th></tr></thead>
                {months.map((month) => <tbody key={month.key}>
                  <tr className="invoice-month-heading"><th colSpan={6} scope="rowgroup"><button type="button" aria-expanded={!collapsedMonths[month.key]} aria-label={`${month.label}: ${month.entries.length} Rechnungen, ${euro.format(month.total)}`} onClick={(event) => toggleMonth(month.key, month.entries, event.currentTarget)}>
                    <ChevronDown aria-hidden="true" /><strong>{month.label}</strong><span>{month.entries.length} {month.entries.length === 1 ? 'Rechnung' : 'Rechnungen'}</span><b>{euro.format(month.total)}</b>
                  </button></th></tr>
                  {!collapsedMonths[month.key] && month.entries.map((invoice) => {
                  const index = invoiceIndices.get(invoice.id) ?? 0
                  const actualStatus = effectiveStatus(invoice)
                  const period = invoice.versionId ? invoice.period : billingPeriodFromItems(invoice.items, invoice.invoiceDate)
                  return (
                    <tr style={staggerStyle(index)} className={`invoice-data-row ${invoice.id === selectedId ? 'is-selected' : ''}${entrance && index < 8 ? ' motion-fade motion-stagger page-entry' : ''}`} key={invoice.id} onClick={() => openDetails(invoice)}>
                      <td><button ref={(node) => { if (node && invoice.id === selectedId && !detailTriggerRef.current) detailTriggerRef.current = node }} className="button button--text invoice-detail-link" type="button" onClick={(event) => { event.stopPropagation(); openDetails(invoice, event.currentTarget) }}>{invoice.number ?? 'Entwurf'}</button>{invoice.versionId && !isActiveClaim(state, invoice) && <small>Ersetzt</small>}<small>{formatDate(invoice.invoiceDate)}</small><StatusChip className="invoice-cell-status" status={actualStatus}><i />{statusLabel[actualStatus]}</StatusChip></td>
                      <td>{guardianName(invoice, state.guardians, state.students)}<small>{studentName(invoice, state.students)}</small></td>
                      <td>{period}</td>
                      <td><StatusChip status={actualStatus}><i />{statusLabel[actualStatus]}</StatusChip></td>
                      <td className="align-right"><strong>{euro.format(invoiceTotal(invoice))}</strong></td>
                      <td className="invoice-row-actions" onClick={(event) => event.stopPropagation()}>
                        <div className="invoice-row-menu">
                          <button className="icon-button icon-button--small" type="button" aria-haspopup="menu" aria-expanded={menu?.invoiceId === invoice.id} aria-controls={`invoice-menu-${invoice.id}`} onClick={(event) => toggleMenu(event.currentTarget, invoice)} aria-label={`Aktionen für ${invoice.number ?? 'Entwurf'} öffnen`}><MoreVertical aria-hidden="true" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}</tbody>)}
              </table>
            </div>
            {!filtered.length && <EmptyState icon={Search} title="Nichts gefunden" description="Passe Suche oder Filter an, um andere Rechnungen zu sehen." />}
          </section>

          {selected && (
            <InvoiceDetail
              invoice={selected}
              state={state}
              onClose={closeDetails}
              onEdit={() => onEdit(selected)}
              onDuplicate={() => onDuplicate(selected)}
              onDelete={() => onDelete(selected)}
              onSetStatus={(next, paymentDay) => onSetStatus(selected, next, paymentDay)}
              onPrint={() => onPrint(selected)}
              onSelect={onSelect} onCorrection={onCorrection} onAllocatePayment={onAllocatePayment} onResolveConflicts={onResolveConflicts}
            />
          )}
        </div>
      )}
      <HistoricalSnapshotEvidence state={state} />
      {menu && menuInvoice && createPortal(
        <div
          className="invoice-kebab-menu"
          id={`invoice-menu-${menu.invoiceId}`}
          ref={menuRef}
          role="menu"
          style={{
            top: menuPosition?.top ?? 0,
            left: menuPosition?.left ?? 0,
            visibility: menuPosition ? 'visible' : 'hidden',
          }}
        >
          {!isFinalizedInvoice(menuInvoice) && <button type="button" role="menuitem" onClick={() => chooseMenuAction('edit', menuInvoice)}><Edit3 aria-hidden="true" /> Bearbeiten</button>}
          <button type="button" role="menuitem" onClick={() => chooseMenuAction('pdf', menuInvoice)}><Printer aria-hidden="true" /> {menuInvoice.status === 'draft' ? 'Vorschau' : 'PDF generieren'}</button>
          <button type="button" role="menuitem" onClick={() => chooseMenuAction('duplicate', menuInvoice)}><Copy aria-hidden="true" /> Duplizieren</button>
          <button className="is-danger" type="button" role="menuitem" onClick={() => chooseMenuAction('delete', menuInvoice)}><Trash2 aria-hidden="true" /> {isFinalizedInvoice(menuInvoice) ? 'Archivieren / zurückholen' : 'Löschen'}</button>
        </div>,
        document.body,
      )}
    </div>
  )
}

function InvoiceDetail({ invoice, state, onClose, onEdit, onDuplicate, onDelete, onSetStatus, onPrint, onSelect, onCorrection, onAllocatePayment, onResolveConflicts }: DocumentHistoryActions & {
  invoice: Invoice
  state: AppState
  onSelect: (id: string) => void
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSetStatus: (status: InvoiceStatus, paymentDay?: string) => void
  onPrint: () => void
}) {
  const detailRef = useRef<HTMLElement>(null)
  const detailEntrance = usePageEntrance(invoice.id)
  useDetailMotion(detailRef, invoice)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const status = effectiveStatus(invoice)
  const version = versionFor(state, invoice)
  const unresolved = Boolean(version?.conflicts.length && !state.invoiceAdministration.find((entry) => entry.versionId === version.id)?.resolutions.length)
  const unassignedPayments = version && isActiveClaim(state, invoice) && state.payments.some((payment) => (
    state.documentVersions.some((entry) => entry.id === payment.sourceVersionId && entry.originalId === version.originalId)
    && payment.allocations.at(-1)?.versionId !== version.id
  ))
  const period = invoice.versionId ? invoice.period : billingPeriodFromItems(invoice.items, invoice.invoiceDate)
  const payment = state.payments.find((entry) => entry.allocations.at(-1)?.versionId === invoice.versionId && entry.amountCents === invoiceTotalCents(invoice))
  const [paymentDay, setPaymentDay] = useState('')

  useEffect(() => {
    setPaymentDay(payment?.paymentDayStatus === 'confirmed' ? payment.paidAt ?? '' : '')
  }, [invoice.id, payment?.id, payment?.paidAt, payment?.paymentDayStatus])

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [invoice.id])

  return (
    <aside ref={detailRef} className={`surface invoice-detail${detailEntrance ? ' motion-rise page-entry' : ''}`} aria-label={`Details zu ${invoice.number ?? 'Entwurf'}`}>
      <header className="invoice-detail__header">
        <div><p className="eyebrow">Rechnung</p><h2>{invoice.number ?? 'Entwurf'}</h2><p>{guardianName(invoice, state.guardians, state.students)}</p></div>
        <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Detailansicht schließen">×</button>
      </header>
      <div className="invoice-detail__amount"><strong>{euro.format(invoiceTotal(invoice))}</strong><StatusChip status={status}><i />{statusLabel[status]}</StatusChip></div>
      <dl className="detail-list">
        <div><dt><CalendarDays aria-hidden="true" /> Leistungszeitraum</dt><dd>{period}</dd></div>
        <div><dt>Rechnungsdatum</dt><dd>{formatDateLong(invoice.invoiceDate)}</dd></div>
        <div><dt>Fällig am</dt><dd>{formatDateLong(invoice.dueDate)}</dd></div>
        <div><dt>Unterricht für</dt><dd>{studentName(invoice, state.students)}</dd></div>
        <div><dt>Positionen</dt><dd>{invoice.items.length}</dd></div>
      </dl>

      <div className="detail-actions">
        {!isFinalizedInvoice(invoice) ? (
          <>{invoice.recipientStrategy === 'separate' && !invoice.correction ? <p className="notice" role="status">Historischer Aufteilungsentwurf: Bitte öffnen, alle Angaben prüfen und ausdrücklich als gemeinsamen Entwurf übernehmen. Eine direkte Finalisierung ist gesperrt.</p> : <button className="button button--tonal" type="button" onClick={() => onSetStatus('sent')}><Send aria-hidden="true" /> Finalisieren</button>}<button className="button button--tonal" type="button" onClick={onPrint}><Printer aria-hidden="true" /> Vorschau</button><button className="button button--text" type="button" onClick={onEdit}><Edit3 aria-hidden="true" /> Bearbeiten</button></>
        ) : (
          <><button className="button button--tonal" onClick={onPrint}><Printer aria-hidden="true" /> PDF / Drucken</button><InvoiceCorrection key={invoice.id} state={state} invoice={invoice} onSelect={onSelect} onCorrection={onCorrection} /></>
        )}
        {isFinalizedInvoice(invoice) && <div className="status-editor">
          <span className="status-editor__label" id={`invoice-status-${invoice.id}`}>Forderungsstatus</span>
          <div className="status-editor__choices" role="group" aria-labelledby={`invoice-status-${invoice.id}`}>
            <button className="button button--tonal" type="button" aria-pressed={status === 'sent' || status === 'overdue'} onClick={() => onSetStatus('sent')}>Versendet / offen</button>
          </div>
          <div className="payment-day-editor">
            <label htmlFor={`payment-day-${invoice.id}`}>Tatsächlicher Zahlungstag</label>
            <input id={`payment-day-${invoice.id}`} type="date" value={paymentDay} onChange={(event) => setPaymentDay(event.target.value)} />
            {payment?.paymentDayStatus === 'unknown' && <p className="field-hint" role="status">Zahlungsdatum unbekannt{payment.legacyPaymentDay ? ` · bisheriger unbestätigter Wert: ${payment.legacyPaymentDay}` : ''}. Erfasst am {payment.recordedAt}.</p>}
            {status === 'paid'
              ? <button className="button button--tonal" type="button" disabled={!paymentDay} onClick={() => onSetStatus('paid', paymentDay)}>Zahlungstag korrigieren</button>
              : <button className="button button--tonal" type="button" disabled={!paymentDay} onClick={() => onSetStatus('paid', paymentDay)}>Vollzahlung erfassen</button>}
          </div>
        </div>}
      </div>

      {unresolved && <p className="notice" role="alert">Historische Abweichungen müssen vor der Finalisierung einer Korrektur geklärt werden. Die Angaben und „Ergebnis der Klärung“ stehen unter „Details“.</p>}
      {unassignedPayments && <p className="notice" role="status">Bestehende Zahlungen sind diesem Beleg nicht zugeordnet. Prüfe die Zahlungszuordnung unter „Details“, bevor du eine weitere Zahlung erfasst.</p>}
      {version && <details key={invoice.id} open={unresolved}>
        <summary>Details</summary>
        <DocumentHistory state={state} invoice={invoice} onSelect={onSelect} onAllocatePayment={onAllocatePayment} onResolveConflicts={onResolveConflicts} />
      </details>}
      {invoice.status === 'draft' && invoice.correction && <p>Korrekturentwurf. Das Original und seine Nummer bleiben erhalten. Fehlende Personen bitte im Editor ausdrücklich neu zuordnen.</p>}
      {needsHistoricalSplitReview(state, invoice) && <p className="notice" role="status">Historische Aufteilung ungeklärt: Dieser übernommene Beleg wird nicht automatisch zusammengelegt oder umgeschrieben. Prüfe Empfänger, Lernende, Positionen und Betrag; notwendige Änderungen erfolgen über den Korrekturweg.</p>}
      {isFinalizedInvoice(invoice) && <p className="field-hint" role="status">{FINALIZED_INVOICE_BLOCKED}</p>}

      {invoice.status === 'draft' && <section className="position-summary">
        <h3>Positionen</h3>
        {invoice.items.map((item) => <div key={item.id}><span>{item.description}<small>{formatDate(item.serviceDate)} · {item.quantity.toLocaleString('de-DE')} {item.unit}</small></span><strong>{euro.format(outputItemTotal(invoice, item))}</strong></div>)}
      </section>}

      <footer className="invoice-detail__footer">
        <button className="button button--text" onClick={onDuplicate}><Copy aria-hidden="true" /> Duplizieren</button>
        <button className="button button--text button--danger-text" onClick={onDelete}><Trash2 aria-hidden="true" /> {isFinalizedInvoice(invoice) ? state.invoiceAdministration.find((admin) => admin.versionId === invoice.versionId)?.archived ? 'Aus Archiv holen' : 'Archivieren' : 'Löschen'}</button>
      </footer>
    </aside>
  )
}

