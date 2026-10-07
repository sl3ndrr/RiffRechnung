import type { CSSProperties } from 'react'
import { staggerStyle } from '../hooks/usePageEntrance'
import type { DashboardStats } from '../lib/dashboardStats'
import { dashboardMonthlyAverage } from '../lib/dashboardPresentation'
import { euro } from '../lib/utils'

const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const shortMonths = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const chartAmount = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DashboardMonthlyChart({ monthly, onYearChange, currentDate }: { monthly: DashboardStats['monthly']; onYearChange: (year: number) => void; currentDate: Date }) {
  const maximum = Math.max(1, ...monthly.months.map((month) => month.cents))
  const average = dashboardMonthlyAverage(monthly, currentDate)
  return <section className="surface dashboard-monthly" aria-labelledby="dashboard-monthly-title">
    <header className="dashboard-section-heading">
      <div><h2 id="dashboard-monthly-title">Zahlungseingang pro Monat</h2><p>Bestätigte Zahlungstage · {monthly.year} · Beträge in €</p></div>
      <label className="select-field"><span className="sr-only">Jahr für Zahlungseingang</span><select value={monthly.year} onChange={(event) => onYearChange(Number(event.target.value))}>{monthly.availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
    </header>
    <p className="dashboard-average"><span className="dashboard-chip">Ø {euro.format(average / 100)}</span><span> pro Monat</span></p>
    <div className="dashboard-chart-scroll" tabIndex={0} role="group" aria-label="Monatsdiagramm, bei Bedarf horizontal scrollen">
      <div className="dashboard-chart-plot" style={{ '--average': `${Math.min(100, average / maximum * 100)}%` } as CSSProperties}>
        <div className="dashboard-chart__average" aria-hidden="true" />
        <ol className="dashboard-chart" aria-hidden="true">
          {monthly.months.map(({ month, cents }) => {
            const currentYear = monthly.year === currentDate.getFullYear()
            const future = currentYear && month > currentDate.getMonth() + 1
            const label = chartAmount.format(cents / 100)
            return <li key={`${monthly.year}-${month}`} data-current={currentYear && month === currentDate.getMonth() + 1 ? 'true' : undefined} className={`dashboard-chart__month${cents ? '' : ' dashboard-chart__month--empty'}${future ? ' dashboard-chart__month--future' : ''}`}>
              <span className="dashboard-chart__value" title={euro.format(cents / 100)} style={{ '--chars': label.length } as CSSProperties}>{label}</span>
              <div className="dashboard-chart__track"><div className="dashboard-chart__bar motion-stagger" title={`${monthNames[month - 1]}: ${euro.format(cents / 100)}`} style={{ ...staggerStyle((month - 1) / 2), height: cents ? `${cents / maximum * 100}%` : undefined }} /></div>
              <span>{shortMonths[month - 1]}</span>
            </li>
          })}
        </ol>
      </div>
    </div>
    <div className="sr-only"><table><caption>Zahlungseingang pro Monat {monthly.year}, nur bestätigte Zahlungstage</caption><thead><tr><th scope="col">Monat</th><th scope="col">Betrag</th></tr></thead><tbody>{monthly.months.map(({ month, cents }) => <tr key={month}><th scope="row">{monthNames[month - 1]}</th><td>{euro.format(cents / 100)}</td></tr>)}</tbody></table></div>
  </section>
}
