# P14 – Abschlussbericht

Arbeitsbasis: `main@1655a5d74aea11a2e3257b8193960bae56e9dd43` nach Merge von P13. Katalogbasis: `4b697df747819c283747f196c172c26af24e155c`. Branch: `simplify/p14-final-cleanup`.

## Ergebnis und Umfang

Die kurze Anleitung beschreibt Einrichtung, Personen/Selbstzahler, Erstellung, Einzel-/Kombinationsnummern, beide Empfängeranschriften, PDF/GiroCode, tatsächlichen Zahlungstag, Korrektur und JSON-Backup. Technik/Migration erklärt tatsächliche Schutz- und Bereinigungsgrenzen sowie die konfigurierten Befehle. Keine neue Funktion, Migration, Layoutänderung, Abhängigkeit oder Versionsanhebung.

P01–P13 wurden vor Änderungen anhand der Git-Historie bis zur Katalogbasis, der gemergten PRs #43–#55, der aktuellen Quellen und vorhandener Tests geprüft. Keine `AGENTS.md` im vollständigen Repositorybaum; kein vorhandener Projektarbeitsbaum bereitgestellt. Direkter Clone über GitHub erhielt HTTP 403. Der Connector lieferte alle 152 Dateien des exakten Ausgangsstands; sämtliche lokalen Git-Blob-SHAs stimmen mit dem Remotebaum überein. Der lokale Checkout beginnt deshalb mit einem gekennzeichneten Snapshot-Commit; Remote-P14-Commits haben den echten main-Commit als Vorfahren.

## Geänderte Dateien und Abbau

- `README.md`: 282 → 62 Zeilen, aktuelle Nutzeranleitung.
- `docs/technical.md`: neue kompakte Architektur-/Migrationsdoku einschließlich bekannter Lücken.
- `docs/evidence.md`: geprüfte vorhandene PR-/CI-Links und unveränderte historische Dokumente am Ausgangscommit.
- `docs/about.md`: auf fünf aktuelle Zeilen gekürzt; bestehender Info-Link bleibt.
- `docs/releases.md`: 71 → 19 Zeilen; unversionierte Vereinfachungsnotiz und klar historische Release-Verweise.
- `src/version.ts`: importiert `package.json.version`; keine zweite Versionskonstante mit unabhängigem Wert.
- `src/views/Settings.tsx`: JSON-Backuptext nennt Rechnungshinweise/Zahlungen statt abgeschaffter interner Notizen.
- `src/lib/mailbox.ts`: veralteten Dokumentationspfad ersetzt.
- `src/types.ts`: überholten Reports-Kommentar präzisiert.
- `tests/documents.test.ts`: alten CSV-Testmarker in `=Hinweis Test` umbenannt; Schutzassertionen bleiben.
- `tests/browser/accessibility.spec.ts`: vorhandener Bedienungstest prüft sichtbare und zugängliche Versionsanzeige gegen Paketmetadaten.
- Dieser Abschlussbericht ergänzt die aktuelle Repositorydokumentation; der Folgeauftrag autorisiert PR und Merge nach erfolgreicher Prüfung.

Entfernte fünf überlappende Dokumente (2.119 Zeilen): `product-decisions.md`, `implementation-status.md`, `quality-gates.md`, `release-readiness.md`, `ap6-integration-matrix.md`.
Entfernte zwölf Paketberichte (1.640 Zeilen): `p01-private-invoices.md`, `p02-secondary-features.md`, `p03-remove-duo-workflow.md`, `p04-storage-settings.md`, `p05-contacts-recipients.md`, `p06-invoice-numbering.md`, `p07-document-output.md`, `p08-derived-invoice-state.md`, `p09-invoice-drafts-rules.md`, `p11-simple-invoice-pdf.md`, `p12-calm-screen-design.md`, `p13-tests-ci.md`.
Insgesamt 17 alte aktive Dokumente entfernt. Vor diesem Abschlussbericht sinken README/docs von 4.142 auf 195 Zeilen (3.947 weniger, rund 95 %). Alte Nachweise bleiben ausschließlich über den historischen Index erreichbar. `src/content/changelog.json` war bereits durch P02 und `tests/logic.test.ts` durch P13 entfernt; es werden keine Ersatz-UI oder Testregistrierungen eingeführt.

## Versionsquelle und Annahmen

`package.json` ist maßgeblich, unverändert `1.1.3`, ebenso beide Lockfile-Versionsangaben. Der bisherige UI-Wert `1.4` war unabhängig gepflegt; die Anzeige folgt jetzt bewusst der vorhandenen Paketversion. Historische Release-Nummern werden nicht als aktuelle Version ausgegeben. Die vorhandene TypeScript-JSON-Auflösung genügt; keine neue Pipeline oder Vite-Konfiguration.
Historische Berichte werden über geprüfte PR-/CI-Links und den exakten alten Dokumentenbaum referenziert, statt ihre widersprüchlichen Anleitungen aktiv weiterzuführen. Keine realen Nutzerdaten wurden bereitgestellt oder bearbeitet.

## Restverweissuche und erlaubte Treffer

Vor und nach Änderungen mit `rg` über README/docs, src, tests und scripts gesucht, einschließlich JSON-Fixturen: Steuerprofil/Kennung/Kleinbetrag/TaxPresentation/TaxOutput; Reports/CSV/Reminder; DuoGroup/finalizeDuoGroup; BackupDirectory/FolderReview/Handles; Dashboard/About/ChangelogModal; Guardian.iban/Guardian.paymentNote/Student.note; introText/legalText/defaultLegalText/outputLegalText; Nummernmuster und Sortieroptionen. Zusätzlich alte Import-/Dokumentationspfade sowie APP_VERSION/Changelog/Versionswerte geprüft.

- Alte Steuer-, Kontakt-, Text- und Nummernfelder bleiben in begrenzten Altadaptern, schemaabhängigen Validatoren, unveränderten Gold-Fixturen und Entfernungstests. Aktuelle Typen enthalten die abgeschafften Felder nicht.
- `defaults.ts` erzeugt synthetische historische Demo-Eingaben und führt sie durch den vorhandenen Adapter; das Nummernmuster ist kein aktiver Einstellungswert.
- `Reports` in `legacyInvoiceTexts.ts` bezeichnet Migrationsberichte; kein Funktionsbericht. Die CSV-Negativprüfung im Browsertest belegt die entfernte UI. Duo als Unterrichtsart/Standardpreis bleibt vorgesehen.
- `historicalSplit.ts`, historische getrennte Belege und Altentwurfs-/Korrekturregressionen bleiben erforderlich. `Student.guardianIds` ist die Stammdatenzuordnung; aktuelle Belege/Snapshots verwenden `recipients`.
- Alte Handle-Daten und Tests sind historische Nachweise des unbenutzten P04-Altbestands. Kein aktiver Ordnerzugriff. Aktive Such-/Status-/Aktivfilter und feste Sortierung bleiben.
- Keine toten Imports auf entfernte Funktionen oder ungültigen lokalen Dokumentationslinks gefunden. Allgemeine Testfixture-Notizen und der tatsächliche Rechnungshinweis sind keine `Student.note`/`Guardian.paymentNote`-Stammdaten.

## Bestehende offene Fachpunkte

Die umfassende Löschvorgabe ist noch nicht vollständig erfüllt; zwei größere Migrationsänderungen liegen außerhalb P14:

1. `src/lib/importState.ts` bewahrt Schema-8/9-`duoGroups` als `report.changes[].before`. `src/lib/storage.ts` schreibt Eingangsrohdaten ins Recovery-Archiv; `src/lib/recoveryContactCleanup.ts` entfernt diese Gruppen nicht. Migrations-/Archivexport kann sie weiter enthalten. `tests/duo.test.ts` erwartet den Erhalt ausdrücklich.
2. `src/lib/legacyInvoiceNumbering.ts` bewahrt Werte von `numberPattern`/`resetNumberAnnually` in Migrationsberichten, obwohl aktuelle Einstellungen sie entfernen. Auch interne Rohkopien werden dafür nicht bereinigt.

Normale aktuelle JSON-Backups enthalten diese Felder nicht. Steuer-/Kontakt-/Textbereinigung einschließlich interner Kopien ist durch vorhandene Tests nachgewiesen; keine neuen dauerhaften Kopien wurden eingeführt. Alte IndexedDB-Datei-Handles bleiben gemäß P04 unbenutzt liegen; ihre Löschung wäre ebenfalls zusätzlicher Migrationsumfang.
Native Druckdialoge, physische Ausdrucke, Firefox-/Safari-PDF, Banking-App-Scans und echte Altbestände wurden in P14 nicht abgenommen. Die historischen P11/P12-Nachweise bleiben im Index erreichbar.

## Vollständige Prüfergebnisse

Lokale Umgebung: Node 24.19.0/npm 11.9.0 statt vorgesehenem Node 22. Vorgesehene lokale Gates vor und nach Änderungen gestartet; fehlende Abhängigkeiten oder Historie verhindern Teststart. Keine blockierte Prüfung zählt als bestanden.

| Prüfung | Lokal vorher | Lokal nachher | Exakter Ausgang in CI |
| --- | --- | --- | --- |
| `npm ci` | Registry E403 bei yocto-queue | derselbe Registry E403 | bestanden |
| `npm run lint` | eslint fehlt | eslint fehlt | bestanden |
| `npm test` | esbuild fehlt | esbuild fehlt | 205/205 bestanden |
| `npm run build` (einschließlich Typecheck) | tsc fehlt | tsc fehlt | bestanden |
| `npm run test:browser` | Playwright fehlt | Playwright fehlt | 91/91 bestanden, einschließlich PDF |
| `npm run test:migrations` | Altcommit fehlt; initial noch kein origin | origin ergänzt, Git-Fetch E403 | 2/2 bestanden |
| `npm audit --json` | nicht separat lokal gestartet | Registry E403 | null Befunde |
| `git diff --check` | sauberer Ausgang | bestanden | kein eigener CI-Gate |

Ausgangsnachweis: [vorhandener Quality-Job 37146404957](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37146404957), erfolgreich auf `1655a5d74aea11a2e3257b8193960bae56e9dd43`, Node 22.23.3. Dieser bereits laufende Pages-Workflow wurde nicht von P14 ausgelöst. Das Joblog bestätigt die Testzahlen; keine CI-Aussage wird allein aus einem PR-Text übernommen.

Zusätzlich bestanden: bytegenaue Original-Blob-Prüfung, Paket-/Lockfile-Versionskonsistenz, lokale Markdown-Zielprüfung und erneute Restverweissuche. Lokaler Produkt-/Doku-/Testbaum der drei ersten P14-Commits stimmt exakt mit Remote-Tree `8901e4f32b7e0532c51b79d8fbeb45cd549fe5bb` überein. Remote-Head: `f01995c8b7c48a3e93b6ea331011afb47b29ed82`. Der anschließende Dokumentationscommit ergänzt ausschließlich diesen Bericht.

Der ausdrückliche Folgeauftrag „mit main mergen“ autorisiert PR und Merge nach vollständig erfolgreicher Prüfung. Der abschließende commitgebundene Quality-Nachweis mit Installation, Lint, Fachtests, Build, Browser-/PDF-Prüfungen, getrennten Migrationsfällen und Audit wird im [PR #56](https://github.com/sl3ndrr/RiffRechnung/pull/56) protokolliert. Diese lokale Prüftabelle beschreibt die Umgebungssperren und den Ausgang, nicht die abschließende CI des P14-Heads. Die vorhandenen Gates bleiben unverändert. Die zwei bestehenden Bereinigungslücken bleiben als außerhalb P14 liegende Fachpunkte offengelegt. Der bestehende Pages-Workflow startet beim Merge automatisch; kein zusätzlicher manueller Deployment- oder Release-Lauf wird veranlasst.

Der erste Abschlusslauf bestand Installation, Lint, alle 205 Fachtests und Build, scheiterte aber vor Browsertestbeginn am neuen direkten JSON-Import des Versionsvergleichs im Node-Testprozess. Der Test liest Paketmetadaten jetzt über das vorhandene `readFileSync`-Muster; Produktimport und sämtliche Assertions bleiben unverändert. Der vollständige Wiederholungslauf wird im PR nachgewiesen.
