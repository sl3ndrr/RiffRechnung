# Historische technische Nachweise

Aktuelle Bedienung: [README](../README.md). Architektur, Migration und Prüfbefehle: [Technik](technical.md). Versionslogik: [Release-Notizen](releases.md).
Die PRs sind gemergte historische Nachweise. Paketstände, Testzahlen und Freigabeaussagen gelten nur für den jeweils bezeichneten Commit, nicht als aktuelle Abnahme.

| Paket | PR | Thema |
| --- | --- | --- |
| P01 | [#43](https://github.com/sl3ndrr/RiffRechnung/pull/43) | Privatrechnung und Steuerfeldbereinigung |
| P02 | [#44](https://github.com/sl3ndrr/RiffRechnung/pull/44) | Nebenfunktionen entfernen |
| P03 | [#45](https://github.com/sl3ndrr/RiffRechnung/pull/45) | Gruppenworkflow entfernen; Archiventscheidung |
| P04 | [#46](https://github.com/sl3ndrr/RiffRechnung/pull/46) | Lokales Speichern und manuelles JSON-Backup |
| P05 | [#47](https://github.com/sl3ndrr/RiffRechnung/pull/47) | Kontaktbereinigung und einheitliche Empfänger |
| P06 | [#48](https://github.com/sl3ndrr/RiffRechnung/pull/48) | Personen-/Kombinationsnummern |
| P07 | [#49](https://github.com/sl3ndrr/RiffRechnung/pull/49) | Eine Belegausgabequelle |
| P08 | [#50](https://github.com/sl3ndrr/RiffRechnung/pull/50) | Abgeleitete Arbeits-/Zahlungswerte |
| P09 | [#51](https://github.com/sl3ndrr/RiffRechnung/pull/51) | Textbereinigung und Entwurfsregeln |
| P10 | [#52](https://github.com/sl3ndrr/RiffRechnung/pull/52) | Reduzierte Arbeitsoberfläche |
| P11 | [#53](https://github.com/sl3ndrr/RiffRechnung/pull/53) | PDF, Anschriften, GiroCode und visuelle Abnahme |
| P12 | [#54](https://github.com/sl3ndrr/RiffRechnung/pull/54) | Ruhiges Bildschirmdesign |
| P13 | [#55](https://github.com/sl3ndrr/RiffRechnung/pull/55) | Fachtests, getrennte Migration und CI |
| P14 | [#56](https://github.com/sl3ndrr/RiffRechnung/pull/56) | Dokumentation und gemeinsame Versionsquelle |
| 3.AP8 | [#64](https://github.com/sl3ndrr/RiffRechnung/pull/64), [#65](https://github.com/sl3ndrr/RiffRechnung/pull/65) | 1.2.0-Prüfung und Nacharbeiten |
| Fix | [#69](https://github.com/sl3ndrr/RiffRechnung/pull/69) | Positionserhalt beim Lernendenwechsel |
| 1.2.1 | [#71](https://github.com/sl3ndrr/RiffRechnung/pull/71) | Dashboard-Bento und zusätzlicher CI-Typecheck |

Historische erfolgreiche Quality-Läufe: [P11 37119574294](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37119574294) auf `8a8abdeffb8da7c9094753143ca778f346181f77`, [P13 37145496612](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37145496612) auf `0babdcf0a2b5f79eeb0590af987b311605e75bc8` und [P14-Ausgang 37146404957](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37146404957) auf `1655a5d74aea11a2e3257b8193960bae56e9dd43`. Letzterer prüfte Installation, Lint, 205 Fachtests, Build, 91 Browser-/PDF-Fälle, zwei Migrationen und Audit ohne Befunde; er lief bereits vor P14. Abschließende Läufe stehen jeweils am PR.

## Unveränderte Dokumente im Git-Archiv

- [P01–P13 und frühere überlappende Dokumente](https://github.com/sl3ndrr/RiffRechnung/tree/1655a5d74aea11a2e3257b8193960bae56e9dd43/docs): die 17 durch P14 entfernten Berichte, Matrizen und Anleitungen.
- [Frühere Release-Notizen 1.0.0 bis 1.4](https://github.com/sl3ndrr/RiffRechnung/blob/1655a5d74aea11a2e3257b8193960bae56e9dd43/docs/releases.md).
- [P14-Abschlussbericht](https://github.com/sl3ndrr/RiffRechnung/blob/8ea10663a962806ffeb94f5686e6ebdb73f4831a/docs/p14-final-cleanup.md): Versionsentscheidung, Restverweise, lokale Umgebungssperren und Abschlussprüfung.
- [Releaseprüfung 1.2.0](https://github.com/sl3ndrr/RiffRechnung/blob/8ea10663a962806ffeb94f5686e6ebdb73f4831a/docs/release-1.2.0.md): AP1–AP8, Backup-/PDF-Nachweise, manuelle Checkliste und Pages-Nacharbeiten.
- [Designsystem vor der Zusammenführung](https://github.com/sl3ndrr/RiffRechnung/blob/8ea10663a962806ffeb94f5686e6ebdb73f4831a/docs/design-system.md): vollständige damalige Gestaltungsbeschreibung.

Die Dateien wurden aus der aktiven Dokumentation entfernt, nicht ersatzlos gelöscht. Dauerhafte Bedienungs-, Technik- und Migrationsregeln stehen in README/Technik; Archivtexte bleiben auf ihren damaligen Stand beschränkt. CI-Artefakte werden laut Workflow sieben Tage aufbewahrt; ein erreichbarer Lauf garantiert keinen dauerhaften Bild-/PDF-Download.
