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
- automatisch gebündeltes Speichern aller Einstellungen
- JSON-Export/-Import sowie optionales automatisches Backup in einen lokalen Ordner

## Tech-Stack

**Vite + React + TypeScript** ist hier bewusst schlanker als ein Full-Stack-Framework: GitHub Pages liefert ausschließlich statische Dateien aus, React eignet sich gut für den zustandsreichen Rechnungseditor, und TypeScript schützt das Daten- und Backup-Format. Die Inter-Schrift (`@fontsource-variable/inter`), Lucide-Symbole und die QR-Bibliothek werden beim Build lokal gebündelt. Zur Laufzeit werden keine CDN-Ressourcen geladen.

Die Daten liegen in `localStorage`; nur die optionale Referenz auf einen freigegebenen Backup-Ordner wird über IndexedDB gespeichert. Es werden keine personenbezogenen Daten automatisch an einen Dienst übertragen.

## Lokal starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev
```

Produktionsprüfung:

```bash
npm run lint
npm test
npm run build
npm run preview
```

## Auf GitHub Pages veröffentlichen

1. Dieses Verzeichnis in ein GitHub-Repository übernehmen und auf den Branch `main` pushen.
2. Im Repository unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** wählen.
3. Der Workflow `.github/workflows/deploy.yml` installiert, baut und veröffentlicht die App bei jedem Push auf `main`.

Vite verwendet für den Produktions-Build relative Asset-Pfade. Dadurch funktioniert die App sowohl unter `username.github.io/repository/` als auch mit einer eigenen Domain, ohne den Repository-Namen im Code einzutragen.

## PDF / Drucken

„PDF / Drucken“ öffnet den nativen Druckdialog des Browsers. Dort **Als PDF speichern** wählen. Das Druck-CSS setzt A4, 20 mm Seitenränder, Inter-Typografie, den blau-grauen Briefkopf, Tabellenfarben, Bankdaten und eine gemeinsame Fußzeile aus Rechtstext und Seitenzahl um. Entwürfe tragen ein Wasserzeichen; auf der zweiten und jeder weiteren Seite steht zusätzlich die Rechnungsnummer. Der Browser erzeugt dabei durchsuchbaren Text statt eines gerasterten Screenshots. Für die dynamischen Seitenränder wird ein aktueller Chromium-Browser ab Version 131 (zum Beispiel Chrome oder Edge) empfohlen.

Der GiroCode füllt Empfänger, IBAN, Betrag und Rechnungsnummer in unterstützten Banking-Apps aus. Der EPC-Standard selbst kann keine Echtzeitüberweisung erzwingen; diese Option wird – sofern verfügbar – in der Banking-App ausgewählt.

## Backup und Restore

Unter **Einstellungen → Backup & Import** gibt es immer einen vollständigen JSON-Export und -Import. Vor einem Import wird der Inhalt validiert und das vollständige Ersetzen des lokalen Stands bestätigt.

Optional kann die App über die **File System Access API** einen lokalen Ordner auswählen. Nach der einmaligen Freigabe schreibt sie dort bei Änderungen die Datei `riffrechnung-backup.json`; „Backup jetzt“ stößt dies zusätzlich manuell an. Diese API ist derzeit vor allem in Chromium-Browsern wie Chrome und Edge verfügbar. Firefox und Safari unterstützen die Ordnerauswahl nicht vollständig – dort bleibt der normale JSON-Download.

Das ist **keine Google-Drive-, Dropbox- oder sonstige Cloud-Integration**. Wenn der gewählte Ordner zufällig von einer Desktop-App synchronisiert wird, lädt ausschließlich diese installierte Software die Datei später hoch. Die Web-App kennt den Cloud-Dienst nicht und kommuniziert nicht mit dessen Servern.

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
