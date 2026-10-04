import { staggerStyle } from '../hooks/usePageEntrance'
import type { DashboardStats } from '../lib/dashboardStats'
import { euro } from '../lib/utils'

const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const shortMonths = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export function DashboardMonthlyChart({ monthly, onYearChange }: { monthly: DashboardStats['monthly']; onYearChange: (year: number) => void }) {
  const maximum = Math.max(1, ...monthly.months.map((month) => month.cents))
  return <section className="surface dashboard-monthly" aria-labelledby="dashboard-monthly-title">
    <header className="dashboard-section-heading">
      <div><h2 id="dashboard-monthly-title">Zahlungseingang pro Monat</h2><p>Bestätigte Zahlungstage · {monthly.year}</p></div>
      <label className="select-field"><span className="sr-only">Jahr für Zahlungseingang</span><select value={monthly.year} onChange={(event) => onYearChange(Number(event.target.value))}>{monthly.availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
    </header>
    <div className="dashboard-chart-scroll" tabIndex={0} role="group" aria-label="Monatsdiagramm, bei Bedarf horizontal scrollen">
      <ol className="dashboard-chart" aria-hidden="true">
        {monthly.months.map(({ month, cents }) => {
          // Geometry only: all monetary values remain the supplied integer cents.
          const height = cents ? cents / maximum * 120 : 2
          return <li key={`${monthly.year}-${month}`} className={`dashboard-chart__month ${cents ? '' : 'dashboard-chart__month--empty'}`}>
            <span className="dashboard-chart__value">{euro.format(cents / 100)}</span>
            <svg className="dashboard-chart__bar motion-stagger" style={staggerStyle((month - 1) / 2)} viewBox="0 0 24 120" preserveAspectRatio="none" focusable="false"><rect x="3" y={120 - height} width="18" height={height} rx="2" /></svg>
            <span>{shortMonths[month - 1]}</span>
          </li>
        })}
      </ol>
    </div>
    <div className="sr-only"><table><caption>Zahlungseingang pro Monat {monthly.year}, nur bestätigte Zahlungstage</caption><thead><tr><th scope="col">Monat</th><th scope="col">Betrag</th></tr></thead><tbody>{monthly.months.map(({ month, cents }) => <tr key={month}><th scope="row">{monthNames[month - 1]}</th><td>{euro.format(cents / 100)}</td></tr>)}</tbody></table></div>
  </section>
}

