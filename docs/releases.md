# Release-Notizen

Die aktuelle App-Version stammt ausschließlich aus `package.json`.
Frühere UI-Nummern wurden unabhängig von der Paketversion gepflegt; die folgenden historischen Angaben sind keine aktuellen Versionsvorgaben.

## 1.2.0

- Dashboard als Startseite: bestätigte Zahlungseingänge nach Jahr/Monat, offene aktive Ansprüche, Entwürfe, Personen und Backup-Erinnerung.
- Farbschema Hell/System/Dunkel in der Topbar und den Einstellungen; ungespeicherte Formularwerte bleiben erhalten.
- Helle Rechnungsdarstellung mit Monatsgruppen, Zwischensummen und sicherem flachem Fallback für historische Beträge.
- Einmaliges Rückgängig für Entwurfs-/Personenlöschung und Archivwechsel, mit pausierbarer Zehn-Sekunden-Frist.
- Gemeinsame, abschaltbare Bewegungen für Navigation, Dialoge, Meldungen und Seiten; Druck bleibt animationsfrei.
- Integration und Dokumentation, zusätzliche Backup- und PDF-Regressionsprüfungen; keine neue Abhängigkeit, Migration oder Änderung an Schema 15, Originalschutz und Rechnungsnummern.

Prüfstand, Grenzen und manuelle Freigabe: [AP8-Prüfbericht](release-1.2.0.md).

## Vereinfachter Stand P01–P14 (ohne neue Releaseversion)

- Privatrechnungen, ein optionaler Rechnungshinweis und feste kurze Rechnungstexte.
- Gemeinsame berechtigte Empfänger mit eigenen optionalen Anschriften, Selbstzahler, PDF und GiroCode.
- Feste jährliche Nummern je Person/Kombination; geschützte Belege, Korrekturen und Zahlungen.
- Drei Arbeitsbereiche, ausdrückliches Speichern und manueller JSON-Export/Import.
- Direkte Fachtests, getrennte historische Browsermigration; kurze aktuelle Dokumentation und eine Versionsquelle.

Integration, Prüfungen und bekannte Migrationsgrenzen: [Technik](technical.md), [Nachweise](evidence.md).

## Historische Veröffentlichungen

Die damaligen Einträge für 1.0.0 bis 1.4 beschreiben frühere Produkte mit inzwischen entfernten Funktionen.
Sie bleiben als [unveränderte historische Release-Notizen am Ausgangscommit](https://github.com/sl3ndrr/RiffRechnung/blob/1655a5d74aea11a2e3257b8193960bae56e9dd43/docs/releases.md) erreichbar und sind keine Bedienungsanleitung für den aktuellen Stand.
