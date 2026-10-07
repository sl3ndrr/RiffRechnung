# RiffRechnung Designsystem

Die Gestaltung folgt Material 3 Expressive: getönte Flächen, betonte Typografie,
Formwechsel und getrennte Bewegung für räumliche Eigenschaften und Effekte.
Referenz: https://m3.material.io/ (Expressive, Motion physics, Shape library).
Die Palette und die CSS-Kurven sind Anpassungen für diese App, keine Kopie
offizieller Android-Tokens.

## Tokens und Kontrast

`primary` bleibt im hellen Theme #1e5aa0. Die fünf `surface-container`-Stufen
trennen Bereiche über kühle Blautönungen. `on-*` bezeichnet die zugehörige
Textfarbe. `outline` grenzt Bedienelemente ab; `outline-variant` dient nur der
dezenten Trennung. Sekundär (Grün) und Tertiär (Violett) besitzen eigene `on-*`- und Container-Tokens sowie ruhige `*-surface`-Stufen. Offene Beträge verwenden Blau, bezahlte Beträge Grün und Entwürfe Violett. Erfolg, Warnung und Fehler besitzen eigene Container.
Status wird zusätzlich durch Icon und Text vermittelt. `theme-color` entspricht
der jeweiligen `surface`; die Shell liest dafür den CSS-Token.

## Formen und Schrift

Radien: 8, 12, 16, 20, 28 px und vollrund. Karten verwenden 20 px, Dialoge
28 px, Felder 16 px. Navigation, Suchfeld und Buttons sind Pills; gedrückte
Buttons und ausgewählte Toggles wechseln auf 16 px. Nur die drei großen
Dashboardkarten nutzen unterschiedliche dekorative Iconformen.

Inter Variable wird lokal geladen. Die kleine `type-*`-Skala reicht von
12-px-Hilfstext über 14/15-px-Labels und Fließtext bis zu 32–40-px-Seitentiteln
und 36–44-px-Kennzahlen. Betonte Werte verwenden Gewicht 700 und tabellarische
Ziffern. Schatten sind auf Menüs, Toasts und den dezenten Theme-Thumb beschränkt; Dialoge erhalten
Tiefe durch den Scrim und die getönte Fläche.

## Bewegung und Bedienung

Die vorhandenen Dauern und Hooks bleiben bestehen. `ease-spatial` ist eine
CSS-`linear()`-Annäherung mit maximal 8 % Überschwingen; `ease-effects` bleibt
monoton. Beide haben einen `cubic-bezier()`-Fallback. Bei kombinierten
Eintritten werden Transformation und Deckkraft separat animiert. Die Systemeinstellung
und `.reduce-motion` deaktivieren alle Bewegungen und Overlay-Schatten.
Toasts bleiben neben den Rechnungsdetails frei von deren Aktionsbuttons.
Fokus ist 3 px breit;
mobile Touchziele sind mindestens 44 px. Buttonhöhen: S 40, M 48, L 56 px;
S wächst mobil auf 44 px. Pro Ansicht gibt es eine hervorgehobene Hauptaktion,
im leeren Dashboard bleibt die vorhandene Einrichtung mit „Person anlegen“.

Der Topbar-Theme-Schalter besteht aus drei runden 44 × 44-px-Iconsegmenten (Hell/System/Dunkel), 132 px Innenbreite, 4 px Padding und 1 px Rand. Der 44-px-Thumb verwendet `primary-container`, einen `primary`-Rand und `0 1px 2px rgb(0 0 0 / .12)`. Nur die zugänglichen Namen und Label-Titel bleiben; die Einstellungskarten behalten ihre Darstellung. Aktive Icons (`on-primary-container` auf `primary-container`) und inaktive Icons (`on-surface-variant` auf `surface-container-high`) übertreffen 3:1 in beiden Themes; die bisherigen Tokens des Schalters bleiben unverändert.

`spring-spatial-fast` und `spring-spatial` ergänzen die bisherigen Kurven mit den Federn des Prüfungsdashboards, jeweils mit `linear()` und Bezier-Fallback. Räumliche Bewegung darf überschwingen, Farbe und Deckkraft bleiben monoton. `dur-spatial-fast` (350 ms) bewegt den Thumb um 0/44/88 px und federt Icons und Segment-Interaktion; der Thumb-Squash animiert separat `scale` und `border-radius`. Diese Formanimation ist eine bewusste Ausnahme zur sonst auf Transform/Deckkraft beschränkten Bewegung. `dur-spatial-slow` (570 ms) steuert den Kreis-Reveal der neuen Root-Momentaufnahme ab Thumb-/Kartenmitte bei einem aufgelösten Farbwechsel. Ohne View Transitions und bei OS-Wechseln bleibt der 250-ms-Farb-Fade erhalten. Gleiche aufgelöste Farbe bewegt nur den Schalter. Beide Bewegungspräferenzen deaktivieren Reveal und Squash und setzen alle Dauern auf exakt 0 ms. Papier und Druck bleiben unabhängig und ohne Animation.

## Ansichten und Dokument

Offene Rechnungen und Personenlisten bilden segmentierte Tonalflächen mit
2 px Abstand. Die Rechnungsliste bleibt eine Tabelle. Im Dashboard bleiben
die vorhandenen Personenzähler als kompakte ergänzende Zeile erhalten;
die Geldwerte stammen unverändert aus `dashboardStats`. Native Auswahllisten
bleiben erhalten. Sie sind von der gemeinsamen Fokus-Translation der Textfelder
ausgenommen: ein animiert verschobener Select-Anker kann die separate native
Popup-Fläche fehlerhaft neu zeichnen. Optionen erben das aufgelöste `color-scheme`
und erhalten die Theme-Flächenfarbe. Es gibt kein `backdrop-filter` in der App.

Die Rechnungsliste gruppiert nach Rechnungsdatum (unabhängig vom Leistungszeitraum).
Jeder Monatskopf zeigt Anzahl und Summe der gefilterten Belege. Tabellen- und
Monatsköpfe bleiben im begrenzten, per Tastatur scrollbaren Listenbereich sichtbar.
Alle Monate starten offen; ein- und ausgeklappte Monate behalten ihren Zustand
bei Suche und Filterwechsel. „Ältere Monate einklappen“ lässt den aktuellen Monat
offen. Die Statuschips bilden Facetten: ihre Zähler berücksichtigen Suche, Jahr
und Archivfilter, der ausgewählte Chip bestimmt die Ergebnisliste. „Offen“ nutzt
die bestehende aktive Forderungs-/Restbetragslogik; „Versendet“ und „Überfällig“
nutzen weiterhin `effectiveStatus`. Eingeklappte Belege sind in Monats- und
Ergebniszählern enthalten.

Der vollständige lokale Reset ist ein eigener, ausdrücklich bestätigter Pfad in
`StorageSession`, getrennt von den unveränderten Schutzregeln für Edit/Import und
`resetUnissuedState`. Er nutzt dieselbe Queue, Web Lock, Konfliktprüfung und
Rollback-Grenze. Er entfernt ausschließlich die bekannten App-Speicherschlüssel
(einschließlich Altbestand, Vorgängerversion, Wiederherstellungsarchive und
Exportzeitpunkt) und startet eine neue Dataset-Identität beim nächsten Speichern.
Im Demo-Modus bleibt echter Storage unangetastet. Der Warndialog nutzt die
bestehende Modal-Fokusfalle, startet auf Abbrechen und verlangt eine Checkbox.
Der vorhandene JSON-Export hält den Dialog offen und setzt die Bestätigung zurück.

Die Rechnung besitzt unabhängige `invoice-*`-Tokens, bleibt hell und ohne
Animation. Einzeilige Positionen verwenden 3,5 pt Padding statt 6 pt und
eine 0,5-pt-Linie statt der 2,5-pt-Rahmen. Monatsköpfe sind schmale Bänder;
Hilfszeilen sind verborgen. Seitenränder, Wiederholung des Tabellenkopfs,
Umbruchschutz, Wasserzeichen, Zahlungsdaten und QR-Code bleiben erhalten.
Die kleine Endsumme besitzt einen kräftigen Rahmen und einen monochromen
Fallback. In einem realen Druckdialog sind zusätzlich Graustufen und die
Option für Hintergrundgrafiken zu prüfen.

## Prüfung

`design-evidence.spec.ts` erzeugt 16 Playwright-Screenshots: Dashboard,
Rechnungsliste, Editor und Einstellungen bei 1440/390 px in Hell/Dunkel.
Die bestehende PDF-Suite prüft die unterschiedlichen Rechnungsszenarien
einschließlich mehrseitiger Ausgabe und unveränderter Daten. Bilder und PDFs
liegen ausschließlich in den CI-Artefakten, nicht im Repository.



`expressive-workspace.spec.ts` prüft den Reset mit ausgestellten Belegen,
Backup-Download, Fokusfalle, Escape, Bestätigung und Reload sowie Monatsgruppen,
Facettenzähler, Sticky-Köpfe und unverformte native Dropdown-Anker in Hell/Dunkel
bei 1440/390 px. Die Token-Paare für normalen Text erreichen mindestens 5,26:1
(hell) bzw. 5,38:1 (dunkel). Native Popup-Darstellung muss zusätzlich im betroffenen
Browser mit Mausöffnung, Pfeilen, Enter, Escape und Buchstabensuche geprüft werden.
