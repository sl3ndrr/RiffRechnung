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
}

// Native modal dialogs provide the inert background and focus containment from
// the W3C dialog pattern. The stack keeps Escape and scroll locking stable when
// a confirmation is displayed above another dialog.
const dialogStack: HTMLDialogElement[] = []
let scrollLockCount = 0

function lockDocumentScroll() {
  scrollLockCount += 1
  document.body.classList.add('modal-open')
}

function unlockDocumentScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) document.body.classList.remove('modal-open')
}

export function Modal({ open, title, eyebrow, onClose, children, footer, size = 'medium' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return

    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const nestedParent = dialogStack.at(-1) ?? null
    if (nestedParent) {
      // Chromium does not consistently activate a second native modal dialog.
      // The outer native dialog remains modal; making it inert gives this top
      // stack entry the same effective modality until it is closed again.
      nestedParent.inert = true
      dialog.show()
    } else {
      try { dialog.showModal() } catch { /* Already open during a development effect re-run. */ }
    }
    dialogStack.push(dialog)
    lockDocumentScroll()
    const target = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus], [autofocus], input:not([type="hidden"]), select, textarea, button:not([disabled]), [href]')
    target?.focus()

    return () => {
      const index = dialogStack.lastIndexOf(dialog)
      if (index >= 0) dialogStack.splice(index, 1)
      if (dialog.open) dialog.close()
      if (nestedParent) nestedParent.inert = false
      unlockDocumentScroll()
      previousFocus.current?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-layer"
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={(event) => {
        if (dialogStack.at(-1) !== event.currentTarget) return
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
          return
        }
        if (event.key !== 'Tab') return
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]')]
        const first = focusable.at(0)
        const last = focusable.at(-1)
        if (!first || !last) return
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}
      onCancel={(event) => {
        event.preventDefault()
        if (dialogStack.at(-1) === event.currentTarget) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dialogStack.at(-1) === event.currentTarget) onClose()
      }}
    >
      <section className={`modal modal--${size}`} role="document">
        <header className="modal__header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Dialog schließen">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </section>
    </dialog>,
    document.body,
  )
}
