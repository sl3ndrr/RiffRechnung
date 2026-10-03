import { useEffect, useMemo, useState } from 'react'
import { CheckCheck, Download, FilePlus2, LayoutDashboard, Plus } from 'lucide-react'
import type { AppState, PageKey } from '../types'
import { EmptyState } from '../components/EmptyState'
import { DashboardMonthlyChart } from '../components/DashboardMonthlyChart'
import { dashboardStats } from '../lib/dashboardStats'
import { dashboardBackupDue, dashboardGreeting } from '../lib/dashboardPresentation'
import { localToday } from '../lib/calendar'
import { euro, formatDate } from '../lib/utils'

const systemClock = () => new Date()
const todayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const days = (count: number, dative = false) => `${count} ${count === 1 ? 'Tag' : dative ? 'Tagen' : 'Tage'}`

interface DashboardProps {
  state: AppState
  mode: 'real' | 'demo'
  lastBackupAt: string | null
  clock?: () => Date
  onNavigate: (page: PageKey) => void
  onNew: () => void
  onNewPerson: () => void
  onOpenInvoice: (id: string) => void
  onShowUnpaid: () => void
  onExport: () => void
  onLoadDemo?: () => void
}

export function Dashboard({ state, mode, lastBackupAt, clock = systemClock, onNavigate, onNew, onNewPerson, onOpenInvoice, onShowUnpaid, onExport, onLoadDemo }: DashboardProps) {
  const [now, setNow] = useState(clock)
  const [year, setYear] = useState<number>()
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clock()), 60_000)
    return () => window.clearInterval(timer)
  }, [clock])
  const stats = useMemo(() => dashboardStats(state, now, year), [state, now, year])
  const showBackup = mode === 'real' && state.invoices.length > 0 && dashboardBackupDue(lastBackupAt, now)
  const empty = !state.invoices.length && !stats.people.guardians && !stats.people.students

  return <div className="page dashboard-page">
    <header className="page-header dashboard-header">
      <div><p className="eyebrow">Dashboard</p><h1>{dashboardGreeting(state.settings.issuer.name, now)}</h1><p><time dateTime={localToday(now)}>{todayFormatter.format(now)}</time></p>
        {!state.settings.issuer.name.trim() && <p className="dashboard-name-hint">Deinen Namen kannst du in den <button className="button button--text" aria-label="Namen in den Einstellungen hinterlegen" onClick={() => onNavigate('settings')}>Einstellungen</button> hinterlegen.</p>}
      </div>
      {stats.people.students > 0 && <button className="button button--primary button--large" onClick={onNew}><FilePlus2 aria-hidden="true" /> Neue Rechnung</button>}
    </header>

    {empty && <section className="surface dashboard-empty" aria-label="Einrichtung"><EmptyState icon={LayoutDashboard} title="Willkommen bei RiffRechnung" description="Lege deine erste Person an und hinterlege Absender und Konto in den Einstellungen. Dann kann die erste Rechnung starten." action={<div className="button-row"><button className="button button--primary" onClick={onNewPerson}><Plus aria-hidden="true" /> Person anlegen</button><button className="button button--tonal" onClick={onNew}><FilePlus2 aria-hidden="true" /> Neue Rechnung</button></div>} /></section>}
    {onLoadDemo && <button className="button button--text dashboard-demo" onClick={onLoadDemo}>Mit Beispieldaten testen</button>}

    <section className="dashboard-amounts" aria-label="Beträge">
      <article className="surface dashboard-stat" aria-labelledby="dashboard-paid"><h2 id="dashboard-paid">Bezahlt</h2><strong className="dashboard-stat__value">{euro.format(stats.paid.yearCents / 100)}</strong><p>Zahlungseingang {stats.monthly.year}</p>{stats.paid.withoutConfirmedDay.count > 0 && <p className="dashboard-stat__note">{stats.paid.withoutConfirmedDay.count} {stats.paid.withoutConfirmedDay.count === 1 ? 'Zahlung' : 'Zahlungen'} ohne bestätigten Zahlungstag: {euro.format(stats.paid.withoutConfirmedDay.cents / 100)} (keinem Jahr zugeordnet)</p>}</article>
      <article className="surface dashboard-stat" aria-labelledby="dashboard-open"><h2 id="dashboard-open">Offen</h2><strong className="dashboard-stat__value">{euro.format(stats.open.totalCents / 100)}</strong><p>{stats.open.count} {stats.open.count === 1 ? 'Rechnung' : 'Rechnungen'}</p><p className="dashboard-stat__note">davon überfällig: {euro.format(stats.open.overdueCents / 100)}, {stats.open.overdueCount} {stats.open.overdueCount === 1 ? 'Rechnung' : 'Rechnungen'}</p></article>
      <article className="surface dashboard-stat" aria-labelledby="dashboard-drafts"><h2 id="dashboard-drafts">Entwürfe (nicht finalisiert)</h2><strong className="dashboard-stat__value">{euro.format(stats.drafts.totalCents / 100)}</strong><p>{stats.drafts.totalCount} {stats.drafts.totalCount === 1 ? 'Entwurf' : 'Entwürfe'}</p>{stats.drafts.uncalculableCount > 0 && <p className="dashboard-stat__note">{stats.drafts.uncalculableCount} {stats.drafts.uncalculableCount === 1 ? 'Entwurf ist' : 'Entwürfe sind'} nicht berechenbar und fehlen im Betrag.</p>}</article>
    </section>

    <section className="dashboard-people" aria-label="Personenzähler">
      <article className="surface dashboard-stat" aria-labelledby="dashboard-parents"><h2 id="dashboard-parents">Eltern</h2><strong className="dashboard-stat__value">{stats.people.guardians}</strong><p>Erziehungsberechtigte</p></article>
      <article className="surface dashboard-stat" aria-labelledby="dashboard-children"><h2 id="dashboard-children">Kinder</h2><strong className="dashboard-stat__value">{stats.people.students}</strong><p>Lernende · davon aktiv: {stats.people.activeStudents}</p></article>
    </section>

    <section className="surface dashboard-unpaid" aria-labelledby="dashboard-unpaid-title">
      <header className="dashboard-section-heading"><h2 id="dashboard-unpaid-title">Noch nicht gezahlt ({stats.open.count})</h2></header>
      {stats.open.count === 0 ? <EmptyState icon={CheckCheck} title={state.invoices.length ? 'Alles bezahlt' : 'Noch keine offenen Rechnungen'} description={state.invoices.length ? 'Hier ist alles erledigt. Sobald eine Rechnung offen ist, findest du sie hier.' : 'Deine offenen finalisierten Rechnungen erscheinen hier.'} /> : <ul className="dashboard-open-list">
        {stats.open.items.slice(0, 8).map((item) => <li key={item.invoiceId}><button className="dashboard-open-row" onClick={() => onOpenInvoice(item.invoiceId)}>
          <span className="dashboard-open-row__person"><strong>{item.number}</strong><span>{item.recipientLabel}</span><small>{item.studentLabel}</small></span>
          <span className="dashboard-open-row__dates"><span>Rechnung vom {formatDate(item.invoiceDate)}</span><small>seit {days(item.daysSinceInvoice, true)} offen</small><span>Fällig am {formatDate(item.dueDate)}</span><span className={`status-chip status-chip--${item.isOverdue ? 'overdue' : 'sent'}`}>{item.isOverdue ? `${days(item.daysOverdue)} überfällig` : item.daysUntilDue === 0 ? 'heute fällig' : `fällig in ${days(item.daysUntilDue, true)}`}</span></span>
          <strong className="dashboard-open-row__amount">{euro.format(item.openCents / 100)}</strong>
        </button></li>)}
      </ul>}
      {stats.open.count > 8 && <footer className="dashboard-unpaid__footer"><button className="button button--text" onClick={onShowUnpaid}>Alle in Rechnungen anzeigen</button></footer>}
    </section>

    <DashboardMonthlyChart monthly={stats.monthly} onYearChange={setYear} />
    {showBackup && <section className="surface dashboard-backup" aria-labelledby="dashboard-backup-title"><div><h2 id="dashboard-backup-title">Zeit für ein Backup</h2><p>Sichere deinen gespeicherten Bestand als JSON-Datei außerhalb dieses Browserprofils.</p></div><button className="button button--tonal" onClick={onExport}><Download aria-hidden="true" /> JSON exportieren</button></section>}
  </div>
}
