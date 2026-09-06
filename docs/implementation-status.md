# Umsetzungsstatus

Stand: 2026-09-06, ausschließlich Paket 00. Analyse und Zielbranch `main` wurden
auf `ba7857fd9180fa392c42a0235643e478e5077ee5` abgeglichen (Tree
`c00c371e0c8052bccaabc1208e6fd796a35c293e`). Keine `AGENTS.md` oder bisherigen
Status-/Entscheidungsdateien im vollständig gelesenen Repository-Tree vorhanden.
Alle 39 Ausgangsdateien wurden anhand ihrer Git-Blob-SHAs verifiziert.

## Paketfolge

Alle noch nicht bearbeiteten Befunde gelten **laut Analyse offen**, nicht als
erneut bestätigt. Bestätigung/Korrektur erfolgt erst im zugehörigen Paket.
00–12 werden in Reihenfolge umgesetzt; 13–17 sind einzeln wählbar. Nach der letzten
gewählten Erweiterung wird Paket 12 wiederholt.

| Paket | Umfang | R-/F-/N-Zuordnung | Stand |
| --- | --- | --- | --- |
| 00 | Ausgangsbasis, CI, esbuild | R23, R25, N01 | Implementiert; CI-Abnahme läuft, siehe unten |
| 01 | Gefährliche Abläufe vorläufig absichern | R01–R05, R10, R22 (Sofortschutz) | Laut Analyse offen |
| 02 | Fachbefehle, Validatoren, reparierbare Formate | R01, R04, R15, R24 | Laut Analyse offen |
| 03 | Speicherung, Backups, isolierte Demo | R05, R08, R22, N06 | Laut Analyse offen |
| 04 | Originalbelege und Korrekturen | R03, R09, R10, F03, N09 | Laut Analyse offen |
| 05 | Exaktes Geld und Kalenderdaten | R06, R12 | Laut Analyse offen |
| 06 | Aufteilung nach Empfängern | R02; Integration R01 | Laut Analyse offen |
| 07 | Rechnungsprofil, deutsche IBAN, Zahlungsdaten | R07, R13 angepasst, R14 | Laut Analyse offen |
| 08 | Zahlungstag und Berichte | R11, F02 (MVP) | Laut Analyse offen |
| 09 | Druck und GiroCode | R16, R21, N03, N08 | Laut Analyse offen |
| 10 | Tastatur, Dialoge, Navigation, Kontrast | R17–R20, N05, N07 | Laut Analyse offen |
| 11 | Sicherheitstexte und Komfort | R26, N02, N04, N10 | Laut Analyse offen |
| 12 | Zusammenhängende Abläufe und Freigabereife | R01–R26, N01–N10 | Laut Analyse offen; Pflichtabnahme |
| 13 | Wiederherstellung mit Versionsvergleich | F01 | Optional, laut Analyse offen |
| 14 | Teilzahlungen und Zahlungskorrekturen | F02 (Ausbau) | Optional, laut Analyse offen |
| 15 | Monatliche Unterrichtsvorlagen | F04 | Optional, laut Analyse offen |
| 16 | Passwortgeschützte portable Backups | F05 | Optional, laut Analyse offen |
| 17 | Offline-Start und kontrollierte Updates | F06 | Optional, zuletzt; laut Analyse offen |

## Paket 00

- **Ausgangsbefunde bestätigt:** R23 (nur Build vor Deployment, kein PR-Prüflauf,
  veränderliche Action-Tags, globale Pages-/OIDC-Rechte), R25 (direktes esbuild
  0.24.2 im betroffenen Advisory-Bereich), N01 (README-Installation mit `npm install`).
- **Ergebnisstand:** Arbeitsbranch `codex/paket-00-quality-gates`; gemeinsamer
  PR-/Pages-Prüfworkflow mit Node 22, `npm ci`, Lint, Tests, Typecheck inklusive
  Tests und Build. Deployment hängt vom erfolgreichen Prüflauf desselben Stands
  ab; Pages-/OIDC-Rechte ausschließlich im Deployment-Job. README nutzt `npm ci`.
  Direkte esbuild-Version 0.25.12, mit npm regeneriertes und gezielt verglichenes Lockfile.
- **Geprüfte Invarianten:** Baseline und esbuild-Testlauf: jeweils 45/45 Tests,
  keine übersprungenen/gelöschten/abgeschwächten Tests; vorhandene Prüfungen zu
  Geld, Referenzen, Import/Reload, Nummernreservierung, CSV und beschädigten
  Rohdaten laufen mit. Das ist keine vollständige fachliche Freigabe der offenen
  Pakete. Produktionsquelltext und Datenformat bleiben unverändert.
- **Migration:** keine; Schema 2, gespeicherte Rechnungen, Snapshots und Rohdaten
  werden durch Paket 00 nicht verändert. Ein Git-Revert betrifft nur Werkzeug-/CI-Konfiguration und Dokumentation.
- **Nachweise/offene Abnahmen:** [Qualitätsschranken](quality-gates.md). Lokale
  Installation blockiert; GitHub-CI verfügbar. Abschließende PR-CI und negativer
  Veröffentlichungstest stehen bei diesem Zwischenstand noch aus. Verpflichtender
  Branch-Statuscheck fehlt; klassischer Branch-Protection-Endpunkt nicht lesbar.
  Keine echte Fokus-, Dateiberechtigungs-, Druck- oder Banking-App-Abnahme.

Produktregeln und offene fachliche Entscheidungen: [product-decisions.md](product-decisions.md).
Nächstes vorgesehenes Paket: **01**, erst nach gesondertem Auftrag auf festgelegtem
Vorgängerstand; noch nicht begonnen.
