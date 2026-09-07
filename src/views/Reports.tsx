import { activeInvoices, openCents, selectedInvoices, recordedPayments } from '../lib/documents'
import { CalendarRange, CheckCircle2, Download, ReceiptText, TrendingUp, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AppState } from '../types'
import { effectiveStatus, euro, formatDate, guardianName, invoiceTotal, invoicesToCsv, monthKey, statusLabel } from '../lib/utils'
import { downloadText } from '../lib/utils'

export function Reports({ state }: { state: AppState }) {
  const availableYears = [...new Set(state.invoices.map((invoice) => invoice.year))].sort((a, b) => b - a)
  const [year, setYear] = useState(availableYears[0] ?? new Date().getFullYear())
  const invoices = useMemo(() => activeInvoices(state).filter((invoice) => invoice.year === year && invoice.number), [state, year])
  const paid = invoices.filter((invoice) => effectiveStatus(invoice) === 'paid')
  const open = invoices.filter((invoice) => ['sent', 'overdue'].includes(effectiveStatus(invoice)))
  const received = recordedPayments(state, year)
  const paidTotal = received.reduce((sum, payment) => sum + payment.amountCents / 100, 0)
  const billedTotal = invoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0)
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`
    const monthInvoices = invoices.filter((invoice) => monthKey(invoice.invoiceDate) === key)
    return {
      key,
      label: new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(year, index, 1)),
      count: monthInvoices.length,
      billed: monthInvoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0),
      paid: received.filter((payment) => monthKey(state.documentVersions.find((version) => version.id === payment.sourceVersionId)!.content.invoiceDate) === key).reduce((sum, payment) => sum + payment.amountCents / 100, 0),
    }
  })
  const max = Math.max(...monthly.map((month) => month.billed), 1)

  const exportCsv = () => {
    downloadText(`rechnungen-${year}.csv`, invoicesToCsv(selectedInvoices(state).filter((invoice) => invoice.year === year), state.guardians, state.students), 'text/csv;charset=utf-8')
  }

  return (
    <div className="page reports-page">
      <header className="page-header">
        <div><p className="eyebrow">Auswertung</p><h1>Jahresübersicht</h1><p>Zahlungen und offene Beträge als Vorbereitung für deine Unterlagen.</p></div>
        <div className="page-header__actions"><label className="select-field select-field--compact"><span className="sr-only">Jahr wählen</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{availableYears.length ? availableYears.map((value) => <option key={value}>{value}</option>) : <option>{year}</option>}</select></label><button className="button button--primary" onClick={exportCsv} disabled={!invoices.length}><Download aria-hidden="true" /> CSV exportieren</button></div>
      </header>

      <section className="report-hero">
        <div><span><TrendingUp aria-hidden="true" /></span><p>Erfasste Zahlungen zum Belegjahr {year}</p><strong>{euro.format(paidTotal)}</strong><small>von {euro.format(billedTotal)} in Rechnung gestellt</small></div>
        <div className="report-progress"><div><span style={{ width: `${billedTotal ? paidTotal / billedTotal * 100 : 0}%` }} /></div><p><strong>{billedTotal ? Math.round(paidTotal / billedTotal * 100) : 0}%</strong> bezahlt</p></div>
      </section>

      <section className="metric-grid metric-grid--3">
        <article className="mini-metric"><span className="mini-metric__icon mini-metric__icon--blue"><ReceiptText aria-hidden="true" /></span><div><p>Rechnungen</p><strong>{invoices.length}</strong></div></article>
        <article className="mini-metric"><span className="mini-metric__icon mini-metric__icon--green"><CheckCircle2 aria-hidden="true" /></span><div><p>Bezahlt</p><strong>{paid.length}</strong></div></article>
        <article className="mini-metric"><span className="mini-metric__icon mini-metric__icon--red"><TriangleAlert aria-hidden="true" /></span><div><p>Offen</p><strong>{euro.format(open.reduce((sum, invoice) => sum + openCents(state, invoice) / 100, 0))}</strong></div></article>
      </section>

      <div className="reports-grid">
        <section className="surface annual-chart-card">
          <div className="section-heading"><div><p className="eyebrow">Monatsvergleich</p><h2>In Rechnung gestellt</h2></div></div>
          <div className="annual-chart" role="img" aria-label={`Rechnungsvolumen ${year} nach Monat`}>
            {monthly.map((month) => <div className="annual-chart__month" key={month.key}><div className="annual-chart__track"><span style={{ height: `${Math.max(month.billed ? 5 : 0, month.billed / max * 100)}%` }} /></div><small>{month.label.slice(0, 3)}</small></div>)}
          </div>
        </section>
        <section className="surface report-note">
          <CalendarRange aria-hidden="true" />
          <h2>Für deine Unterlagen</h2>
          <p>Zahlungen werden einmal nach dem ursprünglichen Belegjahr angezeigt, auch vor einer manuellen Neuzuordnung. Der tatsächliche Zahlungstag bestimmt diese Jahreszuordnung noch nicht. Die Forderungsübersicht zählt jeweils die neueste finalisierte Version, auch im Archiv. Der CSV-Export erhält alle Versionen und kennzeichnet Korrekturbeziehungen. Er ersetzt keine steuerliche Beratung.</p>
          <button className="button button--tonal" onClick={exportCsv} disabled={!invoices.length}><Download aria-hidden="true" /> {year} als CSV</button>
        </section>
      </div>

      <section className="surface monthly-table-card">
        <div className="section-heading"><div><p className="eyebrow">Details</p><h2>Monate {year}</h2></div></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Monat</th><th>Rechnungen</th><th className="align-right">Gestellt</th><th className="align-right">Bezahlt</th></tr></thead><tbody>{monthly.map((month) => <tr key={month.key}><td><strong>{month.label}</strong></td><td>{month.count || '–'}</td><td className="align-right">{month.billed ? euro.format(month.billed) : '–'}</td><td className="align-right">{month.paid ? euro.format(month.paid) : '–'}</td></tr>)}</tbody></table></div>
      </section>

      {invoices.length > 0 && <section className="surface export-preview"><div className="section-heading"><div><p className="eyebrow">Enthaltene Belege</p><h2>Exportvorschau</h2></div></div><div className="compact-invoice-list">{invoices.slice(0, 8).map((invoice) => <div key={invoice.id}><span><strong>{invoice.number}</strong><small>{guardianName(invoice, state.guardians)} · {formatDate(invoice.invoiceDate)}</small></span><span className={`status-chip status-chip--${effectiveStatus(invoice)}`}><i />{statusLabel[effectiveStatus(invoice)]}</span><strong>{euro.format(invoiceTotal(invoice))}</strong></div>)}</div></section>}
    </div>
  )
}
