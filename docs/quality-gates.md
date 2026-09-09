# Qualitätsschranken und Nachweise

Aktueller Stand: [Paket 12](#paket-12--integrierter-prüfstand-und-fehlerzuordnung),
[Freigabematrix](release-readiness.md). Die folgenden früheren Abschnitte sind historische Nachweise.

Stand: 2026-09-06. Ausgangscommit: `ba7857fd9180fa392c42a0235643e478e5077ee5`.

## Aufbau

`quality.yml` läuft für Pull Requests und ist als lokaler wiederverwendbarer
Workflow eingebunden. Ohne Pfadfilter prüft er `npm ci`, `npm run lint`, `npm test`,
`npm run typecheck` und `npm run build` auf `ubuntu-24.04` mit `.nvmrc` (Node 22).
`tsconfig.tests.json` übernimmt die strikten App-Einstellungen einschließlich
DOM-Deklarationen und ergänzt Node-Typen; `tsc -b` erfasst App, Vite-Konfiguration
und Tests. Paket 00 begann mit 45 Tests; aktuelle Ergebnisse stehen unten pro Paket.

`deploy.yml` ruft denselben Workflow ausschließlich für `main` auf. Das Pages-
Artefakt entsteht erst nach allen erfolgreichen Prüfungen und wird im selben
Workflow-Lauf veröffentlicht (`needs: quality`). Es gibt weder fremde Artefakt-
Downloads noch erneutes Auschecken eines beweglichen Branches im Deployment.
Manuelle Läufe anderer Branches werden ausgeschlossen; laufende Veröffentlichungen
werden nicht durch neue Läufe abgebrochen.

PR-/Prüfjobs besitzen nur `contents: read`, keine Secrets-Weitergabe, kein
Environment und keine Pages-/OIDC-Rechte. Checkout speichert keine Credentials;
Paketmanager-Caching ist deaktiviert. Nur `deploy` besitzt `pages: write` und
`id-token: write` sowie das Environment `github-pages`. Der PR-Trigger ist
`pull_request`, nicht `pull_request_target`.

## Offiziell geprüfte Referenzen

Release-Metadaten, Tag-zu-Commit-Auflösung und `action.yml` wurden am 2026-09-06
über die jeweiligen offiziellen GitHub-Repositories gelesen. Vollständige SHAs
stehen in den Workflows. Die Action-Majorwechsel sind auf die CI-Werkzeuge
begrenzt und wegen der [Node-20-Abkündigung für Actions](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
begründet: aktuelle Node-24-Actions auf GitHub-Runnern; Projektbefehle weiterhin
Node 22. Keine React-/Vite-/TypeScript-Major-Upgrades.

| Action | Offizielles Release | Fixierter Commit |
| --- | --- | --- |
| checkout | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| setup-node | [v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0) | `820762786026740c76f36085b0efc47a31fe5020` |
| configure-pages | [v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0) | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| upload-pages-artifact | [v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0) | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| deploy-pages | [v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1) | `368f82528645a54fb793d4d04e342629a3f51346` |

`upload-pages-artifact` pinnt intern `upload-artifact` v7.0.0 auf
`bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`. Versteckte Dateien werden standardmäßig
nicht hochgeladen; der statische Vite-Build benötigt sie nicht.

## esbuild und Lockfile

Das offizielle [Advisory GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)
nennt Versionen bis einschließlich 0.24.2 als betroffen, ab 0.25.0 als korrigiert.
Betroffen ist der Entwicklungsserver mit offenem CORS; hier dient die direkte
Abhängigkeit dem Testbundle. Eine Ausnutzung der statischen App ist damit nicht belegt.

Gewählt: [esbuild 0.25.12](https://github.com/evanw/esbuild/releases/tag/v0.25.12),
bereits zuvor transitiv unter Vite 6.4.3 vorhanden und mit dessen `^0.25.0`
kompatibel. Exakte direkte Version hält das Update gezielt. Regeneration im
isolierten GitHub-Job mit Node 22.23.2 / npm 10.9.8:

```sh
npm install --save-dev --save-exact esbuild@0.25.12 --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci
```

Das vollständige npm-Ergebnis wurde aus dem Job übernommen, keine Integritätswerte
manuell erzeugt. Der semantische Vergleich aller Lockfile-Einträge bestätigt:
nur Root-Anforderung, esbuild und Plattformpakete ändern sich; die gleichartige
Vite-Unterinstallation entfällt. Lockfileformat bleibt 3. Anschließendes `npm ci`
führt auch die regulären Installationsskripte aus. Das beiläufige npm-Audit meldet
danach 0 Funde; daraus folgt keine allgemeine Sicherheitsfreigabe.

## Ausgeführte Prüfungen

| Stand / Lauf | Umgebung und Befehle | Ergebnis |
| --- | --- | --- |
| Unveränderte Baseline `ba7857f…`, [Lauf 34024505339](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34024505339), Job `baseline` | Ubuntu 24.04, Node 22.23.2, npm 10.9.8; `npm ci`, `npm run lint`, `npm test`, `npm run build` | Erfolgreich; 45 Tests, 45 bestanden, 0 fehlgeschlagen/übersprungen. |
| Baseline plus npm-esbuild-Update, gleicher Lauf, Job `lockfile` | Dieselbe Umgebung, obiger Regenerationsbefehl, dann dieselben vier Schranken | Erfolgreich; 45/45 Tests, Testbundle und Build funktionieren. Kein Ergebnis-Commit-Prüflauf. |
| Implementierung `f4e42e7a339431ce385d488c19920d6793a4e54f`, [PR-Lauf 34024860696](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34024860696) | Ubuntu 24.04, Node 22.23.2 / npm 10.9.8; `npm ci`, `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` | Alle erfolgreich; 45/45 Tests, keine übersprungen. PR-Artefaktupload planmäßig ausgelassen. Token-Log: ausschließlich Contents/Metadata read. |
| Absichtlicher Fehler `d74ac8047e08dd30b40a39c73c90b1caae76a503`, [Lauf 34024886264](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34024886264) | Derselbe wiederverwendbare Prüfworkflow, Node 22.23.2 / npm 10.9.8, `upload-pages-artifact: true` | `npm test`: 45 bestanden, genau 1 absichtlich fehlgeschlagen, 0 übersprungen; nachfolgender Build, Artefaktupload und `publish-probe` übersprungen. Erwarteter Fehler, keine Baseline-Regression. |
| Testdatei-Typfehler, gleicher Negativlauf, Job `typecheck-probe` | Temporäre `tests/quality.typecheck-probe.ts` mit `number = 'intentional type error'`; `npm run typecheck`, Datei entfernen, erneut `npm run typecheck` | Erst TS2322 an genau dieser Testdatei; danach Exit 0. Zusätzlich `git diff --exit-code -- package.json package-lock.json` erfolgreich. |
| Fehler entfernt, `cb4e6ea5bee69907243a21a5a5dff2b899997c08`, [Lauf 34024972042](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34024972042) | Derselbe Prüfworkflow und dieselbe Umgebung; ursprüngliche Testdatei wiederhergestellt | Alle fünf Schranken, Pages-Artefaktupload und `publish-probe` erfolgreich. Kein Deployment ausgeführt. |
| Lokaler Ausgangsstand | Node 24.19.0 / npm 11.9.0; `npm view node@22 version --json --fetch-retries=0 --fetch-timeout=20000`; `npm ci --fetch-retries=0 --fetch-timeout=20000 --cache /workspace/scratch/2bd0130b90ec/npm-cache` | Beide Exit 1 / HTTP 403 durch Netzwerkbeschränkung; kein lokales Node 22 und keine erfolgreiche Installation. |
| Lokale Lint-/Test-/Build-Versuche | `npm run lint`, `npm test`, `npm run build`, zusätzlich offline versucht | Werkzeugabbruch vor Prozessstart: `network approval was cancelled before a decision was returned`; keine Prozess-Exitcodes/Testergebnisse. |

Der isolierte Baseline-Workflow liegt ausschließlich auf `codex/paket-00-ci-evidence`,
Workflow-Commit `6922fd9095d23225e741a960d5136bbc4867fc5c`; beide Jobs checken ausdrücklich
den oben genannten Ausgangscommit aus und besitzen nur Lesezugriff.

Der PR-Lauf ist über `head_sha` dem Implementierungscommit zugeordnet und checkt
GitHubs temporären Merge-Commit `b0fa5e63127c8849fd1bbe9b1c4364c6bddfc43a` aus.
Dessen Tree `2e241c6572fca72cfba1976c34c601af2c7d717a` stimmt mit dem
Implementierungscommit überein (GitHub-API-Abgleich).
Abschließende reine Nachweisdokumentation löst erneut PR-CI aus; deren konkreter
Ergebnis-Commit und Lauf stehen in [PR #19](https://github.com/sl3ndrr/RiffRechnung/pull/19).

Der kontrollierte Negativ-/Positivnachweis bleibt auf dem isolierten Nachweisbranch.
`publish-probe` verwendet wie das tatsächliche Deployment `needs: quality`, hat
keine Schreibrechte und veröffentlicht nichts. Damit wird die CI-Abhängigkeit
ohne Produktionsveröffentlichung geprüft. Insbesondere war beim Negativlauf der
Artefaktupload angefordert; er wurde wegen des Testfehlers blockiert, nicht wegen
eines PR-/Branch-Filters. Der absichtliche Test und der Typfehler sind entfernt;
`tests/logic.test.ts` entspricht wieder exakt dem Ausgangsstand. Die eigentlichen
Deployment-Actions und Environment-Regeln bleiben bis zum separaten Deployment-Auftrag ungeprüft.

Der unveränderte Prüfworkflow hat in PR, Negativ- und Positivnachweis den Git-Blob
`ffb49693cf76e524572f9a752199f2e3828d1744`. Das positive Pages-Artefakt ist dem
Commit `cb4e6ea5bee69907243a21a5a5dff2b899997c08` zugeordnet; keine Tests oder
Diagnoseworkflows aus dem Nachweisbranch werden in den Ergebnis-PR übernommen.

| Abnahme | Status |
| --- | --- |
| PR: Node 22, npm ci, Lint, Tests, Typen einschließlich Tests, Build | Bestanden; PR-Lauf oben, abschließender Dokumentationsstand im PR |
| Absichtlicher Testfehler verhindert Veröffentlichungsvoraussetzungen | Bestanden: gleicher Prüfworkflow, Artefakt und abhängiger Probejob blockiert, positiver Gegenlauf erfolgreich |
| PR-Jobs ohne Deployment-Rechte/-Secrets | Bestanden: Workflow und tatsächliches Token-Log geprüft |
| Korrigiertes esbuild, reproduzierbares npm-Lockfile, Testbundle und Build | Bestanden |
| Pflichtstatuscheck administrativ eingerichtet | Nicht umgesetzt; separat einzurichten |
| Lokale Node-22-Ausführung, tatsächliches Pages-Deployment, reale Browser-Fachabnahmen | Nicht geprüft; lokale Installation blockiert, Deployment separat beauftragen |

## Rechte und administrative Abnahme

- GitHub-Plugin: Repository-/Datei-/Commit-Lesen, Branch-Erstellung, Tree/Commit/
  Ref-Schreiben, PR-Erstellung und CI-Läufe/Jobschritte/Logs erfolgreich ausgeführt. Terminal-
  `git ls-remote https://github.com/sl3ndrr/RiffRechnung.git HEAD refs/heads/main`
  scheitert mit Exit 128 / HTTP 403. Es wird keine Beschränkung umgangen.
- Rulesets lesbar: [21096773](https://github.com/sl3ndrr/RiffRechnung/rules/21096773)
  enthält Lösch-/Force-Push-Schutz, aber keine Branch-Auswahl; [21137022](https://github.com/sl3ndrr/RiffRechnung/rules/21137022)
  gilt aktiv für den Default-Branch, verlangt PRs (0 Pflichtfreigaben) und schützt
  vor Löschung/Force-Push. Beide enthalten **keine required_status_checks**.
- **Administrativ offen:** `Quality (Node 22)` als verpflichtenden Statuscheck
  für `main` konfigurieren, vorzugsweise mit aktuellem Zielbranch als Voraussetzung.
  Die Workflows ersetzen diese Einstellung nicht. Keine Branch-Regel wurde geändert.
- Klassisches `GET /repos/sl3ndrr/RiffRechnung/branches/main/protection`: HTTP 403
  `Resource not accessible by integration`, trotz nomineller Admin-Angabe in
  Repository-Metadaten. Die vollständige klassische Schutzkonfiguration bleibt unbekannt.
- Pages-Environment-Schutz und Veröffentlichung auf `main` sind nicht administrativ
  abgenommen; es erfolgt weder Merge noch produktives Deployment in Paket 00.
- Browser-Verbindung verfügbar und leerer Testkontext geprüft; kein lokaler
  App-Build verfügbar. Keine echte Fokus-, Dateiberechtigungs-, Druck- oder
  Banking-App-Prüfung. Server-Rendering und Storage-Mocks zählen dafür nicht.

## Paket 01 – konkrete Prüfnachweise

Basis: `d627d1333fc94f6a9628c3f9d6a1ca17128244fd` auf
`codex/paket-00-quality-gates` (PR #19 noch offen); ursprüngliches `main` weiterhin
`ba7857fd9180fa392c42a0235643e478e5077ee5`. Ergebnis:
[PR #20](https://github.com/sl3ndrr/RiffRechnung/pull/20),
`codex/paket-01-sofortschutz`. Abhängigkeiten, Lockfile, Node-Vorgabe, Typecheck-
Konfiguration und wiederverwendbarer Prüfworkflow unverändert aus Paket 00.

| Commit / Lauf | Befehle und Umgebung | Ergebnis |
| --- | --- | --- |
| Basis `d627d133…`, [34025170731](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34025170731) | Vorhandener Paket-00-PR-Prüflauf unter Node 22, Status erneut ausgelesen | Erfolgreich; keine neue lokale Baseline ausgeführt |
| Implementierung `1f30b4848d17efc36be4f7483f896f3fec33ee77`, [34039460362](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34039460362) | Ubuntu 24.04, Node 22.23.2/npm 10.9.8; `npm ci`, `npm run lint`, `npm test`, `npm run typecheck` | Installation/Lint/56 Tests erfolgreich, 0 übersprungen; TS2339 in `tests/safety.test.ts` (bereits eingegrenzte Union). Build wegen Typecheck-Fehler nicht ausgeführt. Neuer Test-Typfehler, keine Baseline-Regression. |
| Korrektur `e491d440d9baa6ec251570da65bc0eb3187fa399`, [34039578186](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34039578186) | Ubuntu 24.04.4, Node 22.23.2/npm 10.9.8; `npm ci`, `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` | Alle fünf Schranken erfolgreich; 56 Tests, 56 bestanden, 0 fehlgeschlagen, 0 übersprungen. |
| Lokale Umgebung | Node 24.19.0/npm 11.9.0; `npm view node@22 version --json --fetch-retries=0 --fetch-timeout=15000`; `npm ci --fetch-retries=0 --fetch-timeout=15000 --cache /workspace/scratch/9b3a8b1dfebe/npm-cache` | Je Exit 1 / E403: Node-Registry bzw. `yocto-queue-0.1.0.tgz`; keine erfolgreiche Installation, kein lokales Node 22 |
| Lokale Schranken | `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` | Werkzeugabbruch vor Prozessstart: `network approval was cancelled before a decision was returned`; keine Testergebnisse oder Prozess-Exitcodes |
| Lokale begrenzte Prüfung | `node --check` für neue TS-Module/Testdatei; `git diff --check` | Exit 0 unter Node 24; reine Syntax-/Diffprüfung, kein Ersatz für CI oder Browser |

Im erfolgreichen Prüflauf entspricht `head_sha` dem Commit `e491d440…`.
Ausgecheckt wurde der temporäre PR-Merge-Commit
`b42936065b53edcb20a06d8ff4991c6b296376f6`; dessen Tree
`dd2245943bcef96a4af9138e54d30122a81ca86b` stimmt per API-Abgleich mit dem
Ergebnis-Tree überein. Der Job hatte ausschließlich Contents/Metadata-Leserechte.
Kein Pages-Artefakt angefordert, kein Deployment. Die anschließende reine
Nachweisdokumentation löst einen weiteren vollständigen Prüflauf aus; endgültiger
Commit und Lauf werden im PR und Abschluss genannt.

Die elf zusätzlichen Funktionsregressionen und fachlich ersetzten bisherigen
Tests prüfen gesperrte und erlaubte Zustandsübergänge, Geld/Preise, Referenzen,
Nummernreservierungen und Schreibkonflikte einschließlich serialisiertem Import
und simuliertem Reload. Die vorhandenen Normalisierungen bleiben unverändert;
ein zweiter Import prüft unveränderten Inhalt bei bestehender `updatedAt`-Semantik.
Keine Migration, keine gelöschten oder übersprungenen Tests zur Statuskosmetik.
Dateihandles/Storage sind synthetische Mocks, die unter anderem null Datei-
Erzeugungen und null Schreibstreams nachweisen. Sie belegen keine echten
Dateiberechtigungen oder parallelen Browser-Tabs. Reale Browser-, Fokus-, Druck-
und Banking-App-Abnahmen bleiben offen. Pflichtstatuscheck aus Paket 00 weiterhin
administrativ offen. Nächstes Paket: 02, nicht begonnen.


## Paket 02 – Fachbefehle, Validatoren und reparierbare Formate

Basis: PR #20 / `aa775b842aec2ef3b27dc6e3697de7e6eb850b12`; `main` weiterhin
`ba7857fd9180fa392c42a0235643e478e5077ee5`. Branch
`codex/paket-02-fachbefehle-migration`, [PR #21](https://github.com/sl3ndrr/RiffRechnung/pull/21).
GitHub-Branch-, Tree-, Commit-, Ref- und PR-Schreiben tatsächlich ausgeführt.
Ausgangs- und Ergebnis-Trees stimmen mit dem lokalen Git-Tree überein.
Keine neue Abhängigkeit; bestehende Node-22-CI und Testdatei-Typprüfung unverändert.

| Commit / Lauf | Befehle und Umgebung | Ergebnis |
| --- | --- | --- |
| `2db8a974ef0a5ab2ec5c66a1081fb073da58a5db`, [34055649338](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34055649338) | Ubuntu 24.04.4, Node 22.23.2, npm 10.9.8; `npm ci`, `npm run lint`, `npm test` | Installation/Lint erfolgreich; 68/74 Tests, 6 fehlgeschlagen, 0 übersprungen. Typecheck/Build wegen Testschranke nicht gestartet. |
| `02e11cb0732539a7fef7079267e7b829b6c22137`, [34055811688](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34055811688) | Gleiche Umgebung; `npm ci`, `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` | Alle erfolgreich; **74/74 Tests**, 0 fehlgeschlagen/übersprungen. Kein Pages-Artefakt/Deployment im PR. |
| Lokale Versuche in dieser Sitzung | Node 24.19.0/npm 11.9.0; `git ls-remote https://github.com/sl3ndrr/RiffRechnung.git HEAD refs/heads/main`; `npm view node@22 version --json --fetch-retries=0 --fetch-timeout=20000`; `npm ci --fetch-retries=0 --fetch-timeout=20000 --cache /workspace/scratch/b09ca8b15928/npm-cache` | Git-Remote Exit 128/HTTP 403; Node-22-Abruf und Installation Exit 1/E403. |
| Lokale Schranken | `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` | Werkzeugabbruch vor Prozessstart: `network approval was cancelled before a decision was returned`. Keine regulären lokalen Ergebnisse. |
| Lokale Ergänzungen | Node-24-`--experimental-strip-types --check` für 15 TS-Dateien, `git diff --check`, Git-Blob-/Tree-Abgleich | Erfolgreich; Syntax/Diff/Dateiidentität, kein Ersatz für Node-22-CI. |

Der erfolgreiche PR-Lauf ist über `head_sha` dem Ergebniscommit zugeordnet und
checkt GitHubs temporären Merge-Commit `65a5aae6c380a4c91b510e3a7f8ce774ca95c0d1`
aus. Dessen Tree `e581405f97262056f9c9fcaca7be02f091c58369` stimmt laut GitHub-API
mit dem Implementierungs- und lokalen Git-Tree überein.

Die sechs Fehler des ersten Laufs sind Änderungen in diesem Paket zugeordnet:
drei Erwartungen auf bisherige Meldungen (jetzt konkrete Validierungsfehler),
eine bislang im Demo-Test zugelassene unvollständige E-Mail, ein Storage-Mock ohne
`getItem` und der neue SSR-Test eines Portals ohne DOM. Der zweite Stand erhält
sämtliche Prüfabsichten, prüft konkrete Fehlerpfade sowie den tatsächlich im Dialog
verwendeten Inhalt und ergänzt gültige/ungültige E-Mail-Gegenproben. Kein Test wurde
zum Erzwingen eines grünen Status gelöscht, übersprungen oder abgeschwächt.
Die Vorgänger-CI war grün; keine vorbestehenden Testfehler festgestellt.

18 neue Tests prüfen echte Befehlszustände, Preise/Mengen, Referenzen und IDs,
2/3 Empfängerkopien als Entwurf/finalisiert, Rohdaten/Migration/Idempotenz,
Nummernreservierung und Mailbox-/URI-Grenzen. Rechnungsstart- und Mengen-Quelltext-
musterprüfungen wurden durch Verhalten ersetzt. Migration verändert keine Beträge,
Nummern oder vorhandenen Snapshots. Vollständiger Originaltext im Bericht und
Dateibytes im Importkontext bleiben erhalten. Bestehende ältere/beschädigte/neue
unbekannte lokale Daten sind auch gegen erzwungene Schreibversuche geschützt.

Nachfolgende reine Nachweisdokumentation löst erneut denselben PR-Prüflauf aus;
abschließender Ergebnis-Commit und Lauf stehen in PR #21. Echte Browserbedienung,
Dateiberechtigungen, parallele Tabs, Fokus, Druck, Banking-Scans und Mailprogramme
wurden nicht geprüft. Storage-/Datei-Mocks und SSR sind kein Nachweis dafür.
Sichere Übernahme migrierter Daten folgt in Paket 03, das nicht begonnen wurde.


## Paket 03 – Speicher- und Browsernachweise

Basis: `3433c9c0fbab8f57ee66ce669a856a2d82fb43e9` (PR #21);
`main` weiterhin `ba7857fd9180fa392c42a0235643e478e5077ee5`.
Branch `codex/paket-03-sichere-speicherung`, [PR #22](https://github.com/sl3ndrr/RiffRechnung/pull/22).
GitHub-Schreiben (Branch, Tree, Commit, Ref, PR) tatsächlich erfolgreich;
kein Merge, kein Deployment. Die Basis-CI 34056037557 war grün; keine
vorbestehenden fehlschlagenden Tests festgestellt.

Die bisherigen Schranken bleiben erhalten. Hinzu kommen `npx playwright install
--with-deps chromium` und `npm run test:browser` im selben Quality-Job. TypeScript
prüft auch die neuen Unit-/Browserdateien und die Playwright-Konfiguration.
PR-/Deployment-Rechte unverändert; das bestehende `needs: quality` erfasst auch
Browserfehler. Testseiten entstehen erst nach dem Produktionsbuild und werden
anschließend entfernt; das Pages-Artefakt enthält weiterhin ausschließlich `dist`.

Einzige neue direkte Abhängigkeit: **@playwright/test 1.63.0**, exakt fixiert.
[Offizielles Release](https://github.com/microsoft/playwright/releases/tag/v1.63.0).
Lockfile im isolierten Node-22-Job mit npm erzeugt, danach `npm ci` erfolgreich:
[34058813383](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34058813383),
Commit `816036a983077ecd5ef27077a6f64290524928d5` auf
`codex/paket-03-ci-evidence`. Der semantische Lockfile-Abgleich betrifft nur Root,
@playwright/test, playwright und playwright-core; keine manuell erfundenen
Integritätswerte oder sonstigen Abhängigkeitsupdates.

Alle folgenden PR-Läufe: Ubuntu **24.04.4**, Node **22.23.2**, npm **10.9.8**.

| Commit / Lauf | Ergebnis |
| --- | --- |
| `a2d90f2a5ba2d451c340935263576ec47752ad87`, [34059061238](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34059061238) | npm ci/Lint/98 Tests bestanden; Typecheck findet einen veralteten persist(next)-Aufruf nach Schnittstellenänderung. Build/Browser deshalb nicht gestartet. |
| `9d60dc58810088cc521f20016bd470a43bf4dd8a`, [34059234439](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34059234439) | Alle bisherigen Schranken bestanden, 98/98 Tests; 5/6 Browserprüfungen. Chromium beendet sich beim OPFS-/IndexedDB-Reload. |
| `e7580dfbfc5c3c4338725485325c7a271c0ee16b`, [34059398043](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34059398043) | 99/99 Tests und bisherige Schranken bestanden; gleicher Absturz auch mit vollständigem Chromium statt Headless Shell, 5/6 Browserprüfungen. |
| `742e5007db03680e42d1bf3731769e4b93104bb8`, [34086565760](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34086565760) | Alle Schranken; 99/99 Fachtests, 7/7 echte Browserprüfungen einschließlich dauerhaftem Datei-Testprofil und Browserneustart. |
| `257464e89e5841bf5fe317770ce115507e644d17`, [34086906084](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34086906084) | 101/101 Fachtests und bisherige Schranken bestanden; 7/8 Browserprüfungen. Neue Legacy-Testadresse /legacy/ traf den Vite-Fallback statt der historischen HTML-Datei. |
| `c034f63af72aeaeec0bbf8ef10bd2c8f274c0c58`, [34087140552](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34087140552) | **npm ci, npm run lint, npm test (101/101), npm run typecheck, npm run build, Browserinstallation und npm run test:browser (8/8) erfolgreich.** Keine übersprungenen Tests. |

Der erfolgreiche Lauf hat `head_sha = c034f63…`; Checkout ist GitHubs temporärer
Merge-Commit `537e12e06a5db5a8ffe5315782f52e2eecadbab7`. Dessen Tree
`c5219beb000f573e21abbeb2144eb91acd5ae9e5` wurde per API mit dem Ergebnis-Tree
verglichen und ist identisch. Nachfolgend ausschließlich Dokumentation;
abschließender Commit und erneut zugehörige CI werden im PR/Abschluss ausgewiesen.

**Fehlerzuordnung:** Alle Änderungen/Testfehler stammen aus Paket 03. Der
veraltete Settings-Aufruf wurde korrigiert. Der Browserabsturz wurde unabhängig von
der App mit einer minimalen HTML-Seite, nativem OPFS und IndexedDB reproduziert:
[34086399032](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34086399032),
Commit `1f3ad85e9fc8067eec7411698ecadd64d62d86e5`, nur auf dem Nachweisbranch.
Dasselbe Chromium **153.0.8010.12**: privater Kontext scheitert beim Handle-Lesen,
dauerhaftes synthetisches Profil besteht. Der Gegenlauf benutzt deshalb ein
[isoliertes dauerhaftes Profil](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
und prüft zusätzlich vollständiges Schließen/Neustarten. Kein behaupteter Fix des
Chromium-Fehlers; private Profile sind keine freigegebene dauerhafte Dateiablage.
Der Legacy-Test öffnet nun explizit `/legacy/index.html` und prüft die alte
Oberfläche sowie ihren tatsächlichen Schreibabschluss. Kein Test wurde gelöscht,
übersprungen, mit Wiederholungen kaschiert oder in seiner Prüfabsicht abgeschwächt.

**Abdeckung:** 27 zusätzliche Speichertests und fachlich ersetzte betroffene alte
Quelltext-/Sperrtests. Geprüft werden volle Inhaltskonflikte trotz gleicher ID/
Revision/Zeit, Warteschlange/Locks, fremde und extern eintreffende Zweige,
vorhandenes Backup bei leerem Browser, ausdrückliche anonyme Zuordnung,
createWritable/write/close-Fehler mit Wiederholung, Quota-/Security-Fehler,
fehlende Funktionen, granted/prompt/denied, veraltete Handles sowie
IndexedDB-Öffnungsfehler/Blockierung/Abbruch auch nach erfolgreicher Anfrage.
Reparaturtests prüfen jetzt die bestätigte Übernahme über den produktiven Dienst,
Originaltext und Migrationsbericht, alte Revisionen, Reservierungen, Export/Import
und erneutes Laden ohne weitere Reparaturen. Geld-/Original-/Referenz-/CSV-
Regressionen bleiben erhalten; Zahlenrechnung selbst unverändert.

**Echter Browser, getrennt von Fehler-Injektion:** Acht Playwright-Abläufe unter
Chromium 153.0.8010.12; sieben ohne ersetzte Browser-APIs, ein injizierter
Picker-Abbruch. Zwei normale echte Tabs verwenden native Web Locks; zusätzlich
läuft die reale historische App aus `ba7857f…` gleichzeitig unter derselben Origin.
Bestätigte Einstellungen überstehen Ansichtswechsel und erneutes Öffnen. Recovery
lädt die Rohdatei tatsächlich herunter und vergleicht sie bytegenau, bestätigt
Import, persistiert und lädt tatsächlich neu. Demo/OPFS/IndexedDB sowie Dateien und
Konfiguration werden vor/nach Demo und vollständigem Browserneustart verglichen.
OPFS ist browserinterner Speicher und **kein** Nachweis für native Ordnerwahl,
OS-Dateirechte oder Synchronisationssoftware. Die mobile Prüfung misst Sichtbarkeit
bei 390 Pixeln; keine zusätzliche Fokus-/Druck-/Banking-Abnahme behauptet.

**Lokale Ausführung:** Node 24.19.0/npm 11.9.0 statt Node 22. `git ls-remote`
Exit 128/HTTP 403; `npm view node@22 version --json --fetch-retries=0
--fetch-timeout=15000` und `npm ci --fetch-retries=0 --fetch-timeout=15000
--cache /workspace/scratch/2c6811aefcaf/npm-cache` Exit 1/E403.
`npm run lint`, `npm test`, `npm run typecheck`, `npm run build` wurden vom Werkzeug
vor Prozessstart abgebrochen: `network approval was cancelled before a decision
was returned`. Kein regulärer lokaler Node-22-Nachweis. Ergänzende Node-24-
Transpilation mit `stripTypeScriptTypes` und `node --test` ergab zunächst 23/24 neue
Speichertests; eine zu groß geschriebene Fehlertext-Erwartung wurde korrigiert und
anschließend in den regulären Node-22-Läufen geprüft. `git diff --check` erfolgreich.

**Noch native Abnahme erforderlich, ausschließlich mit synthetischen Daten:**
Ordner mit bestehender Sicherung wählen, Abbruch/granted/prompt/denied und späteren
Rechteentzug auf den Zielbetriebssystemen bedienen; gespeichertes OS-Handle nach
Neustart prüfen. Externe Konfliktkopie über ein echtes Synchronisationsprogramm
bzw. zweites Gerät erzeugen und unveränderte Dateien/sichtbare Sperre bestätigen.
Für diese Punkte liegen automatisierte Fehler-Injektionen, aber keine native
Abnahme vor. Keine geräteübergreifende atomare Synchronisation zugesagt.
Administrative Pflichtchecks aus Paket 00 bleiben separat offen.

## Paket 04 – vollständige Belege, Korrekturen und PDF-Inhalt

Tatsächliches `main`: `b7babea58bcb2f9a0423870eadaf7b18109f3eec`.
Fachliche Basis: Paket 03, `203f07c93f90eed40e049956e55a58e3e654714f`;
[Baseline-CI 34087436918](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34087436918)
erneut erfolgreich ausgelesen. Keine vorbestehenden Testfehler festgestellt.
PR #21/#22 wurden in Vorgängerbranches gemergt; `main` enthält 02/03 noch nicht.
[PR #24](https://github.com/sl3ndrr/RiffRechnung/pull/24) vergleicht deshalb mit
`codex/paket-04-basis-03`, einem unveränderten Verweis auf den Paket-03-Commit.
Branch-/Tree-/Commit-/Ref-/PR-Schreiben tatsächlich ausgeführt; kein Merge/Deployment.

Unveränderte Pflichtbefehle: `npm ci`, `npm run lint`, `npm test`,
`npm run typecheck` (einschließlich Tests), `npm run build`,
`npx playwright install --with-deps chromium`, `npm run test:browser`.
Neu: `sudo apt-get install -y poppler-utils` für den Textvergleich echter
Chromium-PDFs. Keine neue npm-Abhängigkeit, kein Lockfile-Update. Browserergebnisse,
synthetische PDFs und Fehlerkontexte werden sieben Tage als `browser-evidence`
aufbewahrt. `actions/upload-artifact` v7.0.0 wurde über die offizielle GitHub-Ref
auf `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f` geprüft und unveränderlich fixiert.
Keine erweiterten Repository-Schreib-/Deployment-Rechte für den Quality-Job.

Alle PR-Läufe: Ubuntu 24.04.4, Node 22.23.2/npm 10.9.8;
Browserläufe mit Chromium 153.0.8010.12. `head_sha` ordnet jeden Lauf seinem
Paket-Commit zu; GitHub checkt den temporären PR-Merge-Commit aus.

| Commit / CI-Lauf | Ergebnis und Fehlerzuordnung |
| --- | --- |
| `b4a830e2a62e1409ca6e891b18e9cb11d085bc29`, [34145935935](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34145935935) | Installation/Lint bestanden; 106/112 Fachtests. Drei optionale Felder gingen als `undefined` beim JSON-Roundtrip verloren: produktive Persistenz korrigiert. Drei historische Testaufbauten enthielten unzulässig aktuelle Versionsdaten: explizite Altformat-Fixtures ergänzt. Nachfolgende Gates nicht gestartet. |
| `99999576485240b371bf4eada05730baf0c58560`, [34157537901](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34157537901) | 112/112 Fachtests und Lint bestanden; Typecheck findet TS18048 im neuen Korrekturvalidator. Null-Check korrigiert; Build/Browser noch nicht ausgeführt. |
| `acb33b40a6cb1a51f987a18feaffbe2626bf0571`, [34157822545](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34157822545) | Alle bisherigen Gates, 112/112 Fachtests; 8/11 Browserprüfungen. Neue Textfeldselektoren und fehlender Schritt zur Altformat-Vorschau korrigiert. Die acht bestehenden Browserprüfungen bestanden. |
| `7485cbcc0a9c69b15ede344fff7f89f5954b2c1b`, [34158495236](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34158495236) | Alle bisherigen Gates, 114/114 Fachtests; 9/11 Browserprüfungen. Echter Original-/Korrektur-PDF-Ablauf bestanden. Zahlungsselektor auf tatsächlichen zugänglichen Rollennamen umgestellt; Migrationstest wartet vor Reload auf bestätigten Speicherabschluss. |
| `9ad4e4c43e29fafb925a6436afcfb7ae294e7838`, [34158920782](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34158920782) | Installation/Lint bestanden; 115/116 Fachtests. Ein alter Test baute Format 2 noch durch selektives Löschen aktueller Felder; auf den expliziten Altformat-Builder umgestellt. Alle neuen Tests bestanden; weitere Gates nicht gestartet. |
| `7eb666e4db7be425b73e8373dac174c329cb4c95`, [34159150309](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34159150309) | Installation/Lint/116 Fachtests/Typen/Build bestanden; 10/11 Browserprüfungen. Original-/Korrektur-PDF und Schema-3-Umstieg mit A/B und leeren historischen Kontofeldern bestanden. Datei-Import im neuen Zahlungsablauf traf zwei Inputs; auf den Backup-Bereich eingegrenzt. |
| `67a8a689ef1d1888d091619ee655011c079ed6ac`, [34188112394](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34188112394) | **Alle Schranken erfolgreich; 116/116 Fachtests, 11/11 Browserprüfungen, 0 übersprungen.** Vollständiger Zahlungs-/Archiv-/Importablauf einschließlich Korrektur im Folgejahr und CSV des ersetzten Vorjahresbelegs bestanden. |

Alle Zwischenfehler gehören zu Paket 04; keine Tests gelöscht, übersprungen,
mit Wiederholungen kaschiert oder in ihrer Prüfabsicht abgeschwächt. Betroffene
Altformat-Prüfungen erzeugen ausdrücklich Altformate; produktive Ergebnisse werden
nicht für Erwartungen normalisiert. 15 neue Fachtests prüfen vollständige Versionen,
Referenzen nach Löschung, Korrekturketten, gespeicherte Beträge/Registerwidersprüche,
Zahlungsdeckung/Zuordnung/Überzahlung, reservierte Nummern, 205 Aktivitäten,
verbliebene Snapshot-Differenzen ohne vollständigen Beleg, Migration und Schreibkonflikte.
Zustände werden über den produktiven Schreibdienst serialisiert, importiert und neu geladen.

Drei neue echte Chromium-Abläufe ergänzen die acht aus Paket 03. Die Druckprüfung
bedient den produktiven Druckknopf und beobachtet `beforeprint`; zusätzlich erzeugt
Chromium mit der produktiven `InvoicePrint`-Komponente tatsächliche PDF-Dateien.
`pdftotext -layout` vergleicht Original vor/nach Stammdatenlöschung und Korrektur,
Empfänger A/B, Datum/Text/Betrag und leere Bankfelder. Keine Ersetzung von
`window.print`, keine echten Rechnungsdaten, kein Mailversand. Browser-JSON-Download,
Wiederherstellung in getrenntem Kontext und Reload prüfen die vollständigen Daten.
Dies belegt PDF-Inhalt, keine Bedienung nativer Druckdialoge, geräteübergreifende
Drucklayout-Matrix, Banking-App-Scans, OS-Dateirechte oder echte Synchronisation.

Lokal: Node 24.19.0/npm 11.9.0 statt Node 22. Git-Zugriff per Terminal HTTP 403;
Node-22-Abruf und `npm ci` E403. `npm run lint`, `npm test`, `npm run typecheck`
und `npm run build` wurden vom Laufzeitwerkzeug vor Prozessstart abgebrochen:
`network approval was cancelled before a decision was returned`. Keine regulären
lokalen Gate-Ergebnisse. `node --experimental-strip-types --check` für betroffene
TS-Module/Tests und `git diff --check` erfolgreich; nur ergänzende Syntax-/Diffprüfung.
Der erfolgreiche Lauf 34188112394 hat `head_sha = 67a8a689…` und checkt
`0b3b03429809815180cfdabae8b2833c6c891906` aus. Dessen Tree
`9b1105d2a18e629a95ab3c565d25b4754c89c270` ist per GitHub-API und lokalem Git-Tree
identisch mit dem Implementierungsstand. Artefakt `browser-evidence`, ID
`10041251131`, gehört zu diesem Commit und enthält die synthetischen Nachweise;
Aufbewahrung bis 2026-09-15. Contents/Metadata ausschließlich lesend; kein Pages-
Artefakt angefordert und kein Deployment. Nachfolgend ausschließlich Dokumentation;
der abschließende Ergebniscommit wird erneut vollständig geprüft und im PR ausgewiesen.



## Paket 05 – Geld/Kalender (2026-09-08)

Ausgang: `main` `d44131b31b5e22eab5e28883bef167864aabe9b5`.
Vorhandener [Baseline-Lauf 34189696762](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34189696762)
prüfte diesen Commit erfolgreich mit allen bestehenden Schranken. Dieser bereits
vor dem Auftrag gestartete Pages-Lauf ist kein Deployment durch Paket 05.
Keine bereits fehlschlagenden Baseline-Gates festgestellt.

| Commit / Lauf | Ergebnis und Zuordnung |
| --- | --- |
| `0eac10205dec52cac158eb355db5a8e8b4607236` / [34190705831](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34190705831) | Installation/Lint bestanden, 119/123 Fachtests. Ein Implementierungsfehler: direkte Finalisierung alter Entwürfe setzte den Berechnungsmarker nicht. Drei Testannahmen: Unterlaufprobe war noch darstellbar, Portal-Dialog ohne Browser-DOM, alte Differenzbeträge nach neuer Rundung. Behoben; Dialogprüfungen in echten Chromium-Ablauf verlegt. Keine abgeschwächte Abnahme. |
| `0a4cd2885b095111570bf55214dd571e0f45db4b` / [34190927478](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34190927478) | npm ci, Lint, 123/123 Fachtests, Typecheck inklusive Tests, Build, Browser-/Popplerinstallation und 13/13 Chromiumprüfungen bestanden. Checkout `e4bf608b9aa0370f4692c9ba39422caa95545584` ist GitHubs PR-Mergestand gegen unverändertes main. |

Finaler Implementierungsstand `238fb7380abf791ba802fc2526a6c4cf9141c0ba`,
[Lauf 34213179499](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34213179499):
alle genannten Gates einschließlich 123/123 Fachtests und 13/13 Chromiumprüfungen
bestanden. Enthält die erweiterte Preisreferenzmatrix, Untercentpreisanzeige und
zusätzliche Präzisions-/Manipulations-/Grenzregressionen. PR-Merge-Commit
`a22c0956e4ae3ade8bf3d1198e92bcaa8d55d275` hat denselben Tree
`e875e7b27daf1f694f57c7fd0c82c7d1350611a6` wie die Implementierung.
Alle 30 neuen/geänderten lokalen Dateien stimmen per Git-Blob-Hash mit GitHub überein.
Anschließend nur README-/Nachweisdokumentation, keine Fachcodeänderung.

Umgebung: Ubuntu 24.04.4, Node 22.23.2, npm 10.9.8, Python 3.12.3,
Chromium 153.0.8010.12. `npm test` enthält 100.000 Vergleiche gegen Python
`decimal.Decimal`/`ROUND_HALF_UP`, keine zweite Kopie der Implementierung.
`npm run test:browser` prüft Original/Korrektur/Reload, bestehende Schreibkonflikte
und die neuen Ausgabekanäle einschließlich CSV-Download und echter PDFs.
EPC-Payload wird geprüft; kein Banking-App-Scan. Synthetische PDFs/Browserberichte
im Artefakt `browser-evidence`, sieben Tage Aufbewahrung.

Lokal: Node 24.19.0/npm 11.9.0; Terminal-Clone, npm ci und Node-22-Abruf E403.
`npm run lint`, `npm test`, `npm run typecheck`, `npm run build` jeweils vor
Prozessstart blockiert (`network approval was cancelled before a decision was returned`).
Kein lokales Testergebnis behauptet, keine Beschränkung umgangen. GitHub-Branch-,
Tree-, Commit-, Ref- und PR-Schreiben tatsächlich erfolgreich. Keine neue Abhängigkeit;
CI ergänzt lediglich die protokollierte Python-Version für den Referenzrechner.
Abschließender Commit und zugehöriger vollständiger Prüflauf stehen im PR/Abschluss.

## Paket 06 – Empfängerzuordnung (2026-09-08)

Ausgang: `main` `5b960d4c9ad46251a967d719b5b2f0c07260d145`, Tree
`0328211bf1003796ed731eb73bb691de65fa38e7`; alle früheren Pakete 00–05 gemergt.
Implementierungscommit `4929c80758b1d77286eed17cbb38643c9a70ee88`,
[PR #27](https://github.com/sl3ndrr/RiffRechnung/pull/27).

Neue Fachregressionen prüfen Zwei-/Drei-Empfänger, verschiedene Familien,
gemeinsame Eltern, getrennte Haushalte, Geschwister, ein Kind mit mehreren
Erziehungsberechtigten, ungeklärte/fremde Zuordnungen, Namensschutz in Ausgabetexten,
manuelle Teilcentbeträge, neue IDs und getrennte Nummernkreise. Der atomare
Fehlerfall vergleicht den unveränderten Eingangszustand und leere Zähler. Entwürfe
und Finalisierungen durchlaufen produktive Serialisierung, Import und Storage-Reload.
Ein echter Chromium-/PDF-Ablauf bedient Zuordnung und gemeinsame Vorschau,
finalisiert beide Rechnungen, lädt neu und prüft beide PDFs auf ausschließlich die
passende Familie/das passende Kind. Wiederholte Ausgabe wird als zustandsloser
Zugriff auf denselben Forderungsbeleg geprüft.

Lokal steht nur Node 24.19.0/npm 11.9.0 bereit. `npm ci --fetch-retries=0
--fetch-timeout=20000` scheiterte mit E403 beim Abruf von `yocto-queue`; deshalb
konnten Lint, gebündelte Fachtests, Projekt-Typecheck, Build und Playwright lokal
nicht starten. `node --experimental-strip-types --check` für die geänderten
`.ts`-Module/Tests sowie `git diff --check` bestanden. Der vollständige Node-22-
CI-Lauf einschließlich Testdatei-Typen, Chromium und echter PDFs ist ausstehend;
Zwischenfehler werden hier dem verursachenden Commit zugeordnet.

Erster Lauf [34234548343](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34234548343)
auf `4929c80758b1d77286eed17cbb38643c9a70ee88`: `npm ci`, Lint, **130/130**
Fachtests, Typecheck einschließlich Tests, Build, Chromium- und Popplerinstallation
bestanden; 13/14 Browserprüfungen bestanden. Ausschließlich die neue PDF-Abnahme
schlug fehl: Die bestehende Einzelkind-Druckvorlage enthielt zwar nur die korrekten
Positionen, nannte den zugeordneten Kindesnamen aber nicht. Die Vorlage wurde um
die aus dem jeweiligen Snapshot abgeleitete Zeile „Unterricht für“ ergänzt; die
Prüferwartung bleibt unverändert. Umgebung: Ubuntu 24.04, Node 22.23.2, npm 10.9.8,
Python 3.12.3, Chromium 153.0.8010.12. Artefakt `browser-evidence` ID 10059343469.

Korrekturlauf [34235461660](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34235461660)
auf `670ce56a0edde9029990b9fd596c5e4f9ae76d16`: alle Schranken erfolgreich;
**130/130 Fachtests und 14/14 Browserprüfungen**, 0 fehlgeschlagen/übersprungen.
Die beiden echten Ergebnis-PDFs enthalten jeweils Empfänger, ausschließlich das
zugeordnete Kind, die passende Position und 30,00 EUR; die Gesamtsumme im
Bestätigungsdialog beträgt 60,00 EUR. Umgebung: Ubuntu 24.04, Node 22.23.2,
npm 10.9.8, Python 3.12.3, Chromium 153.0.8010.12. Synthetisches Artefakt
`browser-evidence` ID 10059733856, kein Pages-Artefakt und kein Deployment.
Der abschließende reine Nachweis ergänzt die zweite identische PDF-Ausgabe samt
unverändertem Storage und durchläuft dieselben Schranken erneut.


## Paket 07 – CI und Fehlerzuordnung

- [34248809788](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34248809788):
  erster Zahlungsdatenstand; Lint fand zwei unbenutzte Kompatibilitätsimporte.
- [34251066948](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34251066948):
  Profilschritt; Lint fand einen leer gewordenen Block.
- [34251683013](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34251683013):
  Installation und Lint erfolgreich, 87/136 Fachtests; Schema 6 ließ das seit
  Schema 5 gültige Berechnungskennzeichen nicht zu, und Alt-Fixtures waren für
  neue Finalisierungen nicht vollständig.
- [34252124684](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34252124684):
  Installation und Lint erfolgreich, 132/136 Fachtests. Vier überholte
  Erwartungen wurden fachlich ersetzt: echtes Schema-4-Fixture, getrennte
  IBAN-Fehler, profilfreier Legacy-Snapshot und EPC-Fall mit nur leerer BIC.
- [34252502949](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34252502949):
  133/136 Fachtests; verblieben waren Profilvollständigkeit nach Migration,
  präziser Längentext und eine neue Korrekturfinalisierung ohne Steuerkennung.
- [34253445967](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34253445967):
  135/136 Fachtests; Zukunftsformat-Test von Schema 6 auf 7 berichtigt.
- [34253655564](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34253655564):
  136/136 Fachtests, Typecheck und Build erfolgreich; 13/14 Browserprüfungen.
  Die Paket-06-Browser-Fixture hatte noch keine Steuerkennung.
- [34254617161](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34254617161):
  Implementierungsstand `2b23a1b976471318f4b5b97ba53fef8efab661ca`;
  `npm ci`, Lint, 138/138 Fachtests, Test-Typecheck, Build sowie 14/14
  Chromium-/PDF-Prüfungen erfolgreich. Ubuntu 24.04, Node 22.23.2/npm 10.9.8,
  Python 3.12.3, Chromium 153.0.8010.12; keine fehlgeschlagenen oder
  übersprungenen Tests. Synthetisches Artefakt `browser-evidence`.

Keine Tests wurden gelöscht, übersprungen oder abgeschwächt.

## Paket 08 – CI und Fehlerzuordnung

- Lokaler Vorabstand: Node 24.19.0/npm 11.9.0; das festgelegte Node 22 ist nicht
  vorhanden. `npm ci --fetch-retries=0 --fetch-timeout=20000` endete beim
  Registry-Abruf von `yocto-queue` mit E403. Deshalb sind lokale Lint-, Test-,
  Typecheck-, Build- und Browserergebnisse nicht behauptet.
- `git diff --check` sowie `node --experimental-strip-types --check` für die
  geänderten `.ts`-Fachmodule und Fachtests bestanden. Das prüft weder JSX noch
  Typen und ist ausdrücklich kein Ersatz für die CI-Schranken.
- Der Node-22-Workflow des Ergebniscommits muss `npm ci`, Lint, Fachtests,
  Typecheck einschließlich Tests, Build sowie die Chromium-/PDF-Prüfungen
  ausweisen. Kein Test wurde gelöscht, übersprungen oder abgeschwächt.
- [34276880945](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34276880945)
  auf `189b2cee89f8d57aca5baba8b208d4f681a1196a`: `npm ci` erfolgreich;
  Lint stoppte ausschließlich zwei ungenutzte Destrukturierungsvariablen im
  Schema-4-Testfixture. Es wurden keine Fachtests ausgeführt.
- [34277110428](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34277110428)
  auf `7964cb94472a858cd52452c246fce16fd7dcc765`: Lint erfolgreich;
  eine Zahlungstagskorrektur war noch vom Originalschutz gesperrt. Der folgende
  Übergang erlaubt ausschließlich Geschäftsdatum/Status `unknown → confirmed`;
  Betrag, Herkunft, Erfassungszeitpunkt und bisherige Zuordnungen bleiben geschützt.
- [34277324886](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34277324886)
  auf `09060bbeb8c87abb9b63e3135ad3863914ec3d1f`: Lint und 142/142 Fachtests
  erfolgreich; Typecheck fand den alten internen Legacy-Zwischentyp sowie eine
  nicht eingegrenzte Testunion. Beide wurden ohne Verhaltensänderung korrigiert.
- [34277602963](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34277602963)
  auf `1f19e1b026f0ea0186c73c71ec4cbcf3a27159cc`: `npm ci`, Lint, 142/142
  Fachtests, Test-Typecheck, Build und Browserinstallation erfolgreich; 13/14
  Browserprüfungen. Der verbleibende Test suchte die absichtlich ersetzte
  Kennzahl „Offener Betrag“; er prüft nun den fachlich präzisen Stichtagstext.
- [34278036194](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34278036194)
  auf `f71d73311fb0559a6438464a007985b6a87f73a6`: alle Schranken erfolgreich:
  `npm ci`, Lint, 142/142 Fachtests, Typecheck einschließlich Tests, Build sowie
  14/14 Chromium-/PDF-Prüfungen. Ubuntu 24.04.4, Node 22.23.2/npm 10.9.8,
  Python 3.12.3, Chromium 153.0.8010.12; keine fehlgeschlagenen oder
  übersprungenen Tests.

## Paket 12 – integrierter Prüfstand und Fehlerzuordnung

Ausgang ist `main` auf `95d7370dbe5931c6ab0373bc070db2ad8763cb93` (00–11
integriert). Die [Freigabematrix](release-readiness.md) erfasst alle R-/F-/N-Punkte
und offenen nativen Abnahmen. Keine Freigabe durch ältere grüne Commits.

| Commit | CI-Lauf | Ergebnis / Einordnung |
| --- | --- | --- |
| `95d7370dbe5931c6ab0373bc070db2ad8763cb93` | [34374453731](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34374453731) | Integrierte Basis: 143 Fachtests, 29 Browserprüfungen bestanden; Installation meldet bereits ein High-Advisory |
| `eb53211f43294a8fd5b9ba62f67a1c4a4f4fbd63` | [34375494258](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34375494258) | 143/29 bestanden; voller Audit bestätigt js-yaml 4.3.1, High. Damalige tee-Pipeline war noch keine sichere Fehlerschranke |
| `8e85d58ed1464f49b7745f0ee45b96da0b74805d` | [34375782770](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34375782770) | 143 bisherige Fachtests bestanden, drei neue Recovery-Regressionen fehlgeschlagen: bestätigter Original-/Reservierungs-/Identitätsverlust |
| `6034ac2b88c4bd2eb1175018c5dbe953821e0757` | [34376119557](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34376119557) | Temporärer Job 102549236782 regeneriert allein den js-yaml-Lockeintrag mit Node 22; regulärer Job zeigt die drei bekannten Regressionen |
| `8bb85c6586aa1a0ab46c325a6362af5b6ba3a761` | [34382244936](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34382244936) | 148/149 Fachtests; ein Textselektor erwartete die alte grammatische Form. Fachliche Assertions erhalten |
| `06071aa04950e1555f151cd7ac510e0bf765f325` | [34382549725](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34382549725) | 149 Fachtests/Typecheck/Build bestanden; 38/41 Browserprüfungen. Drei Selektorfehler (erweiterte Feldnamen, doppeltes Legacy-Importfeld); Firefox-/WebKit-JSON bestanden |
| `dda2c4a79334bf061494a54e23576a6d689a6d2f` | [34383657801](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34383657801) | 149 Fachtests/Typecheck/Build bestanden; Browserinstallation am Google-Chrome-APT-Hashfehler des Runners gescheitert |
| `121f8f44a06be93995bebb1a542574f0a1414123` | [34383904868](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34383904868) | Audit mit explizitem Bash-pipefail; 149 Fachtests/Typecheck/Build bestanden, gleicher APT-Infrastrukturfehler |
| `06d2dc1bfab12ac32f01b509688abe9ff63d37c3` | [34384119389](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34384119389) | 149 bestanden, neue Regression zum verdeckten gültigen Rückfallstand fehlgeschlagen: „Missing expected rejection“ |
| `ced0e4a63ab35e8d5ed6293ef97c5f8dd85dbeb3` | [34384472673](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34384472673) | 150 Fachtests/Typecheck/Build bestanden; Chrome-APT-Quelle nicht unter angenommenem .list-Namen, gleicher Hashfehler |
| `72515209ac123cdd079e730e77686435668827bf` | [34384827205](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34384827205) | **Alle Schranken erfolgreich:** 150/150 Fachtests, 41/41 Browserprüfungen, Lint, Test-Typecheck, Build, vollständiges Audit mit 0 Schwachstellen |

Umgebung des erfolgreichen Laufs: Ubuntu 24.04, Node 22.23.2/npm 10.9.8,
Python 3.12.3, Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6 (Linux).
Befehle: `npm ci`, `npm run lint`, `npm test`, `npm run typecheck`,
`npm run build`, `npx playwright install --with-deps chromium firefox webkit`,
`sudo apt-get install -y poppler-utils`, `npm run test:browser`, `npm audit --json`.
Der Auditbericht nennt 256 Lockfile-Abhängigkeiten und 0 bekannte Schwachstellen.
Testdateien sind in TypeScript enthalten. Keine Tests gelöscht, übersprungen,
abgeschwächt oder mit Playwright-Retries verdeckt. Die Browserabläufe ersetzen
keine native Freigabe. Ergebnis-SHA und abschließender Dokumentations-CI-Lauf
werden im [PR #33](https://github.com/sl3ndrr/RiffRechnung/pull/33) festgehalten.

Die unbenötigte Google-Chrome-APT-Quelle liegt im Runner als `google-chrome.sources`
vor. Der Workflow berücksichtigt `.list`/`.sources`, deaktiviert ausschließlich
diese Quelle im temporären Runner und weist gemischte Quellen ab. Ubuntu-Quellen,
Hash- und Signaturprüfungen bleiben aktiv. Browser kommen aus gelocktem Playwright.

**Dependency-Advisory:** Vollständiges `npm audit --json` umfasst direkte und
transitive Produktions-/Entwicklungspakete. Bestätigt wurde
[GHSA-2883-xcg3-v3hh](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh),
ein CPU-DoS im Merge-Budget von js-yaml; laut Maintainer behoben in
[4.3.2](https://github.com/nodeca/js-yaml/releases/tag/4.3.2). Hier transitiv über
die Entwicklungsabhängigkeit ESLint. Die mit Node 22 ausgeführte Regenerierung
`npm update js-yaml --package-lock-only --ignore-scripts --no-audit --no-fund`
änderte exakt Version, URL und Integrität dieses Lockeintrags; `package.json`
blieb unverändert. Temporärer Job entfernt. Audit mit `shell: bash` (pipefail)
als Pflichtschranke und JSON-Bericht im Artefakt. Der frühere esbuild-Einzelfix
ersetzt keine Vollprüfung; ein Audit ist eine zeitgebundene Advisory-Abfrage.

**Lokale Grenzen tatsächlich geprüft:** Node 24.19.0/npm 11.9.0 statt Node 22.
Terminal-Clone und `npm ci --fetch-retries=0 --fetch-timeout=20000`: HTTP/E403.
`npm view node@22 version --json --fetch-retries=0 --fetch-timeout=20000`: E403.
`npm audit --json --fetch-retries=0 --fetch-timeout=20000`: Registry-Timeout.
Lokale Lint/Test/Typecheck/Build-Aufrufe wurden vor Prozessstart abgebrochen;
keine lokalen Gate-Ergebnisse behauptet. `git diff --check` und vollständige
Git-Blob-/Tree-Vergleiche waren bis zum späteren Laufzeit-Verbindungsabbruch
ausführbar. Die Dokumentation wurde danach über GitHub vervollständigt.
GitHub-Schreibfunktionen sind durch Arbeitsbranch, Commits und PR belegt;
kein Patch-Fallback nötig. Artefakt-Download zur PDF-Sichtprüfung: HTTP 403.
Automatische PDF-Textprüfungen sind kein visueller Layoutnachweis.

**R23 administrativ offen:** Am 2026-09-09 enthalten Rulesets 21096773/21137022
Lösch-/Force-Push-Schutz und PR-Pflicht für den Defaultbranch, jedoch keinen
`required_status_checks`-Eintrag. Ein schreibender Ruleset-Endpunkt ist nicht
verfügbar. `Quality (Node 22)` ist vor Merge administrativ verbindlich einzurichten
und zu prüfen. Merge/Deployment wurden nicht ausgelöst.
