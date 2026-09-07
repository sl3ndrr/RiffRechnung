# Umsetzungsstatus

Stand: 2026-09-06, Pakete 00/01. Paket 01 baut auf dem noch offenen PR #19 auf. Analyse und Zielbranch `main` wurden
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
| 00 | Ausgangsbasis, CI, esbuild | R23, R25, N01 | Implementiert und in CI geprüft; administrative Abnahme offen |
| 01 | Gefährliche Abläufe vorläufig absichern | R01–R05, R10, R22 (Sofortschutz) | Sofortschutz implementiert und CI-geprüft; reale Browserabnahmen offen |
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
- **Ergebnisstand:** [PR #19](https://github.com/sl3ndrr/RiffRechnung/pull/19),
  Branch `codex/paket-00-quality-gates`, Implementierungscommit
  `f4e42e7a339431ce385d488c19920d6793a4e54f` (anschließend nur Nachweisdokumentation;
  aktueller Ergebnis-Commit und zugehörige CI im PR). Gemeinsamer
  PR-/Pages-Prüfworkflow mit Node 22, `npm ci`, Lint, Tests, Typecheck inklusive
  Tests und Build. Deployment hängt vom erfolgreichen Prüflauf desselben Stands
  ab; Pages-/OIDC-Rechte ausschließlich im Deployment-Job. README nutzt `npm ci`.
  Direkte esbuild-Version 0.25.12, mit npm regeneriertes und gezielt verglichenes Lockfile.
  R24 bleibt fachlich offen; lediglich dessen fehlende Testdatei-Typprüfung ist mit erledigt.
- **Geprüfte Invarianten:** Baseline und esbuild-Testlauf: jeweils 45/45 Tests,
  keine übersprungenen/gelöschten/abgeschwächten Tests; vorhandene Prüfungen zu
  Geld, Referenzen, Import/Reload, Nummernreservierung, CSV und beschädigten
  Rohdaten laufen mit. Das ist keine vollständige fachliche Freigabe der offenen
  Pakete. Produktionsquelltext und Datenformat bleiben unverändert.
- **Migration:** keine; Schema 2, gespeicherte Rechnungen, Snapshots und Rohdaten
  werden durch Paket 00 nicht verändert. Ein Git-Revert betrifft nur Werkzeug-/CI-Konfiguration und Dokumentation.
- **Nachweise/offene Abnahmen:** [Qualitätsschranken](quality-gates.md). PR-CI
  erfolgreich. Kontrollierter Testfehler verhindert Build, Pages-Artefakt und
  abhängigen Veröffentlichungs-Prüfjob; nach Entfernen des Fehlers sind diese
  Voraussetzungen erfolgreich. Testdatei-Typfehler wird mit TS2322 erkannt und
  nach Entfernen wieder fehlerfrei geprüft. R23 technisch behoben, administrative
  Pflichtchecks noch offen; R25/N01 behoben. Lokale Installation bleibt blockiert.
  Verpflichtender Branch-Statuscheck fehlt; klassischer Schutzendpunkt nicht lesbar.
  Keine echte Fokus-, Dateiberechtigungs-, Druck- oder Banking-App-Abnahme.

Produktregeln und offene fachliche Entscheidungen: [product-decisions.md](product-decisions.md).
## Paket 01

- **Ausgangsstand:** `main` weiterhin
  `ba7857fd9180fa392c42a0235643e478e5077ee5`. Arbeits-/PR-Basis ist der aktuelle
  Paket-00-Branch `codex/paket-00-quality-gates`, Commit
  `d627d1333fc94f6a9628c3f9d6a1ca17128244fd` (PR #19 noch offen).
  Alle 44 Dateien blobverifiziert, keine `AGENTS.md`. Dessen
  [CI 34025170731](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34025170731)
  ist erfolgreich; keine erneute lokale Baseline-Ausführung möglich.
- **Ergebnisstand:** [PR #20](https://github.com/sl3ndrr/RiffRechnung/pull/20),
  Branch `codex/paket-01-sofortschutz`, gegen PR-19-Branch. Implementierung
  `1f30b4848d17efc36be4f7483f896f3fec33ee77`, mit korrigierter Test-Typisierung
  `e491d440d9baa6ec251570da65bc0eb3187fa399`. Danach nur Nachweisdokumentation;
  abschließender Ergebnis-Commit und zugehörige CI im PR. Kein Merge/Deployment.
- **Aktuell bestätigte Befunde:** R01/R02 (ungeprüfte Kopien aller Positionen),
  R03/R10 (Snapshot-Verlust/Empfängerabweichungen), R04 (ungeprüfte Standardpreise),
  R05 (direkte Datei-Schreibwege), R22 (ungeprüfter Austausch durch Demo).
  Behoben sind deren gefährliche Zugänge durch Sofortschutz; vollständige fachliche
  Lösungen bleiben in den Folgepaketen offen. Keine F-/N-Erweiterung implementiert.
- **Änderungen:** Testbare Funktionen für Speichern/Finalisieren/Status, Preis-
  Übernahme und Sperren aus `App.tsx` herausgezogen. Keine automatische Aufteilung;
  gemeinsame Rechnung nur bei durchgehender Empfänger-Kind-Zuordnung. Lokale rohe
  Preiseingaben, letzter gültiger Wert bleibt. Originalschutz auch bei Löschung,
  Bestandsaustausch und Zurücksetzen; Statuspflege separat. Bestehende Struktur-
  validierung vor Übernahme verhindert neue unlesbare Referenzen. Ordnerzugriffe
  prüfen nur lesend, alle Datei-Schreibwege stoppen. Demo prüft auch Teil-Einrichtung,
  ausstehende Einstellungen und Ordnerabruf. Deutsche IBAN bei neuer Verwendung.
- **Invarianten/Tests:** Gezielte Funktionsregressionen für 2/3 Familien, eindeutige
  Einzel-/Geschwisterrechnungen, Preise, Referenzen/Positions-IDs, Snapshots,
  Statuswechsel, reservierte/getrennte Nummern, Datei-Konflikte, Demo und deutsche
  IBAN. Erlaubte Übergänge werden serialisiert, importiert und mit Storage-Mocks
  neu geladen; wiederholter Import darf keine weiteren Inhaltsänderungen bewirken.
  Betroffene Quelltextmuster-Tests werden fachlich ersetzt; vorhandene CSV-, Geld-,
  Altformat- und Rohdatenschutztests bleiben. **56/56 Tests bestanden**, keine
  übersprungenen Tests; bisherige Prüfabsichten erhalten, geänderte Produktregeln
  fachlich ersetzt. Lint, Typecheck einschließlich Tests und Build erfolgreich
  unter Ubuntu 24.04.4, Node 22.23.2/npm 10.9.8 im
  [Lauf 34039578186](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34039578186)
  für `e491d440…`. Erster CI-Lauf: ebenfalls 56/56 Tests, danach TS2339 in der neuen
  Test-Hilfsfunktion; korrigiert, keine Baseline-Regression und kein abgeschwächter Test.
- **Migration:** keine; Schema 2 und bisherige Altformat-Unterstützung unverändert.
  Keine Reparatur negativer Preise, doppelter Alt-IDs, ausgestellter Beträge oder
  Snapshots. Beschädigte/neue unbekannte Formate bleiben geschützt; Rohdatenexport
  und separater JSON-Export bleiben verfügbar. Kein automatisches Überschreiben
  vorhandener Sicherungen. Ein Revert hebt die Sperren wieder auf, ohne Daten zu migrieren.
- **Vorläufige Sperren/Folgepakete:** Aufteilung → 06 (Alt-ID-Reparatur → 02);
  Originalbearbeitung/Snapshot-Korrektur/Zurücksetzen/Löschen und Bestandsaustausch
  mit ausgestellten Belegen/reservierten Nummern → 04, Import-Speicherdienst → 03;
  alle Ordner-Schreibwege und Demo bei begonnenem Echtbestand → 03;
  vollständige Preis-/Fachvalidierung → 02/05, Rechnungsprofil/EPC → 07.
- **Offene Nachweise:** Lokale Laufzeit Node 24.19.0/npm 11.9.0 statt Node 22.
  Node-22-Abruf und `npm ci` liefern E403; Lint/Tests/Typecheck/Build vom Werkzeug
  vor Prozessstart abgebrochen. Node-24-Syntaxprüfung der neuen TS-Dateien und
  `git diff --check` erfolgreich; reguläre CI-Schranken erfolgreich wie oben.
  Keine echten Browser-, Dateiberechtigungs- oder Mehrtabprüfungen; kein Druck-/Banking-Scan.
  Verzögertes lokales Speichern und historische Darstellungs-Fallbacks bleiben
  Aufgaben der Pakete 03/04/07. Administrative Pflichtchecks aus Paket 00 bleiben offen.

| Abnahmekriterium Paket 01 | Ergebnis |
| --- | --- |
| Kein fremdes Kind / keine vervielfachte Forderung über Aufteilung | Bestanden in Funktionsprüfungen für 2/3 Familien; Einzel-/Geschwistergegenproben bestanden |
| Preise, historisches Zurücksetzen und Empfängeränderung erzeugen keine unlesbaren Daten | Bestanden einschließlich unveränderter Originale, Statuspflege, Import und simuliertem Reload |
| Leerer Browser / vorhandenes Backup und veralteter Tab / manuelles Backup | Bestanden mit Datei-/Storage-Mocks: keine Dateierzeugung, kein Schreibstream und unveränderte Bytes |
| Demo verändert keine begonnenen Echtdaten | Bestanden für Teil-Einstellungen, Daten, ausstehende Eingabe und Ordnersperren mit synthetischen Beständen |
| Gezielte Regressionen und dokumentierte Sperren/Folgepakete | Bestanden; 56/56 Gesamttests und alle CI-Schranken |
| Echte Browserbedienung, Dateirechte und parallele Tabs | Nicht geprüft; Mocks belegen diese Abnahme nicht |

Weitere Ausführungsdetails: [quality-gates.md](quality-gates.md).

Nächstes vorgesehenes Paket: **02**, nur nach gesondertem Auftrag; nicht begonnen.
