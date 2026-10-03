# P13 – Testausführung, CI und Konfiguration

## Ausgang und Vorarbeiten

Katalogbasis: `4b697df747819c283747f196c172c26af24e155c`.
Bearbeitet auf `simplify/p13-tests-ci`, ausgehend von integriertem
`main@b101bd47c193734aae68c8955b268ed003596e5b`.
P01–P12 sind über PRs #43–#54 gemergt. Ihre fachlichen Ergebnisse und vorhandenen
Schutzprüfungen wurden im aktuellen Quellstand geprüft: Privatrechnung,
gemeinsame berechtigte Empfänger einschließlich Selbstzahler, keine neuen
Duo-Gruppen, lokaler Speicher mit ausdrücklichem Abschluss, feste jährliche
Nummern, eingefrorene Originalausgabe, abgeleiteter Zahlungsstand, gemeinsame
Entwurfsregeln sowie erhaltene PDF-/GiroCode- und Bildschirmprüfungen.

Es gibt keine Repository-Datei `AGENTS.md`. Der anfangs materialisierte
Arbeitsbaum war sauber. Der direkte Clone erhielt HTTP 403; alle 143 Dateien
wurden über das GitHub-Plugin aus genau diesem Commit geladen. Der lokale
Ausgangsbaum hat denselben Git-Tree-Hash wie GitHub:
`957234338f6b0fb2f7f2f98a1e2154e8d847c669`. Der lokale Ausgangscommit ist eine
Materialisierung; die veröffentlichten Commits hängen am echten GitHub-Verlauf.

## Änderungen E55–E60

| Eintrag | Umsetzung |
| --- | --- |
| E55 | Keine Bibliothek entfernt oder aktualisiert. React/DOM, Lucide, Inter, qrcode und @types/qrcode bleiben. |
| E56 | Nur den separaten CI-Schritt `npm run typecheck` entfernt. `npm run build` bleibt `tsc -b && vite build`, einschließlich aller drei TS-Projekte. Eigenständiger Typecheck bleibt lokal verfügbar. |
| E57 | Normale Browser-/PDF-Prüfung startet direkt mit Playwright. Nur `test:migrations` lädt/baut den unveränderten Altcommit und führt die beiden echten Altanwendungsfälle aus. Goldfixture und Generator bleiben bytegleich. |
| E58 | Ubuntu-24.04-APT-Workaround unverändert erhalten. Chromium-Hauptlauf und sämtliche drei JSON-Fallbackfälle je Chromium/Firefox/WebKit bleiben erhalten. |
| E59 | Node-Pin, Lockfile, App-/Node-/Root-TS-Konfiguration und ESLint bytegleich. Nur die neue Migrationskonfiguration in den strikten Tests-Typecheck aufgenommen. Keine nachweislich veralteten Include-/Ignore-Pfade entfernt. |
| E60 | 24 Hub-Imports entfernt; alle 29 `tests/*.test.ts` direkt als esbuild-Einstiegspunkte gebündelt. 35 eigenständige Hubfälle unverändert in Fachdateien verschoben, zwei überlappende Fälle konsolidiert. |

Der Ausgangslauf hatte 207 **verschiedene** Fachtestnamen. Eine bereits doppelte
Registrierung desselben Namens war dort nicht nachgewiesen. Die direkte
Dateiauswahl ersetzt jetzt sämtliche Hub-Imports; es gibt keinen parallelen
Registrierungsweg. Der Bundler löscht vor jedem Lauf ausschließlich
`.test-dist/unit`, sodass entfernte Testdateien nicht als alte Bundles mitlaufen.

## Geänderte Dateien und Umfang

- `package.json`, `.github/workflows/quality.yml`: direkte Fachtests, getrennte
  Browserpfade, ein vollständiger Typecheck über den Build.
- `scripts/bundle-tests.mjs`: direkter, sortierter Einstieg für alle Fachdateien.
- `scripts/browser-tests.mjs` → `scripts/migration-tests.mjs`: historische
  Vorbereitung bleibt erhalten, verwendet nun die Migrationskonfiguration.
- `playwright.config.ts`, `playwright.migrations.config.ts`,
  `tsconfig.tests.json`: normale/historische Auswahl, getrennte JSON-Berichte
  und Ausgabeordner sowie strikte Typprüfung beider Konfigurationen.
- `tests/logic.test.ts` entfernt (756 Zeilen). Seine eigenständigen Fälle liegen
  in `invoice-basics.test.ts` (12), `invoice-output.test.ts` (7),
  `invoice-menu.test.ts` (2), `import-validation.test.ts` (10) und
  `workspace.test.ts` (4); reine Hilfsfunktionen in `invoiceFixtures.ts`.
- `tests/commands.test.ts`: die zusätzliche Viertelschritt-Dekrementprüfung
  übernommen.
- `tests/browser/storage.spec.ts`, `tests/browser/stabilization.spec.ts`:
  ausschließlich echte Altanwendungsfälle herausgelöst; übrige Testkörper
  unverändert. Beide verschobenen Testkörper stehen unverändert in
  `tests/browser/historical-migration.spec.ts`.
- `README.md`: nur betroffene Prüfbefehle und Voraussetzungen aktualisiert.
- Dieser P13-Bericht; keine umfassende Dokumentationskonsolidierung.

18 Prüf-/Konfigurationsdateien einschließlich einer Skriptumbenennung,
zuzüglich README und Bericht. Vor den Dokumentationsänderungen: 901 hinzugefügte
und 852 entfernte Zeilen, netto +49. Die Aufteilung benötigt eigene Imports;
der Abbau betrifft den Hub, 24 Registrierungsimporte, zwei redundante Testfälle
und einen doppelten CI-Typecheck, nicht Produktcode oder Schutzassertionen.

## Befehle

```bash
npm ci
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
# Voraussetzung für PDF-Textprüfung: pdftotext aus poppler-utils
npm run test:browser
npm run test:migrations
npm audit --json
```

`npm run test:bundle` baut nur die 29 Fachtestdateien.
`npm run typecheck` ist die vollständige Typprüfung ohne Vite-Build; nicht
zusätzlich vor dem vollständigen Build nötig.

`test:browser` braucht keinen historischen Commit, Git-Fetch, tar oder
historischen App-Build. Auch Altimport-/Originalschutzprüfungen mit bereits
eingefrorenen Fixtures bleiben darin enthalten.
`test:migrations` braucht Git/tar, den historischen Commit
`ba7857fd9180fa392c42a0235643e478e5077ee5` oder lesenden origin-Zugriff und
baut ausschließlich die temporäre Altanwendung unter derselben Origin.
`public/legacy` und die temporäre Quelle werden weiterhin im `finally` gelöscht.
Schema-7-Goldgenerator und Quelle
`1449d596e6538d32f4c22ef3a0b2f845ef1aed71` werden nicht im gewöhnlichen Testlauf
ausgeführt oder verändert.

## Abdeckungsvergleich und Abnahme

Ausgang: [Quality 37143592782](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37143592782)
auf `b101bd47`: Installation, Lint, Fachtests, separater Typecheck, Build,
Browser einschließlich historischer Vorbereitung und vollständiger Audit grün.

Implementierung: [Quality 37144868330](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37144868330)
auf `00fe3b7ac061d2eb90dc3747af7740a3cc8d40a4`: Installation, Lint, Fachtests,
vollständiger Build, normale Browser-/PDF-Prüfungen, historische Migrationsprüfung
und vollständiger Audit grün. Node 22.23.3; Chromium 153.0.8010.12,
Firefox 155.0, Linux-WebKit 26.6. Keine übersprungenen oder flaky Browserfälle.
Der abschließende Dokumentationsstand wird zusätzlich vollständig durch Quality
geprüft; der endgültige Head und dessen Lauf sind in [PR #55](https://github.com/sl3ndrr/RiffRechnung/pull/55)
verlinkt.

| Tatsächlich ausgeführte Prüfung | Ausgang | P13-Implementierung |
| --- | ---: | ---: |
| Fachtests, eindeutige Testnamen | 207/207 | 205/205 |
| Gewöhnlicher Chromium-Hauptlauf | 82/82 | 82/82 |
| Chromium-JSON-Fallback | 3/3 | 3/3 |
| Firefox-JSON-Fallback | 3/3 | 3/3 |
| Linux-WebKit-JSON-Fallback | 3/3 | 3/3 |
| Echte Altanwendung: Tab-Konflikt und unabhängige Rückkehr | 2/2, im Hauptlauf | 2/2, separat |
| Browser gesamt | 93/93 | 93/93 |
| `tsc -b`-Aufrufe im Quality-Job | 2 | 1 |

Alle 205 verbleibenden Fachtestnamen stimmen mit dem Ausgang überein und kommen
genau einmal vor. Alle 93 Browsernamen stimmen samt Browserzuordnung mit dem
Ausgang überein; nur die zwei historischen Chromium-Fälle heißen jetzt im
Projekt `chromium-migrations`. Nicht nur Exitcodes, sondern Testprotokolle und
ausgeführte Fallnamen wurden verglichen.

Die beiden Konsolidierungen sind:

- `ungültige Preise bleiben lokal und überschreiben den letzten gültigen
  Einstellungswert nicht` → bestehender P01-Fall in `safety.test.ts`:
  beide Tarife, 34,50, ungültige Formulareingaben, direkte Einstellung,
  Export/Import/Reload und negative Werte. Alle alten Assertions sind dort
  gleichwertig oder umfassender vorhanden.
- `Mengenfeld bietet begrenzte Viertelschritt-Steuerung` → bestehender P02-Fall
  in `commands.test.ts`: Unter-/Obergrenze und Erhöhung bereits vorhanden;
  `0.75 → 0.5` zusätzlich übernommen. Echte Tastatursteuerung bleibt in P12.

Unterschiedliche Geldfälle einschließlich 100.000 Decimal-Referenzkombinationen,
Kalendergrenzen und Zeitzonen, Erzeugung/Finalisierung, Korrekturen,
Altimport/Originalschutz, Reload, Speicherfehler und Druck bleiben erhalten.
Der HTML-/EPC-/PDF-Verbundfall mit 2,02 Euro bleibt, da er mehr als die reine
Centberechnung nachweist. Keine fachlichen Assertions abgeschwächt.

## Lokale Ausführung, Runner und offene Bedingungen

Vor und nach Änderungen wurden `npm run build`, `npm test`, `npm run lint`
und die jeweils vorgesehenen Browser-/Migrationspfade tatsächlich gestartet.
Vorher waren beide Browsergruppen im einzigen `test:browser`-Befehl enthalten;
danach wurden `test:browser` und `test:migrations` separat versucht.
Lokales Node ist 24.19.0 statt des unveränderten Pins 22. `npm ci` erhielt
Registry-HTTP-403; tsc/eslint/Playwright fehlen, der neue Bundler meldet fehlendes
esbuild. Der historische Git-Fetch ist ebenfalls HTTP-403-blockiert.
Diese lokalen Versuche führten keine Fälle aus und gelten nicht als bestandene
Gates. Die vollständige tatsächliche Ausführung ist durch die oben verlinkte
Node-22-CI nachgewiesen. Lokaler Quell-/Testkörpervergleich und Diffprüfung
bestanden zusätzlich.

Beim Verschieben wurde zunächst eine weiterhin nötige Altfixture-Referenz samt
Argument in einem gewöhnlichen Migrationstest entfernt; vor der erfolgreichen
Abnahme wurden beide wiederhergestellt und sämtliche normalen Testkörper
gegen den Ausgang verglichen. Kein Produktfehler wurde durch Testentfernung
verdeckt; im geprüften P13-Umfang ist kein offener Produktfehler festgestellt.

Der Chrome-APT-Workaround bleibt bytegleich. Die erfolgreichen Läufe auf
`ubuntu-24.04` mit aktivem Workaround sind kein Nachweis für einen behobenen
Mirror ohne ihn. Offene Bedingung für eine spätere Entfernung: nachvollziehbarer
Lauf auf dem passenden Runner mit deaktiviertem Workaround, erfolgreicher APT-
und gepinnter Playwright-Browserinstallation sowie allen Gates. P13 behauptet
diesen Nachweis nicht und entfernt keine notwendige Runnermaßnahme.

Keine offenen CI-Pflichtgates auf dem geprüften Implementierungshead.
Native Druckdialoge, Firefox-/Safari-PDF und Banking-App-Scans wurden nicht neu
abgenommen; die bestehenden Linux-Browserfallbacks bleiben nachgewiesen.
Deploymentdatei, Bedingungen für Pages-Upload und Buildartefakt bleiben erhalten.
Kein Merge und kein Deployment wurde ausgelöst.
