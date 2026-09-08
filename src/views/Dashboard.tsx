import { sumCents } from '../lib/money'
import { activeInvoices, openCents, selectedInvoices } from '../lib/documents'
import { financialReport } from '../lib/reporting'
import { ArrowRight, Banknote, CheckCircle2, Clock3, FilePlus2, ReceiptText, Sparkles, TriangleAlert, Users } from 'lucide-react'
import type { AppState, PageKey } from '../types'
import { effectiveStatus, euro, formatDate, guardianName, invoiceTotal, isInvoiceSetupComplete, monthLabel, statusLabel, studentName } from '../lib/utils'
import { localToday } from '../lib/calendar'

interface DashboardProps {
  state: AppState
  onNavigate: (page: PageKey) => void
  onNewInvoice: () => void
  onLoadDemo: () => void
  demoBlockedReason: string | null
  onOpenInvoice: (id: string) => void
}

export function Dashboard({ state, onNavigate, onNewInvoice, onLoadDemo, demoBlockedReason, onOpenInvoice }: DashboardProps) {
  const issuerReady = isInvoiceSetupComplete(state.settings)
  const completedSetupSteps = Number(issuerReady) + Number(state.students.length > 0)
  const finalized = activeInvoices(state)
  const overdue = finalized.filter((invoice) => effectiveStatus(invoice) === 'overdue')
  const year = new Date().getFullYear()
  const report = financialReport(state, year)
  const paidThisYear = report.paymentIncomeCents / 100
  const openTotal = report.openClaimsCents / 100
  const recent = selectedInvoices(state).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
  const monthly = getMonthlyData(state)
  const maxMonth = Math.max(...monthly.map((month) => month.amount), 1)

  if (!state.invoices.length && completedSetupSteps < 2) {
    return (
      <div className="page dashboard-page">
        <header className="page-header page-header--hero">
          <div className="onboarding-hero__copy">
            <p className="eyebrow">In zwei ruhigen Schritten</p>
            <h1>Alles bereit für deine erste Rechnung.</h1>
            <p>Zuerst Absender und Konto, dann eine Familie – so startest du vollständig eingerichtet und ohne Umwege.</p>
          </div>
          <div className="onboarding-hero__status">
            <div className="onboarding-progress" aria-live="polite">
              <span>Einrichtung</span>
              <strong>{completedSetupSteps} von 2 Schritten abgeschlossen</strong>
              <progress max={2} value={completedSetupSteps} aria-label={`Einrichtung: ${completedSetupSteps} von 2 Schritten abgeschlossen`} />
            </div>
            <button className="text-link onboarding-demo-link" type="button" onClick={onLoadDemo} disabled={Boolean(demoBlockedReason)} aria-describedby={demoBlockedReason ? 'demo-blocked' : undefined}>
              <Sparkles aria-hidden="true" /> Lieber erst mit Beispieldaten testen? <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </header>
        {demoBlockedReason && <p id="demo-blocked" className="field-hint" role="status">{demoBlockedReason}</p>}
        <section className="onboarding-grid" aria-label="Erste Schritte">
          <button className="onboarding-card onboarding-card--primary" onClick={() => onNavigate('settings')}>
            <span className="onboarding-card__step">01</span>
            <Banknote aria-hidden="true" />
            <h2>Absender & Konto</h2>
            <p>Rechnungssteller, Bankverbindung, Nummernkreis und Rechtstext hinterlegen.</p>
            <span className="text-link">Einstellungen öffnen <ArrowRight aria-hidden="true" /></span>
          </button>
          <button className="onboarding-card" onClick={() => onNavigate('people')}>
            <span className="onboarding-card__step">02</span>
            <Users aria-hidden="true" />
            <h2>Familie anlegen</h2>
            <p>Erziehungsberechtigte erfassen und ein oder mehrere Kinder zuordnen.</p>
            <span className="text-link">Familie erfassen <ArrowRight aria-hidden="true" /></span>
          </button>
          <button className="onboarding-card onboarding-card--soft" onClick={onLoadDemo} disabled={Boolean(demoBlockedReason)} aria-describedby={demoBlockedReason ? 'demo-blocked' : undefined}>
            <span className="onboarding-card__step"><Sparkles aria-hidden="true" /></span>
            <ReceiptText aria-hidden="true" />
            <h2>Mit Beispieldaten starten</h2>
            <p>Eine vollständig eingerichtete Beispielwelt laden und Rechnungen, Status und Auswertungen in Ruhe testen.</p>
            <span className="text-link">Demo ausprobieren <ArrowRight aria-hidden="true" /></span>
          </button>
        </section>
        <aside className="privacy-note">
          <span className="privacy-note__icon"><CheckCircle2 aria-hidden="true" /></span>
          <div><strong>Bleibt bei dir.</strong><p>Ohne Anmeldung, Tracking oder Cloud-Datenbank. Die App speichert ausschließlich lokal im Browser.</p></div>
        </aside>
      </div>
    )
  }

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Übersicht · {year}</p>
          <h1>Guten Tag{state.settings.issuer.name ? `, ${state.settings.issuer.name.split(' ')[0]}` : ''}.</h1>
          <p>Hier ist der aktuelle Stand deiner Unterrichtsrechnungen.</p>
        </div>
        <button className="button button--primary button--large" onClick={onNewInvoice}><FilePlus2 aria-hidden="true" /> Neue Rechnung</button>
      </header>

      <section className="metric-grid" aria-label="Kennzahlen">
        <article className="metric-card metric-card--blue">
          <span className="metric-card__icon"><Clock3 aria-hidden="true" /></span>
          <div><p>Offene Forderungen am {formatDate(localToday())}</p><strong>{euro.format(openTotal)}</strong><small>{report.openClaimCount} {report.openClaimCount === 1 ? 'Rechnung' : 'Rechnungen'}</small></div>
        </article>
        <article className="metric-card metric-card--green">
          <span className="metric-card__icon"><CheckCircle2 aria-hidden="true" /></span>
          <div><p>Zahlungseingänge {year}</p><strong>{euro.format(paidThisYear)}</strong><small>{report.payments.length} mit bestätigtem Zahlungstag{report.unknownDatePayments.length ? ` · ${report.unknownDatePayments.length} Zahlungsdatum unbekannt` : ''}</small></div>
        </article>
        <article className={`metric-card ${overdue.length ? 'metric-card--red' : 'metric-card--neutral'}`}>
          <span className="metric-card__icon"><TriangleAlert aria-hidden="true" /></span>
          <div><p>Überfällig</p><strong>{overdue.length}</strong><small>{overdue.length ? euro.format(sumCents(overdue.map((invoice) => openCents(state, invoice))) / 100) : 'Alles im grünen Bereich'}</small></div>
        </article>
        <article className="metric-card metric-card--purple">
          <span className="metric-card__icon"><Users aria-hidden="true" /></span>
          <div><p>Aktive Schüler:innen</p><strong>{state.students.filter((student) => student.active).length}</strong><small>{state.guardians.length} Erziehungsberechtigte</small></div>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="surface chart-card">
          <div className="section-heading">
            <div><p className="eyebrow">Zahlungseingänge</p><h2>Die letzten sechs Monate</h2></div>
            <button className="button button--text" onClick={() => onNavigate('reports')}>Jahresübersicht <ArrowRight aria-hidden="true" /></button>
          </div>
          <div className="bar-chart" role="img" aria-label={`Bezahlte Rechnungen der letzten sechs Monate: ${monthly.map((month) => `${month.label} ${euro.format(month.amount)}`).join(', ')}`}>
            {monthly.map((month) => (
              <div className="bar-chart__column" key={month.key}>
                <span className="bar-chart__value">{month.amount ? euro.format(month.amount).replace(',00 €', ' €') : '–'}</span>
                <div className="bar-chart__track"><div className="bar-chart__bar" style={{ height: `${Math.max(month.amount ? 14 : 2, month.amount / maxMonth * 100)}%` }} /></div>
                <span>{month.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface attention-card">
          <div className="section-heading">
            <div><p className="eyebrow">Aufmerksamkeit</p><h2>{overdue.length ? 'Zahlungen erinnern' : 'Alles erledigt'}</h2></div>
          </div>
          {overdue.length ? (
            <div className="attention-list">
              {overdue.slice(0, 3).map((invoice) => (
                <button key={invoice.id} onClick={() => onOpenInvoice(invoice.id)}>
                  <span className="avatar avatar--warm">{guardianName(invoice, state.guardians).slice(0, 1)}</span>
                  <span><strong>{guardianName(invoice, state.guardians)}</strong><small>{invoice.number} · fällig {formatDate(invoice.dueDate)}</small></span>
                  <strong>{euro.format(invoiceTotal(invoice))}</strong>
                </button>
              ))}
            </div>
          ) : (
            <div className="all-good"><CheckCircle2 aria-hidden="true" /><p>Aktuell ist keine Rechnung überfällig.</p></div>
          )}
        </section>
      </div>

      <section className="surface recent-card">
        <div className="section-heading">
          <div><p className="eyebrow">Zuletzt bearbeitet</p><h2>Rechnungen</h2></div>
          <button className="button button--text" onClick={() => onNavigate('invoices')}>Alle anzeigen <ArrowRight aria-hidden="true" /></button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Nummer</th><th>Familie / Kind</th><th>Zeitraum</th><th>Status</th><th className="align-right">Betrag</th></tr></thead>
            <tbody>{recent.map((invoice) => {
              const status = effectiveStatus(invoice)
              return (
                <tr key={invoice.id} onClick={() => onOpenInvoice(invoice.id)}>
                  <td><strong>{invoice.number ?? 'Entwurf'}</strong><small>{formatDate(invoice.invoiceDate)}</small></td>
                  <td>{guardianName(invoice, state.guardians)}<small>{studentName(invoice, state.students)}</small></td>
                  <td>{invoice.period}</td>
                  <td><span className={`status-chip status-chip--${status}`}><i />{statusLabel[status]}</span></td>
                  <td className="align-right"><strong>{euro.format(invoiceTotal(invoice))}</strong></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function getMonthlyData(state: AppState) {
  const result: Array<{ key: string; label: string; amount: number }> = []
  const now = new Date()
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const report = financialReport(state, date.getFullYear())
    const amount = (report.months.find((month) => month.key === key)?.paymentIncomeCents ?? 0) / 100
    result.push({ key, label: monthLabel(key), amount })
  }
  return result
}
