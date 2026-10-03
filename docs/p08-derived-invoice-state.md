# P08 – abgeleitete Rechnungs- und Zahlungswerte

## Basis und Umfang

Katalogbasis: `4b697df747819c283747f196c172c26af24e155c`, Eintrag E43.
Arbeitsbasis: `main@407c2177ae34b728f30c94a7a13e680c6e8bbd8b`, P07-Merge.
P01–P07 sind über die gemergten PRs #43–#49 integriert. Der Ausgangsbaum
wurde mit GitHub-Tree `43693777681ab6ea5a31160e15d8dc0959caec79` exakt
abgeglichen. Es gibt keine `AGENTS.md` im Repository; die vorhandenen
Qualitäts- und Fachentscheidungsdokumente wurden geprüft. Arbeitsbaum vor
Änderungen sauber. Branch: `simplify/p08-derived-invoice-state`.

Die Arbeit umfasst nur E43. Privatrechnungen, Cent-/Kalenderberechnung,
GiroCode, zwei gemeinsame Empfänger, Selbstzahlung, Personenkennungen,
Nummernkreise und geschützte Originale bleiben erhalten. Keine Berichte,
CSV, Erinnerungen, neue Zahlungsübersicht oder Zahlungsfunktion; keine
Änderung der PDF-Gestaltung, Entwurffactory oder App-Aufteilung. Entwurfs-
und Belegausgabequellen werden über P07 hinaus nicht konsolidiert.

## Arbeitswerte und Ableitungsregeln

| Wert | Neue Arbeitsrechnung | Maßgebliche Quelle |
| --- | --- | --- |
| Jahr | kein gespeichertes `year` | Jahr des gültigen Rechnungs-Kalendertags |
| Zeitraum | kein gespeichertes `period` | bestehendes `billingPeriodFromItems`; erster/letzter Leistungsmonat, Rechnungsdatum bei leerem Entwurf |
| Ausgegebener Zeitraum | eingefrorenes `DocumentVersion.outputPeriod` | beim Ausstellen einmalig erfasste P07-Ausgabequelle; auch leere Werte bleiben verbindlich |
| Entwurf/ausgestellt | gespeichertes `status: draft/sent` bleibt | Arbeitsphase; Nummer, Sequenz, Versionsverweis und `sentAt` bleiben |
| Offen/bezahlt | kein gespeicherter neuer Zahlungsstatus | Summe der Zahlungen, deren letzte Zuordnung auf die Version zeigt, gegenüber deren gesichertem Centbetrag |
| Überfällig | keine speicherbare/manuelle Arbeitswahl | offene ausgestellte Projektion, aktiver Anspruch und positiver Centrest; Fälligkeit liegt vor dem lokalen heutigen Kalendertag |
| Zahlungstag | kein neuer Rechnungswert `paidAt` | ausschließlich bestätigte Kalendertage im zugeordneten Zahlungsdatensatz |

Neue Rechnungen tragen `stateModel: derived-v1`. Das kleine Formatkennzeichen
unterscheidet die streng reduzierten Arbeitsdaten von erhaltenen historischen
Rohangaben. Der Validator verweigert dort `year`, `period`, `paidAt`, `paid`
oder `overdue` als Arbeitszustand sowie sämtliche reinen Projektionsfelder.
Es ersetzt keine fachliche Quelle.

`selectInvoice` liefert die Ansicht für Liste, Jahresfilter, Statussortierung,
Detailansicht, Druck und GiroCode. Jahr, Zeitraum und Zahlungsstand werden
nur für diese lesende Projektion ergänzt. `documentContent` entfernt dabei
auch ein projiziertes Jahr neuer Rechnungen. Bei endgültigen Belegen stammen
Zeitraum, Snapshot, Text und Beträge weiterhin aus der vorhandenen einzigen
P07-Ausgabequelle. Historisch gespeicherte Jahreswerte bleiben in der
historischen Quelle; alte Nummernreservierungen werden nicht umgeschrieben.

Ein Betrag von null ist ausgeglichen und wird nicht überfällig. Ersetzte
Originalansprüche werden ebenfalls nicht überfällig. Teilzahlungen verändern
den Centrest; Überzahlungen bleiben über die bestehenden Zuordnungen und
Salden nachvollziehbar. Archivierung verändert den Anspruch nicht.

## Zahlungsaktionen und historische Nachweise

Die Oberfläche behält ihre einfachen Aktionen. „Überfällig“ als veränderbare
Schaltfläche entfällt; auch der Befehl weist diesen Änderungswunsch ab.
„Versendet / offen“ und ausdrückliche Vollzahlung mit tatsächlichem Zahlungstag
bleiben. Ein leeres oder ungültiges Zahlungsdatum wird nicht durch den Klick-
zeitpunkt ersetzt. Datumskorrektur verändert den Zahlungsdatensatz, erhält
`recordedAt`, Betrag, Herkunft und bisherige Zuordnungshistorie und schreibt
einen Verwaltungseintrag.

`syncPaymentStatus` mit seinen zurückgeschriebenen Rechnungswerten entfällt.
`recordPaymentChange` ergänzt lediglich den Nachweis und den Änderungszeitpunkt;
der aktuelle Zahlungsstand bleibt eine Ableitung. Rücknahme löst die
Zuordnung, erhält aber den Zahlungsnachweis. Wiederzuordnung einer einzigen
Vollzahlung verwendet denselben Datensatz. Bestehende Teilzahlungen oder
mehrere Zahlungen werden durch die einfache Vollzahlungsaktion weder kopiert
noch umdatiert. Datumskorrektur ist nur bei genau einer zugeordneten Vollzahlung
zulässig. Die bisherigen Korrektur- und Zuordnungsaktionen bleiben intern
unverändert verfügbar; Geld wird nicht automatisch auf Korrekturen übertragen.

Annahme für eine lesende zusammengefasste Zahlungsprojektion: Nur wenn der
Betrag ausgeglichen ist und alle zugeordneten Zahlungen bestätigte Tage haben,
erscheint der letzte dieser tatsächlichen Tage als `paidAt`. Sobald ein Tag
unbekannt ist, bleibt der zusammengefasste Tag unbekannt. Die einzelnen Tage
bleiben maßgeblich und erhalten; es wird kein Zeitpunkt erfunden. Die Oberfläche
bietet weiterhin nur die vorhandene Datumsaktion für eine einzelne Vollzahlung.

Historische `year`, `period`, `status` und `paidAt` bleiben als Roh-/Ausgabe-
oder Verwaltungsnachweise erhalten. Ein alter Rohstatus kann nach einer
späteren Rücknahme weiterhin „paid“ lauten: Er beschreibt den historischen
Stand und steuert die aktuelle Ansicht nicht. Ein alter Rechnungs-`paidAt`
beweist keinen bestätigten Banktag; nur der Zahlungsdatensatz ist dafür
maßgeblich. Der Originalschutz schützt jetzt auch diese historischen Roh-
status- und Zahlungstagangaben gegen nachträgliche Änderungen. Frühere
unbestätigte Werte bleiben als `legacyPaymentDay` nachvollziehbar. Unbekannte
Tage bleiben bis zur ausdrücklichen Bestätigung unbekannt.

## Migration und Importgrenzen

Schema 14 wird versioniert gespeichert, exportiert und im Speicherumschlag
geprüft. Schema 13 hat einen ausdrücklich begrenzten Altformatadapter und
wird vor der Migration mit allen bisherigen Struktur-, Original-, Nummern-,
Verwaltungs- und Zahlungsinvarianten validiert. Die Migration 13→14 ändert
nur die Schemafassung; Rechnungen, Versionen, Ausgabewerte, Zahlungen,
Verwaltungshistorie und Nummernreservierungen bleiben identisch. Wiederholter
Import von Schema 14 hat keinen Migrationsbericht und ist idempotent.

Die bestehenden Adapter für Schema 2–12 laufen weiterhin vor dem neuen
letzten Schritt. P07 konsolidiert ausschließlich seine bisherigen Kopien,
P06 schützt seine bisherigen Zähler; P08 erweitert diese Migrationen nicht.
Die schon vorher bestehende Regel für Schema 6 bleibt: automatisch erfasste
Zeitpunkte sind keine bestätigten Zahlungstage. Keine neue Interpretation
historischer unbekannter Angaben.

Lokale Altbestände werden wie bisher im geschützten Recovery-Pfad geprüft
und ausdrücklich übernommen. Fehlgeschlagene Prüfungen überschreiben keine
Rohdaten. Neuere/unbekannte Formate bleiben geschützt; Export und Reload
laufen für Schema 14. Altentwürfe dürfen ihre Rohwerte bis zum nächsten
Speichern behalten; der nächste gewöhnliche Speicher-/Finalisierungsvorgang
stellt auf reduzierte Arbeitsdaten um. Historische finale Originale erhalten
kein neues Arbeitsformatkennzeichen und werden nicht umgeschrieben.

## Geänderte Dateien und Abbau

Produktcode (20 Dateien):

- `src/types.ts`: optionale historische/Projizierungsfelder, Formatkennzeichen,
  Schema 14 und reiner Projektions-Centrest; `InvoiceDraft.period` nur noch
  optionaler Altinput.
- `src/lib/documents.ts`, `src/lib/invoiceActions.ts`, `src/lib/utils.ts`:
  Zahlungs-/Jahresprojektion, Kalenderstatus, reduzierte Speicherwerte,
  unveränderte Originale bei Zahlungsänderungen und Zuordnungen.
- `src/lib/documentProjection.ts`, `src/lib/safety.ts`: kein zurückgespeichertes
  Projektionsjahr; Schutz historischer Rohstatus-/Zahlungstagangaben.
- `src/lib/legacyInvoiceState.ts` (neu), `src/lib/legacyValidation.ts`,
  `src/lib/importState.ts`, `src/lib/validation.ts`, `src/lib/envelope.ts`,
  `src/lib/storage.ts`:
  strikt versionierter Altimport und Speicher-/Recovery-Grenzen.
- `src/lib/legacyDocumentOutput.ts`, `src/lib/legacyInvoiceNumbering.ts`:
  notwendige Typgrenzen für historische Jahre und den bestehenden Schema-
  Zwischenschritt; keine geänderte Nummernregel oder Reservation.
- `src/lib/defaults.ts`, `src/lib/commands.ts`, `src/App.tsx`,
  `src/views/InvoiceEditor.tsx`: redundante Arbeits-Zeitraumweitergaben entfernt;
  Demo kopiert den Zahlungsdatumswert ebenfalls nicht mehr in Rechnungen.
- `src/views/Invoices.tsx`: Jahresfilter nutzt die Projektion, manuelle
  Überfälligwahl entfällt.
- `src/components/InvoicePrint.tsx`: optionale historische Typgrenze; kein
  neuer Ausgabefallback auf heutige Daten und keine Layoutänderung.

Neue Tests: `tests/p08-derived-invoice-state.test.ts` (sechs Fachfälle) und
`tests/browser/p08.spec.ts` (drei Browserfälle). Testregistrierung und
Altformatdarstellung: `tests/logic.test.ts`, `tests/documentFixtures.ts`.
Die bestehenden Assertions wurden nur an Schema 14, unveränderte historische
Quellen oder die neue lesende Statusprojektion angepasst:
`tests/adult-recipients.test.ts`, `tests/ap3.test.ts`,
`tests/ap6-integration.test.ts`, `tests/documents.test.ts`, `tests/duo.test.ts`,
`tests/money-calendar.test.ts`, `tests/p05-contacts-recipients.test.ts`,
`tests/p06-invoice-numbering.test.ts`, `tests/p07-document-output.test.ts`,
`tests/payment-reporting.test.ts`, `tests/private-invoices.test.ts`,
`tests/safety.test.ts`, `tests/stabilization.test.ts`,
`tests/browser/accessibility.spec.ts`, `tests/browser/documents.spec.ts`,
`tests/browser/p05.spec.ts`, `tests/browser/p06.spec.ts`,
`tests/browser/duo.spec.ts`,
`tests/browser/stabilization.spec.ts`.

Grob entfallen drei neue Arbeitsfelder (`year`, `period`, `paidAt`), die
unabhängigen Arbeitsstatuswerte `paid/overdue`, die manuelle Überfälligaktion,
mehrere zurückschreibende Status-/Datumszuweisungen und der alte
`syncPaymentStatus`-Mechanismus. 105 Produktzeilen sind ersetzt/entfernt;
die zusätzliche explizite Migration und die Ableitungen machen den Produktcode
insgesamt etwas länger. Es wird kein Netto-Zeilenabbau behauptet. Eingefrorene
Ausgabefelder, historische Beweise, Versions-/Korrekturbeziehungen, bestätigte
Zahlungen, Zuordnungshistorien und notwendiger Versand-/Arbeitsstatus bleiben
mit den oben genannten Gründen gespeichert.

## Ausgangs- und Abschlussprüfungen

Vor Produktänderungen wurden `npm run build`, `npm test`, `npm run lint` und
`npm run test:browser -- tests/browser/documents.spec.ts tests/browser/stabilization.spec.ts`
aufgerufen. `npm ci --ignore-scripts --fetch-retries=0` scheiterte mit
Registry-HTTP-403 bei `yocto-queue`. Deshalb fehlen lokal `tsc`, `esbuild` und
`eslint`; die npm-Gates konnten keine fachliche Aussage liefern. Der historische
Browser-Checkout `ba7857fd…` ist zusätzlich per Git-HTTP-403 blockiert.
Die lokale Laufzeit ist Node 24.19.0 statt des erforderlichen Node 22.

Der vorhandene P07-Ausgangsnachweis [Quality 37064158356](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37064158356)
bestand Installation, Lint, 189 Fachtests, Typprüfung, Build, 63 Browser-/PDF-
Fälle und Audit ohne Funde. Ein GitHub-Vergleich des geprüften Produkt-/Test-
commits `f9ff4f20` mit der P08-Ausgangsbasis bestätigt ausschließlich eine
Änderung in `docs/p07-document-output.md`. Dieser Nachweis gilt für den
Ausgangscode und wird nicht als Prüfung der P08-Änderung ausgegeben.

Nach Änderungen wurden die drei npm-Gates und die betroffenen Browserdateien
(`p08`, `documents`, `stabilization`, `accessibility`) erneut aufgerufen. Die
lokalen Ursachen sind unverändert. Zusätzlich bestehen 64 direkt ausgeführte
Fachtests unter Node 24 mit einem ausschließlich temporären TypeScript-
Importadapter. Darunter P08, Kalender/Cent, P05-/P06-/P07-Original- und
Nummernschutz, Zahlungsdaten, Downloads und Druckjobsteuerung. Das ersetzt
keinen Build oder Browserlauf.

Die vollständige vorhandene Quality-CI prüft den konkreten P08-Head unter
Node 22 mit installierten Abhängigkeiten, historischem Browser-Checkout,
Chromium/Firefox/WebKit und Poppler. Zwischenläufe: erster Lauf 194/195
Fachtests (Altfixture-Vergleich), zweiter Lauf 195/195 und offene Typgrenzen.
Der dritte Lauf bestand auch Build und Typprüfung sowie 64/66 Browserfälle.
Die beiden übrigen Funde waren eine alte Format-13-Textassertion und der
Versuch, eine Schema-13-Testeingabe mit dem aktuellen Exporter zu serialisieren.
Der Test übergibt jetzt die unveränderte alte JSON-Eingabe direkt an den
bestehenden geschützten Importpfad. Der Produktcode blieb dafür unverändert.
Diese Funde sind korrigiert; Assertions wurden an die ausdrückliche
Altformatdarstellung angepasst, historische Originalquellen nicht verändert.

Die vollständige Schlussabnahme des Produkt-/Testheads
`a016f7cb5298b1e59a6e9c6202f2bfb465af30cc` ist grün:
[Quality 37102455794](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37102455794),
03.10.2026, Node 22.23.3, Laufende 06:23 UTC.

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci` | bestanden |
| `npm run lint` | bestanden |
| `npm test` | 195/195 bestanden |
| `npm run typecheck` | bestanden |
| `npm run build` | bestanden |
| `npm run test:browser` | 66/66 bestanden, keine ausgelassenen Fälle |
| `npm audit` | 0 gemeldete Schwachstellen |
| Ergänzende lokale Fachtests | 64/64 bestanden |
| Quellbaumabgleich / `git diff --check` | identisch zu GitHub / ohne Befund |

Alle drei neuen P08-Browserfälle sind registriert und ausgeführt. Sie prüfen
Fälligkeit, Zahlungstag-/Datumsänderung, Rücknahme und Reload; unbekannte
historische Tage vor und nach ausdrücklicher Bestätigung; bestehende
Korrekturzuordnungen und deren Lösung. Die volle Suite enthält außerdem
historische Original-/Registerprüfungen, reale Chromium-PDF-Ausgaben mit
Poppler sowie JSON-Fallbacks in Chromium 153.0.8010.12, Firefox 155.0 und
WebKit 26.6. Synthetische Browser-/PDF-Nachweise sind im Quality-Artefakt
`browser-evidence` gesichert.

Der abschließende Dokumentationscommit ändert ausschließlich diesen Bericht;
Produktcode und Tests bleiben auf dem vollständig geprüften Stand. Der
aktuelle Head-Lauf ist im [Entwurfs-PR #50](https://github.com/sl3ndrr/RiffRechnung/pull/50)
verknüpft.

## Annahmen und offene Punkte

Historische Rohfelder werden vorsichtshalber auch dort erhalten, wo ihre
frühere Bedeutung nicht vollständig bewiesen werden kann. Sie sind keine
zweite veränderliche Quelle für die aktuelle Ansicht. Die Annahme zur
mehrteiligen bestätigten Datumsprojektion steht oben. Keine Zahlungstage,
Zahlungsbeträge, Originale oder verlorenen früheren Ausgaben werden erfunden.

Keine offenen fachlichen oder automatisierten Prüffehler. Die vollständige
lokale npm-/Browserausführung bleibt aus den genannten Umgebungsgründen
blockiert; die vollständige Node-22-CI-Abnahme deckt diese Gates ab. Manuelle
native Banking-/Druckdialoge waren nicht Bestandteil dieses Pakets.

Der PR bleibt Entwurf. Kein automatischer Merge, kein Pages-/Deployment-Lauf
und keine Veröffentlichung wurden ausgelöst.
