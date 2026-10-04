import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ToastMessage } from '../types'
import { useToastTimer } from '../hooks/useToastTimer'
import { useMotionPresence } from '../hooks/useMotionPresence'

interface ToastRegionProps {
  messages: ToastMessage[]
  onDismiss: (id: string) => void
}

function fillSlots(current: ToastMessage[], messages: ToastMessage[]) {
  return [...current.map((item) => messages.find((message) => message.id === item.id) ?? item), ...messages.filter((message) => !current.some((item) => item.id === message.id))].slice(0, 3)
}

function Toast({ toast, open, onDismiss, onExited }: { toast: ToastMessage; open: boolean; onDismiss: ToastRegionProps['onDismiss']; onExited: ToastRegionProps['onDismiss'] }) {
  const ref = useRef<HTMLDivElement>(null)
  const present = useMotionPresence(open, ref)
  const dismiss = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id])
  const durationMs = toast.durationMs ?? 4200
  const { paused, pause, claim } = useToastTimer(durationMs, dismiss, open)
  useLayoutEffect(() => { if (!present) onExited(toast.id) }, [onExited, present, toast.id])
  if (!present) return null
  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? TriangleAlert : Info
  return (
    <div ref={ref} data-motion={open ? 'enter' : 'exit'} inert={!open} className={`toast toast--${toast.tone}${toast.action ? ' toast--action' : ''}`}
      onMouseEnter={() => pause('hover', true)} onMouseLeave={() => pause('hover', false)}
      onFocusCapture={() => pause('focus', true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pause('focus', false) }}>
      <Icon aria-hidden="true" />
      <span role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.message}</span>
      {toast.action && <button className="toast__action" type="button" aria-label={toast.action.ariaLabel ?? toast.action.label}
        onClick={() => { if (open && claim()) { dismiss(); void toast.action?.onClick() } }}> {toast.action.label} </button>}
      <button className="toast__dismiss" type="button" onClick={dismiss} aria-label="Meldung schließen"><X aria-hidden="true" /></button>
      {toast.action && <div className="toast__progress" aria-hidden="true" style={{ animationDuration: `${durationMs}ms`, animationPlayState: paused ? 'paused' : 'running' }} />}
    </div>
  )
}

export function ToastRegion({ messages, onDismiss }: ToastRegionProps) {
  const [previous, setPrevious] = useState(messages)
  const [displayed, setDisplayed] = useState(messages)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  if (previous !== messages) {
    setPrevious(messages)
    // Retain dismissed nodes for exit without remounting running toast timers.
    // At capacity, the next message enters as soon as the outgoing one exits.
    setDisplayed((current) => fillSlots(current, messages))
  }
  const onExited = useCallback((id: string) => setDisplayed((current) => fillSlots(current.filter((item) => item.id !== id), messagesRef.current)), [])
  const [host] = useState(() => {
    const element = document.createElement('div')
    element.className = 'toast-host'
    return element
  })
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
      {displayed.map((toast) => <Toast key={toast.id} toast={toast} open={messages.some((message) => message.id === toast.id)} onDismiss={onDismiss} onExited={onExited} />)}
    </div>, host,
  )
}
