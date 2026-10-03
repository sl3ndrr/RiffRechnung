# RiffRechnung

RiffRechnung verwaltet Privatrechnungen für Unterricht lokal im Browser.
Die Arbeitsoberfläche startet im **Dashboard** und bietet **Rechnungen**, **Personen** und **Einstellungen**.
Der Demo-Einstieg arbeitet mit Beispieldaten getrennt vom echten Bestand.

Das Dashboard zeigt Zahlungseingänge im gewählten Jahr, offene Restbeträge, Entwürfe und Personenzahlen. Die Monatsansicht verwendet bestätigte Zahlungstage; Zahlungen ohne bestätigten Tag erscheinen als gesonderter Hinweis. Offene Rechnungen stehen mit überfälligen zuerst und lassen sich direkt öffnen. Bei mehr als acht Einträgen führt **Alle in Rechnungen anzeigen** zur vollständigen Liste mit dem Filter **Noch nicht gezahlt**. Eine dezente Erinnerung bietet den JSON-Export an, wenn Rechnungen vorhanden sind und das letzte Backup mehr als 30 Tage zurückliegt oder fehlt.

## Einrichten und Personen anlegen

1. Unter **Einstellungen** den Rechnungsstellernamen, Kontoinhaber und eine gültige deutsche IBAN eintragen. Anschrift, Kontaktangaben, Bankname und BIC sind optional; eine eingetragene BIC muss gültig sein. Standardpreise und Zahlungsziel nach Bedarf setzen.
2. Änderungen mit **Jetzt speichern** bestätigen. Rechnungsdaten bleiben im selben Browserprofil und unter derselben Webadresse. Das Gerät und Browserprofil selbst müssen geschützt werden; die Speicherung ist keine Verschlüsselung.
3. Unter **Personen** Erziehungsberechtigte mit einem Namen anlegen, dann Lernende zuordnen. Für eine gemeinsame Rechnung können beispielsweise ein oder zwei gemeinsame Erziehungsberechtigte ausgewählt werden. Erwachsene Lernende können **Zahlt selbst** verwenden und eigene Kontaktangaben hinterlegen.

Das Farbschema lässt sich oben rechts oder unter **Einstellungen → Darstellung** mit **Hell · System · Dunkel** sofort wechseln. **System** folgt der Gerätepräferenz. Die Auswahl wird sofort gespeichert und verändert keine ungespeicherten Formulareingaben; im Demo-Modus gilt sie nur für die Sitzung. Das Rechnungs-PDF bleibt immer hell.

Anschriften sind optional, auch unvollständige Angaben werden verwendet.
Personen stehen fest A–Z; Suche und der Filter für aktive Lernende bleiben verfügbar.
Jede lernende Person erhält eine bleibende Kennung in Anlagereihenfolge: `a`, `b`, …, `z`, `aa`, `ab`, … . Umbenennen oder Deaktivieren verschiebt sie nicht.

## Rechnung erstellen und Nummern verstehen

Unter **Rechnungen → Neue Rechnung** Lernende und berechtigte Rechnungsempfänger auswählen.
Jeder ausgewählte Empfänger muss allen ausgewählten Lernenden zugeordnet sein.
Datum, Fälligkeit und Positionen mit Leistungsdatum, Beschreibung, Menge, Einheit und Einzelpreis prüfen. Solo-/Duo-Unterricht wählt den passenden Standardpreis; Positionen bleiben einzeln bearbeitbar.

Ein **Rechnungshinweis** ist optional. Die Ausgabe enthält fest „Hiermit stelle ich die folgenden Leistungen in Rechnung.“ und die kurze Zeile „Privatrechnung“.
**Als Entwurf speichern** hält den bearbeitbaren Stand fest. **Finalisieren** prüft die Angaben, vergibt die Nummer und sichert den Beleg mit Beträgen, Empfängern, Anschriften, Konto und Leistungsdaten.
Neue Positionsbeträge werden einzeln exakt dezimal und kaufmännisch auf Cent gerundet; die Summe entsteht aus diesen Centbeträgen. Der Leistungszeitraum folgt den Positionsdaten.

Nummern haben das feste Format **Jahr–Folge–Personenkennung**, zum Beispiel:

| Kreis | Beispiel | Bedeutung |
| --- | --- | --- |
| Person a | `2026-0001-a` | erste Folge für a im Rechnungsjahr 2026 |
| Person b | `2026-0001-b` | eigener jährlicher Zähler für b |
| Kombination a+b | `2026-0001-a+b` | eigener jährlicher Zähler für diese Kombination |

Auswahlreihenfolge und Zahl der Empfänger ändern die Kennung nicht. `ab` bezeichnet eine einzelne später angelegte Person, `a+b` eine Kombination. Neue Jahreskreise beginnen regulär bei 1; übernommene Mindeststände und reservierte Nummern können die Folge erhöhen. Bestehende historische Nummern werden nicht umgeschrieben oder erneut vergeben.

## PDF und GiroCode

In den Rechnungsdetails **PDF / Drucken** wählen und im Browser als PDF speichern oder drucken. Entwürfe haben eine Vorschau mit Wasserzeichen.
Bei zwei ausgewählten Empfängern erscheinen beide Namen und jeweils die eigene vorhandene Anschrift, auch bei identischen Anschriften. Fehlende Anschriftteile entfallen. Die gemeinsame Rechnung hat einen Gesamtbetrag.

Finale Ausgaben und GiroCode verwenden die gesicherten Belegdaten. Spätere Änderungen an Stammdaten oder Einstellungen verändern das Original nicht. Historische Lücken werden nicht mit heutigen Konten oder Anschriften gefüllt.
Der GiroCode enthält Empfängerkonto, Betrag und Rechnungsnummer. Bei einem QR-Fehler bietet der bestehende Druckablauf einen ausdrücklich zu bestätigenden Druck ohne GiroCode an. Eine Banking-App muss die gescannten Angaben vor einer Überweisung prüfen.
Die automatisierten PDF-Prüfungen laufen in Chromium; weitere Druckgrenzen stehen in der [Technikdokumentation](docs/technical.md).

## Zahlung und Korrektur

Rechnung öffnen, den **Tatsächlichen Zahlungstag** eintragen und **Vollzahlung erfassen** wählen.
Bei einer bereits erfassten Zahlung lässt sich der bestätigte Tag über **Zahlungstag korrigieren** ändern. Ein unbekannter historischer Zahlungstag bleibt unbekannt, bis er ausdrücklich bestätigt wird.
Offen/bezahlt wird aus den Zahlungszuordnungen abgeleitet; überfällig aus Fälligkeit und offenem Anspruch. Die Liste steht fest nach Rechnungsdatum, neueste zuerst; Suche und Statusfilter bleiben.

Für Änderungen an finalen Belegen **Korrektur** mit Begründung anlegen, den neuen Entwurf prüfen und finalisieren. Original und ursprüngliche Nummer bleiben erhalten; die Korrektur erhält einen neuen Beleg und eine neue Nummer. Bestehende Zahlungen werden nicht automatisch auf eine Korrektur übertragen. Historie, Klärung und Zahlungszuordnung liegen unter **Details**.

## JSON sichern und wiederherstellen

Unter **Einstellungen → Backup & Import → JSON exportieren** den zuletzt gespeicherten Stand herunterladen. Ungespeicherte Formulareingaben gehören nicht dazu. Backups sind Klartextdateien mit Personen, Rechnungshinweisen, Belegen, Einstellungen, Zahlungen und Historie; bewahre sie geschützt und außerhalb des Browserprofils auf. Es gibt keinen automatischen Dateibackup-Ablauf.

**JSON importieren** prüft die Datei zunächst ohne Übernahme. Vorschau und Meldungen lesen, dann die Wiederherstellung vorbereiten und ausdrücklich bestätigen. Bekannte Originale, Zahlungen, Kennungen und Nummernreservierungen bleiben geschützt; ein Backup ist kein freies Zusammenführen widersprüchlicher Bestände. Alte Tabs vor einem Umstieg schließen. Ein fehlgeschlagener Import verändert den Ausgangsbestand nicht.

Bei Speicher-/Tabkonflikten die Meldung befolgen und den aktuellen Stand neu laden. Im Wiederherstellungsmodus lassen sich Rohdaten sichern und ein vorhandener vorheriger Stand prüfen. **Wiederherstellungsarchiv exportieren** ist ein separater technischer Nachweisexport; bekannte Bereinigungslücken dieses Altpfads sind in der [Migrationsdokumentation](docs/technical.md#bekannte-bereinigungslücken) genannt.

[Technik, Migration und Prüfungen](docs/technical.md) · [Historische Nachweise](docs/evidence.md) · [Kurze Release-Notizen](docs/releases.md)
