# P04 – Backup und Einstellungsspeicherung vereinfachen

## Ergebnis und Abnahmegrenze

Branch: `simplify/p04-storage-settings`. Ausgang: integriertes `main`
`53cc0a8bb22851eb5e39f0d9e1a90233dafa493f`, Merge von P03/PR 45;
P01/PR 43 und P02/PR 44 sind ebenfalls integriert. Katalogbasis ist
`4b697df747819c283747f196c172c26af24e155c`; umgesetzt werden ausschließlich
E27, E36 und E37 mit den ausdrücklich genannten Konkretisierungen.

Der aktive Ordnerworkflow ist entfernt. Einstellungen speichern ausschließlich
auf ausdrücklichen Klick. Verbleibende Downloads teilen eine Blob-Implementierung.
Die vollständige Node-22-Abnahme des Produktstands ist bestanden: **161/161
Logiktests, 60/60 Browser-/PDF-Fälle, Lint, Typprüfung, Build und Audit ohne Funde**.
Nachweis: [Quality-Lauf 37017294224](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37017294224)
auf `5451f3ae31b6e0c7925f539fe6ae564bd75ef23b`, Node `22.23.3`, npm `10.9.9`.
Die nachfolgende Änderung ergänzt ausschließlich diesen Bericht. Die abschließende
CI und Merge-Zuordnung stehen in [PR 46](https://github.com/sl3ndrr/RiffRechnung/pull/46).
Der Folgeauftrag erlaubt den Merge nach grüner Abnahme. Der vorhandene Pages-Workflow
startet bei Integration automatisch; kein zusätzlicher Deployment-Lauf wird ausgelöst.

## Änderungen

| Dateien | Änderung |
| --- | --- |
| `src/lib/backupDirectory.ts`, `src/lib/handleStore.ts`, `src/views/FolderReview.tsx` | Gelöscht: Ordnerprüfung, Dateibestand/Verlaufskonflikte, Schreibberechtigungen, versionierte Dateisicherung, IndexedDB-Handleverwaltung und Ordnerdialog |
| `src/lib/storageConflict.ts` | Allgemeiner `StorageConflict` für konkurrierende Tabs und alte Anwendungsversionen, unabhängig vom entfernten Ordnercode |
| `src/lib/storage.ts` | Keine Ordnerbindung, `connect`, `disconnect`, `backup` oder entsprechenden Reexports; lokale Speicherlogik bleibt erhalten |
| `src/App.tsx` | Ordnerverbindung/-prüfung/-wiederherstellung, `runBackup`, `backupNow`, automatische Sicherungsaufrufe und Datei-Backupstatus entfernt; JSON-Aktionen in Einstellungen gebündelt; Schutzansichten behalten Rettungsaktionen |
| `src/views/Settings.tsx`, `src/lib/settingsBuffer.ts` | Buffer gelöscht; kein Autosave, kein registrierter Flush. Ein Knopf speichert einen Formularstand; Fehler erhalten Eingaben. Während eines Versuchs ergänzte Eingaben bleiben offen |
| `src/App.tsx` | Ansichts- und Demo-Wechsel bieten bei offenen Einstellungen Weiterbearbeiten/Verwerfen; `beforeunload` bleibt. Farbschema-Symbol öffnet Darstellungseinstellungen statt unmittelbar zu speichern |
| `src/lib/utils.ts` | `downloadText` und `downloadBytes` delegieren an `downloadBlob`; angehängter Link und URL bleiben 60 Sekunden erhalten. Synchrone Initiierungsfehler räumen sofort auf und werden weitergegeben |
| `src/vite-env.d.ts` | Nicht mehr benötigte Picker-/Berechtigungs-/Ordner-Typaugmentierungen entfernt |
| `tests/storage.test.ts`, `tests/safety.test.ts`, `tests/logic.test.ts`, `tests/storageHarness.ts` | Nur Tests/Helfer der entfernten Dateisicherung, Handlepersistenz und Autosave-Flushing entfernt/ersetzt; lokale Speicher-/Import-/Originalschutzfälle bleiben |
| `tests/downloads.test.ts`, `tests/logic.test.ts` | Registrierter Regressionstest für verzögerte Blob-Konsumierung, bytegenaue Teilarrayrettung, Datenkopie und Fehlerfreigabe |
| `tests/browser/storage.spec.ts`, `tests/browser/stabilization.spec.ts` | Ausdrückliches Speichern, Eingabe-/Quotafehler und Wiederholung, Tabkonkurrenz, Weiterbearbeiten/Verwerfen, spätere Eingaben bei laufendem Schreiben und Demo-Isolation angepasst/ergänzt |
| `tests/browser/storage.spec.ts` | Synthetische alte IndexedDB-Handles/OPFS-Dateien werden unabhängig vom Produkt angelegt. Echtbestand, Dateien und gespeicherte Bindung werden verglichen; zusätzlicher Test verbietet Datei-/Handle-APIs im Echt- und Demomodus |
| `tests/browser/fallback.spec.ts` | JSON-Export aus Einstellungen; native Downloads mit künstlich späterer Klickinitiierung, Rohtext und unveränderte nicht lesbare Importbytes in Chromium/Firefox/WebKit vorgesehen |
| `README.md`, `docs/p04-storage-settings.md` | Backup-/Einstellungsspeicherung und Abnahmegrenzen dokumentiert |

Grob gegenüber dem Ausgang: 460 Quellzeilen entfernt, 88 hinzugefügt,
netto etwa 372 Quellzeilen weniger. Vier Dateien entfallen insgesamt einschließlich
`settingsBuffer.ts`; der kleine allgemeine Konflikttyp ersetzt die frühere Kopplung.
In App entfallen sieben ordnerspezifische Zustände/Refs: `pendingBackups`,
`fileBackupStatus`, `fileBackupError`, `folderConnected`, `folderName`,
`folderHandle`, `folderReview`; außerdem der Flush-Ref und der zusätzliche
Sidebar-Import-Ref. `settingsDirty`, lokale Fehler und Schreibstatus bleiben.

## Erhaltene Schutzmechanismen und Entscheidungen

- Alle Anwendungswrites bleiben in der `StorageSession`-Queue unter dem
  originweiten Web Lock. Ohne Web Locks gibt es keinen schreibenden Fallback.
  Token- und Legacy-Guard-Prüfungen verhindern Überschreiben durch veraltete Tabs.
- Sichtbare lokale Fehler, Quota-/Securityfehler, atomare Einzelwrites und
  Vorprüfung/Rollback von Speicherbatches bleiben erhalten. Einstellungen
  bestätigen nur einen tatsächlich erfolgreichen Schreibabschluss.
- Importprüfung, ausdrückliche Wiederherstellung, lokale Vorgängerkopie,
  Wiederherstellungsarchiv und Rohdatenrettung bleiben. Bekannte Originale,
  historische Belegversionen, Nummernreservierungen, Zähler und Personenbuchstaben
  bleiben geschützt; unbekannte neuere lokale Formate bleiben schreibgeschützt.
- Die Demo verwendet weiterhin eine eigene RAM-Sitzung. Sie greift weder auf
  echte Speicherung noch auf Handles oder reale Schreibsperren zu.
- Alte Datenbank `riffrechnung-handles-v4` und ihre gespeicherten Handles werden
  konservativ weder geöffnet noch gelöscht. Es gibt keine Bereinigungsmigration.
  Vorhandene externe Backup-Dateien werden nicht gelesen, geändert oder gelöscht.
- JSON-Export enthält bewusst den zuletzt bestätigten Stand, keine offenen
  Einstellungen. Die Beschriftung nennt das ausdrücklich. Der Export speichert
  Einstellungen nicht nebenbei.
- Ein laufender Speicherversuch blockiert Navigation; danach warnen offene
  Änderungen. Import/Reset besitzen weiterhin ihre eigenen ausdrücklichen
  Bestätigungen und nennen das Verwerfen offener Einstellungen. Ein fehlgeschlagener
  Import/Reset setzt das Formular nicht neu auf.
- Darstellung gehört zum selben ausdrücklichen Speichermodell. Das vorhandene
  Farbschema-Symbol führt deshalb zu den Darstellungseinstellungen. Keine allgemeine
  Design-, Rechnungs-, Empfänger-, Nummerierungs- oder PDF-Änderung.
- Daten-/Speicherformat bleiben Schema 10, Speicherprotokoll 4, Archivformat 1.
  Kein Backend, neuer Backupdienst oder neues Speichersystem.

## Lokale Ausgangs- und Abschlussprüfungen

Lokale Umgebung: Node `24.19.0`, npm `11.9.0`; erforderlich ist Node 22.
Der Arbeitsbereich enthielt anfangs keinen Checkout. Direktes Git-Clone erhielt
HTTP 403. Der Stand wurde über die GitHub-Verbindung materialisiert; alle 108
Dateien wurden vor Änderungen mit den GitHub-Blob-Hashes abgeglichen. Im
Repositorybaum gibt es keine `AGENTS.md`. Der lokale Ausgangscommit ist ausdrücklich
als Materialisierung gekennzeichnet; die GitHub-Commits hängen am echten `main`.

| Prüfung | Vor Änderungen | Nach Änderungen |
| --- | --- | --- |
| `npm ci` | Registry HTTP 403 (`yocto-queue`), Installation nicht möglich | Kein erfolgreicher neuer Installationsstand |
| `npm run build` | Exit 127, `tsc` fehlt | Exit 127, `tsc` fehlt |
| `npm test` | Exit 127, `esbuild` fehlt | Exit 127, `esbuild` fehlt |
| `npm run lint` | Exit 127, `eslint` fehlt | Exit 127, `eslint` fehlt |
| `npm run test:browser -- tests/browser/storage.spec.ts tests/browser/fallback.spec.ts` | Historischer Origin-Checkout nicht verfügbar | Mit zusätzlicher `stabilization.spec.ts` erneut versucht; Git-Fetch des unveränderten historischen Commits erhält HTTP 403 |
| Ergänzende Node-24-Tests | Keine npm-Abnahme daraus abgeleitet | **47/47 bestanden**, keine ausgelassenen Tests; Speicher, Schutz, Recovery, Duo-Altbestand, Import und Blob-Downloads |
| Syntaxprüfung | — | **76 TS/TSX-Dateien** mit vorhandenem Babel-Parser geprüft; keine ungenutzten Wertimporte gemeldet |
| `git diff --check` | Sauberer verifizierter Ausgang | Bestanden |

Die ergänzende Ausführung verwendet Nodes experimentelle TypeScript-Transformation
und einen temporären Extension-Resolver außerhalb des Repositorys. Ausgeführt:
`storage.test.ts`, `safety.test.ts`, `stabilization.test.ts`, `duo.test.ts`,
`ap6-integration.test.ts` und `downloads.test.ts`. Der vollständige Logiklauf benötigt
unter anderem React und esbuild und wurde **lokal nicht** als bestanden gewertet. Die vollständige CI-Abnahme steht oben.

Ein erster ergänzender Versuch ohne TypeScript-Transformation konnte
Parameterproperties nicht laden. Der breitere Versuch traf auf fehlendes React
und einen übrig gebliebenen Test des gelöschten Handlemoduls. Dieser obsolete
Test wurde entfernt. Die Syntaxprüfung erkannte zusätzlich einen Rest des alten
Flush-Effects im Einstellungsformular; er ist entfernt, die erneute Syntaxprüfung
bestanden. Entfernte Ordnertexte/-selektoren wurden in den Browserfällen angepasst.
Diese Zwischenbefunde und Korrekturen ersetzen keine vollständige CI-Abnahme.

## Vollständige CI-Abnahme und verbleibende Grenzen

Der Quality-Lauf auf dem oben genannten Produktcommit bestätigt `npm ci`,
`npm run lint`, `npm test` (161/161), `npm run typecheck`, `npm run build`,
`npm run test:browser` (60/60) und `npm audit --json` (0 gemeldete Schwachstellen).
Keine übersprungenen Fach-/Browserfälle, keine Retries. Synthetische Browser-/PDF-
Nachweise stehen im [CI-Artefakt](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37017294224/artifacts/11232170430).

Geprüft sind echte Chromium-Abläufe einschließlich Web Locks, Quota-Wiederholung,
konkurrierender Tabs, echter historischer Altversion, ungenutzter alter OPFS-/
IndexedDB-Handles sowie ausdrücklich gespeicherter Einstellungen. JSON-Export/
Import/Reload und asynchron initiierte Rohtext-/Rohbyte-Downloads sind in Chromium
153.0.8010.12, Firefox 155.0 und Playwright-WebKit 26.6 unter Linux bestanden.
Native Druckdialoge, Safari/macOS, Banking-App-Scan und manuelle Screenreader-
Abnahme bleiben die bestehenden separaten Freigabegrenzen; P04 ändert das PDF nicht.

Der erste Versuch, einen Entwurfs-PR zu öffnen, war im ursprünglichen Auftrag
wegen dessen Veröffentlichungsverbot automatisch abgelehnt worden. Der ausdrückliche
Folgeauftrag zum Merge hat die notwendige PR-Erstellung und Prüfung autorisiert.
PR 46 ist geöffnet und die vollständige Quality-CI erfolgreich ausgeführt.
Die lokalen Registry-/Git-403 bleiben als Ausgangsgrenzen dokumentiert; sie sind
kein offenes Hindernis für die durch vollständige CI belegte P04-Abnahme.
