# AP6 – Integrations- und Migrationsmatrix

Ausgang: `main` 47f491e (AP1, Schema 7, Speicherprotokoll 4, Archivformat 1).
AP2, AP3/AP4 und AP5 liegen auf getrennten Branches. AP4 enthält AP3; Schema 8
ist auf `main` nicht ausgeliefert. Dieser Arbeitsbranch integriert sie additiv in
**einen** Migrationsschritt 7→8. Die Matrix ist zugleich Prüfliste; Ergebnisse und
offene Grenzen werden in `release-readiness.md` protokolliert.

| Bestand / Einstieg | Erwarteter Übergang und Erhaltung | Nachweis |
| --- | --- | --- |
| Schema 7, unveränderter Audit-Demobestand | 7→8 einmal; Namen, Personen, Rechnungen, Nummern, Positionen und Zahlungen bleiben unverändert; optionale neue Felder fehlen | eingefrorene Audit-Fixture, kanonischer Vergleich, zweiter Import |
| Schema 7, ausgestellter `joint`-Beleg mit Version `issued` | Snapshot und Ausgabe bleiben exakt historisch; keine neuen Steuer- oder Empfängerdaten aus Einstellungen | Fixture, Print/Import/Reload |
| Schema 7, `oldest-available` und historischer `separate`-Beleg | fehlende Historie bleibt fehlend; `separate` lesbar, neue Finalisierung gesperrt; Korrektur bleibt verknüpft | Fixture, Datenschutz-/Korrekturtest |
| Schema 7, offener Entwurf | fehlende Namen, Empfängertypen, Rechnungsart und Steueranzeige bedeuten Legacy-Verhalten; neue Wahl ausdrücklich im Editor | Migrations- und UI-Test |
| Schema 8, wiederholter Import/JSON-Roundtrip | identischer Fachzustand, kein erneuter Bericht/Default aus aktuellen Einstellungen | Idempotenz-/Roundtriptest |
| unbekanntes Schema 99 | keine schreibbare Sitzung, kein überschriebenes Original | Import-/Storage-Test |
| Import mit Vorschau und Roharchiv | Migrationsbericht und unveränderte Rohbytes vor bestätigtem Schreibabschluss; Abbruch, Quota, konkurrierende Tabs lassen Bestand intakt | StorageHarness/Browser |

| Neuer Nutzerfall × Altbestand | Erwartetes Ergebnis | Kanäle / Prüfungen |
| --- | --- | --- |
| Mehrere berechtigte Empfänger × Schema-7-`joint` und neuer Entwurf | genau eine Forderung/Nummer; explizite Auswahl und alle Zuordnungen | Fachbefehl, UI, Druck/PDF, Export/Import/Reload |
| Duo aus zwei Haushalten × Schema-7-Personen ohne Gruppe | zwei unabhängig bezahlbare Forderungen; keine Gruppe rückwirkend geraten; kein Partnertext in Einzelbelegen | Vorschau, Druck/PDF, CSV, Erinnerung, JSON/Reload; vollständiges Backup enthält beide Haushalte |
| Namenskontakt × unvollständiger Altstamm | Entwurf speicherbar, Abschluss nur nach fallbezogenen Pflichtangaben | Fachbefehl, UI, Import/Reload |
| Kleinbetrags-/Regelrechnung × Altbeleg und neue 249,99 / 250,00 / 250,01 EUR | historische Steuerdarstellung bleibt; aktuelle Pflichtregeln und gewählte Anzeige in Block/Fußzeile | Fachbefehl, Chromium-PDF, JSON/Reload |
| Erwachsener Selbstzahler × Altbestand mit Kindern | eigener Empfänger ohne erzwungene Kind-/Erziehungsberechtigtenbeziehung; alte Nummern und Belege bleiben | Fachbefehl, UI, Druck/PDF, Export/Import/Reload |
| Altes `separate` × alle neuen Felder | keine neue `separate`-Forderung oder Kopie; Altversion lesbar und Korrektur möglich | Fachbefehl, UI, PDF, Import/Reload |

Querschnitt: genau eine Schema-Erhöhung und Feldmigration; Zulassung aller optionalen
Schlüssel ausschließlich ab Schema 8; registrierte Testdateien; gültige Demo-Daten;
eine Rechnungsart-/Steuerentscheidung; APP_VERSION und Changelog; deutsche
Begriffe/Playwright-Selektoren. Native Druckdialoge, Safari/macOS, Banking-App
und Screenreader bleiben gesonderte Abnahmen.

Die bestehende Demo bleibt ein **historischer Schema-8-Regressionsbestand** mit
unverändertem Personen- und Beleginhalt. Sie wird validiert und enthält bereits
zwei Duo-Lernpaarungen, aber keine nachträglich erfundenen Gruppen, Selbstzahler
oder Steuerentscheidungen in alten Versionen. Neue AP2–AP5-Abläufe stehen als
ausdrücklich synthetische Fach- und Browserfixtures in `tests/duoFixtures.ts`,
`tests/adult-recipients.test.ts`, `tests/ap3.test.ts`, `tests/ap4.test.ts` und
`tests/browser/`.

**Abgearbeitet auf `bc94c272…`:** [CI 36283723964](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36283723964)
bestand 186/186 Fach- und 56/56 Browserfälle. Der Goldvergleich prüft beide
eingefrorenen Schema-7-Bestände feldgenau außer der Versionskennung, bewahrt
den exakten Rohtext in Archivformat 1 und druckt beide `separate`-Provenienzen
nach Import/Reload. Native Freigaben bleiben gemäß
[release-readiness.md](release-readiness.md) offen.
