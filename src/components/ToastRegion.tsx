import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useCallback, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ToastMessage } from '../types'
import { useToastTimer } from '../hooks/useToastTimer'

interface ToastRegionProps {
  messages: ToastMessage[]
  onDismiss: (id: string) => void
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: ToastRegionProps['onDismiss'] }) {
  const dismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id])
  const durationMs = toast.durationMs ?? 4200
  const { paused, pause, claim } = useToastTimer(durationMs, dismiss)
  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? TriangleAlert : Info
  return (
    <div className={`toast toast--${toast.tone}${toast.action ? ' toast--action' : ''}`}
      onMouseEnter={() => pause('hover', true)} onMouseLeave={() => pause('hover', false)}
      onFocusCapture={() => pause('focus', true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pause('focus', false) }}>
      <Icon aria-hidden="true" />
      <span role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.message}</span>
      {toast.action && <button className="toast__action" type="button" aria-label={toast.action.ariaLabel ?? toast.action.label}
        onClick={() => { if (claim()) { dismiss(); void toast.action?.onClick() } }}> {toast.action.label} </button>}
      <button className="toast__dismiss" type="button" onClick={dismiss} aria-label="Meldung schließen"><X aria-hidden="true" /></button>
      {toast.action && <div className="toast__progress" aria-hidden="true" style={{ animationDuration: `${durationMs}ms`, animationPlayState: paused ? 'paused' : 'running' }} />}
    </div>
  )
}

export function ToastRegion({ messages, onDismiss }: ToastRegionProps) {
  const [host] = useState(() => document.createElement('div'))
  useLayoutEffect(() => {
    // Keep one portal host (and its running timers) when a modal opens. Inside
    // the top dialog, toast buttons belong to its focus trap and avoid inert.
    const placeHost = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('.modal-layer')].filter((dialog) => !dialog.inert)
      const parent = dialogs.at(-1) ?? document.body
      if (host.parentElement !== parent) parent.append(host)
    }
    placeHost()
    const observer = new MutationObserver(placeHost)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] })
    return () => { observer.disconnect(); host.remove() }
  }, [host])
  return createPortal(
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {messages.map((toast) => <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>, host,
  )
}
