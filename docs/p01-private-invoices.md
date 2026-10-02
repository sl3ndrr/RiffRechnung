# P01 — Privatrechnungen ohne Steuerbaukasten

Basis: `main`, Commit `4b697df747819c283747f196c172c26af24e155c` (zugleich Katalogbasis).
Branch: `simplify/p01-private-invoices`. Review: https://github.com/sl3ndrr/RiffRechnung/pull/43.
Keine Repository-Anweisungen in einer `AGENTS.md` vorhanden. Der anfängliche Arbeitsbereich enthielt keinen Checkout; der über den GitHub-Connector geladene Quellbaum wurde anhand aller Blob-SHAs und der Git-Tree-SHA geprüft.

## Ergebnis und Umfang

- Ausschließlich Privatrechnungen, ohne auswählbares Profil, Steuerkennung, Rechnungsart oder Steuerdruckwahl.
- Gleicher Abschluss bei 249,99 €, 250,00 € und 250,01 €. Namen und gültige Bankdaten bleiben erforderlich; vollständige Anschriften sind optional.
- Vorhandene Anschriften beider gemeinsamen Empfänger werden weiterhin gedruckt.
- Jede Ausgabe, einschließlich Entwurf und Wiederausgabe alter Belege, hat eine automatisch erzeugte Zeile „Privatrechnung“ unmittelbar unter der Endsumme. Beide Zeilen stehen in einer vor Seitenumbrüchen geschützten Tabellenabschlussgruppe.
- GiroCode, Lernendennummerierung einschließlich a+b, Centberechnung, Unterrichtspreise, Kalender, Kontrollzeichenprüfung, Zahlungsnachweise und Korrekturbeziehungen bleiben erhalten.
- Freitexte werden nicht nach Steuerbegriffen verändert. `introText` und `legalText` bleiben bis P09, `freeText` bleibt Rechnungshinweis. Der leere Standard-Rechtstext führt keine Steuerbehauptung ein.

Entfernt wurden sieben Steuer-Typdefinitionen, fünf unterschiedliche strukturierte Hauptfeldnamen mit ihren Unterfeldern, zwei Steuerkonstanten und etwa ein Dutzend Steuer-/Adresspflicht-/Validierungsfunktionen. Vor der zusätzlichen Abschlussabsicherung umfasste der Diff ungefähr 740 entfernte und 550 hinzugefügte Zeilen; etwa 350 entfernte Zeilen betrafen Produktcode. Neue Zeilen dienen vor allem der Bestandsbereinigung und ihren Nachweisen.

## Schema und kontrollierter Umstieg

Das Datenschema ist ausdrücklich von 8 auf **9** erhöht. Speicherversion 4, Speicher-Schlüssel und Backup-Protokoll bleiben bestehen. Das aktuelle Schema akzeptiert die abgeschafften Felder nicht. Auch in serialisierten Snapshot-Konfliktwerten und ausschließlich auf Steuerfelder bezogenen Konfliktmetadaten dürfen sie nicht wieder eingeschleust werden.

Der getrennte Altformatadapter erkennt Schema 2–8 und verwirft gezielt:

| Speicherort | Entfernte Felder |
| --- | --- |
| Einstellungen | `invoiceProfile`, `taxIdentifier` |
| Rechnungen, Entwürfe und Beleginhalt | `invoiceKind`, `taxPresentation` |
| Rechnungs-, Entwurfsdruck- und Ausgabesnapshots | `invoiceProfile`, `taxIdentifier`, `invoiceKind`, `taxOutput` |
| Snapshot-Korrekturen und Snapshot-Konfliktkopien | Dieselben Snapshot-Felder; ausschließlich steuerbezogene Konflikteinträge |

Es gibt keine Steuerdefaults, alte Steuerberechnung oder historische Steuerdrucklogik. Die bestehende Behandlung anderer Altformatbesonderheiten bleibt bestehen. Für Schema 8→9 verändert der Umstieg keine Beträge, Nummern, Konten, Empfänger, Leistungsdaten, Zahlungsnachweise, Freitexte oder Korrekturverbindungen. Die Tests vergleichen sämtliche übrigen Werte unabhängig vom Bereinigungsadapter.

Gewöhnliche Schreibvorgänge verwenden weiterhin unverändert `assertOriginalsPreserved`. Die erlaubte Originalbereinigung findet ausschließlich im kontrollierten Import statt. Eingangsdaten bleiben vor der bestätigten Speicherung im flüchtigen Importpreview verfügbar. Neu exportierte Migrationsberichte enthalten bereinigte Daten und Pfade, keine ursprünglichen Steuerwerte oder `originalUtf8`-Rohkopie.

## Geprüfte historische Nebenstrukturen

- `invoices[].snapshot` und `draftPrintSnapshot`.
- `documentVersions[].content`, `outputSnapshot`, `snapshotHistory`, `conflicts[].values` mit serialisierten Snapshots.
- `audit[].snapshotCorrection` und `historicalSnapshotCorrections[].snapshotCorrection`, jeweils alter und neuer Wert.
- `riffrechnung-state-v4-previous`, Legacy-Speicher und der darauf bezogene Originalschutz-Schlüssel.
- Alle vorhandenen `riffrechnung-state-v4-recovery-*`-Archive einschließlich eingebetteter `previousRaw`, `legacyRaw`, `sourceRaw`, `originalUtf8` und Migrationsberichte.
- Neu erzeugte Wiederherstellungsarchive und deren exportierte Sammeldatei.

Vor der ersten Änderung werden interne Kopien vorgeprüft und bereinigt. Bei einem Schreibfehler werden bereits geänderte Schlüssel zurückgesetzt; der bestätigte Sessionstand wird erst nach erfolgreicher Speicherung ersetzt. Fehlerinjektionen prüfen Hauptspeicher, Vorgänger, Schutz-Schlüssel und gesperrten Schreibzugriff. Unlesbare interne Kopien mit möglichen abgeschafften JSON-Feldnamen brechen den Umstieg ab; Ausgangsschlüssel bleiben erhalten. Alte Tabs und unbekannte spätere Formate bleiben durch die vorhandenen Schutzprüfungen gesperrt.

Die historische Gold-Datei `tests/fixtures/schema7-audit.json` und ihr Generator bleiben unverändert. Sie dienen als historische Importquelle und Nachweis der Feldentfernung. Externe vorhandene Backup-Dateien wurden nicht verändert.

## Prüfungen und Umgebungsgrenzen

Vor Änderungen versucht:

| Befehl | Lokales Ausgangsergebnis |
| --- | --- |
| `npm ci --offline` | `ENOTCACHED`: nicht alle gesperrten Abhängigkeiten vorhanden |
| `npm ci --prefer-offline --fetch-retries=0 --fetch-timeout=15000` | Registry-Zugriff mit HTTP 403 blockiert |
| `npm run build` | `tsc` fehlte |
| `npm test` | `esbuild` fehlte |
| `npm run lint` | `eslint` fehlte |
| `npm run test:browser -- tests/browser/print.spec.ts tests/browser/storage.spec.ts --project=chromium` | Historischer Git-Checkout nicht abrufbar |

`.nvmrc` verlangt Node 22; lokal war nur Node 24.19.0 verfügbar. Für einen ergänzenden Logiktest wurden vorhandene Caches und offizielle Paketquellen verwendet, ohne `package.json` oder Lockfile zu ändern. **177/177 Logiktests bestanden**. Das ist ausdrücklich kein Ersatz für die festgelegte Node-22-Umgebung.

Nach Änderungen wurden Build, Tests, Lint sowie Druck-, Speicher- und Dokument-Browsertests erneut lokal aufgerufen. Logiktests bestanden. Build und Lint blieben durch die unvollständige, abweichende Toolchain eingeschränkt; Browserprüfungen zusätzlich durch fehlendes Chromium und den gesperrten historischen Git-Abruf.

Die verbindliche Abschlussprüfung läuft über den bereits vorhandenen Workflow **Quality (Node 22)** des Draft-PRs: `npm ci`, `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`, anschließend `npm run test:browser` mit Chromium, Firefox und WebKit einschließlich echter PDF-/Seitenumbruchprüfung. Der erste Lauf bestätigte alle Nichtbrowser-Prüfungen und 53/55 Browserfälle; alle neuen P01-Druckfälle bestanden. Zwei alte Erwartungen (unbereinigter Steuerbestand und Schema 9 als Zukunftsformat) wurden angepasst. Den endgültigen Workflow-Status zeigt der PR; der Abschlussbericht in der Unterhaltung nennt das bestätigte Endergebnis.

## Annahmen und offene Punkte

- `main` ist der vorgesehene Integrationsstand, da es keine abweichende Vorgabe gibt und es noch exakt auf der Katalogbasis steht.
- Beide Seiten einer historischen Snapshot-Korrektur behalten ihre Nichtsteuerinformationen und Metadaten, auch wenn sie nach Entfernen der Steuerfelder identisch werden.
- Historische frei verfasste Steuertexte bleiben erhalten. Ihre feldbezogene Entfernung gehört zu P09; die automatisch erzeugte Privatzeile hängt nicht von ihnen ab.
- Nicht lesbare Kopien werden nicht heuristisch umgeschrieben. Wenn sie mögliche abgeschaffte Feldnamen enthalten, bleibt der Umstieg gesperrt.
- Kein Merge und keine Veröffentlichung. Keine offenen funktionalen Erweiterungen in P01; die lokale Umgebungsbeschränkung ist durch die Node-22-CI getrennt nachvollziehbar.

## Geänderte Dateien

Datenmodell, Prüfung und Migration:
`src/types.ts`, `src/lib/defaults.ts`, `commands.ts`, `documents.ts`, `envelope.ts`, `importState.ts`, `invoiceCompliance.ts`, `invoiceSetup.ts` (neu), `invoiceProfile.ts` (entfernt), `legacyTaxFields.ts` (neu), `legacyValidation.ts` (neu), `recoveryTaxCleanup.ts` (neu), `storage.ts`, `utils.ts`, `validation.ts`.

Oberfläche und Druck:
`src/App.tsx`, `src/components/InvoicePrint.tsx`, `src/styles.css`, `src/views/Settings.tsx`, `InvoiceEditor.tsx`, `Invoices.tsx`, `ImportReview.tsx`, `StorageRecovery.tsx`.

Tests und Fixtures:
`tests/private-invoices.test.ts` (neu), `invoice-profile.test.ts` und `ap4.test.ts` (entfernt), `documentFixtures.ts`, `ap3.test.ts`, `ap6-integration.test.ts`, `adult-recipients.test.ts`, `commands.test.ts`, `documents.test.ts`, `duo.test.ts`, `logic.test.ts`, `money-calendar.test.ts`, `payment-reporting.test.ts`, `safety.test.ts`, `tests/browser/print.spec.ts`, `documents.spec.ts`, `stabilization.spec.ts`.

Bericht: `docs/p01-private-invoices.md`.
