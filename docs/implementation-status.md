# Umsetzungsstatus

Stand: 2026-09-09, Paket 12. Zielbranch `main` zu Beginn:
`95d7370dbe5931c6ab0373bc070db2ad8763cb93` (Pakete 00–11 integriert).
89 Repository-Dateien anhand ihrer Git-Blob-Hashes geprüft; keine `AGENTS.md` im Tree.
Arbeitsbranch `codex/paket-12-stabilisierung`, [PR #33](https://github.com/sl3ndrr/RiffRechnung/pull/33).
Kein Merge und kein Deployment in diesem Auftrag.

**Noch nicht abnahmefähig:** Native Dateiberechtigungen, OS-Druckdialog, visuelle
PDF-/Theme-Abnahme, Banking-App-Scans, Screenreader und Safari/macOS sind offen.
R23: Ein verpflichtender Statuscheck ist administrativ noch nicht eingerichtet.
Die [Abschlussmatrix](release-readiness.md) erfasst jeden R-/F-/N-Punkt.

## Paketfolge

00–12 sind in Reihenfolge implementiert; 13–17 sind einzeln wählbar und wurden
nicht begonnen. Nach der letzten gewählten Erweiterung wird Paket 12 wiederholt.

| Paket | Umfang | R-/F-/N-Zuordnung | Stand |
| --- | --- | --- | --- |
| 00 | Ausgangsbasis, CI, esbuild | R23, R25, N01 | Integriert; aktueller Nachweis in Paket 12 |
| 01 | Gefährliche Abläufe vorläufig absichern | R01–R05, R10, R22 (Sofortschutz) | Integriert; aktueller Nachweis in Paket 12 |
| 02 | Fachbefehle, Validatoren, reparierbare Formate | R01, R04, R15; Grundlage R24 | Integriert; aktueller Nachweis in Paket 12 |
| 03 | Speicherung, Backups, isolierte Demo | R05, R08, R22, N06; schrittweise R24 | Integriert; aktueller Nachweis in Paket 12 |
| 04 | Originalbelege und Korrekturen | R03, R09, R10, F03, N09; schrittweise R24 | Integriert; aktueller Nachweis in Paket 12 |
| 05 | Exaktes Geld und Kalenderdaten | R06, R12; schrittweise R24 | Integriert; aktueller Nachweis in Paket 12 |
| 06 | Aufteilung nach Empfängern | R02; Integration R01; schrittweise R24 | Integriert; aktueller Nachweis in Paket 12 |
| 07 | Rechnungsprofil, deutsche IBAN, Zahlungsdaten | R07, R13 angepasst, R14 | Integriert; aktueller Nachweis in Paket 12 |
| 08 | Zahlungstag und Berichte | R11, F02 (MVP); schrittweise R24 | Integriert; aktueller Nachweis in Paket 12 |
| 09 | Druck und GiroCode | R16, R21, N03, N08 | Integriert; aktueller Nachweis in Paket 12 |
| 10 | Tastatur, Dialoge, Navigation, Kontrast | R17–R20, N05, N07 | Integriert; aktueller Nachweis in Paket 12 |
| 11 | Sicherheitstexte und Komfort | R26, N02, N04, N10 | Integriert; aktueller Nachweis in Paket 12 |
| 12 | Zusammenhängende Abläufe und Freigabereife | R01–R26, F02-MVP/F03, N01–N10; Matrix F01–F06 | Implementiert; native Freigaben und administrative Abnahme offen |
| 13 | Wiederherstellung mit Versionsvergleich | F01 | Optional, laut Analyse offen |
| 14 | Teilzahlungen und Zahlungskorrekturen | F02 (Ausbau) | Optional, laut Analyse offen |
| 15 | Monatliche Unterrichtsvorlagen | F04 | Optional, laut Analyse offen |
| 16 | Passwortgeschützte portable Backups | F05 | Optional, laut Analyse offen |
| 17 | Offline-Start und kontrollierte Updates | F06 | Optional, zuletzt; laut Analyse offen |

## Paket 12 – Ausgang und Ergebnis

Implementierungsnachweis: `72515209ac123cdd079e730e77686435668827bf`,
[CI 34384827205](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34384827205):
150/150 Fachtests, 41/41 Browserprüfungen, Lint, Test-Typecheck, Build und
vollständiges npm-Audit (0 gemeldete Schwachstellen) erfolgreich. Der abschließende
Dokumentationscommit erhält einen eigenen vollständigen CI-Lauf; dessen konkrete
SHA/Laufzuordnung wird im PR-Abschluss festgehalten.

- **R05/R09, Nummern-/Migrationsschutz:** Recovery verwendete einen leeren
  UI-Zustand als Schutzbasis. Bekannte Legacy-Originale sowie Reservierungen,
  Kinderkennzeichenzähler, Bestands-ID und Revision konnten bei Restore verloren
  gehen. Drei neue Regressionen reproduzierten dies bei 143 weiterhin erfolgreichen
  Bestandstests. Eine vierte bestätigte den verdeckten gültigen Rückfallstand hinter
  einem beschädigten Hauptschlüssel; die anderen 149 Tests bestanden.
- **Korrektur:** Wiederherstellung verwendet den vollständig validierten lokalen
  Haupt-, vorigen oder Legacy-Bestand in dieser Reihenfolge. Bekannte Original-/
  Zahlungshistorie, Nummern und Herkunft bleiben geschützt. Beschädigte Daten
  liefern keine erfundene Historie. Alle benötigten unveränderten Eingänge werden
  vor dem Schreibabschluss archiviert; zusätzlicher Rückfalltext im bestehenden
  Archivformat 1. Unterbrechung, Wiederholung und Reload sind regressionsgetestet.
- **R24:** Entwurfslöschung und erlaubtes Zurücksetzen aus `App.tsx` in geprüfte
  Fachbefehle gezogen; Archivierung und Klärung validieren ihren Folgezustand.
  Der Ablauf prüft Einstellungen, Stammdaten, Kopie, Entwurf, Finalisierung, Status/
  Zahlung, Archivierung, Löschen, Neuzuordnung und Korrektur jeweils durch Speicher,
  Export, unabhängigen Import und Reload. Echte Formularabläufe ergänzen Quellmuster.
- **R23/R25:** CI prüft den tatsächlichen PR-Head unter Node 22 einschließlich
  Testtypen, Chromium sowie JSON-Fallback in Firefox/WebKit. Vollständiges npm-Audit
  mit pipefail ist Pflicht. Das High-Advisory GHSA-2883-xcg3-v3hh wird durch das
  npm-regenerierte Lockfile-Update js-yaml 4.3.1→4.3.2 behoben; keine neue Abhängigkeit.
  Der temporäre Regenerierungsjob ist entfernt. Die unbenötigte inkonsistente
  Chrome-APT-Quelle wird nur im CI-Runner deaktiviert; Paketprüfungen bleiben aktiv.
- **Invarianten:** Statische lokale React-/TypeScript-Architektur und deutsche UI;
  getrennte Nummernkreise/reservierte Nummern; eindeutige familienbezogene
  Forderungen; exakte Centbeträge; DE-IBAN-Neuverwendung; unveränderte historische
  Snapshots/Beträge; CSV-Formelabwehr und beschädigte Rohdaten bleiben geschützt.
- **P01-Sperren:** Aufteilung, Datei-Backup, Demo und Korrektur sind durch fertige
  Funktionen ersetzt. Komplett-Zurücksetzen bleibt bewusst ausschließlich ohne
  ausgestellte Belege, historische Dokumentation und Reservierungen verfügbar.
  Die vorläufige Zusage wurde entfernt; Import prüft den tatsächlichen Originalschutz.
- **Migration:** Keine Formatänderung: Schema 7, Speicherprotokoll 4, Archivformat 1.
  Integrierte Schema-7-Bestände benötigen keine Migration. Formate 2–6 behalten
  den kontrollierten Umstieg mit Bericht; unbekannte neuere Formate bleiben
  schreibgeschützt. Rückkehr nur mit unabhängig gesicherter Originaldatei und
  passendem historischem Code in getrenntem Profil, niemals In-place-Downgrade.

Aktuelle Ergebnisse/Abnahmegrenzen: [release-readiness.md](release-readiness.md).
CI-Läufe und Fehlerzuordnung: [quality-gates.md](quality-gates.md). Frühere
Paketdetails bleiben im Git-Verlauf dieser Datei. Produktregeln:
[product-decisions.md](product-decisions.md).

Nächstes vorgesehenes Paket: **13 – Wiederherstellung mit Versionsvergleich**,
optional und nur auf gesonderten Auftrag. Zuerst verbleibende P12-Freigaben klären.
