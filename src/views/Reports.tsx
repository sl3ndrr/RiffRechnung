import { CalendarRange, CheckCircle2, Download, ReceiptText, TrendingUp, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AppState } from '../types'
import { financialReport, financialReportToCsv, reportYears, unknownPaymentDayLabel } from '../lib/reporting'
import { downloadText, euro, formatDate, guardianName, invoiceTotal, statusLabel } from '../lib/utils'
import { localToday } from '../lib/calendar'

export function Reports({ state }: { state: AppState }) {
  const availableYears = reportYears(state)
  const [year, setYear] = useState(availableYears[0] ?? new Date().getFullYear())
  const report = useMemo(() => financialReport(state, year), [state, year])
  const max = Math.max(...report.months.map((month) => Math.max(month.invoiceVolumeCents, month.paymentIncomeCents)), 1)
  const canExport = report.invoices.length > 0 || report.payments.length > 0 || report.unknownDatePayments.length > 0

  const exportCsv = () => {
    downloadText(`jahresauswertung-${year}.csv`, financialReportToCsv(state, year), 'text/csv;charset=utf-8')
  }

  return (
    <div className="page reports-page">
      <header className="page-header">
        <div><p className="eyebrow">Auswertung</p><h1>Jahresübersicht</h1><p>Rechnungsvolumen und tatsächliche Zahlungseingänge werden getrennt ausgewiesen.</p></div>
        <div className="page-header__actions"><label className="select-field select-field--compact"><span className="sr-only">Jahr wählen</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{availableYears.length ? availableYears.map((value) => <option key={value}>{value}</option>) : <option>{year}</option>}</select></label><button className="button button--primary" onClick={exportCsv} disabled={!canExport}><Download aria-hidden="true" /> CSV exportieren</button></div>
      </header>

      <section className="report-hero">
        <div><span><TrendingUp aria-hidden="true" /></span><p>Rechnungsvolumen {year}</p><strong>{euro.format(report.invoiceVolumeCents / 100)}</strong><small>{report.invoices.length} aktuelle Rechnungen nach Rechnungsdatum</small></div>
        <div className="report-progress"><p>Zahlungseingänge {year}</p><strong>{euro.format(report.paymentIncomeCents / 100)}</strong><small>{report.payments.length} Zahlungen nach bestätigtem Zahlungstag</small></div>
      </section>

      <section className="metric-grid metric-grid--3">
        <article className="mini-metric"><span className="mini-metric__icon mini-metric__icon--blue"><ReceiptText aria-hidden="true" /></span><div><p>Rechnungen {year}</p><strong>{report.invoices.length}</strong></div></article>
        <article className="mini-metric"><span className="mini-metric__icon mini-metric__icon--green"><CheckCircle2 aria-hidden="true" /></span><div><p>Zahlungseingänge {year}</p><strong>{report.payments.length}</strong></div></article>
        <article className="mini-metric"><span className="mini-metric__icon mini-metric__icon--red"><TriangleAlert aria-hidden="true" /></span><div><p>Offene Forderungen am {formatDate(localToday())}</p><strong>{euro.format(report.openClaimsCents / 100)}</strong></div></article>
      </section>

      <div className="reports-grid">
        <section className="surface annual-chart-card">
          <div className="section-heading"><div><p className="eyebrow">Monatsvergleich</p><h2>Rechnungsvolumen {year}</h2></div></div>
          <div className="annual-chart" role="img" aria-label={`Rechnungsvolumen ${year} nach Monat: ${report.months.map((month) => `${month.key} ${euro.format(month.invoiceVolumeCents / 100)}`).join(', ')}`}>
            {report.months.map((month) => <div className="annual-chart__month" key={month.key}><div className="annual-chart__track"><span style={{ height: `${Math.max(month.invoiceVolumeCents ? 5 : 0, month.invoiceVolumeCents / max * 100)}%` }} /></div><small>{new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(year, Number(month.key.slice(5, 7)) - 1, 1))}</small></div>)}
          </div>
        </section>
        <section className="surface report-note">
          <CalendarRange aria-hidden="true" />
          <h2>Für deine Unterlagen</h2>
          <p>Rechnungsvolumen richtet sich nach dem Rechnungsdatum. Zahlungseingänge richten sich ausschließlich nach dem bestätigten tatsächlichen Zahlungstag. Statusrücknahmen und Korrekturen ändern keinen bereits erfassten Geldfluss.</p>
          <button className="button button--tonal" onClick={exportCsv} disabled={!canExport}><Download aria-hidden="true" /> {year} als CSV</button>
        </section>
      </div>

      <section className="surface monthly-table-card">
        <div className="section-heading"><div><p className="eyebrow">Details</p><h2>Monate {year}</h2></div></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Monat</th><th>Rechnungen</th><th className="align-right">Rechnungsvolumen</th><th className="align-right">Zahlungseingänge</th></tr></thead><tbody>{report.months.map((month) => <tr key={month.key}><td><strong>{new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(year, Number(month.key.slice(5, 7)) - 1, 1))}</strong></td><td>{month.invoiceCount || '–'}</td><td className="align-right">{month.invoiceVolumeCents ? euro.format(month.invoiceVolumeCents / 100) : '–'}</td><td className="align-right">{month.paymentIncomeCents ? euro.format(month.paymentIncomeCents / 100) : '–'}</td></tr>)}</tbody></table></div>
      </section>

      {report.unknownDatePayments.length > 0 && <section className="surface export-preview"><div className="section-heading"><div><p className="eyebrow">Ohne Kalenderjahr</p><h2>Zahlungsdatum unbekannt</h2><p>{euro.format(report.unknownDatePayments.reduce((sum, payment) => sum + payment.amountCents, 0) / 100)} werden keinem Jahr zugeschlagen. Du kannst den Zahlungstag in der Rechnung nachpflegen.</p></div></div><div className="compact-invoice-list">{report.unknownDatePayments.slice(0, 8).map((payment) => <div key={payment.id}><span><strong>{unknownPaymentDayLabel(payment)}</strong><small>Erfasst am {payment.recordedAt}</small></span><strong>{euro.format(payment.amountCents / 100)}</strong></div>)}</div></section>}

      {report.invoices.length > 0 && <section className="surface export-preview"><div className="section-heading"><div><p className="eyebrow">Rechnungsvolumen</p><h2>Aktuelle Belege {year}</h2></div></div><div className="compact-invoice-list">{report.invoices.slice(0, 8).map((invoice) => <div key={invoice.id}><span><strong>{invoice.number}</strong><small>{guardianName(invoice, state.guardians)} · {formatDate(invoice.invoiceDate)}</small></span><span className={`status-chip status-chip--${invoice.status}`}><i />{statusLabel[invoice.status]}</span><strong>{euro.format(invoiceTotal(invoice))}</strong></div>)}</div></section>}
    </div>
  )
}
