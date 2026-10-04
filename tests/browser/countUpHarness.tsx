import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { CountUpProbe } from './CountUpProbe'

export function mountCountUp(value: number) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const update = (next: number) => flushSync(() => root.render(<StrictMode><CountUpProbe value={next} /></StrictMode>))
  update(value)
  return { update, unmount: () => { flushSync(() => root.unmount()); host.remove() } }
}
