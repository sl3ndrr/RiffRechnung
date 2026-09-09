import { Modal } from '../components/Modal'
import type { DirectoryInspection } from '../lib/backupDirectory'
import type { StorageEnvelope } from '../lib/envelope'
import type { ImportPreview } from '../lib/importState'

export function FolderReview({ review, current, onClose, onChoose, onConnect, onRestore }: {
  review: { handle: FileSystemDirectoryHandle; inspection: DirectoryInspection } | null
  current: StorageEnvelope | null
  onClose: () => void
  onChoose: () => void
  onConnect: () => void
  onRestore: (preview: ImportPreview) => void
}) {
  if (!review) return null
  const { inspection } = review
  return <Modal open title="Backup-Ordner prüfen" eyebrow={review.handle.name} onClose={onClose} size="large" initialFocus="title">
    <p>Lokaler Bestand: {current ? `${current.datasetId}, Revision ${current.revision}` : 'noch kein zugeordneter Bestand'}. Beim Auswählen wurde nichts geschrieben.</p>
    {inspection.conflict && <p role="alert">{inspection.conflict}</p>}
    {inspection.entries.length === 0 ? <p>Dieser Ordner enthält noch keine JSON-Sicherungen.</p> : <ul>{inspection.entries.map((entry) => <li key={entry.name}>
      <strong>{entry.name}</strong>
      {entry.preview ? <><p>{entry.preview.state.students.length} Kinder, {entry.preview.state.invoices.length} Rechnungen. {entry.preview.envelope ? `Bestand ${entry.preview.envelope.datasetId}, Revision ${entry.preview.envelope.revision}` : 'Altbackup ohne Bestands-ID – ausdrückliche Zuordnung erforderlich.'}</p>
        <button className="button button--tonal" onClick={() => onRestore(entry.preview!)}>Diese Sicherung wiederherstellen{!entry.preview.envelope && ' und zuordnen'}</button></> : <p role="alert">{entry.error}</p>}
    </li>)}</ul>}
    <p>Ein Ordner führt einen Bestand. Widersprüchliche oder extern synchronisierte Dateien bleiben erhalten und sperren das Schreiben. Tabsperren koordinieren nur diesen Browser-Origin, keine anderen Geräte.</p>
    <div className="button-row">
      {!inspection.conflict && (inspection.entries.length === 0 || (inspection.head?.datasetId === current?.datasetId && inspection.entries.every((entry) => entry.preview?.envelope))) && <button className="button button--primary" onClick={onConnect}>Diesen Zielort verbinden und sichern</button>}
      <button className="button button--tonal" onClick={onChoose}>Anderen Zielort wählen</button>
      <button className="button button--text" onClick={onClose}>Abbrechen</button>
    </div>
  </Modal>
}
