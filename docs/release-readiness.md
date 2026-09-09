# Paket 12 – Freigabereife

Stand 2026-09-09. Ausgang `main`: `95d7370dbe5931c6ab0373bc070db2ad8763cb93`.
Arbeitsbranch `codex/paket-12-stabilisierung`, [PR #33](https://github.com/sl3ndrr/RiffRechnung/pull/33).
Implementierungsnachweis: `72515209ac123cdd079e730e77686435668827bf`,
[CI 34384827205](https://github.com/sl3ndrr/RiffRechnung/actions/runs/34384827205):
150/150 Fachtests, 41/41 Browserprüfungen, Lint, Test-Typecheck, Build und
vollständiges npm-Audit (0 gemeldete Schwachstellen) erfolgreich. Der abschließende
Dokumentationscommit erhält einen eigenen vollständigen CI-Lauf; dessen konkrete
SHA/Laufzuordnung wird im PR-Abschluss festgehalten.

**Noch nicht abnahmefähig.** Native Dateiberechtigungen, Druckdialoge, visuelle
PDF-/Theme-Abnahme, Banking-App-Scans, Screenreader und Safari/macOS sind offen.
R23: Der verpflichtende Statuscheck ist administrativ noch nicht eingerichtet.
Ungeprüftes gilt nicht als bestanden. Kein Merge/Deployment in diesem Auftrag.

## Prüfbereich und Browser

Alle Daten sind synthetisch. Fachprüfungen verwenden echte Befehle und Ergebnis-
zustände, darunter eine unabhängige Python-Decimal-Matrix mit 100.000 Werten.
Playwright startet echte Browser. Fehlereinjektionen sind im Testnamen ausgewiesen
und belegen keine nativen Berechtigungen, Druckdialoge oder Banking-App-Scans.

| Kombination | Nachweis / Grenze |
| --- | --- |
| Chromium 153.0.8010.12 / Ubuntu 24.04 | UI, Web Locks, localStorage, IndexedDB, OPFS und echte PDF-Engine |
| Firefox 155.0 / Ubuntu 24.04 | JSON-Export/-Import/Reload ohne native Ordner-API |
| Playwright-WebKit 26.6 / Ubuntu 24.04 | JSON-Export/-Import/Reload; **kein Safari-Browser** |
| Safari / macOS oder iOS | Nicht geprüft; JSON-Fallback vorgesehen, keine Zusage dynamischer Druckrandboxen |
| Native Chromium-Druckdialoge; Chrome/Edge als eigene Produkte | Nicht geprüft; Headless-PDF ersetzt keine OS-Abnahme |
| Banking-App / Screenreader | Keine manuelle Abnahme erfolgt |

Web Locks sind Voraussetzung für schreibenden Betrieb. Fehlt nur die Ordner-API,
bleiben lokale Speicherung und JSON-Download/-Import vorgesehen. Ohne Web Locks
bleibt die App schreibgeschützt. Offline-Neustart ist weiterhin kein Produktmerkmal.

## Zusammenhängende Szenarien

Browserdateien stehen unter `tests/browser/`, Fachtests und Fehlermocks unter
`tests/`. Exakte Commit-/CI-Zuordnung: [quality-gates.md](quality-gates.md).

| Szenario | Automatischer Beleg | Offene Teilabnahme |
| --- | --- | --- |
| a: Zwei Familien → Aufteilung → Finalisierung → Export → Import → Reload | `documents.spec.ts` P06, `fallback.spec.ts`, `invoice-split.test.ts`: je 30 EUR, 60 EUR gesamt, nur richtige Kinder/Empfänger, eindeutige IDs | Keine zusätzliche fachliche Entscheidung |
| b: Original → Personen löschen → drucken → Korrektur → neu zuordnen → Reload | `documents.spec.ts` P04 und `stabilization.test.ts`: Original-PDF textgleich, neue Nummer, eine aktive Forderung/eine Zahlung | Nativer Druckdialog |
| c: Negative Einstellung/sofortiger Wechsel; Speichern/Schließen; Quota/Wiederholung | `stabilization.spec.ts`, `storage.spec.ts`, `storage.test.ts`: keine falsche Bestätigung, fehlerhafte Eingabe bleibt im Formular | Keine Geräte-Crash-/Stromausfallzusage |
| d: Leerer Bestand mit Backup; zwei Tabs; manuelle/automatische Sicherung; Fehler/Restore | Echte Tabs in `storage.spec.ts`, echter OPFS in `stabilization.spec.ts`; `storage.test.ts` für Picker-/Rechte-/IndexedDB-/createWritable-/write-/close-Fehler | Native Auswahl, OS grant/prompt/deny/Entzug, echte Synchronisationskonflikte |
| e: Formate 2–6; doppelte IDs; Zukunftsformat; Migrationsbruch | `commands`, `documents`, `money-calendar`, `payment-reporting`, `storage`, `stabilization`; Browser-Migrationsbruch/Zukunftssperre/Rückkehr | Uninterpretierbare Historie wird nicht rekonstruiert |
| f: Halbcent; Januar/Februar; Schaltjahr; Mitternacht; Dezember/Januarzahlung | `money-calendar`, `payment-reporting`, `documents.spec.ts`, Berlin-Browser: Anzeigen/CSV/EPC/PDF und Kalenderjahre | Kein Banking-App-Betragsnachweis |
| g: DE/Nicht-DE; leere Original-BIC; mailto; Clipboard | `payment-data`, `commands`, `documents`; `stabilization.spec.ts`, `accessibility.spec.ts` P11 | Reale Mailclients und Banking-App-Scan |
| h: Mehrseiten-PDF; QR-Fallback; Tastatur/Dialogstapel; Navigation/Themes | `print.spec.ts`: 1/2/mehr Seiten, Text/Randseitenzahlen; `accessibility.spec.ts`: 390/900/1280 px, echter Fokus/Kontrast/beide Themes | Visuelle PDF-/Theme-Abnahme, OS-Druck, Firefox-/Safari-PDF, Screenreader |
| i: Demo bei bestehendem Bestand und Backup-Ordner | `storage.spec.ts`: RAM-Demo, persistentes synthetisches Profil, echte OPFS-/IndexedDB-Handles, Neustart; Rohstand/Dateien unverändert | Native Ordnerrechte separat offen |

## Abschlussmatrix sämtlicher Befunde

„Behoben mit Nachweis“ gilt ausschließlich im angegebenen Prüfbereich. Die obigen
nativen Freigabeblocker werden dadurch nicht als bestanden gewertet.

| ID | Einstufung | Nachweis / Grenze |
| --- | --- | --- |
| R01 | Behoben mit Nachweis | Globale Positions-IDs, begrenzte deterministische Altreparatur; `commands`, `invoice-split`, Familien-JSON-Roundtrip |
| R02 | Behoben mit Nachweis | Explizite Centzuordnung, Leistung genau einmal, nur passende Kinddaten; Familienablauf mit PDF/Import/Reload |
| R03 | Behoben mit Nachweis | Verknüpfter Korrekturentwurf nach Personenlöschung, Neuzuordnung und Reload; `documents` |
| R04 | Behoben mit Nachweis | Negative Zwischenwerte erreichen keinen persistenten Zustand; sofortiger Wechsel im echten Browser |
| R05 | Behoben mit Nachweis im automatisierten Umfang | Web Locks, Konfliktprüfung, neue Versionsdateien, OPFS, Fehlerinjektionen; zusätzlicher Recovery-Schutz. Native Dateiabnahme offen |
| R06 | Behoben mit Nachweis | Exakte Cents, Decimal-Referenz, neue 7,58 gegenüber erhaltenen historischen 7,57; sämtliche Ausgabekanäle |
| R07 | Behoben mit Nachweis im gewählten Profil | Pflichtangaben im ausdrücklich gewählten Kleinunternehmerumfang; `invoice-profile`; keine individuelle steuerliche Einordnung |
| R08 | Behoben mit Nachweis | Bestätigung erst nach lokalem Write; Schließen/Reload und Quota-Wiederholung im Browser |
| R09 | Behoben mit Nachweis | Unveränderliche Vollversionen, >200 Aktionen, Archiv/Restore; P12 schützt Legacy-Originale und gültige Rückfallkopien |
| R10 | Behoben mit Nachweis | Gemeinsame Versionsprojektion, Korrekturen nur als neue Version; A/B-PDF-Textvergleich |
| R11 | Behoben mit Nachweis | Rechnungs-/Zahlungsjahr getrennt, unbekannte Tage jahrslos, CSV/Dashboard/Bericht; `payment-reporting` |
| R12 | Behoben mit Nachweis | Monatsende begrenzt, Schaltjahr/Jahrhundert, lokale Kalenderdaten; Berlin-Mitternacht und Node-Zeitzonen |
| R13 | Bewusst geänderter Produktumfang | Nur deutsche IBANs für neue/geänderte Konten und neue Finalisierungen; ausländische Originale bleiben unverändert |
| R14 | Behoben mit Nachweis im DE-Umfang | Eigenständiger Konsistenzbefund: leere Snapshot-BIC bleibt leer trotz Kontowechsel; Bankblock/EPC aus derselben Version. Banking-Scan offen |
| R15 | Behoben mit Nachweis | ASCII-Mailboxregel, getrennte URL-Kodierung, Sonderzeichen/CR/LF/Listen; keine echte E-Mail gesendet |
| R16 | Behoben mit Nachweis | Fehlergrund und bewusst QR-freier Druck, kein altes QR-Bild; echte Browser-/PDF-Prüfung |
| R17 | Behoben mit Nachweis | Tastaturauslöser Rechnungsnummer, Details/Status/Erinnerung/Rückkehr bei drei Viewports |
| R18 | Behoben mit Nachweis | Tab/Shift+Tab, Escape, Rückfokus, inert-Stapel verschachtelter Dialoge; Screenreader offen |
| R19 | Behoben mit Nachweis | Zugängliche Namen, geschlossene mobile Navigation inert, Öffnen/Schließen mit Fokus |
| R20 | Behoben mit Nachweis im geprüften Farbumfang | Browser-Kontrastmessungen in beiden Themes; visuelle Abnahme offen, keine pauschale WCAG-Zertifizierung |
| R21 | Hypothese im Chromium-Prüfbereich nicht reproduziert | Rechtstext/Referenz im Dokumentfluss, echte mehrseitige PDFs; Firefox-/Safari-/OS-Druck offen |
| R22 | Behoben mit Nachweis | Isolierte Demo; Bestand/Handle/Dateien und Neustart unverändert; keine simulierte Freigabe nativer Ordnerrechte |
| R23 | Weiterhin offen: administrative Teilabnahme | Head-SHA/Gates/Audit/geringe CI-Rechte vorhanden; aktive Rulesets enthalten keinen required status check |
| R24 | Behoben mit Nachweis für kritische Fachbefehle | Validierte Befehle; Übergänge/Serialisierung/Import/Reload; Quellmuster durch tatsächliche Formularabläufe ergänzt |
| R25 | Behoben mit Nachweis | esbuild 0.25.12; gezieltes js-yaml 4.3.2 und vollständiges npm-Audit direkter/transitiver Lockfile-Pakete |
| R26 | Behoben mit Nachweis | README/About/Einstellungen benennen Klartext, Browserprofil, Origin und Ordnersynchronisation; Text-/Codeprüfung |
| F01 | Weiterhin offen, optional | Versionsvergleich ist Paket 13; kein automatisches Zusammenführen ergänzt |
| F02 | Behoben mit Nachweis als Vollzahlungs-MVP | Bestätigter Zahlungstag, unbekannte Historie, einmaliger Geldfluss; Teilzahlungen bleiben optionales Paket 14 |
| F03 | Behoben mit Nachweis | Vollständige Originale, begründete Korrekturbeziehungen, Archiv/Zahlungszuordnung; keine erfundene Historie |
| F04 | Weiterhin offen, optional | Unterrichtsvorlagen bleiben Paket 15 |
| F05 | Weiterhin offen, optional | Verschlüsselte portable Backups bleiben Paket 16 |
| F06 | Weiterhin offen, optional | Verlässlicher Offline-Start bleibt Paket 17 |
| N01 | Behoben mit Nachweis | README `npm ci`, reproduzierbare Installation in CI |
| N02 | Behoben mit Nachweis | `a+b` segmentiert, `ab` einzelnes Kennzeichen; Textprüfung |
| N03 | Behoben mit Nachweis im angegebenen Umfang | Dokumentation/CSS: A4-Ränder 16/20/22 mm; PDF-Textprüfung, visuelle Randabnahme offen |
| N04 | Behoben mit Nachweis | Clipboard-NotAllowedError zeigt vollständiges markierbares Textfeld ohne falschen Erfolg |
| N05 | Behoben mit Nachweis | Sichtbarer Fokus auf Datei-, Chip- und Theme-Trägern im Browser |
| N06 | Behoben mit Nachweis | Speicher-/Backupstatus bei 390 px sichtbar; Erfolg erst nach lokalem Write |
| N07 | Behoben mit Nachweis | Verwerfen fragt nach; Weiterbearbeiten erhält Werte; bestätigtes Verwerfen schreibt nichts |
| N08 | Behoben mit Nachweis im Chromium-PDF | Lange Texte und Zeilenumbrüche in mehrseitiger Ausgabe erhalten |
| N09 | Behoben mit Nachweis | Snapshot-Differenzen/Klärungsgrund in `DocumentHistory`; Browser-Korrekturablauf |
| N10 | Behoben mit Nachweis | ISO-Datum als `time datetime`, Versions-/Changelog-Test unverändert |

## Umstieg und Rückkehr

1. Alte Tabs schließen. Mit dem bisher verwendeten Code den vollständigen JSON-
   Export als **unabhängige Datei außerhalb des automatischen Backup-Ordners**
   sichern. Code-/Datenformat und Datum notieren; die Datei mit passendem Code
   in einem separaten Testprofil probeweise öffnen.
2. Schema 7 aus Paket 11 benötigt keine Formatmigration. Formate 2–6 im neuen
   Code über „Altformat und Reparatur prüfen“ oder JSON-Import prüfen. Bericht,
   Originale, Nummern, Beträge und Hinweise prüfen. Negative Werte, ungeklärte
   Referenzen und unbekannte neuere Formate werden nicht wegrepariert.
3. Übernahme ausdrücklich bestätigen. Unveränderte Eingänge und Migrationsbericht
   müssen vor dem Hauptschreibabschluss archiviert sein. Bei Fehler Rohdaten
   exportieren, nichts löschen, Ursache beheben und Prüfung erneut öffnen.
   Unterbrechung vor/nach Archivierung ist mit Restart getestet. Bekannte gültige
   Rückfallkopien schützen Originale/Nummern/Herkunft; ihr zusätzlicher Rohtext
   bleibt bei Bedarf als weiterer Eintrag im unveränderten Archivformat 1 erhalten.
4. Nach „Lokal gespeichert“ neu laden, Forderungen, Versionen und Nummern prüfen;
   neuen JSON-Export unabhängig sichern. Dedizierten Backup-Ordner erst nach
   Inhalts-/Herkunftsprüfung verbinden. Restore erzeugt eine neue monotone
   Revision; normales Laden löst keine weitere Reparatur aus.
5. **Rückkehr vor die Migration:** Neuen Bestand separat exportieren und schließen.
   Passenden historischen Code in getrenntem Browserprofil ohne Ordner-Handle
   starten, ausschließlich die unabhängige damalige Originaldatei importieren.
   Keinen alten Code auf neuen Schlüssel/Ordner richten und kein Schema umetikettieren.
   Änderungen seit der Migration fehlen im alten Backup; keine Rückkonvertierung.

Der Rückkehrtest verwendet echten historischen Code
`ba7857fd9180fa392c42a0235643e478e5077ee5`: alte App exportiert Originaldatei,
neue App migriert, getrenntes Profil importiert mit alter App und lädt erneut.
Originalrechnungen, Einstellungen und Nummern bleiben gleich; der neue Schema-7-
Bestand bleibt bytegleich und gelangt nicht in das alte Profil.

## Noch auszuführende Freigaben

Die CI erzeugte PDFs und Screenshots. Der Artefakt-Download zur hiesigen Sichtprüfung
endete mit HTTP 403. Keine visuelle PDF-/Theme-Abnahme wird behauptet; automatische
PDF-Text-, Fokus- und Kontrastprüfungen sind davon getrennt.

- Native Chromium-Ordnerauswahl mit synthetischem Ordner: leerer Browser/bestehendes
  Backup, Abbruch, grant/prompt/deny, Entzug/Wiederholung; Originaldateien vergleichen.
  IndexedDB-/Schreibfehler-Injektionen sind eigene automatische Prüfungen.
- OS-Druckdialog und Ausgabe mit 1/2/mehr Seiten, langen Texten, Wasserzeichen,
  QR-Fallback und Rändern kontrollieren; Firefox/Safari gesondert prüfen.
- Banking-App: synthetischen QR scannen, Empfänger, DE-IBAN, optionale BIC, Betrag
  und Referenz vergleichen; **keine Überweisung auslösen**.
- NVDA+Firefox oder VoiceOver+Safari: Rechnung, Detail, Status, Erinnerung,
  verschachtelte Bestätigung, Escape/Rückfokus, Dateiauswahl und mobile Navigation
  mit tatsächlicher Sprachausgabe prüfen; Versionen/Datum/Ergebnis protokollieren.
- Safari/macOS: JSON herunterladen, neues Profil, Import bestätigen, schließen/
  Reload und unveränderten Inhalt prüfen. Linux-WebKit ersetzt dies nicht.
- Required status check `Quality (Node 22)` administrativ einrichten und prüfen.
  Kein entsprechender Schreib-Endpunkt ist verfügbar.

Nächstes vorgesehenes Paket: optional **13**; nicht begonnen.
