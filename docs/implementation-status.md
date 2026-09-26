# AP4 – Ausgabe der Steuerkennung und des Befreiungshinweises

Stand 26.09.2026: Arbeitsbranch `codex/ap4-tax-output-options` auf AP3-Head
`c010cf4d`, gestapelter [Entwurfs-PR #39](https://github.com/sl3ndrr/RiffRechnung/pull/39).
AP1 liegt auf `main`; AP2 hat einen getrennten offenen Branch, AP5 ist nicht
integriert. Schema 8 wird vor seiner Freigabe additiv genutzt. Neue
Rechnungen wählen Kennungsausgabe und Hinweisposition je Beleg; der konkrete
Drucktext und die Kennung werden in der Belegversion gesichert. Der
Altbeleg-Druck wurde vor dem Umbau mit Fach- und PDF-Test charakterisiert.
Die mehrseitige Fußzeile ist bei der Endsumme verankert. Keine
Empfängeranschriftänderung über AP3 hinaus. Kein Merge und kein Deployment.

# AP3 – Empfängerkontakte und Rechnungsart

Stand 25.09.2026: Ausgang `main` 47f491eecbebb788bf6f63aea2b1342bc3dfbd85
(AP1 integriert; AP2/AP4/AP5 nicht integriert). Der lokale Arbeitsbereich war
kein Checkout; die Repositorydateien wurden über den verbundenen GitHub-Zugriff
geprüft. Schema 8 für optionale getrennte Kontaktnamen und Rechnungsart;
Speicherprotokoll 4 und Archivformat 1 bleiben. Schema 7→8 erfolgt mit
kontrolliertem Bericht und Originalarchiv. Noch nicht zusammengeführt oder
bereitgestellt. [Entwurfs-PR #38](https://github.com/sl3ndrr/RiffRechnung/pull/38)
und Ergebniscommits `b8ff8b91` / `0e5c54bf` mit
[CI 36179170530](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36179170530) /
[CI 36181722538](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36181722538):
jeweils 155 Fach- und 44 Browserprüfungen, Lint, Typecheck, Build und Audit
bestanden. Wechselnde Downloadfehler in Zwischenläufen sind weiterhin ein
CI-Reproduzierbarkeitsrisiko; Details stehen in den Qualitätsschranken. Weitere
Testergebnisse und Grenzen stehen in
[release-readiness.md](release-readiness.md).

Neue Kontakte benötigen Vor- und Nachname. Historische Anzeigenamen bleiben
unverändert und werden erst bei einer späteren Bearbeitung ausdrücklich
aufgeteilt oder bestätigt. Kinder behalten ihren einzelnen Leistungsnamen.
Standardrechnungen verlangen weiterhin Empfängeranschriften. Die ausdrücklich
gewählte Kleinbetragsrechnung erlaubt fehlende Empfängeranschriften nur bis
25.000 Cent. Die gemeinsame Abschlussfunktion prüft auch Korrekturen; die
Rechnungsart steht in Beleginhalt und Snapshot. Neue gespeicherte Entwürfe
halten ihren Druckstand fest, ohne eine Nummer zu vergeben.

Die frühere Folge 00–17 und AP1 stehen nachfolgend als historische Abschnitte.

# AP1 – Neue Rechnungsaufteilung entfernen

Stand 2026-09-24: Arbeitsbranch `codex/ap1-remove-invoice-split`, Ausgang `main` 1449d596e6538d32f4c22ef3a0b2f845ef1aed71. AP2–AP5 noch nicht integriert. [PR #36](https://github.com/sl3ndrr/RiffRechnung/pull/36): Implementierungscommit `02e712c519d4f833552837a66b63bad06fd73ad9`; [CI 36063143264](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36063143264) mit 148 Fach- und 43 Browserprüfungen, Lint, Typecheck, Build und Audit erfolgreich. Lokal war kein Git-Checkout verfügbar; die Auditdateien wurden über den verbundenen GitHub-Zugriff bereitgestellt.

AP1 entfernt die neue Empfänger-/Centaufteilung samt UI, Vorschau und Mehrfach-Speicherbefehl. Neue `separate`-Entwürfe und direkte Abschlüsse sind gesperrt. Historische Ausgaben und Korrekturen bleiben erhalten; Kopien von aufgeteilten Belegen sind gesperrt. Einzel- und Mehrpersonenrechnungen nutzen `joint`. Offene Altentwürfe werden nach ausdrücklicher Prüfung atomar übernommen. Kein Schemawechsel (7), keine stille Korrektur historischer Angaben.

Die unten dokumentierte Paketfolge 00–17 ist eine frühere Umsetzung und nicht die AP-Serie. Paket 06 bleibt ein historischer Entwicklungsstand; seine Neuanlage wurde durch AP1 abgelöst.

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
