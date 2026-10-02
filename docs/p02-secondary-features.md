# P02 — Nebenfunktionen und tote Exporte entfernen

Branch: `simplify/p02-remove-secondary-features`. Review: https://github.com/sl3ndrr/RiffRechnung/pull/44.
Basis: integriertes `main`, Commit `690caf14bc11f70878c63e026de72cb9b29fbcbf` (P01-Merge #43), direkt nach der Katalogbasis `4b697df747819c283747f196c172c26af24e155c`.

## Vorbedingungen und Ausgangsprüfung

- Keine `AGENTS.md` im aktuellen Repository-Baum. Der Arbeitsbereich enthielt keinen Checkout und keine Benutzeränderungen.
- Quellbaum über die GitHub-Verbindung geladen. Alle Dateien wurden bytegetreu übernommen: die lokal erzeugte Git-Tree-SHA `77e0ff0aba3c817e860f20eae7d774855ae93c4d` entspricht dem Originalbaum des integrierten P01-Merges.
- P01 ist integriert: aktive Steuerfelder und `invoiceProfile.ts` fehlen; die automatische Privatzeile ist in `InvoicePrint.tsx` vorhanden. Der letzte P01-Quality-Lauf [36979453191](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36979453191) ist erfolgreich. P01 wurde nicht neu implementiert.
- Branch vor Änderungen angelegt; lokale Commits sind wegen des gesperrten direkten Git-Zugriffs auf einem überprüften Snapshot aufgebaut. Die GitHub-Commits hängen dagegen direkt am echten P01-Merge. Die Quellbäume stimmen überein.

Vor Änderungen wurden `npm run build`, `npm test`, `npm run lint` und `npm run test:browser -- tests/browser/accessibility.spec.ts tests/browser/documents.spec.ts --project=chromium` aufgerufen. `npm ci --prefer-offline --fetch-retries=0 --fetch-timeout=15000` scheiterte mit Registry-HTTP-403. Daher fehlen lokal `tsc`, `esbuild` und `eslint`. Das Browser-Skript benötigt zusätzlich den hier nicht verfügbaren historischen Git-Commit `ba7857fd9180fa392c42a0235643e478e5077ee5`. Lokal ist Node 24.19.0 statt des geforderten Node 22 vorhanden. Diese Ausgangsergebnisse sind Umgebungsgrenzen, keine bestandenen Tests.

## Ergebnis

- Drei Seiten gelöscht: `Dashboard`, `Reports`, `About`; außerdem `ChangelogModal` und die bisherigen Info-/Release-Inhalte im Produktcode.
- Rechnungen sind Startseite und Rückkehrziel nach Import/Wiederherstellung oder Zurücksetzen. Hauptnavigation enthält nur Rechnungen, Personen und Einstellungen, auch mobil.
- Keine Jahresauswertung, Diagramme, Dashboard-Kennzahlen oder neuen Kennzahlen. Der bisherige Kopf der Rechnungsansicht bleibt erhalten.
- Alle CSV-Aktionen entfernt, einschließlich „Ausgewählte Version als CSV“ in der Beleggeschichte. Beide CSV-Generatoren, deren Zellenformatierung und Berichtsfunktionen entfallen. E15 ist damit erledigungslos.
- Zahlungserinnerung vollständig entfernt: Textgenerator, Mailto, Zwischenablage, manueller Kopierfallback, zugehöriger Zustand und Props.
- Kompakter vorhandener Einrichtungshinweis in Rechnungen, ohne neue Einrichtungslogik. Genau ein Demo-Einstieg „Mit Beispieldaten testen“ in der Rechnungsansicht; im Demo-Modus nur der vorhandene Ausstieg. Isolation und JSON-Backup bleiben unverändert.
- Kompakter Info-/Versionslink führt zur Repository-Dokumentation. Feedbacknavigation entfällt.
- Ausschließlich den entfernten Oberflächen zugehörige CSS-Regeln und Animationen entfernt; gemeinsame Regeln bleiben bestehen.

Vor dem Abschlussbericht umfasst die Bereinigung ungefähr 1.130 entfernte und 216 hinzugefügte Zeilen in 28 Dateien, netto etwa 914 Zeilen weniger. Rund 660 entfernte Zeilen betreffen TS/TSX/JSON-Produktcode, weitere rund 160 CSS. Etwa ein Dutzend exportierte Funktionen sowie lokale Diagramm-/Erinnerungs-/Karussellfunktionen entfallen. Zahlen enthalten verschobene Texte und angepasste Tests, keine neue Funktionalität.

## Erneute Aufrufprüfung und konservative Entscheidungen

| Katalogexport | Befund auf integriertem Stand | Entscheidung |
| --- | --- | --- |
| `reopenInvoiceAsDraft` | Nur Tests; produktiver Originalschutz läuft über `safety.ts` und Befehle | Export und ausschließlich dazugehörige Erwartungen entfernt; allgemeine Originalschutz-/Nummerntests bleiben |
| `recordedPayments` | Kein Aufrufer | Entfernt, einschließlich der falschen Belegjahrprojektion |
| `parseQuantityInput` | Nur Testaufrufe; Editor nutzt `itemNumberInput` | Entfernt; allgemeine Eingabeprüfung und Viertelschrittsteuerung bleiben |
| `invoiceProfile.invoiceProfileErrors` | Datei und Export bereits durch P01 entfernt | Keine erneute Änderung |

`reporting.ts` hatte neben den entfernten Seiten noch einen produktiven Aufrufer von `unknownPaymentDayLabel` in `DocumentHistory.tsx`. Diese unveränderte gemeinsame Beschriftung wurde nach `documents.ts` verschoben; erst danach wurde `reporting.ts` vollständig gelöscht. Zahlungsnachweise, unbekannte Zahlungstage und der alte unbestätigte Tageswert bleiben sichtbar.

`mailbox.ts` bleibt mit `MAILBOX_ERROR` und `mailboxError`, weil Stammdaten-/Importvalidierung sie produktiv verwenden. Nur `buildMailto` ist nach Entfernung aller Aufrufer entfallen. `downloadText` bleibt für JSON-Backups und Wiederherstellung. `isActiveClaim`, `openCents`, Centberechnung, `invoiceSetupErrors`, `assertInvoiceEditable`, Originalschutz und Zahlungszuordnung bleiben erhalten.

Gemischte Tests wurden nicht vollständig gelöscht: Nur Erwartungen für CSV, Erinnerungen, Dashboard oder Karussell entfallen. Die vier bisherigen Zahlungstests prüfen nun unmittelbar Zahlungsnachweise, Zahlungstagkorrektur, Statusrücknahme, offene Forderung und Korrekturbelege; Jahresaggregation wird nicht als Ersatzfunktion behalten. Duo-Ausgabetests prüfen weiterhin Haushaltstrennung in PDF, Beleggeschichte, Snapshot, GiroCode und PDF-Titel. Historische Gold-Quelle, Schema, Nummerierung, Zahlungslogik und Backup-Protokoll sind unverändert.

## Gesicherte Texte

- `src/content/about.ts` → `docs/about.md`: alle bisherigen Texte einschließlich persönlicher Einführung, Praxisgeschichte, Designphilosophie, lokaler Datenhaltung und Abschluss. Die alten Aussagen sind als historische Projektbeschreibung gekennzeichnet.
- `src/content/changelog.json` → `docs/releases.md`: alle Versionen, Daten und Änderungstexte unverändert als Markdown.
- Die endgültige inhaltliche Konsolidierung dieser Texte und der übrigen alten Repository-Doku ist ausdrücklich später vorgesehen. Historische Release-Aussagen sind keine wieder eingeführten Produktfunktionen.

## Prüfungen

Nach Änderungen wurden Build, Tests und Lint erneut lokal aufgerufen; die gleichen fehlenden Werkzeuge blockieren sie. Der betroffene Browseraufruf wurde um `tests/browser/storage.spec.ts` ergänzt und ist lokal ebenfalls durch den historischen Git-Abruf blockiert. `git diff --check` besteht, der Arbeitsbaum ist nach Commit sauber, der finale Quellbaum wird mit dem GitHub-Tree abgeglichen.

Der vorhandene Quality-Workflow des Draft-PRs prüft mit Node 22: `npm ci`, Lint, sämtliche Logiktests, Typprüfung, Build, vollständige Browser-/PDF-Suite (Chromium, Firefox, WebKit) und Dependency-Audit. Neue Browserprüfungen decken Startseite, drei Navigationseinträge, Seitenwechsel, Suche und Statusfilter bei 390/1280 Pixeln sowie Einrichtung, einen isolierten Demo-Einstieg und Info-Link ab. Bestehende Zahlungs-, Korrektur-, PDF-, Duo- und historische Nachweistests bleiben aktiv.

Der erste CI-Lauf fand zwei nach CSV-Entfernung unbenutzte Testimporte. Diese und zwei bei der Durchsicht gefundene unvollständig entfernte CSV-Aufrufe in gemischten Tests sind korrigiert. Der abschließende CI-Status wird im PR ergänzt.

## Geänderte Dateien

Produktcode: `src/App.tsx`, `src/types.ts`, `src/styles.css`, `src/views/Invoices.tsx`, `src/components/DocumentHistory.tsx`, `src/lib/documents.ts`, `src/lib/utils.ts`, `src/lib/values.ts`, `src/lib/mailbox.ts`.

Gelöscht: `src/views/Dashboard.tsx`, `src/views/Reports.tsx`, `src/views/About.tsx`, `src/components/ChangelogModal.tsx`, `src/content/about.ts`, `src/content/changelog.json`, `src/lib/reporting.ts`.

Tests: `tests/logic.test.ts`, `tests/commands.test.ts`, `tests/documents.test.ts`, `tests/duo.test.ts`, `tests/money-calendar.test.ts`, `tests/payment-reporting.test.ts`, `tests/safety.test.ts`, `tests/browser/accessibility.spec.ts`, `tests/browser/documents.spec.ts`, `tests/browser/storage.spec.ts`.

Doku: `docs/about.md`, `docs/releases.md`, dieser Bericht.

## Annahmen und offene Punkte

`main` ist der Integrationsstand. Gemeinsame Helfer werden nur bei nachgewiesener Nichtverwendung gelöscht. Keine Abhängigkeiten, Frameworks, Datenfelder oder Bildschirmlayouts neu eingeführt. Nicht-Umfang bleibt unangetastet. Die lokale Node-22-Toolchain ist nicht verfügbar; die CI liefert die ausführbare Abschlussprüfung. Kein automatischer Merge oder Deployment. Der Info-Link auf `main/docs/about.md` wird mit Integration dieses Branches verfügbar; die Texte sind bereits im Draft-PR prüfbar.
