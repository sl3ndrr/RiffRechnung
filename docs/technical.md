# Technik und Migration

Diese Beschreibung folgt dem integrierten Stand P01–P13 und dem kleinen Abschluss P14.
Die [Nutzeranleitung](../README.md) beschreibt die Bedienung; [historische Nachweise](evidence.md) ersetzen frühere Paketmatrizen und CI-Protokolle.

## Stack und Version

React 19, TypeScript 5.7 und Vite 6; Inter, Lucide und `qrcode` bleiben die vorhandenen UI-/GiroCode-Abhängigkeiten. Die genauen aufgelösten Versionen stehen in `package-lock.json`. `.nvmrc` verlangt Node 22.
`package.json.version` ist die einzige maßgebliche App-Version. `src/version.ts` importiert sie direkt für den bestehenden Info-Link; `resolveJsonModule` ist bereits konfiguriert. Paket und Lockfile bleiben unverändert. Die früher unabhängig vergebenen UI-/Release-Nummern sind historische Angaben, keine zweite aktuelle Versionsquelle.

## Lokale Speicherung

`StorageSession` schreibt nach Validierung und Originalschutzprüfung über eine Queue und einen originweiten Web Lock. Ohne Web Locks bleibt der echte Bestand schreibgeschützt; Export ist möglich. Der Demo-Modus verwendet keine echten Speicher-/Schreiblocks.
`localStorage` enthält den Speicherumschlag Version 4 mit Datenschema 15, Bestands-ID, Revision, Commit-ID, Abstammung und Daten. Hauptschlüssel ist `riffrechnung-state-v4`; ein vorheriger Stand und Wiederherstellungsnachweise bleiben im bestehenden Speicherprotokoll. Es gibt keine Serverübertragung von Rechnungsdaten durch die App und keine Verschlüsselung der lokalen Daten oder JSON-Dateien.

Vor jedem Schreiben werden aktuelle Speicher-/Legacy-Tokens geprüft. Ein anderer Tab oder alter Anwendungscode darf nicht unbemerkt überschrieben werden. Der vorhandene Batch-Schreiber stellt bei einem Schreibfehler die vorherigen Werte wieder her. Unbekannte neuere Formate bleiben schreibgeschützt.
Einstellungen werden ausdrücklich gespeichert. Export enthält ausschließlich gespeicherte Daten; Import benötigt Prüfung und Bestätigung.

Das Farbschema ist eine sofort gespeicherte Ausnahme: Topbar und Einstellungsauswahl verwenden denselben Handler und `changeThemeState` über `commit`. Der Command verändert ausschließlich `settings.theme`, ohne Kontodaten zu normalisieren oder eine unvollständige IBAN als neue Bankverbindung zu prüfen; Bestandsvalidierung und Originalschutz bleiben aktiv. Der Audit-Eintrag lautet „Farbschema geändert“. Das Einstellungsformular hält keine Theme-Kopie, und sein Speichern übernimmt das aktuelle Theme innerhalb der Speicher-Queue. Im Demo-Modus wird nichts in den echten Bestand geschrieben.

`riffrechnung-theme-hint` enthält nur `light`, `dark` oder `system` und wird ausschließlich aus bestätigten Einstellungen im echten Modus aktualisiert. Ein kleines Inline-Skript nutzt ihn vor dem App-Bundle; fehlende, ungültige oder nicht lesbare Hinweise bedeuten `system`. Er ist kein Bestandsdatum und keine Quelle der Wahrheit. `WorkspaceShell` wendet nach dem synchronen Laden vor dem ersten React-Paint die bestätigte Auswahl an, folgt Systemwechseln und synchronisiert `theme-color`. Nur der Daumen des Schalters erhält eine lokale Transform-Transition; die vorhandenen Bewegungs-Overrides gelten weiter.

## Belegdaten, Nummern und Zahlungen

`DocumentVersion` ist die geschützte Quelle finaler Belege. Ausgabe-Snapshot, Ausgabezeitraum und gesicherte Centbeträge liegen jeweils einmal in der Belegversion; `selectInvoice` leitet die Ausgabesicht daraus ab. `content` speichert keine zweite Kopie dieser Ausgabeinformationen.
`safety.ts` schützt bekannte Versionen, historische Snapshot-Nachweise, Nummernregister, Zahlungen und bisherige Zuordnungen. Verwaltungs-/Klärungshistorien werden fortgeschrieben. Korrekturen erhalten neue Belegversionen und Nummern; das Original bleibt erhalten. Eine ausdrücklich bestätigte Zahlungstagskorrektur und neue Zahlungszuordnung sind vorgesehen, Ursprung/Betrag/Erfassungszeit und frühere Zuordnungshistorie bleiben geschützt.

`recipients` ist die einheitliche Quelle für Rechnungsempfänger. `Student.guardianIds` bleibt die notwendige Stammdatenzuordnung. Jeder gemeinsame Empfänger muss für alle ausgewählten Lernenden berechtigt sein. Die PDF-Ausgabe druckt jeden Empfänger mit dessen eigenen vorhandenen Anschriftteilen; fehlende historische Daten werden nicht aus heutigen Stammdaten ergänzt.

`invoiceNumbering.ts` vergibt `YYYY-NNNN-Kennung` jährlich je Person/Kombination. `a+b` wird nach Vergabereihenfolge kanonisiert und unterscheidet sich von `ab`. Reservierungen und höhere bekannte Zähler werden beim Restore übernommen. Alte globale/nichtjährliche/mehrdeutige Zähler werden konservative Mindeststände; dadurch können Lücken entstehen. Neue Kreise erhöhen keinen globalen Zähler.

`money.ts` berechnet neue Positionen mit ganzzahliger Dezimalarithmetik und kaufmännischer Centrundung je Position. Historische Ausgabebeträge werden nicht neu berechnet. `calendar.ts` behandelt Geschäftstage als gültige gregorianische `YYYY-MM-DD`-Daten und verwendet für „heute“ den lokalen Kalendertag. Arbeitsjahr/Zeitraum sowie Zahlungsstatus werden abgeleitet; historische Rohstatus-/Datumswerte bleiben Nachweise. Überfälligkeit verlangt einen offenen aktiven Anspruch. Unbekannte Zahlungstage werden nicht erfunden.

Neue Empfängerkonten verlangen eine gültige deutsche IBAN, Kontoinhaber und gegebenenfalls gültige BIC. Das GiroCode-Payload verwendet die eingefrorene Ausgabe. Druck wartet auf Schrift-/Bildbereitschaft und verwirft verspätete Ergebnisse einer anderen Anforderung. QR-Fehler benötigen eine ausdrückliche Fallbackbestätigung.
Kontakt-E-Mail ist optional und auf eine ASCII-dot-atom-Adresse ohne Anzeigenamen oder Steuerzeichen begrenzt (`mailbox.ts`); historische Abweichungen werden beim Import gemeldet, nicht still korrigiert.

## Migration und ausdrücklich erlaubte Feldbereinigung

`inspectImport` unterstützt die vorhandenen Schemas 2–15 und prüft alte Formate über begrenzte Adapter. Die Vorschau schreibt nichts. `StorageSession.restore` prüft bekannte Originale, Bestandshistorie und Kennungen vor dem bestätigten Schreiben. Ein Fehler oder eine unlesbare verdächtige Nebenstruktur lässt die Ausgangsschlüssel unverändert. Vor einem Umstieg alte Tabs schließen und vorhandene externe Sicherungen aufbewahren; eine Rückkehr zu altem Code auf dem umgestellten Profil ist kein unterstützter Rückweg.

Der vereinbarte Schutz erlaubt ausdrücklich diese Löschungen, auch in Belegversionen, Konfliktnachweisen und internen Wiederherstellungskopien:

| Entfernte Daten | Vorhandene Adapter und Nachweise |
| --- | --- |
| `invoiceProfile`, `taxIdentifier`, `invoiceKind`, `taxPresentation`, `taxOutput` | `legacyTaxFields.ts`, `recoveryTaxCleanup.ts`; `private-invoices.test.ts` |
| Zahler-IBAN/`Guardian.iban`, `Guardian.paymentNote`, `Student.note`; alte separate Namensfelder | `legacyContactsRecipients.ts`, `recoveryContactCleanup.ts`; `p05-contacts-recipients.test.ts` |
| `introText`, `legalText`, `defaultLegalText`, `outputLegalText` | `legacyInvoiceTexts.ts`; `p09-invoice-texts.test.ts` |

Erfolgreiche Übernahme bereinigt diese Werte aus Hauptbestand, Vorgänger-/Legacy-Schlüsseln und internen Archiven. Die vorhandenen Tests prüfen zusätzlich Reload, normalen Export, Migrations-/Archivexport sowie unveränderte Ausgangswerte bei fehlgeschlagenen Writes. Ausstellerkonto, Beträge, Nummern, Empfänger, Leistungsdaten, Zahlungsnachweise und `freeText` (Rechnungshinweis) bleiben erhalten. Eigene Freitexte werden nicht nach früheren Begriffen durchsucht oder umgeschrieben. Neue aktuelle Daten und normale Exporte lehnen entfernte Felder durch die Schlüsselvalidierung ab.

Historische `separate`-Belege benötigen weiterhin die vorhandenen Altentwurfs-/Korrektur- und Klärungswege. `historicalSplit.ts`, Altvalidatoren und unabhängige Gold-Fixturen sind keine aktive neue Aufteilungsfunktion. Erfolgreich migrierte Arbeitsdaten enthalten keine Duo-Gruppen und kein Nummernmuster.

## Bekannte Bereinigungslücken

Die weitergehende Vorgabe „keine dauerhaften Kopien abgeschaffter Datenfelder“ ist für zwei bestehende Altpfade noch nicht vollständig erfüllt:

- `importState.ts` bewahrt bei Schema 8/9 das gesamte `duoGroups`-Objekt als `report.changes[].before`. `storage.ts` archiviert zusätzlich die bereinigte Eingangsdatei; `cleanRecoveryFields` entfernt die Gruppe nicht. Migrationsbericht und Wiederherstellungsarchiv können diese Daten weiterhin exportieren. `tests/duo.test.ts` erwartet diesen bisherigen Erhalt ausdrücklich.
- `legacyInvoiceNumbering.ts` entfernt `numberPattern`/`resetNumberAnnually` aus aktuellen Einstellungen, bewahrt ihre Werte aber im Migrationsbericht. Die internen Rohkopien werden dafür nicht bereinigt; Migrations-/Archivexport kann sie enthalten.

Diese Fach-/Migrationslücken werden in P14 gemeldet, nicht durch eine neue Migration behoben. Die normale aktuelle JSON-Sicherung enthält diese Felder nicht. Vorhandene alte Datei-Handles in IndexedDB bleiben gemäß dem integrierten P04-Verhalten unbenutzt; die Anwendung liest oder schreibt sie nicht (`tests/browser/storage.spec.ts`).

## Aktueller Prüfweg

Befehle aus `package.json`, `.github/workflows/quality.yml` und den beiden Playwright-Konfigurationen:

```sh
npm ci
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
# Unter Ubuntu/Debian: pdftotext für die PDF-Prüfungen bereitstellen.
sudo apt-get install -y poppler-utils
npm run test:browser
npm run test:migrations
npm audit --json
```

`npm test` bündelt alle `tests/*.test.ts` direkt über `scripts/bundle-tests.mjs` und führt die Fachtests mit `node --test` aus. Auch die schnellen Altformatregressionen gehören dazu. `npm run build` führt `tsc -b && vite build` aus; der Build prüft App, Node-Konfiguration und Tests. `npm run typecheck` ist als gezielter lokaler Befehl vorhanden, wird in CI nicht zusätzlich zum Build ausgeführt.

`test:browser` startet ausschließlich gewöhnliche Browser-/PDF-Fälle: Chromium als Hauptlauf, je drei JSON-Fallbackfälle in Chromium, Firefox und Linux-WebKit. `test:migrations` baut separat den unveränderten historischen Commit `ba7857fd9180fa392c42a0235643e478e5077ee5` und führt die beiden historischen Browserfälle unter derselben Origin aus. Dieser Befehl benötigt Git-Historie oder einen erreichbaren `origin` sowie die installierte Vite-/Playwright-Toolchain; temporäre Altcode-Pfade werden anschließend entfernt.
JSON-Ergebnisse stehen in `test-results/browser-results.json` und `test-results/migration-results.json`; synthetische PDFs und Fehlerkontext im selben Artefaktbereich. Der vorhandene CI-APT-Workaround und alle Gates bleiben unverändert.

Für lokale Entwicklung: `npm run dev`; zur Kontrolle des gebauten Ergebnisses: `npm run preview`.
Automatisierte PDF-Prüfungen decken Text, Seitenumbrüche, Empfängeranschriften, eingefrorene Konten, GiroCode und QR-Fallback in Chromium ab. Native Druckdialoge, physische Ausdrucke, Firefox-/Safari-PDF, Banking-App-Scans und reale Altbestände werden dadurch nicht als abgenommen behauptet. Historische visuelle P11-/P12-Nachweise stehen im [Nachweisindex](evidence.md).
