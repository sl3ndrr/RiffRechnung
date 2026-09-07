# RiffRechnung – lokale Rechnungsverwaltung

Eine vollständig clientseitige Web-App für Rechnungen rund um Gitarrenunterricht. Sie läuft als statische Vite-App auf GitHub Pages; es gibt weder Server noch Datenbank, Benutzerkonto, Tracking oder externe API-Aufrufe.

## Funktionsumfang

- Kinder und mehrere Erziehungsberechtigte verwalten, filtern, sortieren und miteinander verknüpfen
- gemeinsame Rechnung oder je Empfänger:in eine eigenständige Rechnung erstellen
- mehrere Kinder und automatisch berechnete Zwischensummen auf einer Rechnung
- frei definierbare Positionen, Zahlungsziel und Textbausteine
- Entwurf, versendet, bezahlt und automatisch erkanntes „überfällig“; finalisierte Rechnungen können kontrolliert in einen neuen Entwurf zurückversetzt werden
- konfigurierbarer Nummernkreis mit dauerhaftem Kinderkennzeichen (`a`, `b`, `c` …); jedes Kind bzw. jede Kindkombination zählt getrennt und Nummern werden erst bei Finalisierung vergeben
- eingefrorener Adress-/Kontostand als Snapshot auf finalisierten Rechnungen; kontrolliertes späteres Bearbeiten wird protokolliert
- A4-Druckansicht mit Entwurfswasserzeichen, gemeinsamer Rechtstext-/Seitenzahl-Fußzeile und Rechnungsnummer auf Folgeseiten
- clientseitig erzeugter EPC-GiroCode (EPC069-12 / Version 002) für SEPA-Überweisungen
- Dashboard, Volltextsuche, Filter, sortierbare Rechnungslisten, Zahlungserinnerung per `mailto:`, Duplizieren wiederkehrender Rechnungen und CSV-Jahresübersicht
- System-/Light-/Dark-Mode, responsive Desktop-/Tablet-/Smartphone-Oberfläche und reduzierte Bewegung
- bestätigtes lokales Speichern gültiger Einstellungen, auch beim sofortigen Ansichtswechsel
- JSON-Export/-Import sowie optionales automatisches Backup in einen lokalen Ordner

## Tech-Stack

**Vite + React + TypeScript** ist hier bewusst schlanker als ein Full-Stack-Framework: GitHub Pages liefert ausschließlich statische Dateien aus, React eignet sich gut für den zustandsreichen Rechnungseditor, und TypeScript schützt das Daten- und Backup-Format. Die Inter-Schrift (`@fontsource-variable/inter`), Lucide-Symbole und die QR-Bibliothek werden beim Build lokal gebündelt. Zur Laufzeit werden keine CDN-Ressourcen geladen.

Die Daten liegen in `localStorage`; nur die optionale Referenz auf einen freigegebenen Backup-Ordner wird über IndexedDB gespeichert. Es werden keine personenbezogenen Daten automatisch an einen Dienst übertragen.

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
npx playwright install --with-deps chromium
npm run test:browser
npm run preview
```

## Auf GitHub Pages veröffentlichen

1. Änderungen als Pull Request gegen `main` prüfen lassen und erst nach Freigabe übernehmen.
2. Im Repository unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** wählen.
3. `.github/workflows/quality.yml` prüft Pull Requests mit Node 22, `npm ci`, Lint, Tests, Typecheck einschließlich Testdateien, Build und echte Chromium-Abläufe.
4. `.github/workflows/deploy.yml` verwendet bei Push auf `main` dieselben Prüfungen. Erst nach deren Erfolg wird das in demselben Lauf erzeugte Artefakt veröffentlicht. Manuelle Läufe anderer Branches veröffentlichen nichts.

Die verpflichtenden Statuschecks müssen zusätzlich in den Branch-Regeln eingerichtet werden; eine Workflow-Datei erzwingt sie nicht. Nachweise, geprüfte Action-Versionen und offene administrative Einstellungen stehen in [docs/quality-gates.md](docs/quality-gates.md); Paketfolge und Produktregeln in [docs/implementation-status.md](docs/implementation-status.md) und [docs/product-decisions.md](docs/product-decisions.md).

Vite verwendet für den Produktions-Build relative Asset-Pfade. Dadurch funktioniert die App sowohl unter `username.github.io/repository/` als auch mit einer eigenen Domain, ohne den Repository-Namen im Code einzutragen.

## PDF / Drucken

„PDF / Drucken“ öffnet den nativen Druckdialog des Browsers. Dort **Als PDF speichern** wählen. Das Druck-CSS setzt A4, 20 mm Seitenränder, Inter-Typografie, den blau-grauen Briefkopf, Tabellenfarben, Bankdaten und eine gemeinsame Fußzeile aus Rechtstext und Seitenzahl um. Entwürfe tragen ein Wasserzeichen; auf der zweiten und jeder weiteren Seite steht zusätzlich die Rechnungsnummer. Der Browser erzeugt dabei durchsuchbaren Text statt eines gerasterten Screenshots. Für die dynamischen Seitenränder wird ein aktueller Chromium-Browser ab Version 131 (zum Beispiel Chrome oder Edge) empfohlen.

Der GiroCode füllt Empfänger, IBAN, Betrag und Rechnungsnummer in unterstützten Banking-Apps aus. Der EPC-Standard selbst kann keine Echtzeitüberweisung erzwingen; diese Option wird – sofern verfügbar – in der Banking-App ausgewählt.

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

## Datenschutz und Grenzen

- Browserdaten sind an das jeweilige Browserprofil und die konkrete GitHub-Pages-Adresse gebunden. Regelmäßige JSON-Backups werden empfohlen.
- Inkognito-Modus, das Löschen von Website-Daten oder ein Geräteverlust können lokale Daten entfernen.
- Rechnungsnummern sind innerhalb jedes Kinderkennzeichens monoton und eindeutig. Das erste angelegte Kind erhält `a`, das zweite `b`; kombinierte Rechnungen verwenden beispielsweise `ab`. Parallel genutzte Browserprofile/Geräte teilen keinen Nummernkreis; für einen lückenlosen gemeinsamen Nummernkreis darf nur ein führender Datenbestand verwendet werden.
- Finalisierte Rechnungen können bearbeitet, im Status geändert, dupliziert, zurück in Entwurf versetzt oder nach Bestätigung gelöscht werden. Beim Zurücksetzen oder Löschen bleibt die bisherige Rechnungsnummer im lokalen Nummernregister dauerhaft reserviert und wird nicht erneut vergeben.
- Voreingestellt ist „Privatrechnung“ mit einem Hinweis auf § 19 UStG ohne Umsatzsteuerausweis. Der auf 120 Zeichen begrenzte Fußzeilen-/Rechtstext ist editierbar und muss zur tatsächlichen steuerlichen Situation passen. Die App ersetzt keine Steuer- oder Rechtsberatung.

## Bewusst nicht enthalten

- kein automatischer E-Mail-Versand und keine Zugangsdaten in der App; Erinnerungen werden nur an das lokale E-Mail-Programm übergeben
- keine Mehrsprachigkeit, da der aktuelle Einsatz deutschsprachig ist und ein schlankes, zuverlässiges Rechnungs-Template Vorrang hat
- keine Mehrgeräte-Synchronisation oder kollaborative Bearbeitung, da dies ohne Backend nicht konfliktfrei und sicher möglich wäre


### Datenprüfung und Altformat-Reparatur (Paket 02)

Das Datenschema bleibt Format 3; die Speicherung verwendet einen versionierten
Umschlag (Speicherprotokoll 4). Entwürfe können unvollständig sein; ungültige
Preise, Mengen, IDs oder Referenzen werden nicht gespeichert. Nur deutsche IBANs
sind für neue/geänderte Kontoeinstellungen und neue Finalisierungen zugelassen.

Beim Import und im Wiederherstellungsmodus lässt sich Format 2 prüfen. Bekannte
Empfängerkopien mit doppelten Positions-IDs erhalten eine Reparaturvorschau,
separate Exporte und einen Bericht mit Originaldaten. Die bestätigte Übernahme
verwendet denselben abgesicherten Schreibdienst wie normale Änderungen.

Beim Umstieg **alle alten Tabs schließen**, Original exportieren und die Vorschau
bestätigen. Neue Schlüssel und eine neue Handle-Datenbank trennen den Bestand von
alten Anwendungsversionen. Der alte Rohtext bleibt unverändert. Ändert ein alter
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
