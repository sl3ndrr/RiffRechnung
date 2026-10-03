import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { BookUser, Menu, ReceiptText, Settings as SettingsIcon, X } from 'lucide-react'
import type { PageKey, Settings } from '../types'
import { APP_VERSION } from '../version'

const navItems: Array<{ key: PageKey; label: string; icon: typeof ReceiptText }> = [
  { key: 'invoices', label: 'Rechnungen', icon: ReceiptText },
  { key: 'people', label: 'Personen', icon: BookUser },
  { key: 'settings', label: 'Einstellungen', icon: SettingsIcon },
]

const backupDateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface WorkspaceShellProps {
  children: ReactNode
  page: PageKey
  settings: Settings
  draftCount: number
  lastBackupAt: string | null
  saveStateLabel: 'saved' | 'saving' | 'error'
  saveStatus: string
  mainContentRef: RefObject<HTMLElement | null>
  onNavigate: (next: PageKey, afterNavigation?: () => void) => void
}

export function WorkspaceShell({ children, page, settings, draftCount, lastBackupAt, saveStateLabel, saveStatus, mainContentRef, onNavigate }: WorkspaceShellProps) {
  const [mobileNav, setMobileNav] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 820px)').matches)
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const mobileCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)')
    const update = () => {
      setIsMobile(media.matches)
      if (!media.matches) setMobileNav(false)
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      root.style.colorScheme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151618' : '#f7f7f8')
    }
    apply()
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    root.classList.toggle('reduce-motion', settings.reducedMotion)
    return () => media.removeEventListener('change', apply)
  }, [settings.reducedMotion, settings.theme])

  const navigate = (next: PageKey) => onNavigate(next, () => {
    setMobileNav(false)
    if (isMobile && mobileNav) requestAnimationFrame(() => mainContentRef.current?.focus())
  })
  const openMobileNav = useCallback(() => {
    setMobileNav(true)
    requestAnimationFrame(() => mobileCloseButtonRef.current?.focus())
  }, [])
  const closeMobileNav = useCallback(() => {
    setMobileNav(false)
    requestAnimationFrame(() => mobileMenuButtonRef.current?.focus())
  }, [])
  useEffect(() => {
    if (!mobileNav) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      event.preventDefault()
      closeMobileNav()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closeMobileNav, mobileNav])
  const backupStatusLabel = lastBackupAt ? `Letzter JSON-Export: ${backupDateFormatter.format(new Date(lastBackupAt))}` : 'Noch kein Backup'
  return <>
      <a href="#main-content" className="skip-link">Zum Inhalt springen</a>
      <aside id="mobile-sidebar" className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`} inert={isMobile && !mobileNav}>
        <div className="brand"><span className="brand__mark" aria-hidden="true">🧾</span><div><strong>RiffRechnung</strong><small>Rechnungen</small></div><button ref={mobileCloseButtonRef} className="icon-button mobile-only" onClick={closeMobileNav} aria-label="Navigation schließen"><X aria-hidden="true" /></button></div>
        <nav aria-label="Hauptnavigation">{navItems.map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} aria-label={label} key={key} onClick={() => navigate(key)}><Icon aria-hidden="true" /><span>{label}</span>{key === 'invoices' && draftCount > 0 && <b>{draftCount}</b>}</button>)}</nav>
        <div className="sidebar__privacy"><span><ShieldDot /></span><div><strong>Nur auf diesem Gerät</strong><small>Keine automatische Cloud-Übertragung</small></div></div>
        <a className="sidebar__version" href="https://github.com/sl3ndrr/RiffRechnung/blob/main/docs/about.md" target="_blank" rel="noreferrer" aria-label={`Info öffnen (neuer Tab), aktuelle Version ${APP_VERSION}`}>Info · Version {APP_VERSION}</a>
      </aside>
      {mobileNav && <button className="nav-scrim" aria-label="Navigation schließen" onClick={closeMobileNav} />}

      <div className="app-main" inert={isMobile && mobileNav}>
        <header className="topbar">
          <button ref={mobileMenuButtonRef} className="icon-button mobile-only" onClick={openMobileNav} aria-label="Navigation öffnen" aria-controls="mobile-sidebar" aria-expanded={mobileNav}><Menu aria-hidden="true" /></button>
          <div className="topbar__end"><div className="topbar__storage-status" role="status" aria-live="polite"><span className={`save-indicator ${saveStateLabel === 'saving' ? 'is-saving' : saveStateLabel === 'error' ? 'is-error' : ''}`}><i />{saveStatus}</span><span className="backup-indicator">{backupStatusLabel}</span></div></div>
        </header>

        {children}
      </div>
      <nav className="mobile-bottom-nav" aria-label="Mobile Hauptnavigation" inert={isMobile && mobileNav}>{navItems.map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} aria-label={label} key={key} onClick={() => navigate(key)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>
  </>
}

function ShieldDot() {
  return <span className="shield-dot" aria-hidden="true"><i /></span>
}
