import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CheckCheck, Clock3, Download, FilePenLine, FilePlus2, LayoutDashboard, Plus } from 'lucide-react'
import type { AppState, PageKey } from '../types'
import { EmptyState } from '../components/EmptyState'
import { DashboardNumber } from '../components/DashboardNumber'
import { StatusChip } from '../components/StatusChip'
import { usePageEntrance, staggerStyle } from '../hooks/usePageEntrance'
import { DashboardMonthlyChart } from '../components/DashboardMonthlyChart'
import { dashboardStats } from '../lib/dashboardStats'
import { dashboardBackupDue, dashboardGreeting, dashboardMonthlyAverage, dashboardNextDue, dashboardDeadlineProgress } from '../lib/dashboardPresentation'
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
  const entrance = usePageEntrance(state)
  const entryClass = entrance ? ' motion-fade motion-stagger page-entry' : ''
  const showBackup = mode === 'real' && state.invoices.length > 0 && dashboardBackupDue(lastBackupAt, now)
  const nextDue = dashboardNextDue(stats.open.items)
  const average = dashboardMonthlyAverage(stats.monthly, now)
  const empty = !state.invoices.length && !stats.people.guardians && !stats.people.students

  return <div className="page dashboard-page">
    <header className="page-header dashboard-header">
      <div><p className="eyebrow">Dashboard</p><h1 tabIndex={-1}>{dashboardGreeting(state.settings.issuer.name, now)}</h1><p><time dateTime={localToday(now)}>{todayFormatter.format(now)}</time></p>
        {!state.settings.issuer.name.trim() && <p className="dashboard-name-hint">Deinen Namen kannst du in den <button className="button button--text" aria-label="Namen in den Einstellungen hinterlegen" onClick={() => onNavigate('settings')}>Einstellungen</button> hinterlegen.</p>}
      </div>
      {stats.people.students > 0 && <button className="button button--primary button--large" onClick={onNew}><FilePlus2 aria-hidden="true" /> Neue Rechnung</button>}
    </header>

    {empty && <section className="surface dashboard-empty" aria-label="Einrichtung"><EmptyState icon={LayoutDashboard} title="Willkommen bei RiffRechnung" description="Lege deine erste Person an und hinterlege Absender und Konto in den Einstellungen. Dann kann die erste Rechnung starten." action={<div className="button-row"><button className="button button--primary" onClick={onNewPerson}><Plus aria-hidden="true" /> Person anlegen</button><button className="button button--tonal" onClick={onNew}><FilePlus2 aria-hidden="true" /> Neue Rechnung</button></div>} /></section>}
    {onLoadDemo && <button className="button button--text dashboard-demo" onClick={onLoadDemo}>Mit Beispieldaten testen</button>}

    <div className="dashboard-grid">
      <article className={`surface dashboard-stat dashboard-stat--open${entryClass}`} style={staggerStyle(0)} aria-labelledby="dashboard-open">
        <span className="dashboard-stat__icon" aria-hidden="true"><Clock3 /></span><h2 id="dashboard-open">Offen</h2><DashboardNumber value={stats.open.totalCents} money />
        <div className="dashboard-stat__chips"><span className="dashboard-chip">{stats.open.count} {stats.open.count === 1 ? 'Rechnung' : 'Rechnungen'}</span>
          <span className={`dashboard-chip dashboard-chip--${stats.open.overdueCount ? 'error' : 'success'}`}>{stats.open.overdueCount ? `${stats.open.overdueCount} ${stats.open.overdueCount === 1 ? 'Rechnung' : 'Rechnungen'} überfällig · ${euro.format(stats.open.overdueCents / 100)}` : 'Nichts überfällig'}</span>
        </div>
        <p className="dashboard-stat__next">Nächste Fälligkeit · {nextDue ? <><time dateTime={nextDue.dueDate}>{formatDate(nextDue.dueDate)}</time> · {nextDue.daysUntilDue === 0 ? 'heute' : `in ${days(nextDue.daysUntilDue, true)}`}</> : 'Keine anstehende Fälligkeit'}</p>
      </article>
      <article className={`surface dashboard-stat dashboard-stat--paid${entryClass}`} style={staggerStyle(1)} aria-labelledby="dashboard-paid"><span className="dashboard-stat__icon" aria-hidden="true"><CheckCheck /></span><h2 id="dashboard-paid">Bezahlt</h2><DashboardNumber value={stats.paid.yearCents} money /><p>Zahlungseingang {stats.monthly.year}</p><p>Ø {euro.format(average / 100)} pro Monat</p>{stats.paid.withoutConfirmedDay.count > 0 && <p className="dashboard-stat__note">{stats.paid.withoutConfirmedDay.count} {stats.paid.withoutConfirmedDay.count === 1 ? 'Zahlung' : 'Zahlungen'} ohne bestätigten Zahlungstag: {euro.format(stats.paid.withoutConfirmedDay.cents / 100)} (keinem Jahr zugeordnet)</p>}</article>
      <article className={`surface dashboard-stat dashboard-stat--draft${entryClass}`} style={staggerStyle(2)} aria-labelledby="dashboard-drafts"><span className="dashboard-stat__icon" aria-hidden="true"><FilePenLine /></span><h2 id="dashboard-drafts">Entwürfe (nicht finalisiert)</h2><DashboardNumber value={stats.drafts.totalCents} money /><p>{stats.drafts.totalCount} {stats.drafts.totalCount === 1 ? 'Entwurf' : 'Entwürfe'}</p>{stats.drafts.uncalculableCount > 0 && <p className="dashboard-stat__note">{stats.drafts.uncalculableCount} {stats.drafts.uncalculableCount === 1 ? 'Entwurf ist' : 'Entwürfe sind'} nicht berechenbar und fehlen im Betrag.</p>}</article>
      <section className="surface dashboard-people" aria-label="Personenzähler">
        <article className={`dashboard-stat${entryClass}`} style={staggerStyle(3)} aria-labelledby="dashboard-parents"><h2 id="dashboard-parents">Eltern</h2><DashboardNumber value={stats.people.guardians} /><p>Erziehungsberechtigte</p></article>
        <article className={`dashboard-stat${entryClass}`} style={staggerStyle(4)} aria-labelledby="dashboard-children"><h2 id="dashboard-children">Kinder</h2><DashboardNumber value={stats.people.students} /><p>Lernende · davon aktiv: {stats.people.activeStudents}</p></article>
      </section>

    <section className="surface dashboard-unpaid" aria-labelledby="dashboard-unpaid-title">
      <header className="dashboard-section-heading"><h2 id="dashboard-unpaid-title">Noch nicht gezahlt ({stats.open.count})</h2></header>
      {stats.open.count === 0 ? <EmptyState icon={CheckCheck} title={state.invoices.length ? 'Alles bezahlt' : 'Noch keine offenen Rechnungen'} description={state.invoices.length ? 'Hier ist alles erledigt. Sobald eine Rechnung offen ist, findest du sie hier.' : 'Deine offenen finalisierten Rechnungen erscheinen hier.'} /> : <ul className="dashboard-open-list">
        {stats.open.items.slice(0, 8).map((item, index) => <li key={item.invoiceId} className={entryClass} style={staggerStyle(index)}><button className="dashboard-open-row" onClick={() => onOpenInvoice(item.invoiceId)}>
          <span className="dashboard-open-row__person"><strong>{item.number}</strong><span>{item.recipientLabel}</span><small>{item.studentLabel}</small></span>
          <strong className="dashboard-open-row__amount">{euro.format(item.openCents / 100)}</strong>
          <span className="dashboard-open-row__dates"><StatusChip status={item.isOverdue ? 'overdue' : 'sent'}>{item.isOverdue ? `${days(item.daysOverdue)} überfällig` : item.daysUntilDue === 0 ? 'Heute fällig' : `Fällig in ${days(item.daysUntilDue, true)}`} · {formatDate(item.dueDate)}</StatusChip><small>Rechnung vom {formatDate(item.invoiceDate)} · seit {days(item.daysSinceInvoice, true)} offen</small></span>
          <span className={`dashboard-deadline${item.isOverdue ? ' dashboard-deadline--overdue' : ''}`} aria-hidden="true" style={{ '--progress': `${dashboardDeadlineProgress(item) * 100}%` } as CSSProperties}><i /></span>
        </button></li>)}
      </ul>}
      {stats.open.count > 8 && <footer className="dashboard-unpaid__footer"><button className="button button--text" onClick={onShowUnpaid}>Alle in Rechnungen anzeigen</button></footer>}
    </section>

    <DashboardMonthlyChart monthly={stats.monthly} onYearChange={setYear} currentDate={now} />
    </div>
    {showBackup && <section className="surface dashboard-backup" aria-labelledby="dashboard-backup-title"><div><h2 id="dashboard-backup-title">Zeit für ein Backup</h2><p>Sichere deinen gespeicherten Bestand als JSON-Datei außerhalb dieses Browserprofils.</p></div><button className="button button--tonal" onClick={onExport}><Download aria-hidden="true" /> JSON exportieren</button></section>}
  </div>
}



