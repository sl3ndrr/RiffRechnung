# Umsetzungsstatus

Stand: 2026-09-09, Paket 10. Zielbranch `main` zu Beginn vollständig geprüft:
`cacd7e4135ab37b57c7063777c4a836cf2fcd3a1`. Pakete 00–09 sind gemergt.
Keine `AGENTS.md` im vollständigen Repository-Tree. Arbeitsbranch:
`codex/paket-10-tastatur-dialoge`.
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
| 07 | Rechnungsprofil, deutsche IBAN, Zahlungsdaten | R07, R13 angepasst, R14 | Implementiert; vollständiger CI-Nachweis unten |
| 08 | Zahlungstag und Berichte | R11, F02 (MVP); schrittweise R24 | Implementiert; vollständiger CI-Nachweis unten |
| 09 | Druck und GiroCode | R16, R21, N03, N08 | Implementiert und CI-geprüft; native Druck-/Banking-Abnahme offen |
| 10 | Tastatur, Dialoge, Navigation, Kontrast | R17–R20, N05, N07 | Implementiert; CI- und manuelle Screenreader-Abnahme offen |
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

Paket 07 ist im folgenden Abschnitt dokumentiert.

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
  Lint/Test/Typecheck/Build. Node-22-Lauf
  [34235461660](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34235461660)
  auf `670ce56a0edde9029990b9fd596c5e4f9ae76d16` bestand npm ci, Lint, 130/130
  Fachtests, Test-Typecheck, Build und 14/14 Chromium-/PDF-Prüfungen. Der erste Lauf
  34234548343 bestand Installation,
  Lint, 130/130 Fachtests, Test-Typecheck und Build; 13/14 Browserprüfungen. Der
  fehlende Kindesname in Einzelkind-PDFs wurde als Implementierungsbefund korrigiert.

| Abnahme Paket 06 | Ergebnis |
| --- | --- |
| Zwei Familien, je 30 EUR, zwei Belege und 60 EUR gesamt; nur passendes Kind in Snapshot/PDF | Bestanden, Fach- und echter Chromium-/PDF-Ablauf |
| Gemeinsame Eltern, getrennte Haushalte, Geschwister, Mehrfachberechtigte, zwei/drei Empfänger, Mehrdeutigkeit | Bestanden, Fachprüfungen |
| Belegkopien ohne neue Forderung; bestätigte Teilbeträge summengleich und sichtbar | Bestanden, Fachprüfung; wiederholte PDF-Ausgabe im Abschlusslauf |
| Entwurf/Finalisierung nach Export–Import und Speichern–Reload; Nummern/IDs | Bestanden, Fach- und Browserprüfung |
| Native Druckdialoge/Dateirechte, Banking-App-Scan | Nicht geprüft; nicht Gegenstand dieses Pakets |

R02 und die R01-Aufteilungsintegration sind im Paketumfang implementiert; R24 wird
durch Fach-, Speicher- und echten Browser-/PDF-Ablauf fortgeführt. Keine weiteren
R-/F-/N-Befunde werden als behoben beansprucht. Produktannahmen stehen in
`product-decisions.md`.


## Paket 07 – Kleinunternehmerprofil und deutsche Zahlungsdaten

- **Ausgang und Befund:** Basis `main` ist
  `455b53d28149bfaea607b7ad0ca43851248ec60d`. R07, der auf Deutschland
  begrenzte Anteil von R13 und R14 wurden am aktuellen Code bestätigt:
  Aussteller-/Empfängerpflichtfelder und Steuerkennung waren nicht strukturiert,
  die IBAN-Prüfung enthielt eine allgemeine SEPA-Länderliste, und eine bewusst
  leere Snapshot-BIC konnte durch heutige Einstellungen ersetzt werden.
- **Profil:** Nach ausdrücklicher Nutzerentscheidung unterstützt die App für neue
  Rechnungen das Kleinunternehmerprofil nach § 19 UStG. Vollständige Namen und
  Anschriften von Aussteller und allen Empfängern, Profil sowie genau eine
  ausdrücklich typisierte Steuerkennung (Steuernummer, USt-IdNr. oder
  Kleinunternehmer-Identifikationsnummer) sind finalisierungsrelevant. Die
  Kleinbetragsausnahme wird nicht automatisch aktiviert. Unvollständige
  Einstellungen und Entwürfe bleiben speicherbar; Finalisierung nennt jedes
  fehlende Feld und vergibt bei Fehlern keine Nummer.
- **Zahlungsdaten:** Eine gemeinsame Fachfunktion normalisiert IBAN/BIC und wird
  von Einstellungen, Finalisierung, Druck und EPC verwendet. Neue Verwendung
  akzeptiert ausschließlich 22-stellige deutsche IBANs mit gültiger
  Modulo-97-Prüfsumme. Nicht-DE, Länge/Format und Prüfsumme haben getrennte
  deutsche Fehlermeldungen. BIC ist für den unterstützten deutschen
  Empfängerkontofall optional, wird bei Eingabe aber früh auf 8/11 Stellen und
  ISO-Zeichenstruktur geprüft. Prüfsumme/BIC bestätigen weder Inhaber noch
  Erreichbarkeit.
- **Snapshots/Invarianten:** Neue Belege frieren Profil, konkrete Steuerkennung,
  vollständige Personen, Zahlungsempfänger, IBAN, BIC und Betrag ein. Sichtbarer
  Bankblock und EPC lesen dieselbe ausgewählte Version. Vorhanden-leere BIC bleibt
  leer; heutige Kontoeinstellungen werden nicht ergänzt. Historische Snapshots
  ohne Profilfelder bleiben ohne diese Felder. Getrennte/reservierte Nummern,
  Centbeträge, Referenzschutz, CSV-Formelabwehr, Rohdatenschutz und
  Schreibkonfliktschutz bestehen weiter.
- **Migration:** Schema 6; Speicherprotokoll und Schlüssel bleiben unverändert.
  Formate 2–5 werden kontrolliert nach 6 übernommen. Aktuelle Einstellungen
  erhalten das gewählte Profil und eine leere Steuerkennung, sodass keine neue
  Finalisierung vor bewusster Eingabe möglich ist. Historische Snapshots werden
  nicht ergänzt. Bericht `riffrechnung-to-v6` dokumentiert Quelle und Änderung;
  Originalbytes bleiben vor Übernahme im Wiederherstellungsarchiv. Wiederholter
  Import aktueller Daten ist idempotent. Unbekannte neuere Formate bleiben
  schreibgeschützt. Rückweg: archivierte Originaldatei in getrenntem alten Profil.
- **Grundlagen (Abruf 08.09.2026):** [§ 14 UStG](https://www.gesetze-im-internet.de/ustg_1980/__14.html),
  [§ 34a UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__34a.html),
  [EPC069-12 v3.1](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2024-03/EPC069-12%20v3.1%20Quick%20Response%20Code%20-%20Guidelines%20to%20Enable%20the%20Data%20Capture%20for%20the%20Initiation%20of%20an%20SCT.pdf),
  [SWIFT IBAN Registry, Release 102](https://www.swift.com/resource/iban-registry-pdf)
  und [Deutsche Bundesbank: IBAN-Regeln](https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/iban-regeln/iban-regeln-603042).

| Abnahme Paket 07 | Ergebnis |
| --- | --- |
| Vollständiges Kleinunternehmerprofil / konkrete Feldfehler / Entwurf ohne Nummernverbrauch | Bestanden in Fachtests |
| DE-IBAN normalisiert; Leerwert, Länge, Prüfsumme und gültige Nicht-DE-IBAN getrennt | Bestanden in Fachtests |
| Leere Snapshot-BIC bleibt trotz späterer Kontenänderung in Bankblock und EPC leer | Bestanden in Funktions-/Ausgabeprüfungen |
| Druck und EPC verwenden dieselbe Version von Name, IBAN, BIC und Betrag | Bestanden in Funktions-/Ausgabeprüfungen |
| Export–Import, Migration 2–5, Reload, Idempotenz, Original-/Rohdatenschutz | Bestanden in Fach- und Speicherprüfungen |
| Native Druckdialoge, Betriebssystem-Dateirechte und Banking-App-Scans | Nicht geprüft; spätere/native Abnahmen |

R07, R13 im ausdrücklich deutschen Produktumfang und R14 sind umgesetzt; R24 wird
durch Fach-, Serialisierungs- und Ablaufprüfungen weitergeführt. Rechtliche
Einzelfallfreigabe, Kontoinhaber-/Bankerreichbarkeitsprüfung sowie Zahlerfälle
außerhalb des modellierten Empfängerkontos werden nicht behauptet. CI- und
Zwischenfehlernachweise stehen in `quality-gates.md`.

**Prüfstand:** Implementierungscommit
`2b23a1b976471318f4b5b97ba53fef8efab661ca`,
[CI 34254617161](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34254617161).
Ubuntu 24.04, Node 22.23.2/npm 10.9.8, Python 3.12.3 und Chromium
153.0.8010.12: `npm ci`, Lint, 138/138 Fachtests, Typecheck einschließlich
Testdateien, Build sowie 14/14 Chromium-/PDF-Prüfungen erfolgreich. Keine Tests
fehlgeschlagen oder übersprungen; synthetisches Artefakt `browser-evidence`.
Lokal sind Node 24.19.0/npm 11.9.0 und Git 2.51.1 verfügbar; der Terminalzugriff
auf den GitHub-Clone wurde mit HTTP 403 durch die Umgebung blockiert. Daher sind
lokale npm-Gates nicht behauptet.

Nächstes vorgesehenes Paket: **08 – Zahlungstag und Berichte**, im folgenden Abschnitt dokumentiert.

## Paket 08 – Zahlungstag und Berichte

- **Ausgang und Befund:** Basis `main` ist
  `3332222917daf6662b8e9639251fa7a22f1a4f85`. R11 und F02 (MVP) waren am
  aktuellen Code nachvollziehbar: Der Status setzte einen Zeitpunkt automatisch
  zugleich als Zahlungstag, und Dashboard, Jahresübersicht sowie CSV ordneten
  Zahlungen über das Rechnungsjahr statt über den Geldfluss zu. Keine N-ID ist
  diesem Paket zugeordnet; R24 wird durch Ablauf-, Import- und Reloadprüfungen
  fortgeführt.
- **Ergebnis:** Schema 7 trennt bestätigten Zahlungstag, unbekannten Tag und
  technischen Erfassungszeitpunkt. Vollzahlungen brauchen einen Kalendertag;
  Nachpflege/Korrektur wird als Ereignis nachvollziehbar. `reporting.ts` ist die
  gemeinsame Cent- und Kalenderquelle für Dashboard, Jahresübersicht und
  Jahres-CSV. Kennzahlen heißen Rechnungsvolumen, Zahlungseingänge und offene
  Forderungen am Stichtag.
- **Invarianten:** Rechnungsvolumen nutzt das Rechnungsdatum, Zahlungseingänge
  ausschließlich den bestätigten Zahlungstag. Unbekannte Altzahlungen bleiben
  sichtbar, aber jahrslos. Statusrücknahme löst nur die Zuordnung; Korrekturen
  ersetzen die Forderung ohne den Geldfluss zu duplizieren oder zu löschen.
  Getrennte/reservierte Nummern, exakte Centbeträge, DE-IBAN-Regel,
  CSV-Formelabwehr, Referenz- und Rohdatenschutz bleiben unverändert.
- **Migration/Rückweg:** Formate 2–6 werden mit `riffrechnung-to-v7` nach 7
  übernommen. P6-`paidAt` wird als `legacyPaymentDay` erhalten, jedoch bewusst
  nicht als bestätigter Banktag ausgegeben; `paymentDayStatus` bleibt `unknown`
  bis zur Nachpflege. Bericht und unveränderte Originalbytes werden vor einer
  Übernahme gesichert. Aktuelles Schema 7 migriert beim erneuten Laden/Import
  nicht weiter; unbekannte neuere Formate bleiben schreibgeschützt. Rückweg ist
  die archivierte Originaldatei in einem getrennten Profil mit altem Code.
- **Nachweis:** Fachregressionen decken Dezember-2025-/Januar-2026-Zuordnung,
  Nachpflege/Korrektur, Statusrücknahme, Korrekturbeleg, unbekannten historischen
  Zahlungstag, Formelabwehr und Export–Import–Reload ab. Auf
  `f71d73311fb0559a6438464a007985b6a87f73a6` bestanden in
  [CI 34278036194](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34278036194)
  `npm ci`, Lint, 142/142 Fachtests, Typecheck einschließlich Tests, Build und
  14/14 Chromium-/PDF-Prüfungen. Umgebung: Ubuntu 24.04.4, Node 22.23.2,
  npm 10.9.8, Python 3.12.3, Chromium 153.0.8010.12. Keine Tests wurden
  übersprungen oder abgeschwächt. Lokal: Node 24.19.0/npm 11.9.0; `npm ci
  --fetch-retries=0 --fetch-timeout=20000` scheiterte vor Ausführung mit
  Registry-E403 bei `yocto-queue`; Node 22 ist lokal nicht verfügbar.

| Abnahme Paket 08 | Ergebnis |
| --- | --- |
| Dezemberrechnung 2025, Zahlung Januar 2026: getrennte Jahreswerte | Bestanden in Fachregression und Node-22-CI |
| Nachpflege, Datumsänderung, Statusrücknahme, korrigierter Beleg | Bestanden in Fachregression und Node-22-CI |
| Historischer unbekannter Zahlungstag bleibt sichtbar und jahrslos | Bestanden in Fachregression und Node-22-CI |
| Dashboard, Jahresübersicht, CSV, Saldo sowie Export–Import–Reload | Bestanden in Fachregression; Dashboard-/CSV-Ablauf auch im Chromium-Lauf |
| Native Bank-App-Scan, Druckdialoge und Dateirechte | Nicht geprüft; nicht Gegenstand dieses Pakets |

Nächstes vorgesehenes Paket: **09 – Druck und GiroCode zuverlässig ausgeben**, nicht begonnen.


## Paket 09 – Druck und GiroCode

- **Ausgang / Ergebnis:** R16 (fehleranfälliger GiroCode), R21 (unzuverlässige
  Mehrseitenausgabe), N03 (zu frühes Drucken) und N08 (Textverlust) am geprüften
  Code bestätigt. Ein Druckauftrag enthält jetzt eine unveränderliche Kopie der
  Belegversion, Personen und Einstellungen. Schriften und QR-Bild des *gleichen*
  Auftrags müssen bereit sein; verspätete Ergebnisse werden verworfen.
- **Fachregel:** Die Finalisierungsprüfung bleibt unverändert. Ein EPC-/QR-Fehler
  zeigt seinen Grund und die bewusste Aktion **„Ohne GiroCode drucken“**. Dieser
  Fallback rendert keinen alten oder fehlerhaften QR-Code. BIC-Formatfehler,
  zu lange Payload und Encoder-Ablehnung sind separat regressionsgetestet.
- **Ausgabe / Invarianten:** Rechtstext und Rechnungsreferenz stehen im normalen
  Dokumentfluss; `@page` ergänzt nur Kopf/Seitenzahl. A4-Ränder sind 16/20/22 mm.
  Lange Namen, Anschriften, Kontodaten und Freitexte umbrechen; Zeilenumbrüche
  bleiben erhalten. Die sichtbare 120-Zeichen-Grenze für neue Rechtstexte wird
  vor dem Speichern validiert, historische Texte werden ungekürzt ausgegeben.
  Nummernkreise, Reservierungen, deutsche IBAN-Regel, Beträge/Snapshots,
  CSV-Formelabwehr, Rohdatenschutz sowie Serialisierung/Import/Reload bleiben
  unverändert geschützt.
- **Migration:** Keine Formatänderung; Schema 7, Altformatunterstützung,
  Wiederherstellungsweg und Schutz unbekannter neuer Formate bleiben unverändert.
- **Prüfstand:** Implementierungscommit
  `ee96e44bf56e1e0e0d98a9522bb993f8bb0265f0`,
  [CI 34301220337](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34301220337):
  npm ci, Lint, **143/143** Fachtests, Typecheck einschließlich Tests, Build und
  **17/17** Chromium-Browserprüfungen bestanden. Ubuntu 24.04.5, Node 22.23.2,
  npm 10.9.8, Python 3.12.3, Chromium **153.0.8010.12**. Die CI erzeugt und
  liest synthetische PDFs mit einer, zwei und sieben Seiten; Artefakt
  `browser-evidence` ist sieben Tage verfügbar. Erster sichtbarer Laufzeitfehler
  der neuen Prüfung (CSS-Zeilenmarker) wurde vor diesem Lauf korrigiert; keine
  Tests wurden gelöscht, übersprungen oder abgeschwächt. Lokal: Node 24.19.0/npm
  11.9.0 statt Node 22; der Git-Checkout per `git clone` war in dieser Umgebung
  mit 403 gesperrt. Daher wurden weder `npm ci` noch lokale Gates ausgeführt;
  die CI ist der vollständige Nachweis.

| Abnahme Paket 09 | Ergebnis |
| --- | --- |
| Synthetische PDFs: 1, 2, ≥5 Seiten, Wasserzeichen, Seitenzahlen, lokal gebündelte Schriften, vollständige Rechnungs-/Hinweistexte | Bestanden: echte Chromium-PDFs, Textauszug und visuelle Prüfung |
| Ungültige BIC, überlange Payload, Encoder-Ablehnung, bewusster Druck ohne GiroCode; zwei überlappende Aufträge | Bestanden: Fach- und echter Browserablauf |
| Export–Import–Reload und unveränderte Beleg-/Kontosnapshots | Bestehende Fach-/Browserregressionen bestanden; keine Migration dieses Pakets |
| Nativer Druckdialog, Firefox/Safari-Ausgabe, Banking-App-Scan | Nicht geprüft. Manuell: PDF in Chromium 153 öffnen, QR mit Banking-App scannen und Empfänger, DE-IBAN, optionale BIC, Betrag und Rechnungsnummer gegen den Bankblock prüfen. |

## Paket 10 – Tastatur, Dialoge, Navigation und Kontrast

- **Ausgang / Ergebnis:** R17–R20, N05 und N07 waren am aktuellen Stand
  nachvollziehbar. Rechnungsnummern sind echte Buttons und öffnen Details mit
  Fokus auf deren Schließen-Aktion; Escape schließt Details und gibt den Fokus
  an den Auslöser zurück. Status und Erinnerung sind damit per Tastatur erreichbar.
- **Dialoge:** `Modal`, Bestätigungen und Changelog verwenden native
  `dialog.showModal()`-Dialoge. Hintergrund, Tabreihenfolge, initialer Fokus,
  sichtbares Schließen und Fokusrückgabe folgen dem
  [W3C-Dialogmuster](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
  Verschachtelte Bestätigungen werden bewusst ohne zweiten nativen Top-Layer im
  bestehenden Editor-Dialog gerendert. Der äußere Dialog bleibt modal, nur dessen
  Geschwister werden für die obere Bestätigung `inert`. Der Stapel akzeptiert
  Escape nur oben; der Scrollsperrenzähler bleibt aktiv.
- **Navigation / Verwerfen:** Kompakte Navigation und Neue Rechnung haben
  dauerhafte zugängliche Namen. Geschlossene mobile Navigation ist `inert`;
  Öffnen fokussiert Schließen, Schließen den Auslöser. Geänderte Editorformulare
  fragen beim Schließen/Seitenwechsel; Weiterbearbeiten behält Werte, Verwerfen
  speichert keinen Beleg.
- **Kontrast / Fokus:** Fehlerbuttons verwenden im Dark Theme `#690005` statt
  Weiß auf `#ffb4ab`; kleine Versions-/Backuptexte verwenden stärkeren
  Sekundärtext. Datei-, Chip- und Theme-Eingaben zeichnen den sichtbaren Träger
  bei Tastaturfokus aus. Keine Formatänderung: Schema 7, Altformat-/Rohdaten-
  schutz, Nummern, DE-IBAN, CSV-Schutz und Snapshots bleiben unverändert.
- **Nachweis / offen:** Neue Chromium-Ablaufprüfungen decken 390/900/1280 px,
  Nummer → Status → Erinnerung → Escape, verschachtelte Dialoge, Scrollsperre,
  Verwerfen/Reload, mobile `inert`-Navigation und Kontrastwerte ab. Lokal sind
  Node 24.19.0 statt Node 22 und `npm ci` mit E403 bei `yocto-queue` blockiert;
  CI-Commit/-Lauf wird nach PR ergänzt. Sichtbarer Fokus und Kontraste brauchen
  zusätzlich visuelle Kontrolle. Screenreader-Abnahme: NVDA+Firefox oder
  VoiceOver+Safari für Nummer, Dialogtitel/Schließen, Bestätigung, Changelog und
  Fokusrückgabe manuell prüfen.

| Abnahme Paket 10 | Ergebnis |
| --- | --- |
| 390, 900, 1280 px: Tab/Enter/Escape, Detail, Status, Erinnerung, Rückkehr | Automatisiert implementiert; CI offen |
| Editor + Bestätigung + Changelog: Fokus, Escape-Stapel, Hintergrund/Scrollsperre | Automatisiert implementiert; CI offen |
| Zugänglichkeitsbaum, sichtbarer Fokus, Kontrast beider Themes | Struktur/automatische Werte implementiert; visuelle und Screenreader-Abnahme offen |
| Unbestätigtes Schließen / bestätigtes Verwerfen, Reload ohne Speicherstand | Automatisiert implementiert; CI offen |

Nächstes vorgesehenes Paket: **11 – Sicherheitstexte und Komfort**, nicht begonnen.
