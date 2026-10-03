# P09 – Rechnungstexte, Entwürfe und Abschlussprüfung

## Basis und Umfang

Katalogbasis: `4b697df747819c283747f196c172c26af24e155c`, E24/E29/E32/E33.
Arbeitsbasis: `main@4d54f48ebf4e9033a2bc24e285cc001f7ec4a526` (P08-Merge).
P01–P08 sind integriert. Steuer-/Kontaktabbau, typisierte `recipients`,
Personen-/Kombinationsnummern, die einzige Belegausgabequelle aus P07 und
der abgeleitete Zahlungszustand aus P08 wurden geprüft. Der Ausgangsbaum
war sauber; im vollständigen Repository-Tree gibt es keine `AGENTS.md`.
Branch: `simplify/p09-invoice-drafts-rules`.

Die Umsetzung umfasst ausschließlich P09. Beide gemeinsamen Anschriften,
Selbstzahler, GiroCode, exakte Geldberechnung und Nummerierung bleiben erhalten.
Keine neuen Vorlagen, Textbausteine, Zahlungsfunktionen, Befehlsframeworks,
Layoutänderungen, CI-Änderungen oder Änderungen externer Backup-Dateien.

## Texte und Migration

Schema 15 entfernt `Invoice.introText`, `Invoice.legalText`, die entsprechenden
Entwurfsfelder, `Settings.defaultLegalText`, `InvoiceSnapshot.legalText` und
`DocumentVersion.outputLegalText`. Der Editor besitzt genau ein optionales
Feld: `freeText`, beschriftet als „Freitext / Hinweis“. Seine Inhalte bleiben
einschließlich Leerraum, Zeilenumbrüchen und Steuerbegriffen exakt erhalten.
Entfernte Texte werden weder angehängt noch in dieses Feld übertragen.

Die Ausgabe erzeugt statisch „Hiermit stelle ich die folgenden Leistungen in
Rechnung.“ sowie die bestehende Zeile „Privatrechnung“. Auch Wiederausgaben
historischer Belege verwenden diese Texte. Es werden keine Ersatzfelder
gespeichert. Die frühere Rechtstextzeile im Footer entfällt; dessen Referenz
bleibt. Druck-CSS, Positionsaufbau und Seitenregeln wurden unverändert verschoben.

`legacyInvoiceTexts.ts` bereinigt ausschließlich bekannte strukturierte
Textfelder und ausschließlich darauf bezogene Konfliktmetadaten:

- Einstellungen und rohe Rechnungen, auch ausgestellte Altbelege;
- `snapshot` und `draftPrintSnapshot`;
- Versionsinhalt, historische darin enthaltene Ausgabe-/Snapshotkopien,
  `outputSnapshot` und `outputLegalText`;
- Snapshotkorrekturen in Audit, `historicalSnapshotCorrections` und
  `DocumentVersion.snapshotHistory`;
- Konflikte mit abgeschafften Feldpfaden; bei vollständigen JSON-Snapshot-
  Konfliktwerten ausschließlich deren Rechtstextfeld;
- strukturierte Vorher-/Nachherkopien und Textfeldpfade im Migrationsbericht;
- interne Vorgänger-, Legacy-, Recovery- und verschachtelte Rohkopien.

Altschemas 2–14 behalten ihre bestehenden Struktur-/Finanzprüfungen. Nur die
abgeschafften Textfelder werden vor der alten Strukturprüfung ausgeblendet;
es gibt keine neue Reparatur von Geld, Nummern, Konten, Leistungsdaten,
Empfängern, Zahlungen oder Korrekturbeziehungen. Für Schema 14 besteht der neue
Migrationsschritt allein aus dieser Textbereinigung und dem Wechsel auf 15.
Die bereits integrierten älteren Migrationen laufen für entsprechend ältere
Quellen weiterhin. Schema 15 weist die abgeschafften Felder zurück, auch in
Snapshot-Konfliktwerten. Neue Backups, Migrationsberichte und Recovery-Exporte
enthalten diese Textfelder nicht mehr.

Der Originalschutz gestattet beim Übergang aus einem Altschema genau diese
Textlöschung. Er normalisiert dafür ausschließlich die alte Vergleichsseite;
die neue Seite und aktuelle Originale bleiben strikt geschützt. Die Tests
vergleichen den gesamten bereinigten Bestand mit unabhängig aufgebauteten
Erwartungen und weisen Änderungen an Betrag, Nummer, Konto, Zahlung und Hinweis
zurück.

Die Vorschau verändert den Ausgangsbestand nicht. Interne Kopien werden vor
der Übernahme vollständig zur Bereinigung vorbereitet und über den bestehenden
Speicherbatch geschrieben. Fehler am Hauptbestand, Vorgänger oder Archiv rollen
die Änderungen zurück. Unlesbare interne Kopien mit möglichen abgeschafften
Feldschlüsseln brechen den Umstieg ab. Nach erfolgreicher Übernahme verbleibt
keine dauerhafte Roh-/Archivkopie der entfernten Texte. Geschützte nichttextliche
Nachweise in den bestehenden Archiven bleiben erhalten.

Annahme: Der bisherige Export unveränderter Eingangsbytes vor einer erfolgreichen
Übernahme bleibt als Schutz-/Prüfaktion bestehen. Diese nur vorübergehend geprüfte
Quelle wird nicht zur dauerhaften Textkopie des erfolgreich migrierten Bestands.
Frei formulierte Gründe, Labels und der Rechnungshinweis werden nicht nach
Textähnlichkeit durchsucht; nur benannte Felder und ihre strukturierten Nachweise
werden entfernt.

## Entwurfspfade

`invoiceDraftFields` kopiert nur sieben bearbeitbare Werte: Rechnungsdatum,
Fälligkeit, Empfänger, Lernende, Empfängerstrategie, Positionen und Hinweis.
Arrays werden unabhängig geklont. Die Funktion erzeugt keine Identität und
kennt keine Nummern, Zahlungen, Originalversionen oder eingefrorenen Kontaktdaten.

| Pfad | Identität/Nummer | Datum/Positionen | Eingefrorene Daten/Beziehung |
| --- | --- | --- | --- |
| Neu | keine Rechnungs-ID vor dem Speichern; keine Nummer | heutiger Kalendertag, Zahlungsziel, leere Positionen | keine eingefrorenen Daten oder Beziehung |
| Kopie | keine Rechnungs-ID, frische Positions-IDs; Nummer erst beim Abschluss | Zieldatum/Zahlungsziel und bisherige Monatsverschiebung der Leistungstage | keine Original-/Zahlungs-/Versions-/Snapshotkopie; Hinweis unverändert |
| Korrektur | frische Rechnungs-/Positions-IDs, Nummer/Sequenz leer | bisherige Daten und Berechnungskennzeichnung ausdrücklich übernommen | eingefrorener Eltern-Snapshot, ausdrücklicher Versionsverweis und Grund; keine kopierte Zahlung |
| Editor | vorhandene ID ausdrücklich erhalten | gemeinsame bearbeitbare Basis | Korrekturbeziehung ausdrücklich erhalten |

Historische getrennte Kopien und Kopien mit fehlenden Stammdaten bleiben gesperrt.
Korrekturen behalten die bisherigen Prüfungen auf aktiven Anspruch, vorhandenen
Originalbeleg, Konfliktklärung und schon bestehenden Korrekturentwurf.

## Zuständigkeiten und Prüfgrenzen

| Modul | Zuständigkeit |
| --- | --- |
| `invoiceDrafts.ts` | kleine Entwurfbasis, Leerentwurf, Unterrichtspositionen |
| `invoiceRules.ts` | Entwurfs-/Abschluss-/Empfänger- und Korrekturregeln |
| `invoiceNumbering.ts` | unveränderte Personenkennungen und Nummernvergabe |
| `invoiceOutput.ts` | Zeitraum, Darstellung/Sortierung, PDF-Titel, Druck-CSS und Ausgabepositionen |
| `downloads.ts` | bestehende Text-/Byte-Downloads; Blob-Helfer privat |
| vorhandene `money.ts`, `calendar.ts`, `paymentData.ts`, `identities.ts`, `invoiceSetup.ts` | Geldsummen, Zahlungsziel, EPC, IDs und Setup bei ihren Fachmodulen |
| `utils.ts` | allgemeine Formatierung und Personensortierung |

`invoiceCompliance.ts` entfällt; seine Setup-/Empfängernamensprüfung liegt bei
den Abschlussregeln. Unbenutzte Rechtstext-Helfer und deren Längenkonstante
entfallen. Nur intern benötigte Formatierungs-/Unterrichts-/Downloadhelfer sind
privat. Alle Aufrufer, einschließlich dynamischer Browser-Testimporte, verwenden
die zuständigen Module. Es gibt keine Kompatibilitäts-Reexports und keine neuen
Importzyklen.

`invoiceDraftErrors` ist eine reine Vorschau ohne temporäres Speichern oder
UUID-Vergabe. Mit Abschlussflag verwendet sie dieselben Regeln wie
`saveInvoiceDraft`; der Statusabschluss verwendet dieselben Abschlussregeln.
Geldfehler und Korrekturfehler werden dabei nicht erneut angehängt.
Die Kopie benötigt keinen probeweisen vollständigen Speicherbefehl mehr.

Beim Speichern/Finalisieren bleiben die vollständige Eingangsprüfung und genau
eine vollständige Ausgangsprüfung bestehen. Entfallen ist die zusätzliche
Vollprüfung desselben Zwischenentwurfs vor dem unmittelbaren Abschluss.
Importprüfung, Exportprüfung, Speichergrenze, Originalschutz, Web Locks,
Revisions-/Tokenprüfung und Konkurrenzschutz sind erhalten. Die ausdrückliche
Prüfung geänderter historischer Berechnung und die Zahlungstags-/Zuordnungsregeln
bleiben an ihrer Befehlsgrenze. Notwendige Prüfungen verschachtelter Aktionen mit
abweichenden Zwischenständen wurden nicht pauschal entfernt.

## Dateien und Umfang

38 Produktdateien sind geändert, davon sechs neue Fach-/Migrationsmodule und
eine gelöschte Datei. Etwa 640 Produktzeilen wurden entfernt/ersetzt; zahlreiche
davon sind reine Verschiebungen. `utils.ts` sinkt von ungefähr 460 auf 34 Zeilen.
Die explizite Textmigration und ihre Schutzbehandlung machen den Produktcode
insgesamt etwa 150 Zeilen länger. Es wird kein Netto-Codeabbau behauptet.
Sieben Textfelddeklarationen sowie vier Rechtstext-Featurehelfer/-konstanten
entfallen; weitere Exporte werden privat oder fachlich verschoben.

Produktdateien:

- `src/types.ts`, `src/App.tsx`;
- `src/components/DocumentHistory.tsx`, `src/components/InvoicePrint.tsx`;
- `src/views/InvoiceEditor.tsx`, `Settings.tsx`, `ImportReview.tsx`,
  `StorageRecovery.tsx`, `Invoices.tsx`, `People.tsx`;
- `src/lib/defaults.ts`, `commands.ts`, `documents.ts`, `invoiceActions.ts`,
  `settings.ts`, `safety.ts`, `storage.ts`, `envelope.ts`, `validation.ts`,
  `legacyValidation.ts`, `importState.ts`, `recoveryContactCleanup.ts`,
  `legacyInvoiceState.ts`, `legacyInvoiceNumbering.ts`, `utils.ts`, `printJob.ts`;
- `src/lib/calendar.ts`, `money.ts`, `paymentData.ts`, `identities.ts`,
  `invoiceSetup.ts` und die sechs neuen Module aus den Tabellen;
- gelöscht: `src/lib/invoiceCompliance.ts`.

32 Testdateien sind geändert: neue `p09-invoice-texts.test.ts`,
`p09-drafts-rules.test.ts` und `browser/p09.spec.ts`; Testregistrierung und
Fixtures; bestehende Erstellungs-, Kopier-, Korrektur-, Import-, Original-,
Zahlungs-, Nummerierungs-, Ausgabe- und Browsertests mit neuen Schema-/Text-
Erwartungen oder verschobenen Imports. Die eingefrorenen JSON-Altfixtures selbst
wurden nicht verändert. Die vollständige Dateiliste steht im Branchvergleich.

## Prüfungen und offene Abnahme

Vor Änderungen wurden `npm run build`, `npm test`, `npm run lint` sowie
`npm run test:browser -- tests/browser/documents.spec.ts tests/browser/storage.spec.ts tests/browser/print.spec.ts`
aufgerufen. Build/Test/Lint konnten zunächst mangels installierter Werkzeuge
nicht starten. `npm ci` scheiterte an Registry-HTTP-403. Der Git-Checkout ist
ebenfalls per HTTP 403 blockiert; deshalb wurde der exakte Main-Stand über die
GitHub-Schnittstelle gelesen. Der Browserwrapper kann den historischen Commit
`ba7857fd9180fa392c42a0235643e478e5077ee5` lokal nicht beziehen.

Für zusätzliche lokale Diagnosen wurden echte vorhandene Cache-/Laufzeitpakete
und zugängliche Paketquellen verwendet, ohne Änderung an Manifest oder Lockfile.
Diese Umgebung ist ausdrücklich nicht die verlangte Lockfile-Umgebung:
Node 24.19.0 statt 22, TypeScript 5.9.3 statt 5.7.3, Vite 8.0.13 statt 6.4.3,
React-Hooks-Lint 7.1.1 statt 5.2.0 und Playwright 1.62.1 statt 1.63.0.

| Prüfung | Unveränderte Ausgangsbasis | P09-Schlussstand |
| --- | --- | --- |
| `npm test`, rekonstruierte lokale Umgebung | 195/195 bestanden | 204/204 bestanden |
| `npm run build` mit TS 5.9 | bestehender `WriteLock`-Typfehler in `storage.ts` | derselbe Typfehler, keine weiteren Typbefunde |
| `npm run lint` mit Hooks 7 | sieben bestehende React-Regelfehler | dieselben sieben Regelfehler |
| Diagnose-Lint ohne die zwei neuen Hooks-Regeln | – | bestanden; ersetzt reguläres Lint nicht |
| direkter Vite-Build | – | bestanden; ersetzt `npm run build` nicht |
| betroffene reguläre Browsertests | historischer Checkout fehlt | gleicher Wrapperblocker |
| direkter Playwright-Lauf: alle acht geänderten Browserdateien, Chromium | – | 45 Fälle vor Testausführung blockiert: Browserprogramm fehlt |
| Print-CSS-Vergleich / Importgraph / `git diff --check` | Referenz | bestanden; keine neuen Zyklen |

Die sechs neuen Textfälle prüfen vollständige Migration, neue Exporte,
Originalschutz und Fehler/Rückrollen an vier Speicher-/Lesestellen. Die drei
Entwurfs-/Regelfälle prüfen Erstellungspfade, gemeinsame Fehler und verbleibende
Import-/Originalgrenzen. Der neue Browserfall ergänzt echten Recovery/Reload,
interne Textkopien, beide Empfänger und statische Wiederausgabe; bestehende
Editor-/Druck-/PDF-Fälle wurden an das einzelne Hinweisfeld angepasst.

Die vollständige grüne Abnahme mit exakten Abhängigkeiten und echten Browsern
ist offen. Ein Draft-PR wurde nicht erstellt: Die automatische Freigabeprüfung
hat ihn als Veröffentlichung eines Zusammenarbeitsergebnisses unter dem
ausdrücklichen Veröffentlichungsverbot abgelehnt. Damit wurde auch keine
PR-Quality-CI für den P09-Head gestartet. Der Branch ist mit den thematischen
Commits vorhanden; es gibt keinen Merge oder eine Veröffentlichung der Anwendung.
