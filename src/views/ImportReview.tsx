import { Modal } from '../components/Modal'
import { serializeBackup } from '../lib/storage'
import { serializeMigrationReport, type ImportPreview } from '../lib/importState'
import type { CommandResult } from '../lib/result'
import { downloadBytes, downloadText } from '../lib/downloads'

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
    <Modal open onClose={onClose} title="Import und Reparatur prüfen" eyebrow="Datensicherung" size="large" initialFocus="title" footer={<button className="button button--text" onClick={onClose}>Schließen</button>}>
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
          <p>Geprüft: {preview.state.students.length} Lernende und {preview.state.invoices.length} Rechnungen.</p>
          {preview.report && <>
            <p>Altformat {preview.report.fromSchema} → Format {preview.report.toSchema}: {preview.report.idMappings.length} Positions-IDs werden ersetzt. Beträge, Belegnummern und Rechnungshinweise bleiben erhalten. Einleitungs- und Rechtstextfelder samt historischen Kopien werden entfernt; Wiederausgaben verwenden die feste Einleitung und „Privatrechnung“. Abgeschaffte strukturierte Steuerfelder sowie Zahler-IBAN und interne Personen-/Zahlungsnotizen werden auch aus internen Kopien entfernt. Ausstellerkonten und Rechnungshinweise bleiben erhalten.</p>
            <p>Kontakte verwenden künftig ein Feld „Name“. Ein vorhandener Anzeigename bleibt erhalten. Entfernte Kontaktfelder werden nach erfolgreicher Übernahme nicht archiviert.</p>
            <table><thead><tr><th>Rechnung / Position</th><th>Alte ID</th><th>Neue ID</th></tr></thead><tbody>{preview.report.idMappings.map((mapping) => <tr key={`${mapping.invoiceId}-${mapping.itemIndex}`}><td>{mapping.invoiceId} / {mapping.itemIndex + 1}</td><td>{mapping.oldId}</td><td>{mapping.newId}</td></tr>)}</tbody></table>
            <details><summary>Alle {preview.report.changes.length} Formatänderungen</summary><ul>{preview.report.changes.map((change, index) => <li key={`${change.path}-${index}`}>{change.path}: {change.reason}</li>)}</ul></details>
            <p>Die Reparatur bestätigt keine korrekte Aufteilung der Leistungen. Prüfe die alten Empfängerrechnungen fachlich; dieses Paket ändert keine Forderung.</p>
          </>}
          {preview.warnings.length > 0 && <div className="form-errors" role="alert"><strong>Historische Angaben prüfen</strong><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          {!onApply && <p>Die lokalen Eingangsbytes bleiben geschützt. Du kannst den geprüften Bestand separat exportieren und in einem leeren Browserprofil importieren. Unbekannte neuere lokale Formate bleiben schreibgeschützt.</p>}
        </>}
        <div className="button-row">
          <button className="button button--tonal" onClick={() => downloadBytes('riffrechnung-originaldaten.bin', review.bytes)}>Unveränderte Originaldatei exportieren</button>
          {preview && <>
            <button className="button button--tonal" onClick={() => downloadText('riffrechnung-migrationsbericht.json', serializeMigrationReport(preview))}>Bericht mit bereinigten Daten exportieren</button>
            <button className="button button--tonal" onClick={() => downloadText('riffrechnung-gepruefter-bestand-v4.json', serializeBackup(preview.state))}>Geprüften Bestand separat exportieren</button>
            {onApply && <button className="button button--primary" onClick={() => onApply(preview)}>Wiederherstellung vorbereiten</button>}
          </>}
        </div>
      </div>
  )
}

