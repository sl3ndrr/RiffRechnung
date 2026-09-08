# Umsetzungsstatus

Stand: 2026-09-08, Paket 06. Zielbranch `main` zu Beginn vollständig geprüft:
`5b960d4c9ad46251a967d719b5b2f0c07260d145`, Tree
`0328211bf1003796ed731eb73bb691de65fa38e7`. Pakete 00–05 sind gemergt.
Keine `AGENTS.md` im vollständigen Repository-Tree. Arbeitsbranch:
`codex/paket-06-empfaengerzuordnung`, [PR #27](https://github.com/sl3ndrr/RiffRechnung/pull/27).
Kein Merge oder Deployment in diesem Auftrag.

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
| 04 | Originalbelege und Korrekturen | R03, R09, R10, F03, N09; schrittweise R24 | Implementiert; 116/116 Fachtests und 11/11 Browserprüfungen bestanden |
| 05 | Exaktes Geld und Kalenderdaten | R06, R12; schrittweise R24 | Implementiert; 123/123 Fachtests und 13/13 Browserprüfungen bestanden |
| 06 | Aufteilung nach Empfängern | R02; Integration R01; schrittweise R24 | Implementiert; vollständiger CI-Nachweis unten |
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
  Geprüfter Implementierungsstand: `67a8a689ef1d1888d091619ee655011c079ed6ac`;
  anschließend ausschließlich Nachweisdokumentation. R03/R09/R10/F03/N09 im
  Paketumfang behoben; R24 durch Fachmodule/Selektoren weitergeführt.
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
| Mehr als 200 Aktionen, Archivierung, alle Versionen/Reservierungen und Export–Import | Bestanden: 205-Aktionen-Fachprüfung sowie Browserarchivierung, JSON-Download, Import und Reload |
| Keine doppelte Forderung; bezahlte Korrektur und manuelle Zahlungszuordnung | Bestanden: Fachprüfungen und vollständiger Browserablauf, einschließlich Korrektur im Folgejahr und Vorjahres-CSV |
| Geld, Referenzen, Migration/Idempotenz, Nummern und Schreibkonflikte nach Reload | Bestanden in Funktionsprüfungen; bisherige zwei echte Tabs bleiben Teil der CI |
| Native Druckdialoge, Drucklayout-Matrix, Banking-App-Scan, OS-Dateirechte | Nicht geprüft; eigenständige spätere/native Abnahmen |

**Prüfstand:** `67a8a689ef1d1888d091619ee655011c079ed6ac`,
[CI 34188112394](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34188112394):
**npm ci, Lint, 116/116 Fachtests, Typecheck einschließlich Tests, Build,
Browserinstallation und 11/11 Browserprüfungen erfolgreich.** Umgebung: Ubuntu
24.04.4, Node 22.23.2/npm 10.9.8, Chromium 153.0.8010.12. Synthetische PDFs und
Browserergebnisse als CI-Artefakt `browser-evidence`. Der ausgecheckte PR-Merge-Tree
ist identisch mit dem Implementierungs-Tree. Keine Tests gelöscht, übersprungen
oder abgeschwächt; Zwischenfehler sind in `quality-gates.md` zugeordnet. Der
abschließende reine Dokumentationscommit wird erneut vollständig durch CI geprüft;
sein konkreter Commit und Lauf stehen im PR und Abschlussbericht.
Lokal Node 24.19.0/npm 11.9.0; Node-22-Abruf/Installation E403, reguläre Gates vor
Prozessstart blockiert. Syntax-/Diffprüfungen erfolgreich, kein lokaler CI-Ersatz.

**Grenzen/offen:** Kein Wiederherstellen verlorener Originale, keine automatische
GoBD-Konformität. Unbegrenzte Beleg-/Zahlungsdaten benötigen zusätzlichen Speicher;
Quota-Fehler bleiben sichtbar. Betragsdifferenzen werden manuell geklärt;
Teilzahlungen/Erstattungen und Zahlungstagsauswertungen sind nicht vorgezogen.
Eigenständiger Storno-Workflow gehört nicht zum MVP. Native Datei-/Druck-/Banking-
Abnahmen und administrative Pflichtchecks bleiben offen. Keine neue npm-Abhängigkeit;
CI ergänzt Poppler und ein sieben Tage verfügbares synthetisches Browser-/PDF-Artefakt.

## Paket 05 – Exaktes Geld und Kalenderdaten

- Ausgangsbefunde R06/R12 am aktuellen Code bestätigt: binäre Multiplikation vor
  Rundung, direkte Detailmultiplikation, Euro- statt Centaggregation, Monatsüberlauf
  und UTC-Ableitung neuer Rechnungsdaten. Implementierung in `money.ts`/`calendar.ts`;
  gemeinsame Rechnung in allen betroffenen Ausgabekanälen, genaue neue Belegversionen.
- Schema 5 übernimmt 2/3 über historische Betragssicherung und 4 ohne Änderung
  vorhandener Originale. Präzision bleibt erhalten; Migrationsbericht und Editor
  zeigen geänderte Entwurfsbeträge. Rohdaten/Archive, Wiederherstellung, unbekannte
  Formate und Idempotenz bleiben geschützt. Produktregeln siehe Entscheidungsdatei.
- Regressionen: Halbcent, 100.000 Werte gegen Python Decimal, Grenzen/Überlauf,
  JSON/Import/Reload, Originalbeträge, Nummern, Berlin/UTC, Mitternacht, Schaltjahr,
  Jahreswechsel, Sommerzeit und Kopierablauf. Vorhandene Referenz-/Konflikttests bleiben.
- Lokale Umgebung Node 24.19.0/npm 11.9.0 statt gefordertem Node 22. `npm ci` und
  `npm view node@22 version --json --fetch-retries=0 --fetch-timeout=20000`: E403.
  Lint/Test/Typecheck/Build vor Prozessstart blockiert; keine lokalen Testergebnisse.
  CI übernimmt alle vorhandenen Gates einschließlich Testtypen und Chromium/PDF.
  Prüflauf [34213179499](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34213179499)
  gehört zu `238fb7380abf791ba802fc2526a6c4cf9141c0ba`: npm ci, Lint,
  123/123 Fachtests, Typecheck, Build, Browserinstallation und 13/13 Browserprüfungen
  bestanden. Ubuntu 24.04.4, Node 22.23.2/npm 10.9.8, Python 3.12.3,
  Chromium 153.0.8010.12. Untercentpreisanzeige und ergänzte Grenzprüfungen
  sind enthalten. Der geprüfte PR-Merge-Tree stimmt mit dem Implementierungs-Tree
  überein. Danach ausschließlich README-/Nachweisdokumentation; der abschließende
  Dokumentationscommit wird erneut durch dieselben CI-Schranken geprüft.
  Ergebnisbranch/PR: [#26](https://github.com/sl3ndrr/RiffRechnung/pull/26).
  Zwischenfehler und Baseline sind in `quality-gates.md` getrennt zugeordnet.

| Abnahme Paket 05 | Ergebnis |
| --- | --- |
| 0,75 × 10,10 = 7,58; Halbcent, Viertelstunden, Hundertstel, mehrere Positionen, Grenzen | Bestanden (Fachtests) |
| Unabhängige exakte Wertematrix, 100.000 Kombinationen | Bestanden (Python Decimal) |
| Editor, Liste/Details, Dashboard, Berichte, CSV, Erinnerung, EPC-Betrag und PDF | Bestanden (Fach-/Chromiumprüfungen); reservierte historische Registerbeträge bleiben erhalten |
| Historische 7,57 unverändert; neue Version 7,58; Untercentpräzision, JSON/Import/Reload | Bestanden; originale PDF-Texte und gesicherte Beträge geprüft |
| Januar→Februar, Schaltjahr/Jahreswechsel, Berlin 00:30, UTC und Sommerzeit | Bestanden (Kalender- und Befehlsprüfungen) |
| Deutsche IBAN-Regel, getrennte/reservierte Nummern, Referenzen, CSV-Formelabwehr, Rohdaten- und Schreibkonfliktschutz | Bestehende Regressionen weiter bestanden |
| Native Druckdialoge/Dateirechte, Banking-App-Scan, umfassende Layoutmatrix | Nicht geprüft; spätere/native Abnahmen |

R06/R12 im Paketumfang behoben, R24 durch Fach-/Ablaufprüfungen weitergeführt.
Keine weiteren F-/N-Befunde als behoben beansprucht. Kein Merge/Deployment.
Migrationsrückweg und neue Grenzen sind dokumentiert; Zahlungstagswahl/Jahreszuordnung
bleiben Paket 08, Aufteilung bleibt bis Paket 06 gesperrt.

Nächstes vorgesehenes Paket: **07 – Rechnungsprofil, deutsche IBAN und Zahlungsdaten**, nicht begonnen.

## Paket 06 – Empfängerbezogene Rechnungsaufteilung

- **Ausgang und Befund:** Basis `main` ist
  `5b960d4c9ad46251a967d719b5b2f0c07260d145`. R02 und die letzte R01-Integration
  am aktuellen Code bestätigt: Der UI-Weg war gesperrt, der Direktweg lehnte nur
  pauschal ab, und es gab keine fachliche Zuordnung/Vorschau. Die historische
  Vervielfältigung hätte vollständige Kinder-/Positionsmengen je Empfänger kopiert.
- **Ergebnis:** `invoiceSplit.ts` bildet Voll- und bestätigte Centzuordnungen auf
  datensparsame Ergebnisrechnungen ab. Der Editor zeigt Empfänger, Kinder,
  Positionen, Einzel- und Gesamtsummen, bevor alle Ergebnisse als Entwürfe oder
  finalisiert in einem Übergang angelegt werden. Resultate erhalten neue Rechnungs-,
  Positions- und Beleg-IDs; Nummern folgen den vorhandenen getrennten Kinderkreisen.
  Fremde Kindreferenzen und namentliche Fremdkinddaten in Ausgabetexten sperren.
- **Invarianten:** Jede Quellposition ergibt über alle Ergebnisse exakt einmal ihren
  Centbetrag. Keine Quote wird geraten. Teilbeträge müssen ganze Cent sein und exakt
  summieren; der Rest ist sichtbar und nur ausdrücklich zuweisbar. Snapshot, Kopf,
  Druck und Erinnerung beziehen Personen/Kinder aus der einzelnen Ergebnisrechnung.
  Zusätzliche Ausgabe desselben Belegs erzeugt keinen Zustand und keine Forderung.
  Ein Fehler liefert keinen Folgezustand; Zähler/Nummern bleiben unverändert.
- **Historie/Migration:** Kein Formatwechsel; Schema 5 und Speicherprotokoll 4
  bleiben unverändert. Ergebnisrechnungen bestehen daher vorhandenen Export-/Import-
  und Reload-Vertrag. Historische `separate`-Belege mit Provenienz
  `oldest-available` werden nur sichtbar zur Einzelkorrektur markiert; Beträge,
  Snapshots, Belege, Nummern und Rohdaten bleiben unverändert. Neuere unbekannte
  Formate, Wiederherstellungsarchive und Konfliktschutz bleiben unberührt.
- **Nachweis:** Implementierungscommit
  `4929c80758b1d77286eed17cbb38643c9a70ee88`. Lokal Node 24.19.0/npm 11.9.0
  statt Node 22; `npm ci` scheiterte an Registry-E403 (`yocto-queue`). Syntaxprüfung
  der geänderten `.ts`-Dateien und `git diff --check` erfolgreich, kein Ersatz für
  Lint/Test/Typecheck/Build. Vollständiger Node-22-PR-Lauf wird dem Ergebniscommit
  in `quality-gates.md` zugeordnet. Der erste Lauf 34234548343 bestand Installation,
  Lint, 130/130 Fachtests, Test-Typecheck und Build; 13/14 Browserprüfungen. Der
  fehlende Kindesname in Einzelkind-PDFs wurde als Implementierungsbefund korrigiert.

| Abnahme Paket 06 | Ergebnis |
| --- | --- |
| Zwei Familien, je 30 EUR, zwei Belege und 60 EUR gesamt; nur passendes Kind in Snapshot/PDF | Implementiert; CI-Ausführung ausstehend |
| Gemeinsame Eltern, getrennte Haushalte, Geschwister, Mehrfachberechtigte, zwei/drei Empfänger, Mehrdeutigkeit | Implementiert; CI-Ausführung ausstehend |
| Belegkopien ohne neue Forderung; bestätigte Teilbeträge summengleich und sichtbar | Implementiert; CI-Ausführung ausstehend |
| Entwurf/Finalisierung nach Export–Import und Speichern–Reload; Nummern/IDs | Implementiert; CI-Ausführung ausstehend |
| Native Druckdialoge/Dateirechte, Banking-App-Scan | Nicht geprüft; nicht Gegenstand dieses Pakets |

R02 und die R01-Aufteilungsintegration sind im Paketumfang implementiert; R24 wird
durch Fach-, Speicher- und echten Browser-/PDF-Ablauf fortgeführt. Keine weiteren
R-/F-/N-Befunde werden als behoben beansprucht. Produktannahmen stehen in
`product-decisions.md`.
