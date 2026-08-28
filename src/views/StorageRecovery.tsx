import { AlertTriangle, Download, Upload } from 'lucide-react'
import type { StorageRecoveryState } from '../lib/storage'

interface StorageRecoveryProps {
  recovery: StorageRecoveryState
  onExport: () => void
  onImport: (file: File) => void
}

export function StorageRecovery({ recovery, onExport, onImport }: StorageRecoveryProps) {
  return (
    <main className="recovery-page">
      <section className="surface recovery-card" role="alert" aria-labelledby="recovery-title">
        <span className="recovery-card__icon"><AlertTriangle aria-hidden="true" /></span>
        <p className="eyebrow">Lokaler Wiederherstellungsmodus</p>
        <h1 id="recovery-title">Lokale Daten benötigen Wiederherstellung</h1>
        <p>RiffRechnung hat beschädigte oder unvollständige lokale Daten erkannt. Das automatische Speichern ist pausiert, damit die vorhandenen Rohdaten nicht überschrieben werden.</p>
        <div className="recovery-error"><strong>Technischer Hinweis</strong><code>{recovery.error}</code></div>
        <div className="recovery-actions">
          <button className="button button--tonal" type="button" onClick={onExport} disabled={!recovery.rawData}><Download aria-hidden="true" />Beschädigte Rohdaten exportieren</button>
          <label className="button button--primary file-button"><Upload aria-hidden="true" />JSON-Backup wiederherstellen<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImport(file) }} /></label>
        </div>
        <p className="recovery-hint">Exportiere möglichst zuerst die beschädigten Rohdaten. Stelle anschließend ein bekanntes JSON-Backup wieder her; erst nach deiner Bestätigung darf RiffRechnung den lokalen Stand ersetzen.</p>
      </section>
    </main>
  )
}
