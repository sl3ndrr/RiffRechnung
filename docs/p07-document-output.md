# P07 – Belegausgabe konsolidieren und Importzyklen lösen

## Stand und Ausgangsprüfung

P07 ist auf `simplify/p07-document-output` implementiert. Der Nutzer hat am
2. Oktober 2026 den Merge mit `main` ausdrücklich beauftragt. Vor dem Merge
läuft die vollständige GitHub-Schlussprüfung mit Build, Lint und Browser-/PDF-Tests.

Ausgangspunkt ist `aa150b9d99d6d84a4fb47ff8d737a414ec5e7cf8` auf `main`.
P01 bis P06 sind integriert (PRs 43–48). Der Repository-Baum enthält keine
`AGENTS.md`. Der anfangs leere Arbeitsbereich wurde mit 116 anhand ihrer
Git-Blob-Hashes geprüften Dateien materialisiert; sein Git-Tree entspricht
exakt dem Ausgangsbaum `b0291110b268369341b5eb11040673a39e225447`.

Geprüfte Vorarbeiten: aktuelle Typen/Validatoren enthalten keine abgeschafften
Steuerfelder, Zahler-IBAN oder internen Kontakt-/Personennotizen. `recipients`
bleibt die einzige aktuelle Empfängerzuordnung. Personen- und Kombinationenkennungen,
Nummern, Reservierungen, Originalschutz, beide gemeinsamen Anschriften,
Selbstzahler und GiroCode bleiben erhalten.

## Gewählte Ausgabequelle und historische Ausnahmen

Die kleinste Änderung behält die vorhandenen `DocumentVersion`-Ausgabefelder:
`outputSnapshot`, `outputPeriod` und – bis P09 – `outputLegalText`.
`selectInvoice` verbindet sie mit `content` und den unveränderten gesicherten
`amounts` zur gemeinsamen Projektion für Ansicht, Druck und GiroCode.
Es gibt keine neue Ausgabequelle und keinen neuen Archivtyp.

`content` enthält keine Kopien von `snapshot`, `draftPrintSnapshot`, `period`
oder `legalText` mehr. Alle anderen Inhalte bleiben erhalten. Korrekturentwürfe
übernehmen Zeitraum, Rechtstext und Drucksnapshot aus der bestehenden verbindlichen
Ausgabe, ohne das Original zu verändern.

Die vorhandenen `invoices` bleiben als geschützte Rohbelege vollständig erhalten.
Insbesondere werden ihre möglicherweise abweichenden historischen Snapshots,
Zeiträume und Texte nicht durch die Ausgabeprojektion überschrieben. Sie dienen
nicht als zweite finale Ausgabequelle. Vorhandene `conflicts`, `snapshotHistory`,
`historicalSnapshotCorrections`, Registerbelege und Betragsquellen bleiben gleich.
So bleiben abweichende Beträge, Empfänger, Konto- und Leistungsdaten nachvollziehbar.

Leere eingefrorene Werte bleiben verbindlich. Die Auswahl und die bestehenden
Druck-/Zahlungsdatenfunktionen verwenden keinen Wahrheitswert-Fallback auf heutige
Stammdaten, wenn ein Ausgabesnapshot vorhanden ist. Leere BIC, Bankname und Rechtstext
sowie zwei eingefrorene Anschriften werden gezielt geprüft.

Annahme: Die in E42 genannten redundanten Kopien innerhalb von `DocumentVersion`
werden entfernt; der bestehende geschützte Rohbeleg wird nicht allgemein neu
modelliert. Eine weitergehende Verdichtung von `Invoice` wäre eine zusätzliche
Typen-/Speicheränderung außerhalb der kleinsten E42-Änderung.
`introText`, `legalText`, bestehende Snapshot-Rechtstexte und vorhandene
Text-Konfliktnachweise werden hier nicht inhaltlich bereinigt. Das bleibt P09.
Die P07-Migration archiviert keine entfernten Kopien oder Rohwerte zusätzlich.

## Repräsentation und Imports

Schema **12 → 13** ist ausdrücklich versioniert; Speicherprotokoll 4 bleibt gleich.
Schema 12 wird vor dem Entfernen von Kopien mit seinen bisherigen vollständigen
Inhaltsinvarianten validiert. Manipulierte Alt-Kopien werden abgewiesen.
Danach werden ausschließlich die vier Kopiefelder aus `content` gelöscht.
Der Bericht nennt entfernte Kopien mit einem Platzhalter statt ihren Rohwerten.
Schema 13 lehnt diese Felder in `content` ab. Import, Export, Reload und
erneute Migration sind auf ihre Idempotenz und den Erhalt geschützter Daten geprüft.
Ältere Importstufen bleiben erhalten; P06 läuft nur für Quellen vor Schema 12.

`canonical` liegt jetzt in `src/lib/canonical.ts`; die bisherige Bedeutung
einschließlich Schlüsselordnung, `undefined` und Arrayreihenfolge bleibt gleich.
`documentContent` liegt in `src/lib/documentProjection.ts`. Beide Basismodule
haben ausschließlich Typimporte und importieren weder Validatoren noch Speicherlogik.
`validation.ts` importiert diese Basismodule direkt. Auch der notwendige
Kanonisierungsimport des Legacy-Empfängeradapters führt auf das Basismodul.
Die bestehenden Re-Exports vermeiden unnötige Aufruferänderungen.

## Geänderte Dateien und Abbau

31 Produkt-/Testdateien; dieser Bericht kommt als Dokumentationsdatei hinzu.

| Dateien | Änderung |
|---|---|
| `src/types.ts`, `src/lib/documentProjection.ts`, `src/lib/documents.ts` | Vier redundante Inhaltsfelder entfallen; Korrekturen übernehmen die verbindliche Ausgabe |
| `src/lib/canonical.ts`, `src/lib/legacyContactsRecipients.ts` | Unveränderte Kanonisierung ohne Import auf Validator-/Umschlagmodule |
| `src/lib/legacyDocumentOutput.ts`, `src/lib/importState.ts`, `src/lib/legacyValidation.ts`, `src/lib/validation.ts` | Strenge Altprüfung, eng begrenzte Migration und Schema-13-Invarianten |
| `src/lib/envelope.ts`, `src/lib/storage.ts`, `src/lib/defaults.ts` | Notwendige aktuelle Schemaannahmen und Altformatannahme |
| `tests/p07-document-output.test.ts`, `tests/documentFixtures.ts`, `tests/logic.test.ts` | Vier neue P07-Fälle, echte Alt-Kopien in historischen Fixtures, Einbindung in die Gesamtsuite |
| `tests/documents.test.ts`, `tests/private-invoices.test.ts`, `tests/adult-recipients.test.ts`, `tests/ap3.test.ts`, `tests/ap6-integration.test.ts`, `tests/duo.test.ts`, `tests/money-calendar.test.ts`, `tests/p05-contacts-recipients.test.ts`, `tests/p06-invoice-numbering.test.ts`, `tests/payment-reporting.test.ts` | Schemaannahmen und ausdrücklich erlaubte Repräsentationsentfernung angepasst; geschützte Werte weiterhin vollständig geprüft |
| `tests/browser/documents.spec.ts`, `tests/browser/print.spec.ts`, `tests/browser/duo.spec.ts`, `tests/browser/p05.spec.ts`, `tests/browser/p06.spec.ts`, `tests/browser/stabilization.spec.ts` | Ein neuer Migrations-/Ansichts-/GiroCode-/PDF-Fall, Schemaannahmen und entfallene Kopie angepasst |

Grob: vier gespeicherte Kopiefelder pro Belegversion entfernt; zwei reine
Funktionen verschoben, keine fachliche Funktion abgeschafft. Vor diesem Bericht
umfasst der Diff 325 hinzugefügte und 97 entfernte Zeilen, überwiegend Migration
und Regressionstests. Das Paket reduziert doppelte gespeicherte Ausgabedaten,
ist insgesamt kein Netto-Zeilenabbau. App, Layout und CI-Konfiguration sind unverändert.

Lokale thematische Commits:

- `8233ac4`: reine Kanonisierung und Projektion auslagern.
- `cd40814`: Ausgabe konsolidieren, Schema 13, Migration und Regressionen.

## Prüfergebnisse

Vor Änderungen wurden Build, Tests, Lint und die Dokument-/Druck-Browsertests
aufgerufen. Nach den Produkt-/Teständerungen wurden dieselben Pflichtaufrufe
erneut ausgeführt. `npm ci` scheitert lokal mit HTTP 403 beim npm-Download;
der Offline-Cache ist ebenfalls unvollständig. Der historische Git-Checkout
für den Browserwrapper wird ebenfalls mit HTTP 403 blockiert.

Der unveränderte Ausgangscommit wurde zusätzlich anhand seiner Logs aus
[Quality 37049048146](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37049048146)
geprüft: Node 22.23.3, Lint, **185/185 Logiktests**, Typecheck, Build und
**62/62 Browser-/PDF-Fälle** bestanden.

| Schlussprüfung | Ergebnis |
|---|---|
| `npm run build` | Lokal blockiert: `tsc` fehlt wegen gesperrter Installation |
| `npm test` | Lokal blockiert: `esbuild` fehlt |
| `npm run lint` | Lokal blockiert: `eslint` fehlt |
| Dokument-/Druck-Browsertests | Lokal blockiert: historischer Git-Commit kann nicht geladen werden |
| Direkt ausführbare Tests mit nativer Node-TS-Transformation | **93/93 bestanden**, darunter vier P07-Fälle, P05/P06, Speicher-/Originalschutz, Import-/Reload- und Goldbestandsprüfungen |
| `git diff --check` | Bestanden |
| Vollständige GitHub-Schlussprüfung | Wird vor dem ausdrücklich beauftragten Merge auf dem PR-Head ausgeführt |

Der Produkt-/Testbaum ist `b5e45bcfca5680775e73a6de5ddd433d0afa34d4`.
Der über das GitHub-Plugin vorbereitete Baum wurde mit dem lokal geprüften
Git-Tree verglichen und ist identisch.

Der Merge mit `main` ist ausdrücklich beauftragt. Build, Lint und die vollständigen
Browser-/PDF-Tests werden vor dem Merge durch den bestehenden Quality-Workflow
geprüft. Ein Push auf `main` löst anschließend den vorhandenen Quality-/Pages-Workflow aus.
