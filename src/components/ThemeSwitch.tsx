import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemeMode } from '../types'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { prefersReducedMotion } from '../lib/theme'
import { centerOf, type RevealOrigin } from '../lib/themeTransition'

const options = [['light', Sun, 'Hell'], ['system', Monitor, 'System'], ['dark', Moon, 'Dunkel']] as const

interface ThemeSwitchProps {
  theme: ThemeMode
  onChange: (theme: ThemeMode, origin?: RevealOrigin) => void
}

export function ThemeSwitch({ theme, onChange }: ThemeSwitchProps) {
  const thumb = useRef<HTMLSpanElement>(null)
  const squash = useRef<Animation | null>(null)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (reducedMotion) squash.current?.cancel()
    return () => squash.current?.cancel()
  }, [reducedMotion])
  const select = (next: ThemeMode) => {
    const origin = centerOf(thumb.current)
    onChange(next, origin)
    squash.current?.cancel()
    if (!thumb.current || reducedMotion || prefersReducedMotion()) return
    const style = getComputedStyle(document.documentElement)
    const duration = parseFloat(style.getPropertyValue('--dur-spatial-fast'))
    if (!duration) return
    squash.current = thumb.current.animate([
      { scale: '1 1', borderRadius: '50%' },
      { scale: '1.28 .85', borderRadius: '16px', offset: .35 },
      { scale: '1 1', borderRadius: '50%' },
    ], { duration, easing: style.getPropertyValue('--spring-spatial-fast').trim(), fill: 'backwards' })
  }
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0
    const input = event.target
    if ((!offset && event.key !== 'Home' && event.key !== 'End') || !(input instanceof HTMLInputElement)) return
    event.preventDefault()
    const index = options.findIndex(([value]) => value === input.value)
    const next = options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + offset + options.length) % options.length][0]
    event.currentTarget.querySelector<HTMLInputElement>(`input[value="${next}"]`)?.focus()
    select(next)
  }
  return <div className="theme-switch" role="radiogroup" aria-label="Farbschema" data-mode={theme} onKeyDown={moveFocus}>
    <span ref={thumb} className="theme-switch__thumb" aria-hidden="true" />
    {options.map(([value, Icon, label]) => <label className={theme === value ? 'is-selected' : ''} key={value} title={label}>
      <input type="radio" name="topbar-theme" value={value} checked={theme === value} tabIndex={theme === value ? 0 : -1} onChange={() => select(value)} aria-label={label} />
      <Icon aria-hidden="true" />
    </label>)}
  </div>
}
