# Releaseprüfung 1.2.0 · 3.AP8

Ausgangspunkt: `main` bei `750ff71faeb72571a8e6558d6634e8b2e7f2c052` (AP7 gemergt), Branch `3.AP8`. AP8 fügt keine Produktfunktion hinzu.

## Zusammenfassung der Pakete

| Paket | Integrierter Stand und Review |
| --- | --- |
| AP1 Theme | Beide Auswahlen verwenden denselben Command. Das Formular hält keine Theme-Kopie; beim Speichern gilt die aktuelle Auswahl aus der Queue. Demo und Starthinweis bleiben getrennt. |
| AP2 Kennzahlen | Zahlungseingänge zählen Zahlungsdatensätze einmal nach bestätigtem Tag, auch bei ersetzten/archivierten Belegen. Unbekannte Tage bleiben separat; offene Beträge verwenden aktive, nicht archivierte Ansprüche in Cent. |
| AP3 Dashboard | Startseite, acht offene Ansprüche, vollständiger Listenfilter, zugängliche Monatsdaten, Personenzähler und manuelle Backup-Erinnerung. Bestehende Accessibility-Fälle decken 320/390/1280 px in beiden Themes ab. |
| AP4 Rechnung | Monatliche Ausgabe mit eingefrorenen Positionsbeträgen, Zwischensummen und flachem Legacy-Fallback; helle eigene Druckfarben einschließlich Root-Farbschema/Seitenfläche im Druck, geschützte Snapshots und expliziter QR-Fallback. |
| AP5 Undo | Gezielter Umkehr-Command, kein Gesamtsnapshot-Rollback. Replay-/Konfliktprüfung bleibt atomar; Timer und Portalhost überstehen Dialogwechsel. Restore/Reset entfernen alte Undo-Aktionen. |
| AP6 Motion | Gemeinsame Tokens, Medien- und App-Abschaltung, begrenzte Exits mit Timer-Fallback; Dialogfokus bleibt bis zur Entfernung geschützt. Eine redundante Aktivregel wurde entfernt; die spätere Regel nach Hover bleibt erhalten. |
| AP7 Seiten | Einmalige Eintritte, zugängliche Endwerte beim Hochzählen, inerte dekorative Detail-/Editor-Kopien; keine Mutation von Belegen oder Druckbereitschaft. Die CountUp-Probe liegt jetzt separat als Komponentenexport, damit ihr Browserharness ohne Fast-Refresh-Lintwarnung auskommt. |
| AP8 Release | Versionsquelle/Lock-Wurzel auf 1.2.0, aktualisierte Bedienungs-/Technik-/Release-Doku, eingefrorene 1.1.3-Sicherung und zusätzliche pixelgenaue PDF-Vergleiche. |

Querschnitt gelesen: `App`, `WorkspaceShell`, `Settings`, `ThemeSwitch`, `useLocalWorkspace`, Toast-/Dialog-/Motion-Hooks, `undo`, `dashboardStats`, Belegprojektion/Commands, `InvoicePrint`, Ausgabe- und Druck-CSS sowie zugehörige Fach-/Browserfälle. Die neuen PDF-Vergleiche deckten einen dunklen Seitenhintergrund außerhalb des hellen Rechnungspapiers auf. `html { color-scheme: light !important; }` im Druck korrigiert auch die vom Browser gezeichnete Seitenfläche und Randboxen, unabhängig vom Inline-Farbschema der App. Keine sichere Entfernung weiterer Fach-/Migrationshelfer: historische Pfade und Nachweise bleiben erforderlich.

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

Die Meldung über unbekannte npm-Umgebungskonfiguration `http-proxy` stammt aus der Laufzeitumgebung; es wurde keine Projektkonfiguration zur Unterdrückung geändert. `.github/workflows`, Playwright-Konfiguration, Gate-Befehle, Retries und Timeouts bleiben unverändert. Maßgeblich sind beide Quality-Jobs (`reduce` und `no-preference`) am [PR #64](https://github.com/sl3ndrr/RiffRechnung/pull/64). Der erste CI-Lauf [37203121341](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37203121341) bestand Installation, 260 Fachtests und Build sowie alle 233 bisherigen Browserfälle in beiden Jobs. Ausschließlich die sechs neuen PDF-Vergleiche meldeten die reproduzierbare dunkle Seitenfläche; die historische Migration und der separate Audit-Schritt wurden nach diesem Fehler noch nicht ausgeführt. Der Lintlauf zeigte zusätzlich die vorhandene Fast-Refresh-Warnung im CountUp-Harness. Beide Ursachen sind korrigiert, ohne Assertions, Timeouts, Retries oder Gates abzuschwächen. Die abschließenden CI-Ergebnisse und Artefakte sind am PR verlinkt; die Releasefreigabe verlangt beide grünen Matrixjobs einschließlich Migration und Audit.

## Druck-Regression

Die vorhandenen AP4-Fälle prüfen einen/zwei Monate, Zwischensummen, mehrseitige Entwürfe, fehlende/ungültige Leistungsdaten, Legacy-Beträge und lange unteilbare Positionen. P11/P12 ergänzen Anschriften, mehrseitige Hinweise, eingefrorene Konten und GiroCode/Fallback. AP8 ergänzt für einen/zwei Monate, Entwurf, ungültige/fehlende Leistungsdaten, Legacy-Fallback und mehrseitige Rechnung je vier Renderings (Hell/Dunkel × normale/reduzierte Bewegung). Als Referenz dient die helle Ausgabe desselben Falls. Alle gerasterten Seiten müssen pixelgleich sein; Text und QR-Payload müssen ebenfalls gleich bleiben. `theme-changing` ist dabei ausdrücklich aktiv; am gesamten Rechnungspapier sind Animationen und Transitions verboten.

PDFs und erste/letzte Seitenbilder werden im bestehenden CI-Artefakt `browser-evidence-reduce` bzw. `browser-evidence-no-preference` gespeichert. Lokal konnten keine neuen Renderings erzeugt werden. Die CI-Artefakte wurden heruntergeladen: Alle 27 Seiten der bestehenden AP4-Fälle waren gegenüber der unveränderten `main`-Referenz aus Lauf [37201357215](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37201357215) pixelgleich (SHA-256), einschließlich aller 21 Seiten des Belegs mit langen Positionen. Sichtproben von einem/zwei Monaten, Legacy-Fallback, Leistungsdaten, Entwurf und langem Druckabschluss zeigten die unveränderte Referenzdarstellung. Der neue Theme-Vergleich zeigte bei Dunkel ausschließlich die zusätzliche dunkle Seitenfläche außerhalb des hellen Papiers; diese Root-Farbschema-Lücke wurde behoben. Die vollständige Theme-/Motion-Unabhängigkeit verlangt weiterhin die strengen Pixel-, Text- und GiroCode-Assertions der abschließenden CI.

## Manuelle Freigabe

- [ ] Eine Rechnung mit einem Monat, eine mit mehreren Monaten und eine mehrseitige Rechnung mit langem Hinweis drucken bzw. als PDF speichern. Beträge, Zwischensummen, Anschriften, Tabellenkopf, Endsumme, GiroCode und Seitenränder prüfen; zusätzlich einen Entwurf und historischen Fallback ansehen. Auch echten Firefox-/Safari-PDF-Ablauf prüfen.
- [ ] GiroCode mit der eigenen Banking-App scannen und Konto, Centbetrag und Rechnungsnummer vor einer Überweisung vergleichen.
- [ ] Hell/System/Dunkel oben und in den Einstellungen wechseln, auch mit ungespeicherten Formularwerten; Reload und Gerätepräferenz prüfen. Bewegungen reduzieren speichern und danach erneut wechseln/drucken.
- [ ] Per Tastatur Dashboard, Jahreswahl, Theme-Schalter und Dialoge durchlaufen; Fokus muss sichtbar bleiben. Mobil etwa 390 px und Desktop prüfen.
- [ ] Einen Entwurf bzw. eine Person löschen und rechtzeitig per Tastatur rückgängig machen; Hover/Fokus pausieren die Frist. Auch nach dem Ablauf und bei geöffnetem Dialog prüfen. Originale über Archivieren/Zurückholen prüfen.
- [ ] Dashboard mit eigenen Daten gegen bestätigte Banktage vergleichen: Teilzahlung, unbekannter Tag, Korrekturentwurf, finalisierte Korrektur und archivierter Beleg. Die Jahreswahl darf offene Beträge nicht verändern.
- [ ] Gespeicherten Bestand exportieren. Eine geschützte Kopie des eigenen 1.1.3-Backups in einem separaten Browserprofil importieren, Vorschau und Bestätigung prüfen und erneut exportieren/importieren. Namen, Nummern, Beträge, Originale und Zahlungen vergleichen; die produktive Sitzung vorher schließen.

## Offene Punkte und bewusste Grenzen

Die lokalen Fachprüfungen allein erteilen keine Releasefreigabe; dafür gelten die abschließenden Quality-Ergebnisse am PR. Native Druckdialoge, physische Ausdrucke, Banking-App-Scans und eigene Altbestände benötigen die obige manuelle Abnahme. Vorhandene Bereinigungslücken bei historischen Duo-/Nummernmuster-Nachweisen bleiben in [technical.md](technical.md#bekannte-bereinigungslücken) dokumentiert. Kein neues Feature, kein automatischer Backup-Ablauf, keine Änderung an historischen Originalen, keine Veröffentlichung oder Merge des Releases im Rahmen dieses PRs.
