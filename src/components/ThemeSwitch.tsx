import type { KeyboardEvent } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemeMode } from '../types'

const options = [['light', Sun, 'Hell'], ['system', Monitor, 'System'], ['dark', Moon, 'Dunkel']] as const

interface ThemeSwitchProps {
  theme: ThemeMode
  onChange: (theme: ThemeMode) => void
}

export function ThemeSwitch({ theme, onChange }: ThemeSwitchProps) {
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0
    const input = event.target
    if (!offset || !(input instanceof HTMLInputElement)) return
    event.preventDefault()
    const index = options.findIndex(([value]) => value === input.value)
    const next = options[(index + offset + options.length) % options.length][0]
    event.currentTarget.querySelector<HTMLInputElement>(`input[value="${next}"]`)?.focus()
    onChange(next)
  }
  return <div className="theme-switch" role="radiogroup" aria-label="Farbschema" data-mode={theme} onKeyDown={moveFocus}>
    <span className="theme-switch__thumb" aria-hidden="true" />
    {options.map(([value, Icon, label]) => <label className={theme === value ? 'is-selected' : ''} key={value} title={label}>
      <input type="radio" name="topbar-theme" value={value} checked={theme === value} tabIndex={theme === value ? 0 : -1} onChange={() => onChange(value)} aria-label={label} />
      <Icon aria-hidden="true" /><span>{label}</span>
    </label>)}
  </div>
}
