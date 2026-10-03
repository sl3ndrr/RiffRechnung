# Historische technische Nachweise

Aktuelle Bedienung: [README](../README.md). Aktuelle Architektur, Migration und Prüfbefehle: [Technik](technical.md).
Die verlinkten PRs sind gemergte historische Nachweise. Ihre damaligen Paketstände, Testzahlen und Freigabeaussagen gelten jeweils nur für den dort bezeichneten Commit.

| Paket | Vorhandener PR | Thema |
| --- | --- | --- |
| P01 | [#43](https://github.com/sl3ndrr/RiffRechnung/pull/43) | Privatrechnung und Steuerfeldbereinigung |
| P02 | [#44](https://github.com/sl3ndrr/RiffRechnung/pull/44) | Nebenfunktionen entfernen |
| P03 | [#45](https://github.com/sl3ndrr/RiffRechnung/pull/45) | Gruppenworkflow entfernen; bisherige Archiventscheidung |
| P04 | [#46](https://github.com/sl3ndrr/RiffRechnung/pull/46) | Lokales Speichern und manuelles JSON-Backup |
| P05 | [#47](https://github.com/sl3ndrr/RiffRechnung/pull/47) | Kontaktbereinigung und einheitliche Empfänger |
| P06 | [#48](https://github.com/sl3ndrr/RiffRechnung/pull/48) | Personen-/Kombinationsnummern |
| P07 | [#49](https://github.com/sl3ndrr/RiffRechnung/pull/49) | Eine Belegausgabequelle |
| P08 | [#50](https://github.com/sl3ndrr/RiffRechnung/pull/50) | Abgeleitete Arbeits-/Zahlungswerte |
| P09 | [#51](https://github.com/sl3ndrr/RiffRechnung/pull/51) | Textbereinigung und Entwurfsregeln |
| P10 | [#52](https://github.com/sl3ndrr/RiffRechnung/pull/52) | Reduzierte Arbeitsoberfläche |
| P11 | [#53](https://github.com/sl3ndrr/RiffRechnung/pull/53) | PDF, beide Anschriften, GiroCode und visuelle Abnahme |
| P12 | [#54](https://github.com/sl3ndrr/RiffRechnung/pull/54) | Ruhiges Bildschirmdesign |
| P13 | [#55](https://github.com/sl3ndrr/RiffRechnung/pull/55) | Fachtests, getrennte Migration und CI |

Vorhandene, am 03.10.2026 über GitHub geprüfte Läufe:

- [P11 Quality 37119574294](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37119574294): erfolgreich auf `8a8abdeffb8da7c9094753143ca778f346181f77`; historische PDF-/QR-Abnahme im PR.
- [P13 Quality 37145496612](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37145496612): erfolgreich auf `0babdcf0a2b5f79eeb0590af987b311605e75bc8`.
- [P14-Ausgang, vorhandener Quality-Job 37146404957](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37146404957): erfolgreich auf integriertem `main@1655a5d74aea11a2e3257b8193960bae56e9dd43`; Installation, Lint, 205 Fachtests, Build, 91 normale Browser-/PDF-Fälle, zwei historische Migrationsfälle und Audit ohne Befunde. P14 hat diesen bereits laufenden Pages-Workflow nicht ausgelöst.

Die früheren fünf überlappenden Dokumente und zwölf Paketberichte wurden aus der aktiven Dokumentation entfernt. Ihre unveränderten Inhalte bleiben im [historischen docs-Verzeichnis dieses Ausgangscommits](https://github.com/sl3ndrr/RiffRechnung/tree/1655a5d74aea11a2e3257b8193960bae56e9dd43/docs) nachlesbar; dortige Anleitungen sind überholt. Das gilt besonders für damalige Steuer-/Druckentscheidungen, Gruppen-/Ordnerabläufe, Matrizen und lange CI-Protokolle.
