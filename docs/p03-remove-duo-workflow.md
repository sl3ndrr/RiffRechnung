# P03 – Duo-Gruppenworkflow entfernen

Stand: 02.10.2026. Branch: `simplify/p03-remove-duo-workflow`.
Implementierung vorhanden, vollständige Abnahme noch offen. Kein Merge, kein Deployment, kein Pull Request.

## Basis und Vorgänger

Katalogbasis `4b697df747819c283747f196c172c26af24e155c`.
Arbeitsbasis ist `main@83c747488f643dc6d1416319c8a1d594e9ae4305`, nach Integration von P01 und P02.

- P01: PR #43 gemergt; Head `508066963829abf9b6c2c791c6d41a931220a793`, [Quality 36979453191](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36979453191) erfolgreich. Bericht: 177 Logiktests, 55 Browser-/PDF-Fälle, Lint, Typecheck, Build, Audit ohne Funde.
- P02: PR #44 gemergt; Head `aa4c0684f8bd37512765135f891998bd4cb17c80`, [Quality 36990010170](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36990010170) erfolgreich. Bericht: 174 Logiktests, 55 Browser-/PDF-Fälle, Lint, Typecheck, Build, Audit ohne Funde.
- Beide Ergebnisse, Berichte und Workflowzustände wurden vor Änderungen geprüft. Keine fehlenden Vorgänger bearbeitet.
- Kein bestehender Checkout oder Arbeitsbaum war bereitgestellt. Der GitHub-Quellstand wurde über den Connector exakt materialisiert: Tree `e802193bcee0140cef82433d05b2f6bb415b0d32`. Keine `AGENTS.md` im rekursiven Repositorybaum. Ausgangsarbeitsbaum sauber.

## Produktiver Abbau

Entfernt: `src/views/DuoWorkflow.tsx`, `src/lib/duo.ts`, `src/lib/duoModel.ts` (zusammen 254 Zeilen).
Die zehn exportierten Fachfunktionen `createDuoDrafts`, `previewDuoLessonChange`, `applyDuoLessonChange`, `setDuoTotal`, `duoForInvoice`, `duoInvoices`, `duoAudienceErrors`, `previewDuo`, `groupCentsInput` und `finalizeDuoGroup` entfallen, außerdem der Gruppen-Dialog und seine internen Aktionen.

`src/App.tsx`, `src/views/Invoices.tsx` und `src/views/InvoiceEditor.tsx` verlieren Gruppenstart, Verknüpfung, Partnersperre und gemeinsamen Abschluss. `src/lib/invoiceActions.ts` speichert/finalisiert unabhängig von Partnern, Gruppenbeträgen oder einer Gruppenbestätigung. `src/styles.css` verliert die drei nur dafür verwendeten Regeln. Produktiver Code insgesamt ungefähr 280 Zeilen kleiner, einschließlich des kleinen Altformatadapters.

Duo-Unterricht, Duo-Standardpreis, Selbstzahler, gemeinsame berechtigte Empfänger, GiroCode, Personenbuchstaben und gewöhnliche Einzelrechnungen bleiben. Die Datenschutzprüfungen zwischen ausgewählten Lernenden und Rechnungsempfängern bleiben in Speichern und Finalisieren unverändert. Keine neue Gruppenverwaltung. Kein Umbau von `guardianIds`/`recipients`; keine Änderung an Berechnung, Nummerierungsalgorithmus, Rechnungstexten, PDF oder Backupablauf.

## Schema und Bestandsbehandlung

Aktuelles Datenschema **10**, Migrationskennung `riffrechnung-to-v10`, Berichtsversion 1. Speicherprotokoll **4**, Speicherschlüssel und Archivformat **1** bleiben.

`AppState` enthält keine Gruppenfelder mehr. Die aktuelle Schlüsselprüfung lehnt `duoGroups` ab, selbst ein leeres Array. Gruppenprüfungen existieren ausschließlich im ausdrücklich auf Schema **8/9** begrenzten `legacyDuoV8V9.ts`; der aktive Validator prüft keine Gruppen. `legacyValidation.ts`, `envelope.ts`, `importState.ts`, `storage.ts` und `defaults.ts` kennen die neue Versionsgrenze.

Der Import validiert zuerst die alten Strukturen, löst anschließend ausschließlich das oberste Gruppenfeld und übernimmt **alle vorhandenen Rechnungen unverändert**. Es werden weder Positionen, Einzelpreise, Empfänger, Rechnungs-/Positions-IDs noch historische Beträge neu verteilt. Ein gespeicherter Gruppenbetrag ist keine neue Forderung. Das gesamte alte Gruppenobjekt bleibt als `before`-Nachweis im Migrationsbericht; die Eingangsdaten bleiben im vorhandenen Wiederherstellungsarchiv. Für Schema 8 gilt weiterhin ausschließlich die schon in P01 eingeführte Bereinigung strukturierter Steuerfelder, auch im internen Archiv. P03 entfernt dort keine Gruppenrohdaten. Schema-9-Daten ohne solche Felder werden bytegleich archiviert, einschließlich BOM und Zeilenenden.

Finale Rechnungen, vollständige Originalversionen, Snapshots, Zahlungs-/Verwaltungsdaten, Nummernregister und Korrekturbeziehungen bleiben gleich. Bereits unabhängige neue Rechnungen erhalten keine Gruppe. Wiederholter Import/Reload von Schema 10 ist idempotent.

Ein lokaler Schema-9-Stand öffnet zunächst den bestehenden Wiederherstellungsmodus, ohne zu schreiben. Die Übernahme erfolgt erst nach dessen bestehender Prüfung und Bestätigung. Schema 2–7 bleibt über die bisherigen Adapter importierbar; dort werden keine Gruppen vermutet.

## Annahmen und offene Bestandsfälle

- Bestehende Rechnungsdatensätze sind die verlässliche Grundlage. Gruppenmetadaten werden nicht zum Rekonstruieren oder Neuberechnen verwendet.
- Fehlende Partner oder bereits entfernte Zielpositionen waren im Altformat zulässig. Übrige Rechnungen bleiben unverändert; der Bericht bewahrt die alten Verweise. Fehlende Daten bleiben fehlend, leere/unvollständige Entwürfe bleiben Entwürfe und unterliegen den gewöhnlichen Finalisierungsprüfungen.
- Doppelte Zielzuordnungen, unbekannte Gruppenfelder, ungültige Zahlen/IDs, unklare Positionskollisionen oder ungültige Empfängerreferenzen werden nicht geraten. Import bleibt gesperrt; Rohdaten und vorhandener lokaler Stand bleiben exportierbar und unverändert im Klärungspfad.
- Historische `separate`-Belege und ihre bestehenden Korrektur-/Klärungsregeln bleiben. `historicalSplit.ts` und die Altentwurfsübernahme in `commands.ts` sind dafür notwendig und wurden nicht entfernt.
- Keine echten Nutzerdaten bereitgestellt; keine Aussage zur Anzahl tatsächlich offener Bestandsfälle. Rein synthetische Regressionen.

## Tests und geänderte Dateien

`tests/fixtures/duo-schema9.json` enthält eingefrorene synthetische Entwürfe und atomar ausgestellte Belege, **mit unveränderten Fachbefehlen der P02-Arbeitsbasis erzeugt**, einschließlich Quellcommit. Erwartete historische Werte werden nicht aus der neuen Implementierung nachgebaut.

`tests/duoFixtures.ts` trennt diese eingefrorenen Altbestände von ausdrücklich einzeln angelegten neuen Rechnungen. `tests/duo.test.ts` prüft Schema 8/9, lokales Recovery, gleichbleibende Originale/Entwürfe, Roharchiv, fehlende Ziele, unklare Bestände, Zukunftsformat, unabhängige Bearbeitung/Finalisierung, gemeinsame Empfänger, Duo-Preis, Selbstzahler/GiroCode/Nummer sowie Quota/Tabkonflikte. `tests/duo-output.test.ts` behält die private Ausgaberegression. Die früheren Gruppenaktions-/Zweierabschluss-Tests sind entsprechend dem entfernten Produktverhalten ersetzt; allgemeine Speicherregressionen bleiben.

`tests/browser/duo.spec.ts` prüft ausdrückliche Auswahl zweier Erziehungsberechtigter auf **einem** Beleg, Duo-Preiswahl, den tatsächlichen lokalen Umstieg mit Einzelabschlüssen und zwei privaten PDFs, Originalexport bei ungültiger Gruppe sowie Quota/Tabkonflikte. `tests/browser/fallback.spec.ts` exportiert/importiert zwei unabhängige Duo-Rechnungen in Chromium/Firefox/WebKit. Bestehende Selbstzahler-/Empfänger-Browserfälle in `documents.spec.ts` bleiben.

Zusätzlich ausschließlich Versions-/Berichtsassertionen angepasst: `tests/adult-recipients.test.ts`, `tests/ap3.test.ts`, `tests/ap6-integration.test.ts`, `tests/browser/documents.spec.ts`, `tests/documents.test.ts`, `tests/logic.test.ts`, `tests/money-calendar.test.ts`, `tests/payment-reporting.test.ts`, `tests/private-invoices.test.ts`.

Dokumentation: Duo-Beschreibung in `README.md`, aktueller Eintrag in `docs/implementation-status.md`, dieser Bericht. Paketdateien und Abhängigkeiten unverändert.

## Prüfergebnisse

Lokale Umgebung: Node **24.19.0**, npm **11.9.0**; vorgesehen ist Node 22 gemäß `.nvmrc`.

| Prüfung | Ausgang | Abschluss |
| --- | --- | --- |
| `npm ci` | Registry-E403 (`yocto-queue`) | Keine installierbare Toolchain verfügbar |
| `npm run build` | `tsc: not found` | `tsc: not found` |
| `npm test` | `esbuild: not found` | `esbuild: not found` |
| `npm run lint` | `eslint: not found` | `eslint: not found` |
| `npm run typecheck` | Nicht separat vor Änderungen ausgeführt | `tsc: not found` |
| `npm run test:browser -- tests/browser/duo.spec.ts` | Historischer Checkout fehlt, Git-Fetch blockiert | Betroffene Duo-/Empfänger-/Fallback-Dateien erneut angefordert; historischer Git-Fetch E403 |
| `git diff --check` | Sauberer Ausgangsbaum | Bestanden |

Vor Änderungen wurde der vorhandene komplette erfolgreiche P02-Browserlauf geprüft; lokal wurde zunächst die Duo-Datei angefordert. Im Abschlussaufruf wurden zusätzlich `documents.spec.ts` und `fallback.spec.ts` angegeben. Beide lokalen Browseraufrufe scheiterten vor Teststart. Keine lokalen Browsererfolge behauptet.

**Ergänzende Fachprüfung: 71/71 bestanden, 0 übersprungen.** Die vorhandenen TypeScript-Dateien wurden ohne Codeänderung mit der eingebauten Node-24-Funktion `stripTypeScriptTypes` in einen temporären, nicht eingecheckten Testpfad überführt. Ausgeführt wurden `duo.test.ts`, `storage.test.ts`, `safety.test.ts`, `stabilization.test.ts`, `ap6-integration.test.ts`, `payment-data.test.ts`, `payment-reporting.test.ts` und `print-job.test.ts`. Keine Ersatzbibliotheken oder abgeschwächten Assertions. Der erste ergänzende Lauf fand eine falsche Indexannahme im neuen Bearbeitungstest: der bestehende Speicherbefehl sortiert bearbeitete Entwürfe um; Vergleich jetzt anhand der unveränderten Rechnungs-ID. Ein zusätzlicher Testdateiaufruf war mangels React nicht startbar und wird nicht als bestanden gezählt. Danach vollständiger Wiederholungslauf aller acht ausführbaren Dateien grün.

Diese Prüfung ersetzt weder Typecheck/Lint/Build noch React-Ausgabe-/Browser-/PDF-Prüfungen. Deren vollständige Abnahme unter Node 22 ist offen. Es wurden keine Prüfschranken entfernt oder CI-Auslöser verändert.

Das Öffnen eines Draft-PRs wurde von der automatischen Freigabeprüfung abgelehnt, weil die Anweisung „nicht automatisch … veröffentlichen“ dafür keine Freigabe enthält. Der bestehende Quality-Workflow startet über Pull Requests; für den P03-Stand läuft deshalb noch keine vollständige CI. Ein Draft-PR muss ausdrücklich freigegeben werden, bevor dieser Prüfweg genutzt werden kann. Kein Merge oder Deployment wurde angefordert oder durchgeführt.
