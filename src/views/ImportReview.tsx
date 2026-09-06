import { Modal } from '../components/Modal'
import { serializeBackup } from '../lib/storage'
import { serializeMigrationReport, type ImportPreview } from '../lib/importState'
import type { CommandResult } from '../lib/result'
import { downloadBytes, downloadText } from '../lib/utils'

export interface ImportReviewData {
  bytes: Uint8Array
  result: CommandResult<ImportPreview>
}

export function ImportReview({ review, onClose, onApply }: {
  review: ImportReviewData | null
  onClose: () => void
  onApply?: (preview: ImportPreview) => void
}) {
  if (!review) return null
  return (
    <Modal open onClose={onClose} title="Import und Reparatur prüfen" eyebrow="Datensicherung" size="large" footer={<button className="button button--text" onClick={onClose}>Schließen</button>}>
      <ImportReviewContent review={review} onApply={onApply} />
    </Modal>
  )
}

export function ImportReviewContent({ review, onApply }: { review: ImportReviewData; onApply?: (preview: ImportPreview) => void }) {
  const preview = review.result.ok ? review.result.value : null
  return (
      <div className="form-section">
        {!review.result.ok && <div className="form-errors" role="alert"><strong>Keine Übernahme möglich</strong><ul>{review.result.errors.map((error, index) => <li key={index}>{error.message}</li>)}</ul><p>Der aktuelle Bestand bleibt unverändert. Exportiere die Originaldatei und korrigiere eine separate Kopie bewusst. Es werden keine Personen erfunden, Preise ersetzt oder Positionen gelöscht.</p></div>}
        {preview && <>
          <p>Geprüft: {preview.state.students.length} Kinder und {preview.state.invoices.length} Rechnungen.</p>
          {preview.report && <>
            <p>Altformat 2 → Format 3: {preview.report.idMappings.length} Positions-IDs werden ersetzt. Beträge, Belegnummern, Texte und vorhandene Snapshots bleiben erhalten.</p>
            <table><thead><tr><th>Rechnung / Position</th><th>Alte ID</th><th>Neue ID</th></tr></thead><tbody>{preview.report.idMappings.map((mapping) => <tr key={`${mapping.invoiceId}-${mapping.itemIndex}`}><td>{mapping.invoiceId} / {mapping.itemIndex + 1}</td><td>{mapping.oldId}</td><td>{mapping.newId}</td></tr>)}</tbody></table>
            <details><summary>Alle {preview.report.changes.length} Formatänderungen</summary><ul>{preview.report.changes.map((change) => <li key={change.path}>{change.path}: {change.reason}</li>)}</ul></details>
            <p>Die Reparatur bestätigt keine korrekte Aufteilung der Leistungen. Prüfe die alten Empfängerrechnungen fachlich; dieses Paket ändert keine Forderung.</p>
          </>}
          {preview.warnings.length > 0 && <div className="form-errors" role="alert"><strong>Historische E-Mail-Adressen prüfen</strong><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          {(preview.report || !onApply) && <p>Die lokalen Eingangsbytes bleiben geschützt. Du kannst den geprüften Bestand separat exportieren und in einem leeren Browserprofil importieren. Das Ersetzen beschädigter oder migrierter Bestände folgt mit dem abgesicherten Schreibweg in Paket 03.</p>}
        </>}
        <div className="button-row">
          <button className="button button--tonal" onClick={() => downloadBytes('riffrechnung-originaldaten.bin', review.bytes)}>Unveränderte Originaldatei exportieren</button>
          {preview && <>
            <button className="button button--tonal" onClick={() => downloadText('riffrechnung-migrationsbericht.json', serializeMigrationReport(preview))}>Bericht mit Originaldaten exportieren</button>
            <button className="button button--tonal" onClick={() => downloadText('riffrechnung-gepruefter-bestand-v3.json', serializeBackup(preview.state))}>Geprüften Bestand separat exportieren</button>
            {!preview.report && onApply && <button className="button button--primary" onClick={() => onApply(preview)}>Wiederherstellung vorbereiten</button>}
          </>}
        </div>
      </div>
  )
}
