# RiffRechnung – lokale Rechnungsverwaltung

Eine vollständig clientseitige Web-App für Rechnungen rund um Gitarrenunterricht. Sie läuft als statische Vite-App auf GitHub Pages; es gibt weder Server noch Datenbank, Benutzerkonto, Tracking oder externe API-Aufrufe.

## Funktionsumfang

- Kinder und mehrere Erziehungsberechtigte verwalten, filtern, sortieren und miteinander verknüpfen
- gemeinsame Rechnungen erstellen oder Positionen nach ausdrücklicher Empfänger-/Centzuordnung atomar in mehrere Rechnungen aufteilen
- mehrere Kinder und automatisch berechnete Zwischensummen auf einer Rechnung
- frei definierbare Positionen, Zahlungsziel und Textbausteine
- strukturiertes Kleinunternehmerprofil mit vollständigen Aussteller-/Empfängeranschriften und ausdrücklich typisierter Steuerkennung
- Entwurf, versendet, bezahlt und automatisch erkanntes „überfällig“; verknüpfte Korrekturentwürfe erhalten den vollständigen Originalbeleg
- konfigurierbarer Nummernkreis mit dauerhaftem Kinderkennzeichen (`a`, `b`, `c` …); jedes Kind bzw. jede Kindkombination zählt getrennt und Nummern werden erst bei Finalisierung vergeben
- unveränderliche vollständige Belegversionen mit damaligen Positionen, Beträgen, Personen, Konto und Texten; einsehbare Korrekturgründe und Snapshot-Differenzen
- A4-Druckansicht mit Entwurfswasserzeichen, gemeinsamer Rechtstext-/Seitenzahl-Fußzeile und Rechnungsnummer auf Folgeseiten
- clientseitig erzeugter EPC-GiroCode (EPC069-12 / Version 002) für SEPA-Überweisungen
- Dashboard, Volltextsuche, Filter, sortierbare Rechnungslisten, Zahlungserinnerung per `mailto:`, Duplizieren wiederkehrender Rechnungen und CSV-Jahresübersicht
- System-/Light-/Dark-Mode, responsive Desktop-/Tablet-/Smartphone-Oberfläche und reduzierte Bewegung
- bestätigtes lokales Speichern gültiger Einstellungen, auch beim sofortigen Ansichtswechsel
- JSON-Export/-Import sowie optionales automatisches Backup in einen lokalen Ordner

## Tech-Stack

**Vite + React + TypeScript** ist hier bewusst schlanker als ein Full-Stack-Framework: GitHub Pages liefert ausschließlich statische Dateien aus, React eignet sich gut für den zustandsreichen Rechnungseditor, und TypeScript schützt das Daten- und Backup-Format. Die Inter-Schrift (`@fontsource-variable/inter`), Lucide-Symbole und die QR-Bibliothek werden beim Build lokal gebündelt. Zur Laufzeit werden keine CDN-Ressourcen geladen.

Die Daten liegen im `localStorage` des verwendeten Browserprofils; nur die optionale Referenz auf einen freigegebenen Backup-Ordner wird über IndexedDB gespeichert. Die App selbst sendet keine personenbezogenen Daten an einen Dienst. Das ist keine Verschlüsselung: Wer Zugriff auf das Gerät oder Browserprofil hat, kann auch auf diese Daten zugreifen.

## Lokal starten

Voraussetzung: Node.js 22 gemäß `.nvmrc` (mit dem zugehörigen npm).

```bash
npm ci
npm run dev
```

Produktionsprüfung:

```bash
npm run lint
npm test
npm run typecheck
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
npm audit --json
npm run preview
```

Die PDF-Regressionsprüfung benötigt zusätzlich `pdftotext` aus Poppler. Der
Ubuntu-CI-Job installiert es mit `sudo apt-get install -y poppler-utils`.

## Auf GitHub Pages veröffentlichen

1. Änderungen als Pull Request gegen `main` prüfen lassen und erst nach Freigabe übernehmen.
2. Im Repository unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** wählen.
3. `.github/workflows/quality.yml` prüft den konkreten PR-Head mit Node 22, `npm ci`, Lint, Tests, Typecheck einschließlich Testdateien, Build, echte Chromium-Abläufe, JSON-Fallbacks in Firefox/WebKit und ein vollständiges Dependency-Audit.
4. `.github/workflows/deploy.yml` verwendet bei Push auf `main` dieselben Prüfungen. Erst nach deren Erfolg wird das in demselben Lauf erzeugte Artefakt veröffentlicht. Manuelle Läufe anderer Branches veröffentlichen nichts.

Die verpflichtenden Statuschecks müssen zusätzlich in den Branch-Regeln eingerichtet werden; eine Workflow-Datei erzwingt sie nicht. Nachweise, geprüfte Action-Versionen und offene administrative Einstellungen stehen in [docs/quality-gates.md](docs/quality-gates.md); Paketfolge und Produktregeln in [docs/implementation-status.md](docs/implementation-status.md) und [docs/product-decisions.md](docs/product-decisions.md).

Vite verwendet für den Produktions-Build relative Asset-Pfade. Dadurch funktioniert die App sowohl unter `username.github.io/repository/` als auch mit einer eigenen Domain, ohne den Repository-Namen im Code einzutragen.

## PDF / Drucken

„PDF / Drucken“ öffnet den nativen Druckdialog des Browsers. Dort **Als PDF speichern** wählen. Das Druck-CSS setzt A4 mit **16 mm oben, 20 mm links/rechts und 22 mm unten**, Inter-Typografie, Briefkopf, Tabellenfarben und Bankdaten um. Entwürfe tragen ein Wasserzeichen. Rechtstext, Rechnungsreferenz und Hinweise stehen zusätzlich im normalen Dokumentfluss: Selbst wenn ein Browser die optionalen `@page`-Randbereiche nicht unterstützt, bleiben die wesentlichen Angaben im PDF erhalten. In Chromium ergänzen die Randbereiche auf jeder Seite Rechnungsreferenz und „Seite x von y“. Lange Namen, Anschriften, Kontoangaben und mehrzeilige Freitexte bleiben umbruchfähig statt abgeschnitten zu werden.

Der GiroCode füllt Empfänger, deutsche IBAN, optional eingegebene BIC, Betrag und Rechnungsnummer aus derselben gebundenen Belegversion in unterstützten Banking-Apps aus. Bei einer fehlerhaften EPC-Payload oder abgelehnter QR-Erzeugung erklärt die App den Grund und bietet ausdrücklich **„Ohne GiroCode drucken“** an; das fehlerhafte Bild wird nicht übernommen. Das ändert weder die Finalisierungsprüfung noch Rechnungsdaten. Für neue Verwendung werden ausschließlich deutsche Empfänger-IBANs unterstützt. IBAN-Prüfsumme und BIC-Format bestätigen weder Kontoinhaber noch Erreichbarkeit. Der EPC-Standard selbst kann keine Echtzeitüberweisung erzwingen; diese Option wird – sofern verfügbar – in der Banking-App ausgewählt.

Automatisch geprüft ist **Chromium 153.0.8010.12 unter Ubuntu 24.04** in CI, einschließlich echter PDF-Erzeugung und Textprüfung. Native Druckdialoge und die visuelle Druckabnahme bleiben offen. Der normale Dokumentfluss ist der vorgesehene Druckfallback für Firefox/Safari; deren PDF-Ausgabe und dynamische `@page`-Seitenzahlen wurden nicht abgenommen. Chrome und Edge werden nicht als eigene Versionen freigegeben. Banking-App-Scans bleiben manuell: eine synthetische finale PDF öffnen bzw. den QR-Code scannen und Empfänger, DE-IBAN, optionale BIC, Betrag sowie Rechnungsnummer gegen den Bankblock prüfen, ohne eine Überweisung auszulösen. Die [Freigabematrix](docs/release-readiness.md) hält Versionen und offene Prüfungen fest.

## Originale, Korrekturen und Zahlungen

Finalisieren sichert den vollständigen Beleg. Spätere Änderungen an Stammdaten,
Konten oder Textbausteinen verändern ihn nicht. Ansicht, Druck, Erinnerung und
Export verwenden dieselbe ausgewählte Version, auch bei leeren historischen
Kontofeldern. Bereits gesicherte Beträge bleiben bei der Rechenumstellung erhalten;
ältere Formate ohne Belegversion sichern zunächst ihren bisherigen Ausgabestand.

In den Rechnungsdetails einen **Korrekturgrund** eingeben und **Korrekturentwurf
erzeugen** wählen. Der Entwurf übernimmt sämtliche Positionen. Gelöschte Kinder
und empfangende Personen ausdrücklich neu zuordnen; bis dahin lässt sich der
Entwurf speichern, aber nicht finalisieren. Historische Abweichungen zuerst mit
dem Ergebnis der Klärung dokumentieren. Die Finalisierung vergibt eine neue Nummer
und ersetzt die aktive Forderung. Das Original bleibt auswählbar und druckbar.

Vorhandene Zahlungen bleiben zunächst beim ursprünglichen Beleg. Unter
**Zahlungszuordnung** den korrigierten Beleg wählen und die Zuordnung begründen.
Die Zahlung wird weder kopiert noch gelöscht; Herkunft, Datum und bisherige
Zuordnungen bleiben sichtbar. Abweichende Beträge erscheinen als Restforderung
oder Überzahlung. Vollzahlungen haben einen bestätigten Zahlungstag; neue
Teilzahlungen und Erstattungen bleiben optionales Paket 14. Bei ungeklärten Zuordnungen oder
Restbeträgen ist die bisherige Erinnerung über den vollen Betrag gesperrt.

Finalisierte Belege lassen sich **archivieren** und über **Archivierte anzeigen**
wieder aufrufen. Archivierung ändert keine Forderung und gibt keine Nummer frei.
Nur echte Entwürfe können gelöscht werden. Die Aktivitätsliste ist auf 200 Einträge
begrenzt; vollständige Versionen, Zahlungszuordnungen und vorhandene historische
Snapshot-Differenzen werden unabhängig davon aufbewahrt. JSON-Backups enthalten
alle Versionen; CSV kennzeichnet ersetzte und archivierte Belege ausdrücklich.
Komplett-Zurücksetzen ist nur ohne ausgestellte Belege, historische Dokumentation
und reservierte Nummern verfügbar; dies ist bewusster Produktumfang.

## Backup und Restore

Unter **Einstellungen → Backup & Import** sind JSON-Export, Wiederherstellung,
vorheriger lokaler Stand und Wiederherstellungsarchiv erreichbar. Der Export
enthält den zuletzt bestätigten Stand. Eine Wiederherstellung wird nach Vorschau
bestätigt, bewahrt Originaldaten/Berichte und wird als neue Revision gespeichert.
Bekannte ausgestellte Belege und reservierte Nummern bleiben geschützt.

**Ordner wählen** liest zuerst vorhandene Sicherungen und zeigt Bestand und
Konflikte. Ein leerer Browser ersetzt keine bestehende Sicherung. Altbackups ohne
Bestands-ID brauchen eine ausdrückliche Zuordnung durch Wiederherstellung.
**Jetzt sichern** und automatische Sicherung verwenden denselben Schreibdienst.
Jeder neue Stand erhält eine neue Datei `riffrechnung-v4-<Revision>-<ID>.json`;
die bisherigen gültigen Dateien bleiben erhalten. Keine automatische Bereinigung.

Die Anzeige unterscheidet ungespeicherte Änderungen, lokalen Schreibabschluss,
ausstehendes Datei-Backup, Konflikt und Fehler – auch mobil. Gültige Einstellungen
werden beim Ansichtswechsel übernommen. Asynchrones Datei-Backup benötigt den
offenen Tab; sein Abschluss wird nicht beim Schließen versprochen. Bei entzogenem
Zugriff **Jetzt sichern** zur erneuten Freigabe verwenden oder JSON exportieren.

Ordnerzugriff benötigt File System Access samt vollständiger Ordner- und
Berechtigungsprüfung. Fehlt eine benötigte Dateifunktion, bleibt der JSON-Export.
Ohne Web Locks ist auch lokales Schreiben gesperrt. Locks koordinieren Tabs im
selben Browserprofil, keine weiteren Geräte oder Synchronisationsprogramme.
Widersprüchliche Dateien bleiben erhalten und sperren den Ordner; dann Sicherungen
prüfen und einen anderen Zielort wählen. Eine Cloud-Anbindung enthält die App nicht.

Die **Demo** läuft ausschließlich im Arbeitsspeicher einer eigenen Sitzung.
Einstieg/Ausstieg erhalten den realen Bestand, seine Ordnerverbindung und Dateien.
Demo-Änderungen gehen beim Verlassen verloren.

JSON-Export, Import in ein leeres Profil und Reload ohne Ordner-API werden in
Chromium 153.0.8010.12, Firefox 155.0 und Playwright-WebKit 26.6 unter Linux
geprüft. WebKit/Linux ist kein Nachweis für Safari auf macOS/iOS. Der dort
vorgesehene JSON-Fallback bleibt eine offene native Abnahme.

Vor einem Formatumstieg eine unabhängige Originaldatei außerhalb des automatischen
Backup-Ordners sichern. Rückkehr zu früherem Code nur mit dieser passenden alten
Datei in einem getrennten Profil; neue Formate werden nicht zurückkonvertiert.
Die geprüfte [Umstiegs- und Rückkehranleitung](docs/release-readiness.md#umstieg-und-rückkehr)
beschreibt Migration, Wiederholung nach Fehlern und Kontrolle nach Reload.

## Datenschutz und Grenzen

- Rechnungen, Einstellungen und Historie liegen im verwendeten Browserprofil. Ein Geräteschutz, ein gesperrtes Benutzerkonto und ein geschütztes Browserprofil sind deshalb Teil des Schutzmodells. Inkognito-Modus, das Löschen von Website-Daten oder ein Geräteverlust können lokale Daten entfernen.
- Browser-Speicher ist an den **Origin** (Schema, Host und Port), nicht an den Repository-Unterpfad gebunden. Die konfigurierte GitHub-Pages-Auslieferung hat ohne `CNAME` den Origin `https://sl3ndrr.github.io`; RiffRechnung liegt darunter unter `/RiffRechnung/`. Andere dort ausgelieferte Projekte teilen den Origin und sind kein getrenntes Speicher-Sicherheitsgebiet. Die im Eigentümerkonto vorhandenen weiteren Repositories belegen nicht, dass sie auch dort ausgeliefert werden; das konnte aus der Repository-Konfiguration nicht abschließend festgestellt werden. Wenn nicht vertrauenswürdige Anwendungen unter diesem Origin betrieben werden sollen, ist ein separater Origin eine Betriebsoption.
- JSON-Exports und Ordner-Backups sind normale Klartextdateien. Sie enthalten Familien-/Kontaktangaben, Rechnungen, Einstellungen, Freitexte und Notizen, vollständige Belegversionen sowie Änderungs- und Zahlungszuordnungshistorie. Sicherungen nur geschützt ablegen und vor dem Weitergeben prüfen.
- Die App nutzt keine Cloud-API. Wird ein lokal synchronisierter Ordner gewählt, kann dessen installierte Desktop-Synchronisation die Klartextdateien an den jeweiligen Dienst übertragen; dessen Datenschutz- und Freigaberegeln gelten zusätzlich.
- Rechnungsnummern sind innerhalb jedes Kinderkennzeichens monoton und eindeutig. Das erste angelegte Kind erhält `a`, das zweite `b`; eine gemeinsame Rechnung für beide verwendet `a+b`. `ab` kann dagegen das Kennzeichen eines einzelnen später angelegten Kindes sein. Parallel genutzte Browserprofile/Geräte teilen keinen Nummernkreis; für einen lückenlosen gemeinsamen Nummernkreis darf nur ein führender Datenbestand verwendet werden.
- Finalisierte Rechnungen bleiben erhalten; inhaltliche Änderungen erzeugen Korrekturen. Archivierung und Zahlungs-/Versandverwaltung ändern den gesicherten Inhalt nicht. Originalnummern und frühere Registereinträge bleiben dauerhaft reserviert.
- Ein migrierter Beleg ist nur der älteste verfügbare Stand. Fehlende frühere Versionen werden nicht rekonstruiert. Lokale Versionierung garantiert weder Manipulationssicherheit noch automatische GoBD-Konformität.
- Für neue Rechnungen ist nach ausdrücklicher Produktentscheidung das Kleinunternehmerprofil nach § 19 UStG vorgesehen. Vor Finalisierung sind vollständige Aussteller-/Empfängeranschriften und eine ausdrücklich typisierte Steuerkennung erforderlich. Andere Steuerprofile oder Ausnahmen werden nicht automatisch angenommen. Die App ersetzt keine Steuer- oder Rechtsberatung.

## Bewusst nicht enthalten

- kein automatischer E-Mail-Versand und keine Zugangsdaten in der App; Erinnerungen werden nur an das lokale E-Mail-Programm übergeben
- keine Mehrsprachigkeit, da der aktuelle Einsatz deutschsprachig ist und ein schlankes, zuverlässiges Rechnungs-Template Vorrang hat
- keine Mehrgeräte-Synchronisation oder kollaborative Bearbeitung, da dies ohne Backend nicht konfliktfrei und sicher möglich wäre


### Datenprüfung und kontrollierter Formatumstieg

Das Datenschema ist Format 7; die Speicherung verwendet weiterhin den versionierten
Umschlag aus Paket 03 (Speicherprotokoll 4). Entwürfe können unvollständig sein; ungültige
Preise, Mengen, IDs oder Referenzen werden nicht gespeichert. Nur deutsche IBANs
sind für neue/geänderte Kontoeinstellungen und neue Finalisierungen zugelassen.

Beim Import und im Wiederherstellungsmodus lassen sich Formate 2 bis 6 prüfen. Bekannte
Empfängerkopien mit doppelten Positions-IDs erhalten eine Reparaturvorschau,
separate Exporte und einen Bericht mit Originaldaten. Die bestätigte Übernahme
verwendet denselben abgesicherten Schreibdienst wie normale Änderungen.
Der Migrationsbericht dokumentiert die jetzt gesicherten Belegstände, Betragsquellen,
Abweichungen und übernommenen Verwaltungs-/Zahlungsangaben. Vorhandene Registerbeträge
haben Vorrang; die abweichende bisherige Rechnungssumme bleibt ebenfalls erhalten.

Beim Umstieg **alle alten Tabs schließen**, Original exportieren und die Vorschau
bestätigen. Paket 07 verwendet die Speicher-Schlüssel und Handle-Datenbank aus
Paket 03 weiter. Alte Rohtexte bleiben im Wiederherstellungsarchiv erhalten. Ändert ein alter
Tab ihn später, erscheint ein Konflikt; beide Stände separat exportieren und in
einem getrennten aktuellen Profil prüfen. Unbekannte neuere Formate bleiben
schreibgeschützt. Für alten Anwendungscode nur die Originaldatei in einem eigenen
Profil verwenden. Andere Schäden werden nicht automatisch korrigiert.

Die unterstützte E-Mail-Regel und die genauen Format-/Reparaturgrenzen stehen in
[Produktentscheidungen](docs/product-decisions.md#paket-02--speicherbare-zustände-und-reparaturen).


Die Browserprüfung nutzt ausschließlich synthetische Daten. Sie baut zusätzlich
den historischen Commit `ba7857fd9180fa392c42a0235643e478e5077ee5` als temporäre
Testseite unter derselben Origin, um einen wirklich geöffneten alten Tab zu prüfen.
`npm run test:browser` benötigt dafür Git, tar und bei fehlendem Commit lesenden
GitHub-Zugriff. Die Testseite wird anschließend entfernt und nicht ausgeliefert.
Dateihandles werden in einem isolierten dauerhaften Chromium-Profil mit echtem
OPFS/IndexedDB geprüft; native Ordnerdialoge und OS-Rechte bleiben separate Abnahmen.
Paket 04 prüft zusätzlich echte Chromium-PDFs anhand ihres Textinhalts. Synthetische
PDFs und Browsernachweise stehen sieben Tage als CI-Artefakt `browser-evidence`
bereit. Native Druckdialoge, Drucklayout-Matrix und Banking-App-Scans sind separate
Abnahmen; die automatisierte PDF-Prüfung ersetzt sie nicht.


### Dezimalbeträge und Kalenderdaten (Paket 05)

Neue Positionen werden vor der Multiplikation dezimal exakt ausgewertet,
positionsweise kaufmännisch auf Cent gerundet und als Centbeträge addiert.
Mengen erlauben 0,01–99,99 mit zwei Nachkommastellen; Untercentpreise bleiben
verlustfrei erhalten. Neue Rechnungen sind auf 999.999.999,99 EUR begrenzt.
Schema 5 bewahrt bereits gesicherte Originalbeträge. Geänderte Altentwurfsbeträge
werden beim Umstieg und im Editor angezeigt. Vor Übernahme bleibt das Original
mit Migrationsbericht im Wiederherstellungsarchiv; alte Tabs vorher schließen.
Rechnungs- und Leistungstage verwenden lokale Kalenderdaten; Monatskopien
begrenzen etwa den 31. Januar auf den 28./29. Februar. Details und Nachweise:
[Produktentscheidungen](docs/product-decisions.md), [Umsetzungsstatus](docs/implementation-status.md).


### Rechnungsprofil und deutsche IBAN (Paket 07)

Unvollständige Einstellungen und Rechnungsentwürfe sind speicherbar. Finalisieren
ist erst mit vollständigem Kleinunternehmerprofil, Aussteller- und
Empfängeranschriften, einer als Steuernummer, USt-IdNr. oder
Kleinunternehmer-Identifikationsnummer ausgewählten Angabe sowie gültigen
deutschen Zahlungsdaten möglich. Fehlende Angaben werden feldbezogen angezeigt.

Schema 6 ergänzt Profil und Steuerkennung in den aktuellen Einstellungen und in
neuen Snapshots. Bei der Migration aus Format 2–5 bleibt die Steuerkennung leer
und sperrt neue Finalisierungen bis zur bewussten Eingabe. Historische Snapshots
werden nicht ergänzt; auch eine dort leere BIC bleibt leer. Grundlagen und
Produktannahmen stehen in [Produktentscheidungen](docs/product-decisions.md).
