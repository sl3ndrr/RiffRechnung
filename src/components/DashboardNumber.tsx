import { useCountUp } from '../hooks/useCountUp'
import { euro } from '../lib/utils'

export function DashboardNumber({ value, money = false }: { value: number; money?: boolean }) {
  const displayed = useCountUp(value)
  const format = (amount: number) => money ? euro.format(amount / 100) : String(amount)
  return <><span className="dashboard-number"><span className="dashboard-number__sizer" aria-hidden="true">{format(value)}</span><strong className="dashboard-stat__value" aria-hidden="true">{format(displayed)}</strong></span><span className="sr-only dashboard-stat__end">{format(value)}</span></>
}
