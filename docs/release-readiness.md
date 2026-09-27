# AP6 – integrierte Freigabematrix, 27.09.2026

Der [AP6-Branch/Entwurfs-PR #41](https://github.com/sl3ndrr/RiffRechnung/pull/41)
integriert AP1–AP5 auf `main` `47f491e`; AP2–AP5 sind in `main` weiterhin nicht
enthalten. Schema 7→8, Speicherprotokoll 4 und Archivformat 1 sind der geprüfte
Umstieg. Die [Fallmatrix](ap6-integration-matrix.md) ordnet Altbestände und neue
Fälle zu. Branch-CI gilt nur für die bezeichnete Head-SHA und ersetzt weder
Merge- noch Deploymentauftrag.

[CI 36283723964](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36283723964)
auf `bc94c2724c858c81731dfaeb4e6079dbc9cfa6c9` bestand unter Node
22.23.2 Installation, Lint, 186/186 Fachtests, Typecheck, Build, 56/56
Browserprüfungen und Audit (0 gemeldete Schwachstellen). Davon sind **50
Chromium-Fälle**, darunter echte PDF-Erzeugung mit `pdftotext` für Goldbelege
und Mehrseitenfall; **zwei Chromium-, zwei Firefox- und zwei Linux-WebKit-
JSON-Fallbacks** prüfen Export/Import und Reload getrennt. Die geprüften
Versionen sind Chromium 153.0.8010.12, Firefox 155.0 und Linux-WebKit 26.6.
Der abschließende Dokumentationscommit wird im PR separat auf seiner eigenen
SHA geprüft.

| Bereich | Automatischer Nachweis im AP6-Branch | Offene Grenze |
| --- | --- | --- |
| Goldbestände des unveränderten Auditcommits | `tests/fixtures/schema7-audit.json`: bezahlter Originalbeleg, Korrektur, historischer `separate` mit `issued`, zweiter mit `oldest-available`; kanonischer 7→8-Vergleich, wiederholter Import, JSON-Roundtrip, Roharchiv, Reload | Unbekannte reale Bestände bleiben individuell vor Übernahme zu prüfen |
| Datenschutz/Schreibpfad | `tests/ap6-integration.test.ts`, AP1-, AP2- und Storage-Tests: neue `separate`-Finalisierung gesperrt; Originale/Korrektur erhalten; Vorschau ohne Schreibzugriff, Abbruch, Quota, konkurrierender Tab, Zukunftsschema 99 | Geräte- und Dateisystemfehler nicht vollständig simulierbar |
| Mehrpersonenforderung und Duo | Fach- und Browserfälle mit zwei eigenständigen Duo-Forderungen, Einzel-PDFs, Text-/CSV-/EPC-/Erinnerungsgrenzen und JSON-Reload; ein gemeinsamer Mehrpersonenbeleg bleibt eine Forderung | Das Voll-Backup enthält systembedingt beide Haushalte |
| Kontaktname, Rechnungsart und Steueranzeige | Schema-7-Altname unverändert; fehlende Pflichtangaben sperren fallbezogen; 249,99/250,00/250,01 €, Steuerblock/Fußzeile und mehrseitiger Chromium-PDF-Text in AP3/AP4-Tests | Steuerliche Einzelfallberatung und OS-Druck offen |
| Selbstzahler | AP5-Fach- und Browserfall mit Anlage, Zahlung, PDF und Export/Import/Reload; alte Empfänger-Snapshots bleiben | Native Geräteabnahme offen |
| Chromium / PDF | Echte Headless-PDF-Erzeugung und `pdftotext`, Mehrseitenfall und Goldbeleg werden gesondert zum JSON-Fallback bewertet | OS-Druckdialog, visuelle Ausgabe und Banking-App-Scan offen |
| Firefox / Linux-WebKit | JSON-Fallback und Reload in beiden Browsern | Linux-WebKit ist keine Safari/macOS-Abnahme; PDF/Druck dort offen |
| Zugänglichkeit | Automatische Tastatur-, Fokus- und Kontrasttests | Screenreader mit NVDA/VoiceOver offen |

Die synthetischen CI-Artefakte aus
[Lauf 36283017799](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36283017799)
wurden ergänzend gesichtet: Selbstzahlerin und gemeinsamer Minderjährigenbeleg
sind je eine lesbare A4-Seite; bei vierseitiger Ausgabe stehen Steuerkennung,
Hinweis, Summe und Bankblock ohne sichtbare Überlagerung auf der Schlussseite.
Diese Stichprobe ersetzt keinen OS-Druckdialog und keine Geräteabnahme.

**Freigabeempfehlung:** Die automatisierte Integration ist auf `bc94c272…`
bestanden. Produktive Freigabe bleibt wegen OS-Druckdialog, Safari/macOS,
Banking-App-Scan, Screenreader, nativer Dateiberechtigungen und des administrativ
fehlenden verpflichtenden Statuschecks (R23) gesperrt; diese Prüfungen sind
offen und nicht bestanden. Kein Merge und kein Deployment in AP6.

# AP4 – Prüfstand 26.09.2026

AP4 ist ein gestapelter Entwurfs-PR auf AP3 und noch nicht freigegeben.
Die gesetzlichen Voraussetzungen aus §§ 33 und 34a UStDV wurden für den
dokumentierten Produktumfang erneut geprüft. Die neue Fußzeilenwahl wird als
Zeile bei der Endsumme gedruckt, damit ein mehrseitiger Beleg den Hinweis
nicht erst auf einer späteren Seite zeigt. Der bestehende Rechtstext bleibt
unverändert, sodass ein nutzereigener Steuerhinweis zusätzlich vorkommen
kann; Editor und Rechnungsdetail warnen ohne Inhaltsänderung.

Der Charakterisierungscommit `1684225f` bestand `npm ci`, Lint,
Fachtests einschließlich importiertem AP4-Test, Typecheck, Build und den
Altbeleg-PDF-Test in Chromium in
[CI 36203816712](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36203816712).
Der vollständige Browserlauf endete mit 44/45: Der bekannte instabile
AP1-JSON-Download in WebKit erhielt keine Export-Rückmeldung; die AP4-
Charakterisierung bestand. Der erste Implementierungslauf fand eine
Statusreihenfolge beim finalen Snapshot; der unveränderte Test bestand
nach Korrektur. [CI 36204634782](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36204634782)
auf `65b97fd8` bestand unter Node 22.23.2 Installation, Lint,
161/161 Fachtests, Typecheck, Build, 47/47 Browserprüfungen mit
Endsumme-Seitenvergleich sowie vollständiges Audit ohne gemeldete
Schwachstellen. Der ergänzte Editor-Browsertest bestand auf `eddf3dca` in
[CI 36205098812](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36205098812)
mit 161/161 Fach- und 48/48 Browserprüfungen sowie allen übrigen Gates.
Lokales `npm ci` erhielt Registry HTTP 403,
Node ist hier 24 statt 22. Native Freigabegrenzen unten bleiben offen.

# AP3 – Prüfstand 25.09.2026

AP3 beruht auf `main` 47f491e (AP1 integriert). Schema 8 ist noch nicht
freigegeben oder gemergt. Die lokalen Node/npm-Gates waren wegen Node 24
(statt 22) und eines 403 beim `npm ci` nicht vollständig ausführbar.
Der Ergebniscommit `b8ff8b91` bestand [CI 36179170530](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36179170530)
unter Node 22.23.2 mit `npm ci`, Lint, 155/155 Fachtests, Typecheck, Build,
44/44 Browserprüfungen, `pdftotext` und vollständigem Audit. Der Fehler bei
der Korrektur-Rechnungsart ist behoben; die Download-Zwischenläufe sind in
[quality-gates.md](quality-gates.md) zugeordnet. Native Freigaben der älteren
Paketfolge bleiben offen. § 14 UStG wurde über die amtliche Gesamtausgabe
vollständig geprüft; siehe Produktentscheidungen.
Ein späterer unveränderter Dokumentationslauf hatte zweimal wechselnde
Downloadfehler in WebKit und Chromium; [CI 36181722538](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36181722538)
bestand mit zusätzlicher Fehlerdiagnose erneut 155/155 und 44/44. Die
Browser-Downloadprüfung ist deshalb trotz grünem Stand als instabil markiert.

Die bisherige Schemanummer 7 und die pauschale Empfängeranschriftspflicht in
den folgenden historischen Freigabeabschnitten beschreiben den Stand vor AP3.
Rückweg von Schema 8 nur mit gesichertem Schema-7-Original in getrenntem Profil.

# AP2 – Prüfstand (2026-09-25)

Arbeitsstand auf `codex/ap2-duo-households`, Ausgang `47f491e…`, APP_VERSION 1.4,
Schema 8. Noch kein Release und nicht in main. AP3–AP5 sind nicht integriert.
Die bisherigen AP1-/Paket-12-Ergebnisse sind historische Nachweise, keine
Freigabe des AP2-Stands. Aktuelle Gates: siehe [quality-gates.md](quality-gates.md).

Der 7→8-Umstieg benötigt die bestehende ausdrückliche Import-/Recoverybestätigung.
Originaldatei vorher unabhängig sichern, alte Tabs schließen; Rohdaten und Bericht
werden vor Übernahme archiviert. Die Migration erzeugt keine Duo-Gruppen und
verändert keine Originalbelege oder Zahlungstage. Rückweg ausschließlich mit
Originaldatei, passendem alten Code und getrenntem Profil; kein In-place-Downgrade.

AP2-Abnahmematrix: gemeinsame Erfassung/getrennte Bearbeitung; beide Vollvorschauen;
Gruppen-Centdifferenz; private PDFs via `pdftotext`; Einzelbeleg-/EPC-/mailto-/CSV-
und Historien-Leaktests; JSON-Roundtrip/Reload; zwei Tabs; Doppelklick;
Quota-/Schreibfehler; Zahlung nur A/Korrektur nur B; Partnerlöschung/-verlust;
Schema-7-Migration und Zukunftssperre. Lokale Node-22-Gates nicht ausführbar
(Node 24.19.0; npm-Registry und origin HTTP 403).

Implementierungsstand `adf99f5d830e0fc639175f8d3a250cd0c3716920`,
[CI 36112913179](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36112913179):
Node 22.23.2; Installation, Lint, 160/160 Fachtests, Typecheck, Build,
49/49 Browserprüfungen und Dependency-Audit erfolgreich. Darunter beide
vorhandenen Demo-Duos mit Partnernotizen, unabhängige Vollausgaben und echte
Chromium-PDFs. Der Abschlusscommit mit zusätzlichen Adress-/Kontoprüfungen
wird vollständig separat geprüft; genaue Zuordnung im [PR #37](https://github.com/sl3ndrr/RiffRechnung/pull/37).
Sein erster Lauf `36138790679` bestand die zusätzlichen PDF-Prüfungen, scheiterte
aber am nicht ausgelösten WebKit-Exportklick (48/49). Trace und gezielte Anpassung
des AP2-Tests an den festen Exportknopf stehen in `quality-gates.md`; kein
Zeitbudget und kein Datenvergleich wurde abgeschwächt. Der Folgelauf ist separat
im PR dokumentiert und ersetzt diesen fehlgeschlagenen Nachweis nicht rückwirkend.

Native Dateirechte, OS-Druckdialog, visuelle PDF-Abnahme, Banking-Scan,
Screenreader und Safari/macOS bleiben wie bisher separate offene Freigaben.
Kein Merge und kein Deployment.

# AP5 – Prüfstand (2026-09-26)

Schema 8 trennt neue typisierte Rechnungsempfänger von unveränderten Schema-7-Altbelegen. Selbstzahler erhalten ihr dauerhaftes Lernendenkennzeichen; der Wechsel des Zahlmodus ändert keine früheren Nummern oder Belegversionen. Neue gemischte gemeinsame Rechnungen zeigen allen ausdrücklich ausgewählten Empfängern die Namen und Positionen aller ausgewählten Lernenden. AP2-Gruppen und AP3-Rechnungsarten einschließlich Kleinbetragsrechnung fehlen in der Ausgangsbasis und können hier nicht als geprüft gelten. Historische Doppelanlagen werden nicht automatisch bereinigt.

Lokal steht Node 24.19.0 statt `.nvmrc` 22 bereit; `npm ci` endet mit HTTP 403 beim Paketabruf. Lokale Folge-Gates dürfen daher nicht als bestanden gelten. [CI 36253116923](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36253116923) auf `6183cb31ef6ec3dd1c07fd5dc44d26ec4c38ea44` prüfte unter Node 22 alle 155 Fachtests und 44 Browserprüfungen einschließlich PDF-Text, Migration, Export/Import und Reload erfolgreich; Lint, Typecheck, Build und Audit bestanden ebenfalls. Die synthetischen AP5-PDFs für Selbstzahlerin und Minderjährigen mit zwei Empfängern wurden als einzelne A4-Seiten visuell geprüft, ohne sichtbare Kollisionen oder Abschneidungen. Native Druckdialoge, Safari/macOS und weitere Freigabepunkte unten bleiben offen. Jeder weitere Commit benötigt einen eigenen vollständigen Lauf. Kein Merge oder Deployment.

# AP1 – Prüfstand (2026-09-24)

Die folgenden Paket-12-Nachweise sind historische Ergebnisse vor AP1. AP1 ersetzt die Empfängeraufteilung durch gemeinsame Rechnungen und die bestätigte Umwandlung offener Altentwürfe. [PR #36](https://github.com/sl3ndrr/RiffRechnung/pull/36), Implementierungscommit `02e712c519d4f833552837a66b63bad06fd73ad9`, [CI 36063143264](https://github.com/sl3ndrr/RiffRechnung/actions/runs/36063143264): Node 22.23.2, `npm ci`, Lint, 148/148 Fachtests, Typecheck, Build, 43/43 Browserprüfungen (Chromium sowie JSON-Fallback in Firefox/WebKit) und Dependency-Audit erfolgreich. Der letzte Dokumentationscommit wird gesondert geprüft.

Lokales `npm ci` erhielt HTTP 403; die lokale Node-Version ist 24.19.0. Native Druckdialoge und Dateiberechtigungen, visuelle PDF-Abnahme, Banking-Scans, Screenreader und Safari/macOS sind weiterhin offen. Keine Freigabe, kein Merge und kein Deployment.

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
| a (vor AP1): Zwei Familien → historische Aufteilung | Paket-12-Nachweis vor AP1; der Ablauf wurde durch gemeinsame Rechnung, Altentwurfsprüfung und Export/Import/Reload ersetzt | AP1-Browserlauf noch offen |
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
