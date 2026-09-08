import type { Settings } from '../types'
import { canonical } from './envelope'
import { settingsChangeErrors } from './settings'

// A flush joins an active save and includes edits made while that save is pending.
// Confirmed is advanced only after the actual local write has completed.
export class SettingsBuffer {
  private confirmed: Settings
  private draft: Settings
  private valid = true
  private pending: Promise<boolean> | null = null
  constructor(settings: Settings) { this.confirmed = structuredClone(settings); this.draft = structuredClone(settings) }
  update(settings: Settings, valid = true): void { this.draft = structuredClone(settings); this.valid = valid }
  get dirty(): boolean { return !this.valid || canonical(this.draft) !== canonical(this.confirmed) }
  flush(save: (settings: Settings) => Promise<boolean>): Promise<boolean> {
    if (this.pending) return this.pending
    this.pending = (async () => {
      while (this.dirty) {
        if (!this.valid || settingsChangeErrors(this.confirmed, this.draft).length) return false
        const submitted = structuredClone(this.draft)
        if (!await save(submitted)) return false
        this.confirmed = submitted
      }
      return true
    })().finally(() => { this.pending = null })
    return this.pending
  }
}
