# Produktentscheidungen

Stand: Pakete 00–03, 2026-09-07. Quelle: beauftragter Umsetzungsplan zur Analyse von
`ba7857fd9180fa392c42a0235643e478e5077ee5`. Diese Regeln sind verbindliche Ziele;
ihre technische Umsetzung wird pro Paket im [Umsetzungsstatus](implementation-status.md) belegt.

| Thema | Entscheidung | Umsetzung / offene Entscheidung |
| --- | --- | --- |
| Architektur | Statische React-/TypeScript-App, lokale Datenhaltung, deutsche Oberfläche; kein zusätzliches Backend. | In allen Paketen erhalten. |
| IBAN | Ausschließlich deutsche IBANs für neue/geänderte Kontoeinstellungen und neue Finalisierungen. Keine Ausweitung auf weitere SEPA-Länder. | Sofortschutz in Paket 01 für Kontoeinstellungen und neue Finalisierungen; vollständiges Profil und EPC-Konsistenz in Paket 07. |
| Historische Kontodaten | Alte Belege originalgetreu lesen; fremde IBANs weder löschen noch umschreiben noch durch aktuelle Kontodaten ersetzen. Neue Verwendung darf eine Korrektur verlangen. | Pakete 04/07. |
| Getrennte Rechnungen | Jede Leistung pro Aufteilung insgesamt genau einmal berechnen; Empfänger erhalten nur zugeordnete Kinder/Positionen. Keine angenommene 50/50-Aufteilung. | Konservative Regel aus dem Plan übernommen, Paket 06. |
| Rechnungskopien | Weitere Ausgabe desselben Belegs erzeugt weder neue Forderung noch zweiten Umsatz. Getrennte Forderungen brauchen getrennte Leistungen oder ausdrücklich bestätigte Anteile. | Pakete 04/06/08. |
| Finalisierte Belege | Originalinhalt erhalten; Änderungen über verknüpften Korrekturentwurf. Zahlungs- und Versandstatus separat pflegen. Fehlende Historie nicht erfinden. | Paket 04; keine rückwirkende Behauptung vollständiger Historie. |
| Nummern und Export | Getrennte Nummernkreise, dauerhaft reservierte Nummern und CSV-Formelabwehr erhalten. | In allen betroffenen Paketen prüfen. |
| Backup-Ordner | Ein Ordner gehört zu einem führenden Datenbestand. Abweichende Bestände erkennen; kein stilles Zusammenführen oder Überschreiben. | Konservative Regel übernommen, Paket 03. |
| Zahlungen | Zunächst Vollzahlung mit tatsächlichem Zahlungstag. Fehlende historische Zahlungstage bleiben unbekannt. Teilzahlungen später separat. | Paket 08 (F02-MVP), optional Paket 14. |
| Datenformate | Änderungen versionieren; Altformate definieren, unveränderte Eingangsdaten schützen, Migrationsbericht und Wiederherstellung vorsehen. Laden/Importieren muss idempotent sein. Unbekannte neuere Formate nicht überschreiben; ausgestellte Beträge/Snapshots nicht still ändern. | Pakete 02–05 und spätere Formatänderungen; Paket 00 ohne Migration. |
| Steuerliches Profil | Keine steuerliche Einordnung aus dem Projektnamen oder dem voreingestellten Rechtstext ableiten. | Tatsächliche Konstellation in Paket 07 klären. |
| Zielbrowser | README nennt Chromium ab 131 für Druck und Chromium für Ordnerzugriff. Das ist keine verifizierte Freigabeliste. Nur tatsächlich geprüfte Browser/Versionen freigeben. | Verbindliche Betrieb-/Druckmatrix in Paketen 09/12 festlegen. |
| Freigabe | Jedes Paket separat beauftragen. PR/Commits sind Teil des Pakets; Merge und produktives Deployment brauchen einen separaten Auftrag. Nur synthetische Testdaten verwenden. | Paket 00 endet vor Merge/Deployment. |

Zusätzliche technische Annahmen für Paket 00: `.nvmrc` bleibt bei Node 22;
Prüfungen verwenden das mitgelieferte npm auf `ubuntu-24.04`. Die Node-24-Laufzeit
der GitHub Actions ist unabhängig von der Node-22-Laufzeit der Projektbefehle.
PRs prüfen GitHubs Merge-Stand; Pages prüft und veröffentlicht den auslösenden
`main`-Commit und dessen Artefakt im selben Workflow-Lauf.

## Vorläufige Regeln für Paket 01

Datei-/Demo-Sperren und die pauschale Importsperre sind durch die Regeln aus Paket 03 ersetzt. Original- und Aufteilungsschutz gelten weiter.

- **Aufteilung (R01/R02):** Mehrere getrennte Empfängerrechnungen sind bei Anlage,
  Entwurfsspeicherung und Finalisierung gesperrt. Eine einzelne gemeinsame
  Rechnung verlangt die Zuordnung jedes Empfängers zu jedem ausgewählten Kind.
  Die Sperre ersetzt keine Anteilsberechnung; endgültige Aufteilung in Paket 06.
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
  gültige deutsche IBAN. Die Aufteilungssperre aus 01 bleibt bis 06 erhalten.
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
