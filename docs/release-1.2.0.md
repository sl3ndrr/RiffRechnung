# Releaseprüfung 1.2.0 · 3.AP8

Ausgangspunkt: `main` bei `750ff71faeb72571a8e6558d6634e8b2e7f2c052` (AP7 gemergt), Branch `3.AP8`. AP8 fügt keine Produktfunktion hinzu.

## Zusammenfassung der Pakete

| Paket | Integrierter Stand und Review |
| --- | --- |
| AP1 Theme | Beide Auswahlen verwenden denselben Command. Das Formular hält keine Theme-Kopie; beim Speichern gilt die aktuelle Auswahl aus der Queue. Demo und Starthinweis bleiben getrennt. |
| AP2 Kennzahlen | Zahlungseingänge zählen Zahlungsdatensätze einmal nach bestätigtem Tag, auch bei ersetzten/archivierten Belegen. Unbekannte Tage bleiben separat; offene Beträge verwenden aktive, nicht archivierte Ansprüche in Cent. |
| AP3 Dashboard | Startseite, acht offene Ansprüche, vollständiger Listenfilter, zugängliche Monatsdaten, Personenzähler und manuelle Backup-Erinnerung. Bestehende Accessibility-Fälle decken 320/390/1280 px in beiden Themes ab. |
| AP4 Rechnung | Monatliche Ausgabe mit eingefrorenen Positionsbeträgen, Zwischensummen und flachem Legacy-Fallback; helle eigene Druckfarben, geschützte Snapshots und expliziter QR-Fallback. |
| AP5 Undo | Gezielter Umkehr-Command, kein Gesamtsnapshot-Rollback. Replay-/Konfliktprüfung bleibt atomar; Timer und Portalhost überstehen Dialogwechsel. Restore/Reset entfernen alte Undo-Aktionen. |
| AP6 Motion | Gemeinsame Tokens, Medien- und App-Abschaltung, begrenzte Exits mit Timer-Fallback; Dialogfokus bleibt bis zur Entfernung geschützt. Eine redundante Aktivregel wurde entfernt; die spätere Regel nach Hover bleibt erhalten. |
| AP7 Seiten | Einmalige Eintritte, zugängliche Endwerte beim Hochzählen, inerte dekorative Detail-/Editor-Kopien; keine Mutation von Belegen oder Druckbereitschaft. |
| AP8 Release | Versionsquelle/Lock-Wurzel auf 1.2.0, aktualisierte Bedienungs-/Technik-/Release-Doku, eingefrorene 1.1.3-Sicherung und zusätzliche pixelgenaue PDF-Vergleiche. |

Querschnitt gelesen: `App`, `WorkspaceShell`, `Settings`, `ThemeSwitch`, `useLocalWorkspace`, Toast-/Dialog-/Motion-Hooks, `undo`, `dashboardStats`, Belegprojektion/Commands, `InvoicePrint`, Ausgabe- und Druck-CSS sowie zugehörige Fach-/Browserfälle. Im Review ergab sich kein zusätzlicher funktionaler Korrekturbedarf. Keine sichere Entfernung weiterer Fach-/Migrationshelfer: historische Pfade und Nachweise bleiben erforderlich.

## Datenintegrität

Schema 15 und Speicherumschlag 4 bleiben unverändert. Import, Export, Validierung, Geldarithmetik, Nummernvergabe und Originalschutz sind gegenüber dem Ausgangscommit unverändert. Keine Migration und keine neuen Abhängigkeiten. `src/version.ts` leitet 1.2.0 weiterhin direkt aus `package.json` ab.

Die neue synthetische Sicherung stammt aus dem 1.1.3-Code des Ausgangscommits, Demo-Stichtag 2025-02-10: 14 Rechnungen, neun Belegversionen und sieben Zahlungen. Ihr Import benötigt keinen Migrationsbericht und erhält alle Daten identisch. Der Test prüft außerdem das unveränderte Exportformat sowie bestätigten Restore, Export und Reload einschließlich Belegen, Zahlungen, Dashboard und Originalschutz. Die bestehenden Schema-7-/Schema-9-Fixtures und die historische Browsermigration bleiben unverändert.

## Prüfprotokoll

Lokale Umgebung: Node 24.19.0 / npm 11.9.0; CI verlangt unverändert Node 22. Direktes Git-Clonen und die npm-Registry sind durch die Ausführungsumgebung gesperrt. Die 173 Quelldateien wurden über das GitHub-Plugin geladen; der lokale Git-Baum entspricht exakt dem Ausgangsbaum `27dc4f994a417dc67d2c4a533157132a40f081bb`.

| Prüfung | Lokales Ergebnis |
| --- | --- |
| `npm ci` | Ausgeführt, HTTP 403 beim Paketdownload von `registry.npmjs.org`; keine Toolchain installiert. |
| `npm run lint` | Ausgeführt, blockiert: `eslint` fehlt. |
| `npm run typecheck` | Ausgeführt, blockiert: `tsc` fehlt. |
| `npm test` | Ausgeführt, blockiert: `esbuild` fehlt. |
| `npm run build` | Ausgeführt, blockiert: `tsc` fehlt. |
| `npm run test:browser` | Ausgeführt, blockiert: Projekt-Playwright fehlt. |
| `npm run test:migrations` | Ausgeführt, blockiert: unveränderter historischer Git-Commit lokal nicht verfügbar, kein erreichbarer `origin`. |
| Fachtests ohne React | 183 Prüfungen aus 26 Dateien direkt mit Node, TypeScript-Transformation und temporärem Auflöser für Endungen: bestanden, keine übersprungenen Fälle im ausgewählten Lauf. Dies ersetzt weder den gebündelten Gesamtlauf noch Typecheck oder Browserprüfungen. |

Die Meldung über unbekannte npm-Umgebungskonfiguration `http-proxy` stammt aus der Laufzeitumgebung; es wurde keine Projektkonfiguration zur Unterdrückung geändert. `.github/workflows`, Playwright-Konfiguration, Gate-Befehle, Retries und Timeouts bleiben unverändert. Maßgeblich sind beide Quality-Jobs (`reduce` und `no-preference`) am PR. Ihr Ergebnis wird nach dem Lauf hier ergänzt.

## Druck-Regression

Die vorhandenen AP4-Fälle prüfen einen/zwei Monate, Zwischensummen, mehrseitige Entwürfe, fehlende/ungültige Leistungsdaten, Legacy-Beträge und lange unteilbare Positionen. P11/P12 ergänzen Anschriften, mehrseitige Hinweise, eingefrorene Konten und GiroCode/Fallback. AP8 ergänzt für einen/zwei Monate, Entwurf, ungültige/fehlende Leistungsdaten, Legacy-Fallback und mehrseitige Rechnung je vier Renderings (Hell/Dunkel × normale/reduzierte Bewegung). Als Referenz dient die helle Ausgabe desselben Falls. Alle gerasterten Seiten müssen pixelgleich sein; Text und QR-Payload müssen ebenfalls gleich bleiben. `theme-changing` ist dabei ausdrücklich aktiv; am gesamten Rechnungspapier sind Animationen und Transitions verboten.

PDFs und erste/letzte Seitenbilder werden im bestehenden CI-Artefakt `browser-evidence-reduce` bzw. `browser-evidence-no-preference` gespeichert. Lokal konnten diese Renderings wegen der fehlenden Toolchain nicht ausgeführt oder visuell abgenommen werden. Theme-/Motion-Unabhängigkeit ist im Code nachvollzogen und durch die zusätzlichen CI-Assertions abgesichert; eine erfolgreiche PDF-Regression wird erst mit grünem CI-Lauf bestätigt.

## Manuelle Freigabe

- [ ] Eine Rechnung mit einem Monat, eine mit mehreren Monaten und eine mehrseitige Rechnung mit langem Hinweis drucken bzw. als PDF speichern. Beträge, Zwischensummen, Anschriften, Tabellenkopf, Endsumme, GiroCode und Seitenränder prüfen; zusätzlich einen Entwurf und historischen Fallback ansehen. Auch echten Firefox-/Safari-PDF-Ablauf prüfen.
- [ ] GiroCode mit der eigenen Banking-App scannen und Konto, Centbetrag und Rechnungsnummer vor einer Überweisung vergleichen.
- [ ] Hell/System/Dunkel oben und in den Einstellungen wechseln, auch mit ungespeicherten Formularwerten; Reload und Gerätepräferenz prüfen. Bewegungen reduzieren speichern und danach erneut wechseln/drucken.
- [ ] Per Tastatur Dashboard, Jahreswahl, Theme-Schalter und Dialoge durchlaufen; Fokus muss sichtbar bleiben. Mobil etwa 390 px und Desktop prüfen.
- [ ] Einen Entwurf bzw. eine Person löschen und rechtzeitig per Tastatur rückgängig machen; Hover/Fokus pausieren die Frist. Auch nach dem Ablauf und bei geöffnetem Dialog prüfen. Originale über Archivieren/Zurückholen prüfen.
- [ ] Dashboard mit eigenen Daten gegen bestätigte Banktage vergleichen: Teilzahlung, unbekannter Tag, Korrekturentwurf, finalisierte Korrektur und archivierter Beleg. Die Jahreswahl darf offene Beträge nicht verändern.
- [ ] Gespeicherten Bestand exportieren. Eine geschützte Kopie des eigenen 1.1.3-Backups in einem separaten Browserprofil importieren, Vorschau und Bestätigung prüfen und erneut exportieren/importieren. Namen, Nummern, Beträge, Originale und Zahlungen vergleichen; die produktive Sitzung vorher schließen.

## Offene Punkte und bewusste Grenzen

CI-Gesamtlauf und Sichtprüfung seiner Renderings sind zunächst offen; die lokalen Fachprüfungen allein erteilen keine Releasefreigabe. Native Druckdialoge, physische Ausdrucke, Banking-App-Scans und eigene Altbestände benötigen die obige manuelle Abnahme. Vorhandene Bereinigungslücken bei historischen Duo-/Nummernmuster-Nachweisen bleiben in [technical.md](technical.md#bekannte-bereinigungslücken) dokumentiert. Kein neues Feature, kein automatischer Backup-Ablauf, keine Änderung an historischen Originalen, keine Veröffentlichung oder Merge des Releases im Rahmen dieses PRs.
