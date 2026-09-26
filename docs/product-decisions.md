# Produktentscheidungen

Stand: Pakete 00–12, 2026-09-09. Quelle: beauftragter Umsetzungsplan zur Analyse von
`ba7857fd9180fa392c42a0235643e478e5077ee5`. Diese Regeln sind verbindliche Ziele;
ihre technische Umsetzung wird pro Paket im [Umsetzungsstatus](implementation-status.md) belegt.

| Thema | Entscheidung | Umsetzung / offene Entscheidung |
| --- | --- | --- |
| Architektur | Statische React-/TypeScript-App, lokale Datenhaltung, deutsche Oberfläche; kein zusätzliches Backend. | In allen Paketen erhalten. |
| IBAN | Ausschließlich deutsche IBANs für neue/geänderte Kontoeinstellungen und neue Finalisierungen. Keine Ausweitung auf weitere SEPA-Länder. | In Paket 07 zentral normalisiert und nach DE-Struktur, 22 Stellen und Modulo-97 geprüft; Nicht-DE erhält eine eigene Fehlermeldung. |
| Historische Kontodaten | Alte Belege originalgetreu lesen; fremde oder leere Kontofelder weder löschen noch umschreiben noch durch aktuelle Kontodaten ersetzen. | In 04 erhalten; Profil-/EPC-Ausbau in 07. |
| Getrennte Rechnungen | AP1 entfernt die Neuanlage getrennter Rechnungen. Eine Rechnung kann einen oder mehrere berechtigte Empfänger haben; sie erzeugt eine Nummer und eine Forderung. Historische `separate`-Belege bleiben originalgetreu. | Die frühere Zuordnung aus Paket 06 ist ausschließlich historisch dokumentiert und aus UI und Fachbefehlen entfernt. |
| Rechnungskopien | Weitere Ausgabe desselben Belegs erzeugt weder neue Forderung noch zweiten Umsatz. | AP1 sperrt Kopien historischer `separate`-Belege wegen möglicher Teilbetragspositionen und gemeinsamer Texte; Korrekturen desselben Vorgangs bleiben möglich. |
| Finalisierte Belege | Originalinhalt erhalten; Änderungen über verknüpften Korrekturentwurf mit neuer Nummer. Zahlungs- und Versandstatus separat pflegen. Fehlende Historie nicht erfinden. | In 04 umgesetzt; Details unten. |
| Nummern und Export | Getrennte Nummernkreise, dauerhaft reservierte Nummern und CSV-Formelabwehr erhalten. | In allen betroffenen Paketen prüfen. |
| Backup-Ordner | Ein Ordner gehört zu einem führenden Datenbestand. Abweichende Bestände erkennen; kein stilles Zusammenführen oder Überschreiben. | Konservative Regel übernommen, Paket 03. |
| Zahlungen | Zunächst Vollzahlung mit tatsächlichem Zahlungstag. Fehlende historische Zahlungstage bleiben unbekannt. Teilzahlungen später separat. | Paket 08 (F02-MVP) umgesetzt, optional Paket 14. |
| Datenformate | Änderungen versionieren; Altformate definieren, unveränderte Eingangsdaten schützen, Migrationsbericht und Wiederherstellung vorsehen. Laden/Importieren muss idempotent sein. Unbekannte neuere Formate nicht überschreiben; ausgestellte Beträge/Snapshots nicht still ändern. | Pakete 02–05 und spätere Formatänderungen; Paket 00 ohne Migration. |
| Steuerliches Profil | Kleinunternehmer nach § 19 UStG für neue Rechnungen; Kleinbetragsrechnung nur durch ausdrückliche Rechnungsartwahl. | AP3 (25.09.2026) ersetzt die pauschale Empfängeranschriftspflicht aus Paket 07: Standard mit Empfängeranschrift, § 33 UStDV bis 250,00 € ohne diese; Ausstelleranschrift und bisherige Steuerkennungsprüfung bleiben vorläufig für beide Arten Pflicht. AP4 bearbeitet Ausgabeoptionen der Steuerkennung/des Hinweises. |
| Zielbrowser | Nur tatsächlich geprüfte Browser/Versionen freigeben. | Verbindliche Versions-/Nachweismatrix in [release-readiness.md](release-readiness.md). Chromium-PDF und JSON-Fallback getrennt prüfen; Linux-WebKit belegt weder Safari/macOS noch dessen Druckdialog. |
| Freigabe | Jedes Paket separat beauftragen. PR/Commits sind Teil des Pakets; Merge und produktives Deployment brauchen einen separaten Auftrag. Nur synthetische Testdaten verwenden. | Paket 00 endet vor Merge/Deployment. |

Zusätzliche technische Annahmen für Paket 00: `.nvmrc` bleibt bei Node 22;
Prüfungen verwenden das mitgelieferte npm auf `ubuntu-24.04`. Die Node-24-Laufzeit
der GitHub Actions ist unabhängig von der Node-22-Laufzeit der Projektbefehle.
Seit Paket 12 prüfen PRs ausdrücklich ihren vollständigen Head-Commit; Pages
prüft den auslösenden `main`-Commit und dessen Artefakt im selben Workflow-Lauf.
Merge und Auslieferung bleiben separate Aufträge.

## Vorläufige Regeln für Paket 01

Datei-/Demo-Sperren und die pauschale Importsperre sind durch Paket 03 ersetzt;
die folgenden historischen Originalsperren durch den Korrekturweg aus Paket 04.
Die damalige Aufteilungssperre wurde in Paket 06 vorübergehend durch den unten historisch dokumentierten
Zuordnungsübergang ersetzt. AP1 entfernt diesen Übergang wieder. Bei Überschneidungen gilt der jüngste Paketstand.

- **Aufteilung (R01/R02):** Mehrere getrennte Empfängerrechnungen sind bei Anlage,
  Entwurfsspeicherung und Finalisierung gesperrt. Eine einzelne gemeinsame
  Rechnung verlangt die Zuordnung jedes Empfängers zu jedem ausgewählten Kind.
  Die Sperre ersetzte keine Anteilsberechnung; endgültige Aufteilung siehe Paket 06.
- **Preise (R04):** Leere, negative, unvollständige und nicht endliche Preise bleiben
  Formulareingaben; der letzte gültige Zahlenwert bleibt erhalten. Punkt und Komma
  sind als Dezimaltrenner zulässig, keine Exponentialschreibweise im Formular.
  Null bleibt zulässig; bestehende Dezimalpräzision wird nicht gerundet (Paket 05).
- **Originale (R03/R10, Vorbereitung F03):** Inhaltliches Bearbeiten, Snapshot-
  Korrektur, Zurücksetzen und Löschen finalisierter Belege sind bis Paket 04
  gesperrt. Ein vollständiger Bestandsaustausch durch Import oder Zurücksetzen ist
  bei ausgestellten Belegen oder reservierten Nummern ebenfalls gesperrt. Zahlungs-
  und Versandstatus bleiben erlaubt. Referenzfehler werden vor Übernahme abgewiesen.
- **Dateien (R05):** Bis Paket 03 sind ALLE Ordner-Schreibwege gesperrt, auch bei
  leerem Ziel, gleicher Datei oder erneuter Berechtigung. Die jetzigen Zeitstempel-
  und Tabsperren reichen für einen sicheren Datei-Austausch nicht aus. Verbinden
  prüft die bekannte Backup-Datei nur lesend; JSON-Export bleibt separat verfügbar.
- **Demo (R22):** Bis Paket 03 nur bei unverändertem Leerbestand und nach geklärtem
  Ordnerzugriff ohne verbundenen Ordner. Jede Einstellungsabweichung (auch Theme),
  Historie, Zähler oder reservierte Nummer sperrt den Einstieg. Bereits angefasste,
  noch ausstehende Einstellungen sperren zusätzlich innerhalb des laufenden Tabs.
  Ein fehlgeschlagener Ordnerabruf gilt nicht als Nachweis, dass kein Ordner besteht.
- **Konten:** Eine leere IBAN ist unvollständige Einrichtung, kein finalisierbares
  Konto. Jede neue/geänderte nichtleere Kontoverbindung verlangt eine deutsche
  IBAN. Unveränderte ausländische Alt-Kontodaten bleiben bei sachfremden Änderungen
  erhalten; neue Finalisierung verlangt ihre Korrektur. Historische Snapshots und
  die bisherige EPC-Leseprüfung bleiben erhalten (vollständige Lösung Paket 07).

Paket 01 ändert kein Datenformat und erfindet keine Originalhistorie. Vorhandene
Normalisierung und Import-Zeitstempel bleiben unverändert; Migrationen folgen erst
in Paket 02, revisionssichere Speicherung in Paket 03.


## Paket 02 – Speicherbare Zustände und Reparaturen

- **Drei Ebenen:** Leere/unvollständige Zahlen bleiben ausschließlich im Formular;
  sie überschreiben keinen letzten gültigen Wert. Speicherbare Entwürfe dürfen
  ohne Personen, Positionen und vollständige Einrichtung beginnen. Vorhandene
  Positionen brauchen gültige IDs, Kalenderdaten und aktuelle Kindreferenzen.
  Finalisierung verlangt zusätzlich vollständige Leistungen/Empfänger und eine
  gültige deutsche IBAN. Die Aufteilungssperre aus 01 blieb bis Paket 06 erhalten.
- **Zahlen/Identitäten:** Preise sind endlich, nicht negativ und höchstens
  `Number.MAX_SAFE_INTEGER / 100`; auch die Positions-/Rechnungssumme muss in
  sicheren Centzahlen darstellbar bleiben. Untercentpreise bleiben unverändert
  zulässig, die exakte Geldrechnung folgt in 05. Mengen: 0,01–99,99 mit höchstens
  zwei Nachkommastellen. Zahlungsziel: sichere ganze Zahl ab 0. Formulare erlauben
  Punkt/Komma, keine Exponentialschreibweise; numerischer Unterlauf wird abgewiesen.
  IDs: 1–200 ASCII-Zeichen, Beginn alphanumerisch, danach zusätzlich `._:-`.
- **Kopien:** Aktive Rechnungen haben global eindeutige Positions-IDs. Die gemeinsame
  Kopierfunktion vergibt neue IDs und erkennt Generatorfehler/Kollisionen. Fehlende
  historische Personen sperren eine Kopie, ohne Referenzen oder Positionen zu
  entfernen. Belegversionen aus 04 bekommen einen eigenen Identitäts-/Referenzbereich.
  Die vorhandene Monatsverschiebung bleibt bis 05 bestehen; Kopien sind neue Entwürfe.
- **Format 3 / Altformat 2:** Rohzustände und Umschläge der Apps `riffrechnung` und
  `gitarrenrechnungen` werden geprüft. Versionsangaben müssen übereinstimmen;
  unbekannte Felder, Fremdformate und neuere Versionen werden abgewiesen. Normale
  Format-3-Lesevorgänge ändern nichts, auch keinen Zeitstempel. Bisherige optionale
  Format-2-Felder werden nur in der versionierten Migration ergänzt und einzeln
  protokolliert (Kinderkennzeichen, Typ, Nummernmuster/Kombinationszähler,
  Reservierungsliste). Vorhandene Typen, Beträge, Nummern und Snapshots bleiben.
- **Begrenzte ID-Reparatur:** Algorithmus `riffrechnung-v2-to-v3`, Version 1,
  prüft zuerst sämtliche Struktur-, Zahlen- und Referenzregeln mit Positions-IDs
  je Rechnung. Nur der nachgewiesene alte Erzeugungsfall wird repariert: separate
  Rechnungen für unterschiedliche einzelne Empfänger, gleiche vollständige
  Positionen, Texte, Daten und Erstellungszeit; übereinstimmende Snapshot-Anteile.
  Die Herkunft ist eine überprüfbare Format-/Inhaltsbedingung, kein kryptografischer
  Herkunftsnachweis. Doppelte IDs innerhalb einer Rechnung oder abweichende Inhalte
  werden nicht repariert. Die erste ID bleibt, weitere erhalten deterministische,
  kollisionsfreie IDs mit vollständiger Zuordnung. Danach gilt die volle globale
  Format-3-Prüfung. Ausgestellte Forderungen werden nicht fachlich neu aufgeteilt.
- **Rohdaten/Wiederherstellung:** Importdateien werden als Bytes behalten und nur
  mit strikter UTF-8-Dekodierung geprüft. Export des Originals erhält auch BOM,
  Zeilenenden und ungültige UTF-8-Bytes. Der Bericht enthält zusätzlich den exakten
  ursprünglichen UTF-8-Text. Migration ist über Import UND Wiederherstellungsmodus
  erreichbar. Migrierte oder beschädigte lokale Bestände werden in 02 ausschließlich
  separat exportiert, nicht übernommen/automatisch überschrieben. Ein korrigierter
  Format-3-Export kann in einem leeren Browserprofil geprüft/importiert werden.
  Sichere Übernahme im bestehenden Profil folgt in 03. Rückkehr zu altem Code:
  ursprüngliche Datei in einem getrennten alten Profil verwenden; niemals Schema 3
  mit altem Code überschreiben. Negative Preise, fehlende Personen oder Positionen
  werden nicht erfunden, entfernt oder auf null gesetzt.
- **Mailbox-Regel (R15):** Ein Feld ist leer oder genau eine ASCII-Mailbox:
  lokaler Dot-Atom-Teil bis 64 Zeichen, gesamte Adresse bis 254, DNS-Domain mit
  mindestens zwei Labels (je höchstens 63 Zeichen, keine Rand-Bindestriche).
  Unterstützt werden Buchstaben/Ziffern und die Zeichen
  ``!#$%&'*+-/=?^_`{|}~`` zwischen Punkten. Keine führenden, abschließenden oder aufeinanderfolgenden Punkte im lokalen
  Teil, Anzeigenamen, Anführungszeichen, Listen, Unicode-Mailboxen, Leer- oder
  Steuerzeichen. Punycode-Domains sind möglich. Keine stille Trimmung/Entfernung.
  `?`, `&`, `#` im gültigen lokalen Teil werden als Mailboxzeichen erhalten und
  pro Empfänger kodiert; erst danach werden mehrere Empfänger durch Komma verbunden.
  Betreff und Nachricht werden separat kodiert, Steuerzeichen im Betreff abgewiesen.
  Fehlerhafte Live-Adressen blockieren Eingabe/Import sichtbar mit Feldpfad.
  Historische Snapshot-Adressen bleiben originalgetreu und werden als Warnungen
  ausgewiesen; ungültige Empfänger sperren den E-Mail-Link. Ein vorhandener Snapshot
  mit leerer Adresse fällt nicht auf heutige Kontaktdaten zurück. Kein Versand erfolgt.


## Paket 03 – Speichervertrag und kontrollierter Umstieg

- **Ein führender Bestand pro Ordner:** Alle JSON-Dateien im gewählten, dafür
  vorgesehenen Ordner werden geprüft, einschließlich Synchronisationskopien.
  Abweichende Inhalte/Bestände oder unbekannte Formate sperren weitere Datei-Writes.
  Kein automatischer Merge, keine Auswahl des Gewinners nach Datum oder Revision.
  Gültige Sicherungen lassen sich ausdrücklich lokal wiederherstellen; ein weiter
  widersprüchlicher Ordner bleibt gesperrt und erfordert einen anderen Zielort.
- **Identität/Revision:** Speicherprotokoll 4 enthält Datenschema 3, Bestands-ID,
  zufällige Commit-ID, monoton steigende Revision, Operation und SHA-256-Verweise
  auf kanonische Vorgängerinhalte. Das erkennt Inhaltsabweichungen; es ist keine
  Signatur oder Behauptung fälschungssicherer Herkunft. Gleiche Nummer/Dateizeit
  genügen nie. Eine anonyme Altdatei erhält erst bei bestätigter Übernahme eine neue
  Identität bzw. ausdrückliche Zuordnung; ihre Quell-ID bleibt unbekannt (`null`).
- **Wiederherstellung:** Jeder bestätigte Restore ist ein neuer Stand mit
  `max(lokale Revision, Quellrevision) + 1` und protokollierter Quelle. Ein gültiger
  lokaler Bestand behält seine ID; ein leeres Profil kann die bekannte Quell-ID
  übernehmen. Bekannte Originalinhalte müssen erhalten bleiben. Zähler, reservierte
  Nummern und Kinderkennzeichen werden nicht zurückgesetzt. Die pauschale
  Importsperre aus 01 wird durch diese konkrete Original-/Reservierungsprüfung
  ersetzt; ein historischer Beleg darf weiterhin weder verschwinden noch verändert
  werden. Unbekannte Historie wird nicht ergänzt.
- **Erfolg/Fallback:** „Lokal gespeichert“ folgt erst auf erfolgreiches setItem.
  Datei-Backup ist ein separater ausstehender/erfolgreicher/fehlerhafter Zustand und
  wird nicht beim Tab-Schließen garantiert. Neue Versionsdateien statt Überschreiben;
  mindestens die vorige gültige Datei sowie der vorige gültige lokale Stand bleiben.
  Fehler erhalten die aktuelle lokale Kopie. Scheitert auch die Bereinigung eines
  neuen Dateiversuchs, bleibt dieser sichtbar und sperrt den Ordner bis zur Prüfung.
- **Sperrbereich:** Eine gemeinsame Web Lock und eine Warteschlange pro Sitzung
  koordinieren alle Schreibanlässe im selben Origin/Browserprofil. Ohne Web Locks
  bleibt die App schreibgeschützt, JSON-Export möglich. Ohne sichere Datei-/Rechte-
  prüfung bleibt das Datei-Backup aus; vorhandene Dateien bleiben erhalten. Keine
  Atomizitätszusage für Betriebssystem, Cloud-Synchronisation oder weitere Geräte.
- **Altversionen:** Neuer Schlüssel `riffrechnung-state-v4`, Handle-Datenbank
  `riffrechnung-handles-v4`; der bisherige Schlüssel `gitarrenrechnungen-state-v2`
  und die alte Handle-Datenbank werden nicht beschrieben/automatisch weiterbenutzt.
  Vor Umstieg alte Tabs schließen und Original exportieren. Der alte Rohtext wird
  als Vergleichswert behalten. Schreibt eine alte App später weiter, werden beide
  Bestände erhalten und neue Writes auch nach Reload gesperrt. Zur Auflösung beide
  Stände exportieren, in einem getrennten aktuellen Profil prüfen und bewusst eine
  Quelle übernehmen. Der neue Schlüssel wird alten Versionen nicht zurückkopiert.
- **Archive/Rückweg:** Vor Übernahme wird ein Archiv mit unveränderten lokalen/
  alten/importierten Rohtexten, Schema-Migrationsbericht und versioniertem
  Speicher-Migrationsbericht geschrieben. Scheitert dies, erfolgt keine Übernahme.
  Vorherige gültige lokale Version und Archive sind über die Oberfläche erreichbar.
  Altformat 2→3 bleibt deterministisch; normales Laden und Importprüfung ändern
  nichts. Rückkehr zu altem Code nur mit Originaldatei in einem separaten Profil;
  kein Downgrade des neuen Bestands. Neuere unbekannte Formate bleiben gesperrt.
- **Demo:** Eigenständige Sitzung ausschließlich im RAM. Einstieg/Ausstieg wartet
  auf bereits beauftragte echte Writes, löst aber keine zusätzliche echte Sicherung
  aus und löscht keine Konfiguration. Demo darf jederzeit verworfen werden; sie
  liest/schreibt weder reale Storage-Schlüssel noch IndexedDB oder Dateihandles.
- **Aufbewahrung:** Keine automatische Löschung alter Versionsdateien oder Archive
  in Paket 03. Das braucht zusätzlichen Speicherplatz; Quota-Fehler sind sichtbar.
  Komfortabler Vergleich/Archivverwaltung aus F01 gehört weiterhin zu Paket 13.

## Paket 04 – vollständige Belege und Korrekturen

- **Unveränderliche Version:** Jede Finalisierung sichert Positionen, damalige
  Positions-/Gesamtbeträge, Leistungs-/Rechnungs-/Fälligkeitsdaten, Nummer,
  Aussteller, Empfänger, Kinder, Bank und sämtliche belegbezogenen Ausgabetexte.
  Ansicht, Druck, Erinnerung, EPC und CSV beziehen ihren Inhalt aus derselben
  ausgewählten Version. Leere Snapshot-Felder sind verbindlich. Zahlungs- und
  Versandereignisse sowie Archiv-/Klärungsdaten stehen separat; bisherige Ereignisse
  und Zahlungszuordnungen dürfen bei Wiederherstellung nicht verschwinden.
- **Korrekturregel:** Ein begründeter Entwurf übernimmt alle Positionen und die
  Beziehung zum Original. Fehlende Personen/Kinder bleiben als Referenzen erkennbar;
  Neuzuordnung ändert im Entwurf Kindreferenzen und Positionen gemeinsam. Die
  Finalisierung verlangt aktuelle gültige Beziehungen und eine deutsche IBAN,
  erzeugt einen gemeinsamen neuen Snapshot und vergibt eine neue Nummer. Pro
  Vorgänger gibt es höchstens einen offenen Korrekturentwurf und einen finalisierten
  Nachfolger. Nur der letzte finalisierte Beleg zählt als aktive Forderung;
  ein noch offener Korrekturentwurf ersetzt die Forderung nicht.
- **Historische Abweichungen:** Registerbetrag hat Vorrang vor der aus vorhandenen
  Positionen berechneten bisherigen Summe; beide bleiben getrennt gespeichert.
  Snapshot-/Zuordnungs-, Text-, Zeitraum- und Registerabweichungen bleiben sichtbar.
  Vor Finalisierung einer Korrektur ist das Ergebnis der Klärung mit Grund
  festzuhalten. Das ändert keine historischen Angaben; gewünschte inhaltliche
  Berichtigungen werden anschließend im Korrekturentwurf vorgenommen.
- **Fehlende Historie:** Migration kennzeichnet jeden Altbeleg als ältesten
  verfügbaren Stand, nicht als wiederhergestelltes Original. Ohne damaligen Snapshot
  wird nur die heute noch mögliche Ausgabe gesichert und entsprechend markiert;
  der fehlende ursprüngliche Snapshot bleibt fehlend. Vorhandene Snapshot-Differenzen
  werden auch bei gelöschten/zurückgesetzten Rechnungen unabhängig von der
  200-Ereignis-Liste erhalten. Daraus wird kein vollständiger Beleg erfunden.
- **Zahlungen bei Korrektur:** Eine erfasste Zahlung bleibt mit unveränderlicher
  Herkunft, Betrag und Datum beim Original, bis sie mit Begründung vollständig
  einem Beleg derselben Korrekturkette oder keiner Version zugeordnet wird.
  Der Zuordnungsverlauf bleibt erhalten. Zurücknehmen von „Bezahlt“ löst nur die
  Zuordnung; es löscht keinen Geldfluss. Existiert bereits Geld im Vorgang,
  erzeugt erneutes „Bezahlt“ keine Kopie. Restforderung/Überzahlung bleibt sichtbar;
  automatische Vollbetragserinnerungen sind bei ungeklärtem Geld oder Restbeträgen
  gesperrt. Keine automatische Erstattung, Teilzahlung oder Aufteilung. Zahlungen
  werden in Übersichten einmal nach ihrem Ursprungsbeleg gezählt. Der bisherige
  Erfassungszeitpunkt neuer Vollzahlungen bleibt bis 08 zugleich Zahlungstag;
  vorhandene historische Tage bleiben erhalten, fehlende bleiben unbekannt.
  Kalender-/Jahresauswertungen nach tatsächlichem Geldfluss folgen in 08.
- **Archiv und Umfang:** Finalisierte Belege werden archiviert und können wieder
  eingeblendet werden; das storniert keine Forderung und gibt keine Nummer frei.
  Nur echte Entwürfe sind löschbar. Korrekturen ersetzen ihren Vorgänger vollständig.
  Ein eigenständiger Storno-Workflow gehört nicht zu diesem MVP; ein optionaler
  Stornierungsverweis wird im Format validiert. Keine automatische GoBD-Konformität
  oder Manipulationssicherheit durch lokale Versionierung zugesagt.
- **Format und Rückweg:** Datenschema 4, Speicherprotokoll/Schlüssel aus 03 bleiben.
  Altformat 2 durchläuft weiter die begrenzte deterministische ID-Reparatur;
  Formate 2/3 werden durch `riffrechnung-to-v4`, Version 1, mit Bericht nach 4
  übernommen. Normales Laden und erneute Importprüfung erzeugen keine weiteren
  Reparaturen. Bestätigung archiviert unveränderte Eingangsdaten und Bericht vor
  dem neuen Schreibabschluss. Bekannte Versionen, Zahlungen, Historie und
  Reservierungen bleiben geschützt; neuere unbekannte Formate schreibgeschützt.
  Rückkehr zu altem Code ausschließlich mit Originaldatei in getrenntem Profil.
  Vollständige JSON-Backups enthalten alle Versionen und Verwaltungsdaten;
  CSV dient als gekennzeichnete Übersicht, nicht als vollständiges Restore-Format.


## Paket 05 – Dezimalbeträge und Kalenderdaten

- **Einheiten/Präzision:** Menge in Std., Pauschale oder Stück, jeweils 0,01–99,99,
  höchstens zwei Nachkommastellen; Schaltflächen ändern weiter um 0,25. Preise
  sind EUR je Einheit. Altcode erlaubte jede endliche nichtnegative JSON-Zahl bis
  `Number.MAX_SAFE_INTEGER / 100`, ohne feste Nachkommastellengrenze. Diese
  kanonische Dezimalpräzision bleibt vollständig erhalten (auch Untercentpreise,
  Exponenten und subnormale Zahlen; höchstens 324 Nachkommastellen bei Number).
  Neue Texteingaben erlauben Punkt/Komma ohne Exponenten und müssen dezimal exakt
  als JSON-Number rücklesbar sein; andernfalls sichtbarer Eingabefehler statt Rundung.
  Zusätzliche ursprünglich schon beim JSON-Parsen verlorene Ziffern werden nicht erfunden.
- **Rechnung:** BigInt-Koeffizienten mit Dezimalskala, Multiplikation vor jeder
  Number-Konvertierung. Jede Position kaufmännisch (HALF_UP) auf Cent runden,
  dann Centbeträge addieren. BigInt bleibt intern; JSON enthält sichere Zahlen.
  Neue/gespeicherte Entwürfe und neue Finalisierungen maximal 999.999.999,99 EUR
  (gemeinsame EPC-Obergrenze); Null bleibt als Betrag erlaubt, ohne GiroCode.
  Alte Preisgrenze bleibt zur verlustfreien Bearbeitung bestehen; maßgeblich ist
  zusätzlich die Rechnungssumme. Überlauf wird kontrolliert abgewiesen.
- **Originale/Umstieg:** Schema 5, unverändertes Speicherprotokoll 4. Formate 2/3
  sichern zunächst mit dem eingefrorenen Altalgorithmus ihren ältesten verfügbaren
  Belegstand; Format 4 übernimmt vorhandene Belegversionen unverändert. Neue
  Versionen zeigen Einzelpreise mit erhaltener Untercentpräzision und tragen `decimal-v1`/`decimal-output`. Legacy-Felder behalten ihre Namen.
  Bestehende Entwürfe behalten Mengen/Preise; Bericht und Editor zeigen geänderte
  Positionsergebnisse bzw. alte/neue Summe. Direktfinalisierung eines ungeprüften
  geänderten Altentwurfs verlangt den Editor; dessen Speichern/Finalisieren übernimmt
  die sichtbare Berechnung. Zu große Altentwürfe müssen vor neuem Speichern korrigiert
  werden; gespeicherte Originale unterliegen nicht der neuen EPC-Grenze. Ein
  Altentwurf außerhalb sicherer exakter Centzahlen blockiert die Übernahme mit
  unveränderten Rohdaten, statt eine nicht darstellbare Summe zu laden.
  Archivierung der unveränderten Eingangsdaten und Bericht vor Übernahme bleibt
  verbindlich. Wiederholtes Laden/Importieren von Schema 5 migriert nichts.
  Neuere Formate bleiben schreibgeschützt; Rückweg nur mit archivierter Originaldatei
  in getrenntem Profil mit passendem alten Code, kein In-place-Downgrade.
- **Kalender:** Rechnungs-, Leistungs-, Fälligkeits- und neue Zahlungstage sind
  Gregorianische YYYY-MM-DD-Daten (0001–9999). Heute wird aus lokalen Komponenten
  der Browser-Zeitzone erzeugt. Monatsverschiebung begrenzt jeden Tag auf den letzten
  gültigen Zielmonatstag. Technische Ereignisse bleiben ISO-Zeitpunkte. Neue
  Vollzahlungen speichern den lokalen Erfassungstag getrennt von `recordedAt`;
  die freie Wahl/Korrektur des Zahlungstags und Berichtszuordnung bleiben Paket 08.
  Alte Zahlungstimestamps bleiben unverändert und zeigen weiter ihren gespeicherten
  Datumsanteil; eine historische Ortszeitzone wird nicht rückwirkend unterstellt.

## Paket 06 – Empfängerbezogene Aufteilung (historische Umsetzung, durch AP1 abgelöst)

- **Drei getrennte Begriffe:** `guardianIds` einer Ergebnisrechnung sind deren
  Rechnungsempfänger:innen. Die Leistung wird davor je Quellposition ausdrücklich
  einer Person oder mit bestätigten Centbeträgen mehreren Personen zugeordnet.
  Ein erneuter Druck/Export desselben Belegs ist nur eine zusätzliche Ausgabe und
  erzeugt weder Rechnung, Nummer noch Forderung.
- **Keine geratene Quote:** Jede Position startet ungeklärt. Eine vollständige
  Zuordnung übernimmt den unveränderten Positionsinhalt. Bei Teilung werden nur
  manuell eingetragene ganze Centbeträge akzeptiert; die Summe muss exakt dem bereits
  kaufmännisch gerundeten Quellpositionsbetrag entsprechen. Der sichtbare Rest kann
  ausdrücklich einer Person zugeschlagen werden; es gibt keine automatische 50/50-
  oder Haushaltsannahme.
- **Teilpositionsdarstellung:** Ein bestätigter Teilbetrag wird als Pauschalposition
  mit Menge 1 und exakt diesem Centpreis gespeichert. Beschreibung und Druck nennen
  Teil- und ursprünglichen Betrag. Dadurch bleibt Schema 5 unverändert und der
  bestehende Geld-/Export-/Reload-Vertrag gilt ohne neue Migration.
- **Datensparsame Ergebnisse:** Kinder werden ausschließlich aus den einer Person
  zugeordneten Positionen abgeleitet. Ausgabetexte mit dem Namen eines nicht
  zugeordneten ausgewählten Kindes sperren den Übergang zur Klärung. Snapshot,
  Kopf, Druck und Erinnerung verwenden danach nur die Ergebnisrechnung.
- **Atomar und historisch:** Sämtliche Ergebnisrechnungen werden in einem reinen,
  vollständig validierten Zustandsübergang angelegt. Erst der eine anschließende
  Speicherabschluss macht sie sichtbar; Fehler verbrauchen keine Nummer. Jede
  Rechnung und Position erhält eine neue ID, Nummern folgen ihrem Kindnummernkreis.
  Übernommene historische `separate`-Belege mit ältestem verfügbarem Belegstand
  werden nur als ungeklärt markiert und können einzeln korrigiert werden; keine
  bestehende Forderung wird automatisch zusammengelegt oder umgeschrieben.


## Paket 07 – Rechnungsprofil und Zahlungsdaten

Die damalige pauschale Empfängeranschriftspflicht und der Ausschluss der
Kleinbetragsrechnung gelten seit AP3 (25.09.2026) nur noch historisch. Die
aktuelle Finalisierungsregel und ihre Quellen stehen unter „AP3“ weiter unten.

- Das Produkt unterstützt für neue Rechnungen ausschließlich das ausdrücklich
  gewählte Kleinunternehmerprofil nach § 19 UStG. Die Rechnung enthält den
  Steuerbefreiungshinweis. Andere Steuerprofile und die Kleinbetragsregel werden
  nicht stillschweigend aktiviert.
- Für die Identifikationsangabe stehen getrennte Typen bereit: Steuernummer,
  Umsatzsteuer-Identifikationsnummer und Kleinunternehmer-Identifikationsnummer.
  Die App prüft Auswahl, Vorhandensein und sichere Textgrenzen, bestätigt aber
  weder Vergabe noch steuerliche Gültigkeit. Die persönliche Steuer-ID wird nicht
  als austauschbare Rechnungsangabe angeboten.
- Neue Finalisierungen verlangen vollständigen Namen und Anschrift von Aussteller
  und jedem Empfänger. Entwürfe dürfen unvollständig gespeichert werden.
  Finalisierte Belege verwenden ausschließlich ihren Snapshot; fehlende
  historische Profilangaben werden nicht aus heutigen Einstellungen ergänzt.
- Neue/geänderte Zahlungseinstellungen und neue Finalisierungen akzeptieren nur
  deutsche Empfänger-IBANs. Schreibweise wird durch Entfernen von Leerzeichen und
  Großschreibung normalisiert. DE-Länge/Struktur und Prüfsumme werden geprüft;
  gültige Nicht-DE-IBANs werden ausdrücklich als nicht unterstützt abgelehnt.
  Das ist keine Kontoinhaber- oder Erreichbarkeitsprüfung.
- Für den unterstützten Fall eines deutschen Empfängerkontos ist die BIC im
  EPC-QR optional; eine eingegebene BIC muss strukturell gültig sein. Daraus wird
  keine Aussage über jeden möglichen Zahlerfall abgeleitet. Snapshot-BIC
  „fehlend“ und „bewusst leer“ bleiben unterscheidbar und werden nie mit heutigen
  Einstellungen aufgefüllt.

Offizielle Grundlagen, geprüft am 08.09.2026:
[§ 14 UStG](https://www.gesetze-im-internet.de/ustg_1980/__14.html),
[§ 34a UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__34a.html),
[EPC Quick Response Code Guidelines v3.1](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2024-03/EPC069-12%20v3.1%20Quick%20Response%20Code%20-%20Guidelines%20to%20Enable%20the%20Data%20Capture%20for%20the%20Initiation%20of%20an%20SCT.pdf),
[SWIFT IBAN Registry Release 102](https://www.swift.com/resource/iban-registry-pdf)
und [Bundesbank-IBAN-Regeln](https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/iban-regeln/iban-regeln-603042).

## Paket 08 – Zahlungstage und Berichte

- Eine neue Vollzahlung verlangt einen bestätigten Gregorianischen Zahlungstag;
  `recordedAt` bleibt ausschließlich der technische Erfassungszeitpunkt. Ein
  bereits bestätigter Tag kann mit einem nachvollziehbaren Verwaltungsereignis
  korrigiert werden. Teilzahlungen werden weder erzeugt noch nachgebildet.
- Schema-6-`paidAt` war kein bestätigter Banktag. Die Migration übernimmt den
  Rohwert deshalb nur als `legacyPaymentDay`, setzt `paymentDayStatus: unknown`
  und bewahrt Betrag, Herkunft, Zuordnung sowie `recordedAt`. Erst eine bewusste
  Nachpflege macht daraus einen bestätigten Zahlungstag.
- Rechnungsvolumen zählt nur aktuelle Forderungsbelege nach Rechnungsdatum;
  Zahlungseingänge zählen jeden Geldfluss genau einmal nach bestätigtem
  Zahlungstag. Statusrücknahme oder Korrektur ändern den Geldfluss nicht.
  Unbekannte Zahlungstage bilden eine sichtbare, jahrlose Menge. Sie erscheinen
  in jedem Jahres-CSV als „Zahlung ohne Kalenderjahr“, damit kein Export ihnen
  stillschweigend ein Jahr zuordnet.


## Paket 09 – Druck und GiroCode

- **Optionaler GiroCode:** Ein Fehler in EPC-Payload, QR-Encoder oder Bildladen
  ist kein Fachfehler der vollständigen Rechnung. Die UI nennt den Grund und
  verlangt die explizite Wahl **„Ohne GiroCode drucken“**. Dabei darf kein
  früheres oder fehlerhaftes QR-Bild im Dokument verbleiben.
- **Auftragsbindung:** Druck startet erst nach den Schriften und den für genau
  diesen Auftrag erzeugten Ausgabeinformationen. Beleg, Personen, Einstellungen,
  Betrag und EPC-Payload werden pro Auftrag kopiert; ein verspätetes Resultat eines
  anderen Auftrags wird ignoriert.
- **Robuster Druckbereich:** Rechtstext und Referenz stehen zusätzlich im
  normalen Dokumentfluss. `@page` ist nur eine Chromium-Ergänzung für
  Seitenzahlen und Folgekopf. Die dokumentierten A4-Ränder betragen oben 16 mm,
  links/rechts 20 mm und unten 22 mm.
- **Textgrenzen:** Neue Rechtstexte haben die sichtbare, vor dem Speichern
  validierte 120-Zeichen-Grenze. Bereits gespeicherte Texte werden weder beim
  Laden noch beim Drucken gekürzt. Neue und historische Freitexte erhalten ihre
  Zeilenumbrüche und bleiben umbruchfähig.
- **Druckfreigabe:** Automatisiert geprüft ist ausschließlich Chromium
  153.0.8010.12 unter Ubuntu 24.04.5 (PDF-Engine, nicht nativer OS-Druckdialog).
  Der normale Dokumentfluss ist der vorgesehene Firefox-/Safari-Fallback;
  deren Text/PDF-Ausgabe und dynamische Randboxen sind nicht abgenommen.
  Für vollständige Seitenzahlen ist Chromium 153 automatisch geprüft.
  Banking-App-Scans sind eine separate manuelle Abnahme.

## Paket 10 – Tastatur, Dialoge und Kontrast

- **Modale Grundlage:** Die App verwendet die vorhandene Dialoggrundlage mit
  einem expliziten `inert`-Stapel statt eines verschachtelten Browser-Top-Layers.
  Hintergrund und Tabreihenfolge sind modal; Escape schließt nur den obersten
  Dialog. Das Verhalten folgt dem
  [W3C-Dialogmuster](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
  Verschachtelte Bestätigungen werden bewusst ohne zweiten nativen Top-Layer im
  bestehenden Dialog gerendert. Der äußere Dialog bleibt modal und nur dessen
  Geschwister werden `inert`; die obere Bestätigung begrenzt Tab/Escape selbst.
  Der Stapel erhält beim Schließen einer Bestätigung die Scrollsperre des
  darunterliegenden Dialogs. Bestätigungen fokussieren die am wenigsten
  zerstörerische Aktion.
- **Editor-Verwerfen:** Ein verändertes Formular wird beim Schließen oder
  Seitenwechsel nie still verworfen. „Weiter bearbeiten“ hält lokalen
  Formularzustand; „Verwerfen“ schließt ohne fachlichen Speicherbefehl und
  verändert keinen gespeicherten Beleg oder Snapshot.
- **Entwurfszugang:** Ein Beleg mit Status `draft` bleibt im Editor erreichbar,
  auch wenn ein historisches Ausgabefeld vorhanden ist. Der fachliche
  Schreibbefehl schützt weiterhin alle tatsächlich ausgestellten Belege.
- **Responsive Bedienung:** Navigationselemente behalten programmatische Namen.
  Die mobile Seitenleiste ist geschlossen `inert`; Enter und Escape schließen
  sie und geben Fokus an den Öffnen-Auslöser zurück.
- **Kontrast:** Für normalen und kleinen Text gilt WCAG 2.2 AA (mindestens
  4,5:1). `#ffb4ab` erhält `#690005`; kleine Versions-/Backuptexte verwenden
  `--on-surface-variant`. Automatische Kontrastwerte werden visuell ergänzt.

## Paket 11 – Schutzmodell und Komfort

- **Lokale Datenhaltung:** Die App überträgt keine Rechnungsdaten an eine eigene
  Cloud-API. Sie speichert sie jedoch unverschlüsselt im verwendeten
  Browserprofil; Geräteschutz und der Zugriff auf dieses Profil liegen außerhalb
  der App. JSON-Export und Ordner-Backup sind Klartext und enthalten neben
  Stammdaten/Rechnungen auch Freitexte und Notizen, vollständige Belegversionen,
  Änderungsverlauf und Zahlungszuordnungen.
- **Origin:** Web Storage ist nach Schema, Host und Port isoliert, nicht nach
  Repositorypfad. Der in diesem Repository konfigurierte GitHub-Pages-Standard
  verwendet mangels `CNAME` `https://sl3ndrr.github.io` mit dem Anwendungspfad
  `/RiffRechnung/`. Weitere Anwendungen, die tatsächlich unter diesem Origin
  ausgeliefert werden, teilen den Speicher-Sicherheitsbereich. Die vorhandenen
  anderen Repositories belegen keine Auslieferung; eine Trennung auf einen
  separaten Origin ist bei nicht vertrauenswürdigen weiteren Apps eine
  Betriebsentscheidung, nicht Teil dieses Pakets.
- **Synchronisierte Ordner:** Ein gewählter Ordner wird nur über die lokale
  Browser-Ordnerfreigabe beschrieben. Synchronisiert eine installierte
  Desktop-Anwendung ihn, kann diese die Klartextdateien an ihren Dienst
  übertragen. Das ist keine Cloud-Anbindung der App und muss bei Ablage,
  Freigabe und Wiederherstellung berücksichtigt werden.
- **Kombinationskennzeichen:** Mehrkindrechnungen verwenden die segmentierte
  Schlüsselbildung `a+b`; `ab` bleibt als mögliches Kennzeichen eines einzelnen
  Kindes davon verschieden.

## Paket 12 – Abschlussumfang und Recovery

- Ein vollständig validierter lokaler Altbestand bleibt im Recoverymodus bekannt:
  Originale, Historie, Nummern, Kinderkennzeichenzähler sowie vorhandene Bestands-ID
  und Revision sind zu erhalten. Bei beschädigtem Hauptschlüssel wird zuerst die
  vorige lokale Kopie, danach der bisherige Legacy-Schlüssel vollständig geprüft.
  Der erste gültige Stand bildet die Schutzbasis. Beschädigte Daten begründen keine
  erfundene Historie. Ein zusätzlicher Rückfall-Rohtext erhält bei Bedarf einen
  weiteren Eintrag im bestehenden Archivformat 1, bevor geschrieben wird.
- Komplett-Zurücksetzen bleibt ausschließlich ohne ausgestellte Belege, historische
  Dokumentation und reservierte Nummern verfügbar. Bei belegtem Bestand dienen
  Archivierung und geprüfte Wiederherstellung dem vorgesehenen Umgang mit Daten.
  Dies ist endgültiger MVP-Umfang, keine verbliebene P01-Sperre.
- Schema 7 und Speicherprotokoll 4 bleiben unverändert. Rückkehr zu einem früheren
  Datenformat nur mit unabhängiger Sicherung von vor der Migration, passendem Code
  und separatem Browserprofil ohne bestehenden Backup-Handle. Seit der Migration
  erfasste Änderungen werden dabei nicht rückkonvertiert.
- Die Safari-Fallbackabsicht bleibt JSON-Download/-Import ohne Ordner-API.
  Linux-WebKit gibt Safari/macOS nicht frei. Native Datei-/Druck-, Banking-App-,
  visuelle PDF-/Theme- und Screenreaderabnahmen bleiben vor Produktfreigabe offen.


## AP1 – Keine neuen getrennten Rechnungen (2026-09-24)

- `separate` bleibt als Legacy-Wert in Schema 7 und im Import lesbar; neue Entwürfe und direkte Abschlüsse damit sind auch mit genau einem Empfänger gesperrt. Korrekturen eines ausgestellten `separate`-Belegs führen denselben Vorgang unter unverändertem Wert fort. Originalversionen, Beträge, Nummern, Zahlungen und Roharchive werden nicht umgedeutet.
- Kopieren eines historischen aufgeteilten Belegs ist gesperrt: Teilbetragspositionen und gemeinsame Texte können sonst unbemerkt in eine neue Forderung gelangen. Eine neue gemeinsame Rechnung wird manuell und nach Prüfung angelegt.
- Zwei Altentwurfsformen sind möglich: einzeln aus früherer Aufteilung entstandene `separate`-Entwürfe mit einem Empfänger und ohne Gruppenbezug; sowie importierte `separate`-Entwürfe mit mehreren Empfängern. Beide bleiben lesbar. Nach sichtbarer Prüfung von Empfänger, Kind, Positionen, Einleitung und Freitext und fünf einzelnen Bestätigungen wird Form eins mit ihrem Empfänger zum gemeinsamen Entwurf. Form zwei verlangt eine neue ausdrückliche Empfängerwahl und erhält eine neue Entwurfs-ID. Jeder Empfänger muss jedem gewählten Kind zugeordnet sein. Erst der atomare Speicherabschluss ersetzt den alten Entwurf; keine Nummer wird verbraucht und keine Finalisierung ausgeführt.
- Keine Formatänderung: Schema 7, Speicherprotokoll 4, Archivformat 1. Historische Felder bleiben unverändert; AP1 benötigt keine Migration. Die früheren Paket-06-Regeln oben beschreiben nur Altbestände, keine heutige Neuanlage.

## AP3 – Kontakte, Entwürfe und Rechnungsart (25.09.2026)

- Für neue Empfängerkontakte sind getrennter Vor- und Nachname erforderlich
  (jeweils getrimmt, höchstens 120 Zeichen, ohne Steuerzeichen). Anschrift,
  Telefon und E-Mail sind optional. `name` bleibt der gespeicherte Anzeigename
  und die einzige Quelle für Druck, CSV und gesicherte Empfänger-Snapshots.
  Bestehende Namen werden bei Schema 7→8 weder zerlegt noch neu gebildet.
  Beim Bearbeiten ohne Namensaufteilung wird die Erhaltung des bisherigen
  Anzeigenamens ausdrücklich bestätigt. Kindernamen bleiben unverändert:
  Sie sind Leistungsbezeichnungen, keine Rechnungsempfängerkontakte; AP5 kann
  dies anhand seines konkreten Empfängermodells erneut beurteilen.
- Jede Rechnung hat eine sichtbare Rechnungsart. `standard` ist der normale
  neue Entwurfswert; `small-amount` wird nur ausdrücklich im Editor gewählt.
  Bei Altbelegen fehlt das Feld und bedeutet Standardrechnung nach den
  damaligen Regeln. Der Abschluss friert die Wahl in Beleginhalt und Snapshot
  ein. Eine Kopie beginnt erneut als Standardrechnung; eine Korrektur übernimmt
  die bisherige Wahl zur ausdrücklichen Prüfung im Editor. Ein gespeicherter
  Entwurf friert seine Druckdaten beim Speichern ein;
  spätere Stammdaten- und Einstellungsänderungen verändern seinen Druck nicht.
  Alte Entwürfe ohne solche Daten erhalten keine erfundene Historie.
- Standardrechnungen verlangen beim Abschluss Namen und vollständige
  Anschriften der Aussteller- und gewählten Empfängerseite. Bei ausdrücklich
  gewählten Kleinbetragsrechnungen entfällt nur die Pflicht zur
  Empfängeranschrift. Die abschließende Rechnungssumme darf nach exakter
  Centberechnung 25.000 Cent nicht übersteigen; 25.001 Cent sperren auch
  Korrekturen und nennen die fehlenden Standardangaben. Die Ausstellerangaben
  bleiben erforderlich. Die vorhandene Steuerkennungsprüfung bleibt vorläufig
  konservativ in beiden Arten; AP4 entscheidet über Ausgabeoptionen und nutzt
  dieselbe zentrale Abschlussfunktion. Es gibt keinen automatischen Wechsel.
- Gesetzesprüfung 25.09.2026: [§ 34a UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__34a.html)
  fordert für die reguläre Kleinunternehmerrechnung Aussteller und Empfänger
  mit vollständigem Namen/Anschrift, Kennung, Datum, Leistungsangaben, Entgelt
  und Befreiungshinweis; Satz 2 lässt [§ 33 UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__33.html)
  unberührt. § 33 erlaubt bis einschließlich 250 Euro eine Rechnung ohne
  Empfängername/-anschrift oder Aussteller-Steuerkennung, verlangt aber Name/
  Anschrift des Ausstellers, Datum, Leistungsangaben, Summe und bei Befreiung
  einen Hinweis. Seine Ausnahme für §§ 3c, 6a und 13b UStG wird für den
  Produktumfang (inländischer Gitarrenunterricht an Privatpersonen) als nicht
  einschlägig angenommen. Der vollständige aktuelle [§ 14 UStG](https://www.gesetze-im-internet.de/ustg_1980/BJNR119530979.html)
  wurde in der amtlichen Gesamtausgabe geprüft: Absatz 1 regelt die
  Rechnungsform und die Zustimmung zur elektronischen Übermittlung; Absatz 2
  nennt insbesondere B2B-Leistungen, Leistungen an nichtunternehmerische
  juristische Personen und bestimmte Grundstücksleistungen als Fälle einer
  Ausstellungspflicht. Absatz 3 verlangt Herkunftsechtheit, inhaltliche
  Unversehrtheit und Lesbarkeit; Absatz 4 nennt die allgemeinen Angaben,
  die § 33 UStDV für Kleinbeträge vereinfacht. Für den angenommenen
  Privatunterricht an natürlichen Personen ohne Grundstücksleistung folgt
  daraus keine zusätzliche Ausstellungs- oder E-Rechnungspflicht. Das Produkt
  erstellt trotzdem bewusst Rechnungen; elektronische Übermittlung bedarf
  gegebenenfalls der Empfängerzustimmung. Individuelle steuerliche
  Einordnung bleibt offen.
- Schema 8 ändert das Speicherprotokoll 4 und Archivformat 1 nicht. Der
  kontrollierte Import prüft das alte Schema, erzeugt einen deterministischen
  Bericht über 7→8 ohne neue Kontakt- oder Belegdaten und archiviert unveränderte
  Rohdaten vor Übernahme. Weitere additive AP4/AP5-Felder dürfen Schema 8 nur
  verwenden, solange Schema 8 noch nicht in `main` oder einem Release steht.
  Unbekannte neuere Schemas bleiben schreibgeschützt. Rückweg nur über die
  unabhängig gesicherte Originaldatei in getrenntem Profil.

## AP4 – Steuerkennung und Befreiungshinweis (26.09.2026)

- AP4 baut auf der noch offenen AP3-Arbeit mit Schema 8 und einer einzigen
  zentralen Abschlussprüfung auf. AP2 und AP5 sind nicht integriert. Das Feld
  `taxPresentation` ist optional im Rechnungsinhalt; sein Fehlen erhält den
  bisherigen Druck exakt. Neue Rechnungen beginnen mit Kennungsausgabe und
  Steuerblock. Kleinbetragsrechnungen dürfen die Kennung ausdrücklich auslassen,
  Standardrechnungen nicht. Bei Ausgabe wird für jeden der drei Kennungstypen
  eine nichtleere Angabe verlangt. Die Grenze von 25.000 Cent und die
  Empfängeranschrift bleiben ausschließlich in der AP3-Abschlussprüfung.
- Der Befreiungshinweis wird bei jeder neuen Finalisierung ausgegeben.
  Entwurfsvorschauen dürfen Kennung und Hinweis getrennt ausblenden und tragen
  das sichtbare ENTWURF-Wasserzeichen. Der alternative Ort „Fußzeile“ ist die
  Rechtstextzeile direkt bei der Endsumme, nicht die spätere Schlusszeile:
  Summe, Kennung und diese Fußzeile bilden im Druck eine zusammengehaltene
  Tabellengruppe. Die Schlusszeile behält die Belegreferenz. Damit bleibt der
  Hinweis auch bei mehrseitiger Ausgabe erkennbar der Endsumme zugeordnet.
- `InvoiceSnapshot.taxOutput` hält explizit die gedruckte Kennung als Typ/Wert
  oder `null`, den konkreten Hinweistext und die Position fest. Er wird bei
  neuen Entwürfen beim Speichern und bei finalen Belegen in
  `DocumentVersion.outputSnapshot` gesichert. Finalisierte Ausgaben lesen
  ausschließlich diese Version; neue Konstanten, Einstellungen und
  Vorgabetexte füllen keine historischen Angaben auf. Fehlt `taxOutput`, gilt
  weiterhin die vor AP4 gespeicherte Ausgabe einschließlich ihrer alten
  Kennungs-/Hinweisbedingung und unverändertem Rechtstext.
- Der neue Standard für `defaultLegalText` ist leer, damit er keinen zweiten
  automatischen Hinweis liefert. Bestehende Einstellungen und Belegfreitexte
  werden nicht umgeschrieben. Editor und Rechnungsdetail zeigen einen
  nicht blockierenden Hinweis bei „§ 19“ oder „Kleinunternehmer“ im freien
  Rechtstext; diese Heuristik entscheidet nie über die automatische Ausgabe.
- Schema 8 wird additiv erweitert, weil es weder auf `main` noch in einem
  Release steht. Die AP3-Migration 7→8 bleibt unverändert und erzeugt
  keines der optionalen AP4-Felder aus heutigen Einstellungen. Import und
  Backup prüfen die neuen Schlüssel nur ab Schema 8. Speicherprotokoll 4 und
  Archivformat 1 bleiben. Rückweg weiterhin nur mit gesichertem Original in
  getrenntem Profil. Fachliche Grundlage: [§ 34a UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__34a.html)
  verlangt Kennung und Entgelt mit Hinweis in einer Summe;
  [§ 33 UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__33.html)
  erlaubt bis 250 Euro die fehlende Kennung, verlangt bei Befreiung aber
  weiterhin den Hinweis. Die in AP3 dokumentierte Annahme zum inländischen
  Privatunterricht gilt fort.
