import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'small' | 'medium' | 'large'
  role?: 'dialog' | 'alertdialog'
  describedBy?: string
  initialFocus?: 'first' | 'title'
}

// The existing dialog foundation uses an explicit inert stack so it follows
// the W3C modal contract without Chromium's nested native-top-layer issue.
const dialogStack: HTMLDivElement[] = []
const dialogReturnTargets = new WeakMap<HTMLDivElement, HTMLElement | null>()
const dialogFallbackTargets = new WeakMap<HTMLDivElement, HTMLElement | null>()
let appRootWasInert = false

function synchronizeModalState() {
  const appRoot = document.getElementById('root')
  if (appRoot) appRoot.inert = dialogStack.length > 0 ? true : appRootWasInert
  dialogStack.forEach((dialog, index) => {
    dialog.inert = index !== dialogStack.length - 1
  })
  document.body.classList.toggle('modal-open', dialogStack.length > 0)
}

function focusableElements(dialog: HTMLElement) {
  const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
  return [...dialog.querySelectorAll<HTMLElement>(selector)].filter((element) => (
    !element.matches(':disabled')
    && !element.closest('[hidden], [inert]')
    && element.getClientRects().length > 0
  ))
}

function returnFocus(dialog: HTMLDivElement, target: HTMLElement | null) {
  const visited = new Set<HTMLElement>()
  let candidate = target
  while (candidate && (!candidate.isConnected || Boolean(candidate.closest('[inert]')))) {
    if (visited.has(candidate)) return
    visited.add(candidate)
    const owner = candidate.closest<HTMLDivElement>('.modal-layer')
    candidate = owner ? dialogReturnTargets.get(owner) ?? null : dialogFallbackTargets.get(dialog) ?? null
  }
  candidate?.focus()
}

export function Modal({ open, title, eyebrow, onClose, children, footer, size = 'medium', role = 'dialog', describedBy, initialFocus = 'first' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return

    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialogStack.length === 0) appRootWasInert = document.getElementById('root')?.inert ?? false
    dialogReturnTargets.set(dialog, previousFocus.current)
    const owner = previousFocus.current?.closest<HTMLDivElement>('.modal-layer')
    dialogFallbackTargets.set(dialog, owner ? dialogFallbackTargets.get(owner) ?? dialogReturnTargets.get(owner) ?? null : previousFocus.current)
    dialogStack.push(dialog)
    synchronizeModalState()
    const target = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') ?? focusableElements(dialog).at(0)
    target?.focus()

    return () => {
      const index = dialogStack.lastIndexOf(dialog)
      const wasTop = index === dialogStack.length - 1
      if (index >= 0) dialogStack.splice(index, 1)
      synchronizeModalState()
      if (wasTop) returnFocus(dialog, previousFocus.current)
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      ref={dialogRef}
      className="modal-layer"
      role={role}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      aria-modal="true"
      onKeyDown={(event) => {
        if (dialogStack.at(-1) !== event.currentTarget) return
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
          return
        }
        if (event.key !== 'Tab') return
        const focusable = focusableElements(event.currentTarget)
        const first = focusable.at(0)
        const last = focusable.at(-1)
        if (!first || !last) { event.preventDefault(); return }
        if (!focusable.includes(document.activeElement as HTMLElement)) {
          event.preventDefault()
          const destination = event.shiftKey ? last : first
          destination.focus()
          return
        }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dialogStack.at(-1) === event.currentTarget) onClose()
      }}
    >
      <section className={`modal modal--${size}`} role="document">
        <header className="modal__header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id={titleId} tabIndex={initialFocus === 'title' ? -1 : undefined} data-dialog-initial-focus={initialFocus === 'title' ? '' : undefined}>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Dialog schließen">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}
