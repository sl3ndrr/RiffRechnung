import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemeMode } from '../types'

interface ThemeSwitchProps {
  theme: ThemeMode
  onChange: (theme: ThemeMode) => void
}

export function ThemeSwitch({ theme, onChange }: ThemeSwitchProps) {
  return <div className="theme-switch" role="radiogroup" aria-label="Farbschema" data-mode={theme}>
    <span className="theme-switch__thumb" aria-hidden="true" />
    {([['light', Sun, 'Hell'], ['system', Monitor, 'System'], ['dark', Moon, 'Dunkel']] as const).map(([value, Icon, label]) => <label className={theme === value ? 'is-selected' : ''} key={value} title={label}>
      <input type="radio" name="topbar-theme" value={value} checked={theme === value} tabIndex={theme === value ? 0 : -1} onChange={() => onChange(value)} aria-label={label} />
      <Icon aria-hidden="true" /><span>{label}</span>
    </label>)}
  </div>
}
