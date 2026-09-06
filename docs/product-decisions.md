# Produktentscheidungen

Stand: Paket 00, 2026-09-06. Quelle: beauftragter Umsetzungsplan zur Analyse von
`ba7857fd9180fa392c42a0235643e478e5077ee5`. Diese Regeln sind verbindliche Ziele;
ihre technische Umsetzung wird pro Paket im [Umsetzungsstatus](implementation-status.md) belegt.

| Thema | Entscheidung | Umsetzung / offene Entscheidung |
| --- | --- | --- |
| Architektur | Statische React-/TypeScript-App, lokale Datenhaltung, deutsche Oberfläche; kein zusätzliches Backend. | In allen Paketen erhalten. |
| IBAN | Ausschließlich deutsche IBANs für neue/geänderte Kontoeinstellungen und neue Finalisierungen. Keine Ausweitung auf weitere SEPA-Länder. | Paket 07; der Ausgangscode akzeptiert noch weitere SEPA-Länder. Paket 00 ändert keine Fachlogik. |
| Historische Kontodaten | Alte Belege originalgetreu lesen; fremde IBANs weder löschen noch umschreiben noch durch aktuelle Kontodaten ersetzen. Neue Verwendung darf eine Korrektur verlangen. | Pakete 04/07. |
| Getrennte Rechnungen | Jede Leistung pro Aufteilung insgesamt genau einmal berechnen; Empfänger erhalten nur zugeordnete Kinder/Positionen. Keine angenommene 50/50-Aufteilung. | Konservative Regel aus dem Plan übernommen, Paket 06. |
| Rechnungskopien | Weitere Ausgabe desselben Belegs erzeugt weder neue Forderung noch zweiten Umsatz. Getrennte Forderungen brauchen getrennte Leistungen oder ausdrücklich bestätigte Anteile. | Pakete 04/06/08. |
| Finalisierte Belege | Originalinhalt erhalten; Änderungen über verknüpften Korrekturentwurf. Zahlungs- und Versandstatus separat pflegen. Fehlende Historie nicht erfinden. | Paket 04; keine rückwirkende Behauptung vollständiger Historie. |
| Nummern und Export | Getrennte Nummernkreise, dauerhaft reservierte Nummern und CSV-Formelabwehr erhalten. | In allen betroffenen Paketen prüfen. |
| Backup-Ordner | Ein Ordner gehört zu einem führenden Datenbestand. Abweichende Bestände erkennen; kein stilles Zusammenführen oder Überschreiben. | Konservative Regel übernommen, Paket 03. |
| Zahlungen | Zunächst Vollzahlung mit tatsächlichem Zahlungstag. Fehlende historische Zahlungstage bleiben unbekannt. Teilzahlungen später separat. | Paket 08 (F02-MVP), optional Paket 14. |
| Datenformate | Änderungen versionieren; Altformate definieren, unveränderte Eingangsdaten schützen, Migrationsbericht und Wiederherstellung vorsehen. Laden/Importieren muss idempotent sein. Unbekannte neuere Formate nicht überschreiben; ausgestellte Beträge/Snapshots nicht still ändern. | Pakete 02–05 und spätere Formatänderungen; Paket 00 ohne Migration. |
| Steuerliches Profil | Keine steuerliche Einordnung aus dem Projektnamen oder dem voreingestellten Rechtstext ableiten. | Tatsächliche Konstellation in Paket 07 klären. |
| Zielbrowser | README nennt Chromium ab 131 für Druck und Chromium für Ordnerzugriff. Das ist keine verifizierte Freigabeliste. Nur tatsächlich geprüfte Browser/Versionen freigeben. | Verbindliche Betrieb-/Druckmatrix in Paketen 09/12 festlegen. |
| Freigabe | Jedes Paket separat beauftragen. PR/Commits sind Teil des Pakets; Merge und produktives Deployment brauchen einen separaten Auftrag. Nur synthetische Testdaten verwenden. | Paket 00 endet vor Merge/Deployment. |

Zusätzliche technische Annahmen für Paket 00: `.nvmrc` bleibt bei Node 22;
Prüfungen verwenden das mitgelieferte npm auf `ubuntu-24.04`. Die Node-24-Laufzeit
der GitHub Actions ist unabhängig von der Node-22-Laufzeit der Projektbefehle.
PRs prüfen GitHubs Merge-Stand; Pages prüft und veröffentlicht den auslösenden
`main`-Commit und dessen Artefakt im selben Workflow-Lauf.
