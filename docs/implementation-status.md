# Umsetzungsstatus

Stand: 2026-09-07, Paket 03. Zielbranch `main` erneut geprüft:
`ba7857fd9180fa392c42a0235643e478e5077ee5`. Die offenen PRs bauen aufeinander auf;
kein Merge und kein Deployment. Keine `AGENTS.md` im vollständig geprüften Tree.

## Paketfolge

Alle noch nicht bearbeiteten Befunde gelten **laut Analyse offen**, nicht als
erneut bestätigt. Bestätigung/Korrektur erfolgt erst im zugehörigen Paket.
00–12 werden in Reihenfolge umgesetzt; 13–17 sind einzeln wählbar. Nach der letzten
gewählten Erweiterung wird Paket 12 wiederholt.

| Paket | Umfang | R-/F-/N-Zuordnung | Stand |
| --- | --- | --- | --- |
| 00 | Ausgangsbasis, CI, esbuild | R23, R25, N01 | Implementiert und in CI geprüft; administrative Abnahme offen |
| 01 | Gefährliche Abläufe vorläufig absichern | R01–R05, R10, R22 (Sofortschutz) | Sofortschutz implementiert und CI-geprüft; reale Browserabnahmen offen |
| 02 | Fachbefehle, Validatoren, reparierbare Formate | R01, R04, R15; Grundlage R24 | Implementiert und CI-geprüft; reale Browser-/Mailprogrammabnahmen offen |
| 03 | Speicherung, Backups, isolierte Demo | R05, R08, R22, N06; schrittweise R24 | Implementiert; CI-/Browsernachweise unten, native Dateirechte offen |
| 04 | Originalbelege und Korrekturen | R03, R09, R10, F03, N09 | Laut Analyse offen |
| 05 | Exaktes Geld und Kalenderdaten | R06, R12 | Laut Analyse offen |
| 06 | Aufteilung nach Empfängern | R02; Integration R01 | Laut Analyse offen |
| 07 | Rechnungsprofil, deutsche IBAN, Zahlungsdaten | R07, R13 angepasst, R14 | Laut Analyse offen |
| 08 | Zahlungstag und Berichte | R11, F02 (MVP) | Laut Analyse offen |
| 09 | Druck und GiroCode | R16, R21, N03, N08 | Laut Analyse offen |
| 10 | Tastatur, Dialoge, Navigation, Kontrast | R17–R20, N05, N07 | Laut Analyse offen |
| 11 | Sicherheitstexte und Komfort | R26, N02, N04, N10 | Laut Analyse offen |
| 12 | Zusammenhängende Abläufe und Freigabereife | R01–R26, N01–N10 | Laut Analyse offen; Pflichtabnahme |
| 13 | Wiederherstellung mit Versionsvergleich | F01 | Optional, laut Analyse offen |
| 14 | Teilzahlungen und Zahlungskorrekturen | F02 (Ausbau) | Optional, laut Analyse offen |
| 15 | Monatliche Unterrichtsvorlagen | F04 | Optional, laut Analyse offen |
| 16 | Passwortgeschützte portable Backups | F05 | Optional, laut Analyse offen |
| 17 | Offline-Start und kontrollierte Updates | F06 | Optional, zuletzt; laut Analyse offen |

## Bisherige Pakete

| Paket | Ergebnis / Abhängigkeit | Nachweis |
| --- | --- | --- |
| 00 | PR #19: gemeinsame Node-22-CI, Testtypen, esbuild; R23/R25/N01 | 45/45 Tests; Pflichtstatuscheck administrativ offen |
| 01 | PR #20: vorläufiger Original-, Aufteilungs-, Datei- und Demoschutz | 56/56 Tests; in 03 werden nur Datei-/Demo-Sperren fachlich ersetzt |
| 02 | PR #21, `3433c9c0fbab8f57ee66ce669a856a2d82fb43e9`: Fachbefehle, Format 3, ID-Reparatur, Mailboxen; R01/R04/R15, Grundlage R24 | 74/74 Tests; [CI 34056037557](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34056037557) |

Historische Einzelbefunde und CI-Fehlerzuordnung: [quality-gates.md](quality-gates.md).
Produktregeln: [product-decisions.md](product-decisions.md).

## Paket 03 – Speicherung, Backups und isolierte Demo

- **Ausgangsstand:** Arbeits-/PR-Basis ist PR #21, Branch
  `codex/paket-02-fachbefehle-migration`, vollständige SHA
  `3433c9c0fbab8f57ee66ce669a856a2d82fb43e9`. Alle 57 Basisdateien anhand ihrer
  Git-Blobs geprüft; Tree `bbc24026bf854fcc742e0f7f05d6476157d1e50d` lokal identisch.
  R05/R08/R22/N06 am aktuellen Code bestätigt: mehrere Speicherwege, verzögerte
  Bestätigung/Einstellungen und vorläufig gesperrte Datei-/Demoabläufe.
- **Ergebnis:** Branch `codex/paket-03-sichere-speicherung`,
  [PR #22](https://github.com/sl3ndrr/RiffRechnung/pull/22) gegen den Paket-02-Branch.
  Implementierung und Ergänzungen bis `c034f63af72aeaeec0bbf8ef10bd2c8f274c0c58`;
  abschließender Dokumentationscommit und zugehöriger Prüflauf stehen im PR.
  R05/R08/R22/N06 im Paketumfang implementiert; R24 für Speicherung weitergeführt.
  Keine F-Erweiterung und kein weiteres Paket begonnen.
- **Änderungen:** Ein Schreibdienst mit Tab-Warteschlange und echten Web Locks;
  vollständiger Inhaltsvergleich, Bestands-ID, Revision und Vorgänger-Fingerprints.
  Verbindung liest zuerst alle JSON-Dateien; ausdrückliche Zuordnung anonymer
  Altbackups. Datei-Backups werden ausschließlich als neue Dateien geschrieben,
  erfolgreich geschlossen und zurückgelesen. Vorherige gültige Dateien bleiben.
  Konflikte und Berechtigungs-/Speicherfehler bleiben sichtbar, auch mobil.
  Gültige Einstellungen werden beim Ansichtswechsel bestätigt lokal gespeichert.
  Demo arbeitet ausschließlich im Arbeitsspeicher ohne reale Schlüssel/Handles.
- **Invarianten:** DE-IBAN-Regeln, historische Beträge/Snapshots, Referenzen,
  CSV-Formelabwehr, getrennte Nummernkreise und reservierte Nummern erhalten.
  Wiederherstellung bewahrt bekannte Originale/Reservierungen und erhöht die
  Revision über aktuellen und importierten Stand. Kein Gewinner allein aufgrund
  von Revision, Dateiname oder Datum; kein stilles Zusammenführen externer Zweige.
- **Migration:** Speicherprotokoll 4 um Datenschema 3, eigener localStorage-Schlüssel
  und neue Handle-Datenbank. Altformat 2 wird mit dem bestehenden Algorithmus nach 3
  migriert, Format 3 übernommen; beide erst nach Vorschau/Bestätigung. Alte Schlüssel,
  Originaltext, Eingangsdatei und Berichte bleiben erhalten. Archiv und vorheriger
  lokaler Stand sind exportierbar/prüfbar. Weitere Lesevorgänge ändern nichts;
  erneute Bestätigung erzeugt eine neue Revision, aber keine weitere Reparatur.
  Unbekannte neuere Formate bleiben schreibgeschützt. Kein automatisches Downgrade.

| Abnahme Paket 03 | Ergebnis / Nachweisart |
| --- | --- |
| Leerer Browser mit bestehendem Backup; fremder Bestand; gleicher Zähler mit anderem Inhalt | Bestanden in Funktionsprüfungen mit synthetischen Storage-/Datei-Adaptern |
| Manuelle und automatische Sicherung gleichzeitig; Fehler bei createWritable/write/close; Wiederholung | Bestanden mit Fehler-Injektion; reale OPFS-Sicherung zusätzlich im Browser |
| Veralteter Tab und zwei zeitgleich schreibende Tabs | Bestanden mit zwei echten Chromium-Tabs und nativen Web Locks |
| Einstellung ändern, sofort Ansicht wechseln, bestätigt speichern, schließen/öffnen | Bestanden im echten Chromium-Browser |
| Beschädigte Rohdaten tatsächlich herunterladen; Backup bestätigen/persistieren/reload | Bestanden im echten Chromium-Browser; Originalbytes und Archiv geprüft |
| Demo mit verbundenem Ordner: Echtbestand, Dateien und gespeichertes Handle unverändert | Bestanden mit echtem OPFS/IndexedDB und vollständigem Browserneustart im isolierten Profil |
| Quota/Security, IndexedDB-Öffnung/Abbruch, veraltete Handles, granted/prompt/denied, fehlende Funktionen | Automatisierte Fehler-Injektion; native OS-Dialoge/Berechtigungen nicht geprüft |
| Picker-Abbruch | Bestanden im Browser mit injiziertem AbortError; kein nativer Picker-Nachweis |
| Bereits geöffnete historische Anwendung nach Umstieg | Bestanden mit dem echten historischen Build `ba7857f…` unter derselben Origin |
| Migration/Reparatur, Geld, Referenzen, Reservierungen, Import und Reload | Vorhandene Regressionen erhalten; bestätigte Reparatur über den produktiven Schreibdienst ergänzt |

**Ausführungsstand:** [CI 34087140552](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34087140552)
für `c034f63af72aeaeec0bbf8ef10bd2c8f274c0c58`: Ubuntu 24.04.4,
Node 22.23.2/npm 10.9.8, Chromium 153.0.8010.12; alle Schranken, 101/101 Fachtests
und 8/8 Browserprüfungen bestanden, keine übersprungenen Tests. Lokal Node 24.19.0/npm 11.9.0;
Installation/Node-22-Abruf E403, reguläre Prüfbefehle vor Prozessstart blockiert.

**Offen:** Native Ordnerwahl und Rechtevergabe/-entzug auf Zielbetriebssystemen,
reale Synchronisationsprogramme/zweites Gerät sowie administrative Pflichtchecks.
Keine Zusage geräteübergreifender Atomizität. Fehlende Web Locks sperren Schreiben;
fehlende Dateifunktionen lassen lokalen Speicher und JSON-Export verfügbar.
Versionsdateien/Archive werden nicht automatisch gelöscht und benötigen Speicherplatz.
Der Chromium-Absturz bei OPFS-Handles im privaten Testprofil ist separat ohne App
reproduziert; Datei-Abnahme verwendet ein dauerhaftes synthetisches Profil.
Fokus, Druck und Banking-App-Scans gehören zu späteren Abnahmen.

Nächstes vorgesehenes Paket: **04 – Originalbelege und Korrekturen**, nicht begonnen.
