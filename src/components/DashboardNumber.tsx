import type { CSSProperties } from 'react'
import { useCountUp } from '../hooks/useCountUp'
import { euro } from '../lib/utils'

export function DashboardNumber({ value, money = false }: { value: number; money?: boolean }) {
  const displayed = useCountUp(value)
  const format = (amount: number) => money ? euro.format(amount / 100) : String(amount)
  const end = format(value)
  return <><span className="dashboard-number" style={{ '--chars': end.length } as CSSProperties}><span className="dashboard-number__sizer" aria-hidden="true">{end}</span><strong className="dashboard-stat__value" aria-hidden="true">{format(displayed)}</strong></span><span className="sr-only dashboard-stat__end">{end}</span></>
}
