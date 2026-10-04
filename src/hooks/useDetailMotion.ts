import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { Invoice } from '../types'
import { useReducedMotion } from './useReducedMotion'

// One live detail/focus tree. The outgoing copy is purely decorative and inert.
export function useDetailMotion(ref: RefObject<HTMLElement | null>, invoice: Invoice) {
  const reduced = useReducedMotion()
  const previous = useRef<{ id: string; snapshot: HTMLElement } | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const old = previous.current
    const snapshot = element.cloneNode(true) as HTMLElement
    previous.current = { id: invoice.id, snapshot }
    if (reduced || element.querySelector('[role="alert"]')) return
    if (!old || old.id === invoice.id || old.snapshot.querySelector('[role="alert"]')) return
    const style = getComputedStyle(document.documentElement)
    const duration = parseFloat(style.getPropertyValue('--dur-base')) || 0
    const easing = style.getPropertyValue('--ease-out').trim()
    const ghost = old.snapshot
    ghost.className = 'surface invoice-detail invoice-detail__previous'
    ghost.removeAttribute('aria-label')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
    const incoming = Array.from(element.children).map((node) => node.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing }))
    element.append(ghost)
    const outgoing = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing })
    const cancel = () => { ghost.remove(); outgoing.cancel(); incoming.forEach((animation) => animation.cancel()) }
    const timer = window.setTimeout(cancel, duration)
    window.addEventListener('beforeprint', cancel)
    return () => { window.clearTimeout(timer); window.removeEventListener('beforeprint', cancel); cancel() }
  }, [invoice, reduced, ref])
}
