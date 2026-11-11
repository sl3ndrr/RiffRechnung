import type { ImportPreview } from './importState'

export function restoreMessage(preview: ImportPreview) {
  return `${preview.envelope ? `Bestand ${preview.envelope.datasetId}, Revision ${preview.envelope.revision}.` : 'Ohne Bestands-ID: Mit der Bestätigung ordnest du dieses Altbackup ausdrücklich zu; eine gemeinsame Herkunft ist nicht nachgewiesen.'} Ungespeicherte Einstellungen werden bei erfolgreicher Wiederherstellung verworfen. Der aktuelle Stand und die Eingangsdaten werden bereinigt lokal aufbewahrt. Abgeschaffte Zahler-IBAN sowie interne Personen- und Zahlungsnotizen werden auch aus internen Kopien endgültig entfernt. Ausstellerkonto, Rechnungshinweis und bekannte Originalbelege bleiben erhalten.`
}
