import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useCountUp } from '../../src/hooks/useCountUp'

function Probe({ value }: { value: number }) {
  const displayed = useCountUp(value)
  return <output className="count-up-probe" data-end={value}>{displayed}</output>
}

export function mountCountUp(value: number) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const update = (next: number) => flushSync(() => root.render(<StrictMode><Probe value={next} /></StrictMode>))
  update(value)
  return { update, unmount: () => { flushSync(() => root.unmount()); host.remove() } }
}
