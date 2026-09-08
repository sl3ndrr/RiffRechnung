# Umsetzungsstatus

Stand: 2026-09-07, Paket 04. Tatsächliches `main` geprüft:
`b7babea58bcb2f9a0423870eadaf7b18109f3eec`. PRs #21/#22 wurden in ihre
Vorgängerbranches übernommen, die anschließend gelöscht wurden; deren Paket-02/03-
Inhalte sind noch nicht in `main`. Keine `AGENTS.md` im vollständig geprüften Tree.
Kein Merge und kein Deployment durch diesen Auftrag.

## Paketfolge

Alle noch nicht bearbeiteten Befunde gelten **laut Analyse offen**, nicht als
erneut bestätigt. Bestätigung/Korrektur erfolgt erst im zugehörigen Paket.
00–12 werden in Reihenfolge umgesetzt; 13–17 sind einzeln wählbar. Nach der letzten
gewählten Erweiterung wird Paket 12 wiederholt.

| Paket | Umfang | R-/F-/N-Zuordnung | Stand |
| --- | --- | --- | --- |
| 00 | Ausgangsbasis, CI, esbuild | R23, R25, N01 | Implementiert und in CI geprüft; administrative Abnahme offen |
| 01 | Gefährliche Abläufe vorläufig absichern | R01–R05, R10, R22 (Sofortschutz) | Sofortschutz implementiert und CI-geprüft; reale Browserabnahmen offen |
| 02 | Fachbefehle, Validatoren, reparierbare Formate | R01, R04, R15; Grundlage R24 | Implementiert und CI-geprüft; reale Browser-/Mailprogrammabnahmen offen |
| 03 | Speicherung, Backups, isolierte Demo | R05, R08, R22, N06; schrittweise R24 | Implementiert; CI-/Browsernachweise unten, native Dateirechte offen |
| 04 | Originalbelege und Korrekturen | R03, R09, R10, F03, N09; schrittweise R24 | Implementiert; abschließende CI-/Browserabnahme läuft |
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

## Bisherige Pakete

| Paket | Ergebnis / Abhängigkeit | Nachweis |
| --- | --- | --- |
| 00 | PR #19: gemeinsame Node-22-CI, Testtypen, esbuild; R23/R25/N01 | 45/45 Tests; Pflichtstatuscheck administrativ offen |
| 01 | PR #20: vorläufiger Original-, Aufteilungs-, Datei- und Demoschutz | 56/56 Tests; in 03 werden nur Datei-/Demo-Sperren fachlich ersetzt |
| 02 | PR #21, `3433c9c0fbab8f57ee66ce669a856a2d82fb43e9`: Fachbefehle, Format 3, ID-Reparatur, Mailboxen; R01/R04/R15, Grundlage R24 | 74/74 Tests; [CI 34056037557](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34056037557) |
| 03 | PR #22, `203f07c93f90eed40e049956e55a58e3e654714f`: gemeinsamer Schreibdienst, Protokoll 4, sichere Versionsdateien und isolierte Demo; R05/R08/R22/N06 | 101/101 Fachtests, 8/8 Browserprüfungen; [CI 34087436918](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34087436918) |

Historische Einzelbefunde und CI-Fehlerzuordnung: [quality-gates.md](quality-gates.md).
Produktregeln: [product-decisions.md](product-decisions.md).

## Paket 04 – Originalbelege und nachvollziehbare Korrekturen

- **Ausgangsstand:** Fachliche Basis ist Paket 03,
  `203f07c93f90eed40e049956e55a58e3e654714f`, Tree
  `860865368a3dd58f532128571ba84bfd00984128`; alle 67 Dateien anhand ihrer Git-Blobs
  verifiziert. R03/R10 waren nur vorläufig gesperrt; vollständige Versionen und
  sicherer Korrekturweg fehlten. R09 (uneinheitlicher Snapshot-Zugriff) und N09
  (nicht einsehbare Snapshot-Differenzen) am aktuellen Code bestätigt.
- **Ergebnis:** Branch `codex/paket-04-belegversionen`,
  [PR #24](https://github.com/sl3ndrr/RiffRechnung/pull/24). PR-Basis ist der
  unveränderte Paket-03-Commit als `codex/paket-04-basis-03`; dadurch bleibt der
  Vergleich auf Paket 04 begrenzt. Die fehlende Übernahme von 02/03 nach `main`
  ist eine Integrationsabhängigkeit, kein in diesem Auftrag ausgeführter Merge.
  R03/R09/R10/F03/N09 implementiert, R24 durch Fachmodule/Selektoren weitergeführt.
- **Änderungen:** Vollständige unveränderliche Belege mit alten Ausgabebeträgen;
  verknüpfte Korrekturentwürfe und ausdrückliche Neuzuordnung gelöschter Personen
  ohne verlorene Positionen. Archiv statt Löschen ausgestellter Belege. Gemeinsame
  Versionsauswahl für Ansicht/Druck/Erinnerung/EPC/CSV. Einsehbare Abweichungen und
  begründete Klärung. Separater Zahlungs-/Verwaltungsverlauf; manuelle Zuordnung
  vorhandener Vollzahlungen innerhalb einer Korrekturkette, Rest/Überzahlung sichtbar.
- **Invarianten:** Originalinhalt bleibt reproduzierbar; keine In-place-Korrektur.
  Nur letzter finalisierter Nachfolger zählt als aktive Forderung. Archivieren
  storniert nichts. Jede Zahlung bleibt einmal mit ihrer Herkunft erfasst;
  Zuordnungswechsel löschen/kopieren kein Geld. Vollständige Versionen, vorhandene
  Snapshot-Differenzen und Verwaltungsverläufe überleben die 200-Ereignis-Grenze.
  DE-IBAN-Regeln, reservierte Nummern/getrennte Kreise, Referenzschutz,
  CSV-Formelabwehr, Rohdatenschutz und Schreibkonfliktprüfung bleiben erhalten.
- **Migration:** Datenschema 4 im bestehenden Speicherprotokoll 4. Altformate 2/3,
  einschließlich alter Umschläge, werden nach Vorschau/Bestätigung migriert;
  vorhandene ID-Reparatur bleibt begrenzt/deterministisch. Bericht
  `riffrechnung-to-v4` Version 1 enthält Belegstände, Quellen, Differenzen und neue
  Verwaltungs-/Zahlungsangaben. Historische Registerbeträge haben Vorrang;
  abweichende bisherige Rechnungssummen bleiben separat erhalten. Altbelege heißen
  ältester verfügbarer Stand; fehlende frühere Versionen werden nicht erfunden.
  Snapshot-Differenzen gelöschter/zurückgesetzter Rechnungen bleiben als unvollständige
  Hinweise sichtbar. Originaltexte/-bytes und Berichte bleiben vor Übernahme im
  Archiv; danach erzeugen Laden/Import keine weitere Reparatur. Neuere unbekannte
  Formate bleiben schreibgeschützt. Rückweg: Originaldatei in getrenntem alten Profil.

| Abnahme Paket 04 | Ergebnis / Nachweisart |
| --- | --- |
| Finalisieren → Stammdaten löschen → Original drucken → Korrektur neu zuordnen → speichern → Reload | Bestanden: Fachprüfung und echter Chromium-Ablauf mit PDF-Textvergleich |
| Betrag, Leistungsdatum, Text und Empfänger ändern; früheren Beleg identisch ausgeben | Bestanden: Schreibschutz-/Korrekturtests und echter PDF-Vergleich |
| A/B und leere Snapshot-Kontofelder in Ansicht, Druck, Erinnerung und Export | Bestanden: Funktions-/Ausgabeprüfungen plus Browser und echte PDF-Erzeugung |
| Mehr als 200 Aktionen, Archivierung, alle Versionen/Reservierungen und Export–Import | Fachprüfungen bestanden; abschließender Browser-Import in Prüfung |
| Keine doppelte Forderung; bezahlte Korrektur und manuelle Zahlungszuordnung | Fachprüfungen bestanden; Browserzuordnung/Archivierung bestanden, kompletter Importablauf in Prüfung |
| Geld, Referenzen, Migration/Idempotenz, Nummern und Schreibkonflikte nach Reload | Bestanden in Funktionsprüfungen; bisherige zwei echte Tabs bleiben Teil der CI |
| Native Druckdialoge, Drucklayout-Matrix, Banking-App-Scan, OS-Dateirechte | Nicht geprüft; eigenständige spätere/native Abnahmen |

**Prüfstand:** `7eb666e4db7be425b73e8373dac174c329cb4c95`,
[CI 34159150309](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34159150309):
116/116 Fachtests, Installation/Lint/Typecheck einschließlich Tests/Build bestanden;
10/11 Browserprüfungen. Der verbleibende neue Test scheiterte am mehrdeutigen
Datei-Input-Selektor; korrigiert, erneuter Gesamtlauf folgt. Umgebung: Ubuntu
24.04.4, Node 22.23.2/npm 10.9.8, Chromium 153.0.8010.12. Keine Tests gelöscht,
übersprungen oder abgeschwächt. Paketbezogene Zwischenfehler in `quality-gates.md`.
Lokal Node 24.19.0/npm 11.9.0; Node-22-Abruf/Installation E403, reguläre Gates vor
Prozessstart blockiert. Syntax-/Diffprüfungen erfolgreich, kein lokaler CI-Ersatz.

**Grenzen/offen:** Kein Wiederherstellen verlorener Originale, keine automatische
GoBD-Konformität. Unbegrenzte Beleg-/Zahlungsdaten benötigen zusätzlichen Speicher;
Quota-Fehler bleiben sichtbar. Betragsdifferenzen werden manuell geklärt;
Teilzahlungen/Erstattungen und Zahlungstagsauswertungen sind nicht vorgezogen.
Eigenständiger Storno-Workflow gehört nicht zum MVP. Native Datei-/Druck-/Banking-
Abnahmen und administrative Pflichtchecks bleiben offen. Keine neue npm-Abhängigkeit;
CI ergänzt Poppler und ein sieben Tage verfügbares synthetisches Browser-/PDF-Artefakt.

Nächstes vorgesehenes Paket: **05 – Exaktes Geld und Kalenderdaten**, nicht begonnen.
