import { invoiceTotalCents, sumCents } from '../lib/money'
import { outputItemTotal } from '../lib/utils'
import { DocumentHistory, HistoricalSnapshotEvidence, type DocumentHistoryActions } from '../components/DocumentHistory'
import { activeInvoices, isActiveClaim, openCents, selectedInvoices } from '../lib/documents'
import { commandResult } from '../lib/result'
import { needsHistoricalSplitReview } from '../lib/invoiceSplit'
import { FINALIZED_INVOICE_BLOCKED, isFinalizedInvoice } from '../lib/safety'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronDown, Copy, Edit3, FilePlus2, Mail, MoreVertical, Printer, Search, Send, Trash2 } from 'lucide-react'
import type { AppState, Invoice, InvoiceStatus } from '../types'
import { EmptyState } from '../components/EmptyState'
import { calculateInvoiceMenuPosition, type InvoiceMenuAction, type InvoiceMenuPosition, runInvoiceMenuAction } from '../lib/invoiceMenu'
import { billingPeriodFromItems, createReminder, effectiveStatus, euro, formatDate, formatDateLong, guardianName, invoiceTotal, mailtoUrl, sortInvoices, statusLabel, studentName, type InvoiceSortKey, type SortDirection } from '../lib/utils'

interface InvoicesProps extends DocumentHistoryActions {
  state: AppState
  selectedId: string | null
  onSelect: (id: string | null) => void
  onNew: () => void
  onEdit: (invoice: Invoice) => void
  onDuplicate: (invoice: Invoice) => void
  onDelete: (invoice: Invoice) => void
  onSetStatus: (invoice: Invoice, status: InvoiceStatus, paymentDay?: string) => void
  onPrint: (invoice: Invoice) => void
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void
}

export function Invoices({ state, selectedId, onSelect, onNew, onEdit, onDuplicate, onDelete, onSetStatus, onPrint, onToast, onCorrection, onAllocatePayment, onResolveConflicts }: InvoicesProps) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const invoices = useMemo(() => selectedInvoices(state), [state])
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all')
  const [year, setYear] = useState('all')
  const [sort, setSort] = useState<{ key: InvoiceSortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' })
  const [menu, setMenu] = useState<{ invoiceId: string; trigger: HTMLButtonElement } | null>(null)
  const [menuPosition, setMenuPosition] = useState<InvoiceMenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const detailTriggerRef = useRef<HTMLElement | null>(null)
  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? null
  const menuInvoice = menu ? invoices.find((invoice) => invoice.id === menu.invoiceId) ?? null : null
  const years = [...new Set(state.invoices.map((invoice) => String(invoice.year)))].sort().reverse()

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    const matches = invoices
      .filter((invoice) => {
        if (!showArchived && state.invoiceAdministration.some((admin) => admin.versionId === invoice.versionId && admin.archived)) return false
        const actualStatus = effectiveStatus(invoice)
        if (status !== 'all' && actualStatus !== status) return false
        if (year !== 'all' && String(invoice.year) !== year) return false
        if (!needle) return true
        const haystack = [invoice.number, billingPeriodFromItems(invoice.items, invoice.invoiceDate), guardianName(invoice, state.guardians), studentName(invoice, state.students), ...invoice.items.map((item) => item.description)].join(' ').toLocaleLowerCase('de-DE')
        return haystack.includes(needle)
      })
    return sortInvoices(matches, sort.key, sort.direction, state.guardians, state.students)
  }, [search, sort.direction, sort.key, state, invoices, status, year, showArchived])

  const toggleSort = (key: InvoiceSortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }))

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

      <section className="filter-bar" aria-label="Rechnungen filtern"><label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archivierte anzeigen</label>
        <label className="search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Rechnungen durchsuchen</span>
          <input id="invoice-search" type="search" placeholder="Nummer, Familie, Kind oder Thema …" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="select-field select-field--compact"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">Alle Status</option>{Object.entries(statusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><ChevronDown aria-hidden="true" /></label>
        <label className="select-field select-field--compact"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">Alle Jahre</option>{years.map((item) => <option value={item} key={item}>{item}</option>)}</select><ChevronDown aria-hidden="true" /></label>
      </section>

      {!state.invoices.length ? (
        <section className="surface">
          <EmptyState icon={FilePlus2} title="Die erste Rechnung wartet" description="Sobald eine Familie angelegt ist, kannst du Unterrichtspositionen erfassen und die Rechnung finalisieren." action={<button className="button button--primary" onClick={onNew}>Rechnung anlegen</button>} />
        </section>
      ) : (
        <div className={`invoice-workspace ${selected ? 'invoice-workspace--detail' : ''}`}>
          <section className="surface invoice-list-card">
            <div className="invoice-list-summary"><span>{filtered.length} Ergebnisse</span>{(search || status !== 'all' || year !== 'all') && <button className="button button--text" onClick={() => { setSearch(''); setStatus('all'); setYear('all') }}>Filter zurücksetzen</button>}</div>
            <div className="table-scroll">
              <table className="data-table invoice-list-table">
                <thead><tr><SortableHeader label="Rechnung" sortKey="number" sort={sort} onSort={toggleSort} /><SortableHeader label="Familie / Kind" sortKey="family" sort={sort} onSort={toggleSort} /><SortableHeader label="Zeitraum" sortKey="period" sort={sort} onSort={toggleSort} /><SortableHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} /><SortableHeader label="Betrag" sortKey="amount" sort={sort} onSort={toggleSort} alignRight /><th><span className="sr-only">Aktion</span></th></tr></thead>
                <tbody>{filtered.map((invoice) => {
                  const actualStatus = effectiveStatus(invoice)
                  const period = invoice.versionId ? invoice.period : billingPeriodFromItems(invoice.items, invoice.invoiceDate)
                  return (
                    <tr className={invoice.id === selectedId ? 'is-selected' : ''} key={invoice.id} onClick={() => openDetails(invoice)}>
                      <td><button ref={(node) => { if (node && invoice.id === selectedId && !detailTriggerRef.current) detailTriggerRef.current = node }} className="button button--text invoice-detail-link" type="button" onClick={(event) => { event.stopPropagation(); openDetails(invoice, event.currentTarget) }}>{invoice.number ?? 'Entwurf'}</button>{invoice.versionId && !isActiveClaim(state, invoice) && <small>Ersetzt</small>}<small>{formatDate(invoice.invoiceDate)}</small></td>
                      <td>{guardianName(invoice, state.guardians)}<small>{studentName(invoice, state.students)}</small></td>
                      <td>{period}</td>
                      <td><span className={`status-chip status-chip--${actualStatus}`}><i />{statusLabel[actualStatus]}</span></td>
                      <td className="align-right"><strong>{euro.format(invoiceTotal(invoice))}</strong></td>
                      <td className="invoice-row-actions" onClick={(event) => event.stopPropagation()}>
                        <div className="invoice-row-menu">
                          <button className="icon-button icon-button--small" type="button" aria-haspopup="menu" aria-expanded={menu?.invoiceId === invoice.id} aria-controls={`invoice-menu-${invoice.id}`} onClick={(event) => toggleMenu(event.currentTarget, invoice)} aria-label={`Aktionen für ${invoice.number ?? 'Entwurf'} öffnen`}><MoreVertical aria-hidden="true" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}</tbody>
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
              onToast={onToast}
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
          <button type="button" role="menuitem" disabled={isFinalizedInvoice(menuInvoice)} title={isFinalizedInvoice(menuInvoice) ? FINALIZED_INVOICE_BLOCKED : undefined} onClick={() => chooseMenuAction('edit', menuInvoice)}><Edit3 aria-hidden="true" /> Bearbeiten</button>
          <button type="button" role="menuitem" onClick={() => chooseMenuAction('pdf', menuInvoice)}><Printer aria-hidden="true" /> {menuInvoice.status === 'draft' ? 'Vorschau' : 'PDF generieren'}</button>
          <button type="button" role="menuitem" onClick={() => chooseMenuAction('duplicate', menuInvoice)}><Copy aria-hidden="true" /> Duplizieren</button>
          <button className="is-danger" type="button" role="menuitem" onClick={() => chooseMenuAction('delete', menuInvoice)}><Trash2 aria-hidden="true" /> {isFinalizedInvoice(menuInvoice) ? 'Archivieren / zurückholen' : 'Löschen'}</button>
        </div>,
        document.body,
      )}
    </div>
  )
}

function SortableHeader({ label, sortKey, sort, onSort, alignRight = false }: {
  label: string
  sortKey: InvoiceSortKey
  sort: { key: InvoiceSortKey; direction: SortDirection }
  onSort: (key: InvoiceSortKey) => void
  alignRight?: boolean
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
  const nextDirection = active && sort.direction === 'asc' ? 'absteigend' : 'aufsteigend'
  return (
    <th className={alignRight ? 'align-right' : undefined} aria-sort={active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
      <button className={`sort-button ${active ? 'is-active' : ''} ${alignRight ? 'sort-button--right' : ''}`} type="button" onClick={() => onSort(sortKey)} aria-label={`${label}: ${nextDirection} sortieren`}><span>{label}</span><Icon aria-hidden="true" /></button>
    </th>
  )
}

function InvoiceDetail({ invoice, state, onClose, onEdit, onDuplicate, onDelete, onSetStatus, onPrint, onToast, onSelect, onCorrection, onAllocatePayment, onResolveConflicts }: DocumentHistoryActions & {
  invoice: Invoice
  state: AppState
  onSelect: (id: string) => void
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSetStatus: (status: InvoiceStatus, paymentDay?: string) => void
  onPrint: () => void
  onToast: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const status = effectiveStatus(invoice)
  const period = invoice.versionId ? invoice.period : billingPeriodFromItems(invoice.items, invoice.invoiceDate)
  const reminder = createReminder(invoice, state.guardians, state.students)
  const mailto = commandResult(() => mailtoUrl(invoice, state.guardians, state.students))
  const canRemind = (status === 'sent' || status === 'overdue') && isActiveClaim(state, invoice) && openCents(state, invoice) === invoiceTotalCents(invoice) && !state.payments.some((payment) => state.documentVersions.find((version) => version.id === payment.sourceVersionId)?.originalId === state.documentVersions.find((version) => version.id === invoice.versionId)?.originalId && payment.allocations.at(-1)?.versionId !== invoice.versionId)
  const payment = state.payments.find((entry) => entry.allocations.at(-1)?.versionId === invoice.versionId && entry.amountCents === invoiceTotalCents(invoice))
  const [paymentDay, setPaymentDay] = useState('')

  useEffect(() => {
    setPaymentDay(payment?.paymentDayStatus === 'confirmed' ? payment.paidAt ?? '' : '')
  }, [invoice.id, payment?.id, payment?.paidAt, payment?.paymentDayStatus])

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [invoice.id])

  const copyReminder = async () => {
    await navigator.clipboard.writeText(`${reminder.subject}\n\n${reminder.body}`)
    onToast('Erinnerungstext kopiert.', 'success')
  }

  return (
    <aside className="surface invoice-detail" aria-label={`Details zu ${invoice.number ?? 'Entwurf'}`}>
      <header className="invoice-detail__header">
        <div><p className="eyebrow">Rechnung</p><h2>{invoice.number ?? 'Entwurf'}</h2><p>{guardianName(invoice, state.guardians)}</p></div>
        <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Detailansicht schließen">×</button>
      </header>
      <div className="invoice-detail__amount"><strong>{euro.format(invoiceTotal(invoice))}</strong><span className={`status-chip status-chip--${status}`}><i />{statusLabel[status]}</span></div>
      <dl className="detail-list">
        <div><dt><CalendarDays aria-hidden="true" /> Leistungszeitraum</dt><dd>{period}</dd></div>
        <div><dt>Rechnungsdatum</dt><dd>{formatDateLong(invoice.invoiceDate)}</dd></div>
        <div><dt>Fällig am</dt><dd>{formatDateLong(invoice.dueDate)}</dd></div>
        <div><dt>Unterricht für</dt><dd>{studentName(invoice, state.students)}</dd></div>
        <div><dt>Positionen</dt><dd>{invoice.items.length}</dd></div>
      </dl>

      <div className="detail-actions">
        {invoice.status === 'draft' ? (
          <><button className="button button--primary" type="button" onClick={() => onSetStatus('sent')}><Send aria-hidden="true" /> Finalisieren</button><button className="button button--tonal" type="button" onClick={onPrint}><Printer aria-hidden="true" /> Vorschau</button><button className="button button--text" type="button" onClick={onEdit}><Edit3 aria-hidden="true" /> Bearbeiten</button></>
        ) : (
          <><button className="button button--primary" onClick={onPrint}><Printer aria-hidden="true" /> PDF / Drucken</button><button className="button button--tonal" onClick={onEdit} disabled><Edit3 aria-hidden="true" /> Rechnung bearbeiten</button></>
        )}
        {invoice.status !== 'draft' && <div className="status-editor">
          <span className="status-editor__label" id={`invoice-status-${invoice.id}`}>Forderungsstatus</span>
          <div className="status-editor__choices" role="group" aria-labelledby={`invoice-status-${invoice.id}`}>
            <button className="button button--tonal" type="button" aria-pressed={status === 'sent'} onClick={() => onSetStatus('sent')}>Versendet / offen</button>
            <button className="button button--tonal" type="button" aria-pressed={status === 'overdue'} onClick={() => onSetStatus('overdue')}>Überfällig</button>
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

      <DocumentHistory key={invoice.id} state={state} invoice={invoice} onSelect={onSelect} onCorrection={onCorrection} onAllocatePayment={onAllocatePayment} onResolveConflicts={onResolveConflicts} />
      {needsHistoricalSplitReview(state, invoice) && <p className="notice" role="status">Historische Aufteilung ungeklärt: Dieser übernommene Beleg wird nicht automatisch zusammengelegt oder umgeschrieben. Prüfe Empfänger, Kind, Positionen und Betrag; notwendige Änderungen erfolgen über den Korrekturweg.</p>}
      {isFinalizedInvoice(invoice) && <p className="field-hint" role="status">{FINALIZED_INVOICE_BLOCKED}</p>}

      {canRemind && (
        <section className="reminder-panel">
          <div><Mail aria-hidden="true" /><div><strong>Zahlungserinnerung</strong><p>Fertig formuliert, ohne automatischen Versand.</p></div></div>
          <div className="button-row">{mailto.ok ? <a className="button button--text" href={mailto.value}><Mail aria-hidden="true" /> E-Mail öffnen</a> : <p role="alert">{mailto.errors.map((error) => error.message).join(' ')}</p>}<button className="button button--text" onClick={copyReminder}><Copy aria-hidden="true" /> Text kopieren</button></div>
        </section>
      )}

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
