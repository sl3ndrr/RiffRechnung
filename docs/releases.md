# Release-Notizen

Die App-Version wird ausschließlich in `package.json` festgelegt; `src/version.ts` übernimmt sie für die Anzeige. Datumsangaben unten bezeichnen die Integration auf `main`, keine Veröffentlichung als GitHub-Release. Frühere UI-/Releasebezeichnungen gehören zu einer getrennten historischen Reihe und werden nicht rückwirkend umnummeriert.

## 1.2.1 — integriert am 07.10.2026

- Responsives Dashboard-Bento mit farbigen Kacheln und einzeiligen, an die Kachelbreite angepassten Kennzahlen.
- Kompakte offene Rechnungen mit Fälligkeitschip, Fristbalken und nächster noch nicht überfälliger Fälligkeit.
- Höhenfüllendes Monatsdiagramm mit exakten Wertbeschriftungen, Durchschnitt und markierten zukünftigen Monaten.
- Bereits enthalten: Lernendenwechsel in Entwürfen und Kopien erhält sämtliche Positionen. Eindeutige Ersatzpersonen übernehmen betroffene Zuordnungen; andernfalls ist vor Speichern/Finalisieren eine ausdrückliche Neuzuordnung erforderlich. Empfängeränderungen werden sichtbar gemeldet.

Der Lernenden-Fix wurde am 05.10.2026 unter der damaligen Paketversion 1.2.0 integriert; er ist keine Änderung nach 1.2.1. Ergänzte Fach-, Browser-, Layout- und Kontrastprüfungen. Diese Änderungen ändern weder Schema 15 noch Migrationen, Rechnungsnummern, Originalschutz oder Geldberechnung. Das Dashboard-Update ändert Druck/PDF und Theme-Reveal nicht; neue Abhängigkeiten wurden nicht eingeführt.

Nachweise: [Lernenden-Fix #69](https://github.com/sl3ndrr/RiffRechnung/pull/69), [Dashboard und Version #71](https://github.com/sl3ndrr/RiffRechnung/pull/71).

## 1.2.0 — integriert am 04.10.2026

- Dashboard als Startseite mit bestätigten Zahlungseingängen nach Jahr/Monat, offenen Ansprüchen, Entwürfen, Personenzahlen und Erinnerung an das manuelle JSON-Backup.
- Hell/System/Dunkel in Topbar und Einstellungen; ungespeicherte Formularwerte bleiben erhalten.
- Helle Rechnungsdarstellung mit Monatsgruppen, Zwischensummen und flachem Fallback für historische Beträge.
- Einmaliges Rückgängig für Entwurfs-/Personenlöschung und Archivwechsel mit pausierbarer Zehn-Sekunden-Frist.
- Abschaltbare Bewegungen für Navigation, Dialoge, Meldungen und Seiten; Druck bleibt animationsfrei.
- Zusätzliche Backup- und PDF-Regressionsprüfungen.

Keine neue Abhängigkeit oder Migration; Schema 15, Originalschutz und Rechnungsnummern bleiben unverändert.
Nachweise: [Integration #64](https://github.com/sl3ndrr/RiffRechnung/pull/64), [Nacharbeiten #65](https://github.com/sl3ndrr/RiffRechnung/pull/65), [historischer Prüfbericht mit manueller Checkliste](https://github.com/sl3ndrr/RiffRechnung/blob/8ea10663a962806ffeb94f5686e6ebdb73f4831a/docs/release-1.2.0.md).

## Vereinfachung P01–P14 — abgeschlossen am 03.10.2026

Die Vereinfachung wurde ohne neue Releaseversion unter Paketversion 1.1.3 integriert:

- Privatrechnungen mit optionalem Rechnungshinweis und festen kurzen Rechnungstexten.
- Gemeinsame berechtigte Empfänger mit eigenen optionalen Anschriften, Selbstzahler, PDF und GiroCode.
- Feste jährliche Nummern je Person/Kombination; geschützte Belege, Korrekturen und Zahlungen.
- Reduzierte Arbeitsoberfläche, ausdrückliches Speichern und manueller JSON-Export/Import.
- Direkte Fachtests, getrennte historische Browsermigration und zusammengeführte Dokumentation.

P14 ersetzte die unabhängig gepflegte UI-Version 1.4 durch die vorhandene Paketversion 1.1.3. Die Paketversion wurde dabei nicht abgesenkt.
Nachweis: [P14 #56](https://github.com/sl3ndrr/RiffRechnung/pull/56). Aktuelle Schutz- und Migrationsgrenzen: [Technik](technical.md).

## Historische Versionsreihe

Die früheren Einträge 1.0.0 bis 1.4 beschreiben damalige Produktstände mit teilweise entfernten Funktionen. Paket- und UI-Version wurden zeitweise getrennt gepflegt; diese Bezeichnungen sind keine aktuelle Versionsvorgabe.
Am 19.08.2026 wurde die Paketversion von 1.1.0 auf 1.0.2 zurückgesetzt ([Commit e47e92c](https://github.com/sl3ndrr/RiffRechnung/commit/e47e92c92abe2c978b3f949b42862fe1cfeefe3e)). Der Grund ist in der geprüften Historie nicht belegt. Historische Changelogdaten stimmen nicht durchgehend mit den Zeitpunkten der Versionssetzung überein.
Die Einträge bleiben [unverändert am historischen Ausgangscommit](https://github.com/sl3ndrr/RiffRechnung/blob/1655a5d74aea11a2e3257b8193960bae56e9dd43/docs/releases.md) erreichbar; sie sind keine heutige Bedienungsanleitung. Weitere Nachweise: [Nachweisindex](evidence.md).
