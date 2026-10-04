import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { BookUser, LayoutDashboard, Menu, ReceiptText, Settings as SettingsIcon, X } from 'lucide-react'
import type { PageKey, Settings, ThemeMode } from '../types'
import { APP_VERSION } from '../version'
import { ThemeSwitch } from './ThemeSwitch'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useMotionPresence } from '../hooks/useMotionPresence'

const navItems: Array<{ key: PageKey; label: string; icon: typeof ReceiptText }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'invoices', label: 'Rechnungen', icon: ReceiptText },
  { key: 'people', label: 'Personen', icon: BookUser },
  { key: 'settings', label: 'Einstellungen', icon: SettingsIcon },
]

const backupDateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface WorkspaceShellProps {
  children: ReactNode
  page: PageKey
  settings: Settings
  mode: 'real' | 'demo'
  draftCount: number
  lastBackupAt: string | null
  saveStateLabel: 'saved' | 'saving' | 'error'
  saveStatus: string
  mainContentRef: RefObject<HTMLElement | null>
  onNavigate: (next: PageKey, afterNavigation?: () => void) => void
  onThemeChange: (theme: ThemeMode) => void
}

export function WorkspaceShell({ children, page, settings, mode, draftCount, lastBackupAt, saveStateLabel, saveStatus, mainContentRef, onNavigate, onThemeChange }: WorkspaceShellProps) {
  const [mobileNav, setMobileNav] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 820px)').matches)
  const reducedMotion = useReducedMotion()
  const scrimRef = useRef<HTMLButtonElement | null>(null)
  const scrimPresent = useMotionPresence(mobileNav, scrimRef)
  const resolvedTheme = useRef<string | null>(null)
  const navStyle = { '--nav-index': navItems.findIndex((item) => item.key === page) } as CSSProperties
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

  useLayoutEffect(() => {
    const root = document.documentElement
    let timer: number | undefined
    root.classList.toggle('reduce-motion', settings.reducedMotion)
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      const theme = dark ? 'dark' : 'light'
      if (resolvedTheme.current !== null && resolvedTheme.current !== theme && !settings.reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        root.classList.add('theme-changing')
        // Establish the old colors before changing tokens, including rapid switches.
        void getComputedStyle(document.body).backgroundColor
        window.clearTimeout(timer)
        const duration = getComputedStyle(root).getPropertyValue('--dur-theme').trim()
        timer = window.setTimeout(() => root.classList.remove('theme-changing'), parseFloat(duration) || 250)
      }
      resolvedTheme.current = theme
      root.dataset.theme = dark ? 'dark' : 'light'
      root.style.colorScheme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--surface').trim())
    }
    apply()
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => { media.removeEventListener('change', apply); window.clearTimeout(timer); root.classList.remove('theme-changing') }
  }, [reducedMotion, settings.reducedMotion, settings.theme])

  useLayoutEffect(() => {
    const main = mainContentRef.current
    if (!main) return
    main.classList.remove('motion-fade')
    void getComputedStyle(main).animationName
    main.classList.add('motion-fade')
    return () => main.classList.remove('motion-fade')
  }, [mainContentRef, page])

  useEffect(() => {
    if (mode !== 'real') return
    try { localStorage.setItem('riffrechnung-theme-hint', settings.theme) }
    catch { /* The hint is optional; the confirmed settings remain authoritative. */ }
  }, [mode, settings.theme])

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
        <nav aria-label="Hauptnavigation" style={navStyle}><span className="nav-indicator" aria-hidden="true" />{navItems.map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} aria-label={label} key={key} onClick={() => navigate(key)}><Icon aria-hidden="true" /><span>{label}</span>{key === 'invoices' && draftCount > 0 && <b>{draftCount}</b>}</button>)}</nav>
        <div className="sidebar__privacy"><span><ShieldDot /></span><div><strong>Nur auf diesem Gerät</strong><small>Keine automatische Cloud-Übertragung</small></div></div>
        <a className="sidebar__version" href="https://github.com/sl3ndrr/RiffRechnung/blob/main/docs/about.md" target="_blank" rel="noreferrer" aria-label={`Info öffnen (neuer Tab), aktuelle Version ${APP_VERSION}`}>Info · Version {APP_VERSION}</a>
      </aside>
      {isMobile && scrimPresent && <button ref={scrimRef} className="nav-scrim" data-motion={mobileNav ? 'enter' : 'exit'} inert={!mobileNav} aria-label="Navigation schließen" onClick={closeMobileNav} />}

      <div className="app-main" inert={isMobile && mobileNav}>
        <header className="topbar">
          <button ref={mobileMenuButtonRef} className="icon-button mobile-only" onClick={openMobileNav} aria-label="Navigation öffnen" aria-controls="mobile-sidebar" aria-expanded={mobileNav}><Menu aria-hidden="true" /></button>
          <div className="topbar__end"><div className="topbar__storage-status" role="status" aria-live="polite"><span className={`save-indicator ${saveStateLabel === 'saving' ? 'is-saving' : saveStateLabel === 'error' ? 'is-error' : ''}`}><i key={saveStateLabel} className="motion-scale" />{saveStatus}</span><span className="backup-indicator">{backupStatusLabel}</span></div><ThemeSwitch theme={settings.theme} onChange={onThemeChange} /></div>
        </header>

        {children}
      </div>
      <nav className="mobile-bottom-nav" aria-label="Mobile Hauptnavigation" style={navStyle} inert={isMobile && mobileNav}><span className="nav-indicator" aria-hidden="true" />{navItems.map(({ key, label, icon: Icon }) => <button className={page === key ? 'is-active' : ''} aria-current={page === key ? 'page' : undefined} aria-label={label} key={key} onClick={() => navigate(key)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>
  </>
}

function ShieldDot() {
  return <span className="shield-dot" aria-hidden="true"><i /></span>
}
