# RiffRechnung

RiffRechnung verwaltet Privatrechnungen für Unterricht lokal im Browser. Die Oberfläche startet im **Dashboard** und bietet **Rechnungen**, **Personen** und **Einstellungen**. Der Demo-Einstieg verwendet Beispieldaten getrennt vom echten Bestand.

## Einrichten und Personen anlegen

1. Unter **Einstellungen** Rechnungsstellername, Kontoinhaber und gültige deutsche IBAN eintragen. Anschrift, Kontaktangaben, Bankname und BIC sind optional; eine eingetragene BIC muss gültig sein. Standardpreise und Zahlungsziel nach Bedarf setzen.
2. Mit **Jetzt speichern** bestätigen. Daten bleiben im selben Browserprofil unter derselben Webadresse; sie sind nicht verschlüsselt. Gerät, Profil und Sicherungen müssen geschützt werden.
3. Unter **Personen** Erziehungsberechtigte anlegen und Lernende zuordnen. Eine gemeinsame Rechnung kann beispielsweise ein oder zwei gemeinsame Erziehungsberechtigte haben. Erwachsene Lernende wählen **Zahlt selbst** und hinterlegen eigene Kontaktangaben.

Anschriften dürfen unvollständig sein. Personen stehen A–Z; Suche und Aktivfilter bleiben verfügbar. Lernende erhalten bleibende Kennungen in Anlagereihenfolge: `a`, `b`, …, `z`, `aa`, `ab`, … . Umbenennen oder Deaktivieren verschiebt sie nicht.
**Hell · System · Dunkel** lässt sich oben rechts oder unter **Einstellungen → Darstellung** sofort wechseln; ungespeicherte Formularwerte bleiben erhalten. **System** folgt der Gerätepräferenz, im Demo-Modus gilt die Auswahl nur für die Sitzung. Das Rechnungs-PDF bleibt hell. **Bewegungen reduzieren** und die Gerätepräferenz schalten Animationen ab.

## Dashboard

**Bezahlt** und das Monatsdiagramm zählen tatsächliche Zahlungseingänge nach bestätigtem Zahlungstag, einschließlich Teilzahlungen und Zahlungen zu ersetzten oder archivierten Belegen. Unbekannte Zahlungstage stehen separat. Die Jahreswahl verändert nur diese Zahlungseingänge und das Diagramm.
**Offen** summiert Restbeträge aktiver, nicht archivierter finaler Ansprüche; ersetzte Originale zählen nicht zusätzlich, Korrekturentwürfe ersetzen den Anspruch noch nicht. **Entwürfe** zählt alle nicht finalisierten Rechnungen, im Betrag nur berechenbare. Die Personenzähler umfassen alle gespeicherten Personen und nennen aktive Lernende zusätzlich.
Offene Rechnungen lassen sich direkt öffnen, überfällige stehen zuerst. Bei mehr als acht führt **Alle in Rechnungen anzeigen** zur vollständigen Liste mit **Noch nicht gezahlt**. Im Echtmodus erinnert das Dashboard bei vorhandenen Rechnungen an den JSON-Export, wenn ein Backup fehlt oder mehr als 30 Tage zurückliegt.

## Rechnung erstellen und Nummern verstehen

Unter **Rechnungen → Neue Rechnung** Lernende und Empfänger auswählen. Jeder Empfänger muss allen ausgewählten Lernenden zugeordnet sein. Datum, Fälligkeit und Positionen mit Leistungsdatum, Beschreibung, Menge, Einheit und Preis prüfen. Solo-/Duo-Unterricht setzt den passenden Standardpreis; Positionen bleiben bearbeitbar.
Ein **Rechnungshinweis** ist optional. Die Ausgabe enthält fest „Hiermit stelle ich die folgenden Leistungen in Rechnung.“ und „Privatrechnung“. **Als Entwurf speichern** hält den bearbeitbaren Stand fest. **Finalisieren** prüft die Angaben, vergibt die Nummer und sichert Beträge, Empfänger, Anschriften, Konto und Leistungsdaten. Neue Positionsbeträge werden einzeln kaufmännisch auf Cent gerundet und danach summiert; der Leistungszeitraum folgt den Positionsdaten.

**Duplizieren** erzeugt einen bearbeitbaren Entwurf. Beim Lernendenwechsel bleiben Positionen und Betrag in beiden Auswahlreihenfolgen erhalten; eindeutige Ersatzpersonen übernehmen nur betroffene Zuordnungen. Änderungen an Empfängern werden gemeldet. Ohne eindeutigen Ersatz musst du die Positionen vor Speichern/Finalisieren ausdrücklich neu zuordnen. Löschen erfolgt nur über den Papierkorb. Rechnungsdatum mit automatischer Fälligkeit und Rechnungshinweis bleiben bearbeitbar.

Nummern folgen **Jahr–Folge–Personenkennung**:

| Kreis | Beispiel | Bedeutung |
| --- | --- | --- |
| Person a | `2026-0001-a` | erste jährliche Folge für a |
| Person b | `2026-0001-b` | eigener jährlicher Zähler für b |
| Kombination a+b | `2026-0001-a+b` | eigener jährlicher Zähler für diese Kombination |

Auswahlreihenfolge und Empfängerzahl ändern die Kennung nicht. `ab` ist eine einzelne Person, `a+b` eine Kombination. Neue Jahreskreise beginnen bei 1; übernommene Mindeststände und reservierte Nummern können die Folge erhöhen. Historische Nummern werden weder umgeschrieben noch erneut vergeben.

## PDF, Zahlung und Korrektur

In den Details **PDF / Drucken** wählen und im Browser speichern oder drucken. Entwürfe tragen ein Wasserzeichen. Leistungen werden nach Kalendermonaten mit ursprünglicher Reihenfolge innerhalb des Monats ausgegeben; mehrere Monate erhalten Zwischensummen, fehlende/ungültige Daten eine letzte Gruppe. Bei widersprüchlichen historischen Beträgen oder unsicherer Gruppensumme bleibt die Ausgabe flach in Originalreihenfolge mit gesicherten Beträgen.
Bei zwei Empfängern erscheinen beide Namen und deren eigene vorhandene Anschriften, auch bei identischen Adressen. Die gemeinsame Rechnung hat einen Gesamtbetrag. Finale Ausgaben und GiroCode verwenden gesicherte Belegdaten; spätere Stammdatenänderungen verändern das Original nicht, historische Lücken werden nicht mit heutigen Angaben gefüllt.
Der GiroCode enthält Konto, Betrag und Rechnungsnummer. Bei QR-Fehlern ist Druck ohne GiroCode ausdrücklich zu bestätigen. Gescannte Angaben vor einer Überweisung in der Banking-App prüfen. Automatisierte PDF-Prüfungen laufen in Chromium; weitere Grenzen stehen unter [Technik und manueller Prüfung](docs/technical.md#manuelle-prüfung).

Zum Bezahlen **Tatsächlichen Zahlungstag** eintragen und **Vollzahlung erfassen** wählen; **Zahlungstag korrigieren** berichtigt einen bestätigten Tag. Unbekannte historische Tage bleiben bis zur Bestätigung unbekannt. Zahlungszuordnungen bestimmen offen/bezahlt, Fälligkeit und offener Anspruch bestimmen überfällig. Die Liste steht nach Rechnungsdatum, neueste zuerst, mit Suche und Statusfiltern.
Nach Entwurfs-/Personenlöschung oder Archivwechsel ist **Rückgängig** einmalig für **10 Sekunden** verfügbar. Hover/Fokus pausieren die Frist; höchstens drei Meldungen erscheinen. Andere Änderungen bleiben erhalten, widersprüchliche Zuordnungen verhindern die Umkehr ohne Bestandsänderung. Schließen, Reload oder Verlassen der Demo beendet die Möglichkeit. Finalisieren, Zahlungen, Wiederherstellung und Zurücksetzen haben keinen solchen Rückgängig-Weg; Bewegungsabschaltung ändert die Frist nicht.
Für Änderungen an finalen Belegen **Korrektur** mit Begründung anlegen und den Entwurf finalisieren. Original und Nummer bleiben erhalten; die Korrektur erhält einen neuen Beleg und eine neue Nummer. Zahlungen werden nicht automatisch übertragen. Historie, Klärung und Zahlungszuordnung stehen unter **Details**.

## JSON sichern und wiederherstellen

**Einstellungen → Backup & Import → JSON exportieren** lädt ausschließlich den gespeicherten Stand herunter. Die Klartextdatei enthält Personen, Rechnungshinweise, Belege, Einstellungen, Zahlungen und Historie. Geschützt außerhalb des Browserprofils aufbewahren; es gibt kein automatisches Dateibackup.
**JSON importieren** prüft zunächst ohne Übernahme. Vorschau lesen und Wiederherstellung ausdrücklich bestätigen. Bekannte Originale, Zahlungen, Kennungen und Nummernreservierungen bleiben geschützt; widersprüchliche Bestände lassen sich nicht frei zusammenführen. Alte Tabs vor dem Umstieg schließen. Fehlgeschlagene Importe verändern den Ausgangsbestand nicht.
Bei Speicher-/Tabkonflikten der Meldung folgen und neu laden. Im Wiederherstellungsmodus können Rohdaten gesichert und vorherige Stände geprüft werden. **Wiederherstellungsarchiv exportieren** ist ein separater technischer Nachweisexport mit [bekannten Bereinigungslücken](docs/technical.md#bekannte-bereinigungslücken).
**Daten zurücksetzen** entfernt nach ausdrücklicher Bestätigung alle bekannten lokalen App-Daten einschließlich Wiederherstellungskopien. Vorher ein JSON-Backup exportieren; in der Demo bleibt der echte Bestand unangetastet.

[Technik, Migration und Prüfungen](docs/technical.md) · [Historische Nachweise](docs/evidence.md) · [Release-Notizen](docs/releases.md)
