# Qualitätsschranken und Nachweise – Paket 00

Stand: 2026-09-06. Ausgangscommit: `ba7857fd9180fa392c42a0235643e478e5077ee5`.

## Aufbau

`quality.yml` läuft für Pull Requests und ist als lokaler wiederverwendbarer
Workflow eingebunden. Ohne Pfadfilter prüft er `npm ci`, `npm run lint`, `npm test`,
`npm run typecheck` und `npm run build` auf `ubuntu-24.04` mit `.nvmrc` (Node 22).
`tsconfig.tests.json` übernimmt die strikten App-Einstellungen einschließlich
DOM-Deklarationen und ergänzt Node-Typen; `tsc -b` erfasst App, Vite-Konfiguration
und Tests. Die 45 vorhandenen Tests bleiben unverändert.

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
