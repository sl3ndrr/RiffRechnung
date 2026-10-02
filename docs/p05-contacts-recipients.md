# P05 – Stammdaten, Notizen und Empfänger vereinfachen

## Ergebnis und Abnahmegrenze

Branch: `simplify/p05-contacts-recipients`. Umgesetzt sind E38–E41 mit
den verbindlichen Konkretisierungen des Auftrags. Schema **11** ersetzt Schema
10; Speicherprotokoll 4 und Archivformat 1 bleiben bestehen.

Der ursprüngliche Auftrag endete mit lokaler Implementierung und ergänzenden
Logikprüfungen; die vollständige lokale Abnahme war wegen der unten beschriebenen
Umgebungssperren offen. Der ausdrückliche Folgeauftrag autorisiert den Merge nach
`main`. Die identischen Dateibäume der drei lokalen Commits wurden auf dem echten
GitHub-Ausgangscommit veröffentlicht und mit zusätzlichen CI-Korrekturen geprüft.
Die vollständige Node-22-Gesamtabnahme und die Merge-Zuordnung stehen in
[PR 47](https://github.com/sl3ndrr/RiffRechnung/pull/47). Beim Merge startet der
vorhandene Pages-Workflow automatisch; kein zusätzlicher Deployment-Lauf wird
manuell ausgelöst.

Ausgang ist das integrierte `main` mit Commit
`10a2906f9ecf8c21518d7fe862adada06e80d2fa` nach P04/PR 46. P01–P03 sind
ebenfalls integriert. Katalogbasis bleibt
`4b697df747819c283747f196c172c26af24e155c`.
Der Arbeitsbereich enthielt anfangs keinen Checkout. Nach blockiertem Git-Zugriff
wurden 107 Dateien über die GitHub-Verbindung materialisiert und ihre Git-Blobs
gegen den Ausgangsbaum geprüft. Lokaler, ausdrücklich synthetischer Basiscommit:
`33dac1c`. Im Repositorybaum gibt es keine `AGENTS.md`.

Die Vorarbeiten wurden anhand von Code und vorhandenen Regressionen geprüft:
Steuerabbau und Bereinigung interner Kopien aus P01, Entfernung des Duo-Gruppen-
workflows aus P03, geschützter JSON-Import sowie ausdrückliche Einstellungsspeicherung
aus P04 bleiben bestehen. Diese Pakete werden nicht erneut erweitert.

## Namensentscheidung und entfernte Daten

- Erziehungsberechtigte verwenden ein Feld **Name**. Vorname, Nachname,
  Synchronisierung und „Unverändert behalten“ entfallen.
- Ein nichtleerer bisheriger `Guardian.name` bleibt einschließlich seiner
  ursprünglichen Darstellung erhalten. Nur bei fehlendem, nullwertigem oder
  leerem Namen werden vorhandene Vor-/Nachnamenswerte mit einem Leerzeichen
  zusammengesetzt. Namen werden niemals automatisch zerlegt.
- Neue und geänderte Namen werden auf Leere, Steuerzeichen und die bisherige
  gemeinsame Maximallänge von 241 Zeichen geprüft. Ein unveränderter Altname
  darf bei der Änderung anderer Kontaktangaben erhalten bleiben, auch wenn er
  außerhalb der heutigen Eingabegrenzen liegt.
- `Guardian.iban`, `Guardian.paymentNote` und `Student.note` werden im Altimport
  aus Stammdaten entfernt. Es gibt keine dauerhafte Archivkopie dieser Werte.
  Auch `Guardian.firstName` und `Guardian.lastName` entfallen nach Übernahme der
  Namensdarstellung. Aktuelles Schema, Oberfläche und neue Exporte akzeptieren
  diese Felder nicht mehr.
- Ausstellerkonto in Einstellungen und eingefrorenen Belegen, GiroCode,
  Rechnungshinweis `freeText`, IDs, Nummerierung, Unterrichtspreise und Zahlungen
  bleiben erhalten. Die bisherigen externen Sicherungsdateien werden weder
  bearbeitet noch gelöscht.

## Empfängermigration und Originalschutz

`Invoice.recipients`, `InvoiceDraft.recipients` und `InvoiceSnapshot.recipients`
sind die einzigen aktuellen Empfängerquellen. `Student.guardianIds` bleibt die
Beziehung zwischen Lernenden und Erziehungsberechtigten. Abgeleitete Guardian-IDs
existieren nur noch vorübergehend für Auswahl und Beziehungskontrolle.

Der begrenzte Altadapter liest Rechnungs-`guardianIds` und Snapshot-`guardians`
für Schemata vor 11. Er normalisiert auch vollständige Belegversionen,
Drucksnapshots, Snapshot-Korrekturen und bekannte Snapshot-Konfliktnachweise.
Historische Namen und Anschriften stammen aus diesen eingefrorenen Daten;
der neue Adapter rekonstruiert sie nicht aus heutigen Stammdaten. Bereits
vorhandene typisierte Empfänger bleiben bei doppelter Darstellung maßgebend,
wie im bisherigen Ausgabeweg.

Abweichende eingefrorene Guardian-Daten werden als Konfliktnachweis im vorhandenen
Klärungspfad erhalten. Widersprüchliche Zuordnungs-IDs werden weiterhin abgelehnt.
Bei widersprüchlichen eingefrorenen Darstellungen ohne vollständige Belegversion
bleibt der Umstieg gesperrt: Für einen solchen Entwurf gibt es keine bestehende
Belegverwaltung, die beide Nachweise aufnehmen kann. Der Ausgangsbestand bleibt
erhalten; es wird kein neuer Klärungsworkflow eingeführt.

Ein oder zwei berechtigte Erziehungsberechtigte sowie Selbstzahler funktionieren.
Beide vorhandenen Guardian-Anschriften werden eingefroren; fehlende Anschriften
blockieren nicht. Jeder ausgewählte Empfänger einer neuen Rechnung muss die Daten
**aller** ausgewählten Lernenden erhalten dürfen. Der bisherige Prüfpfad für
typisierte Empfänger wurde entsprechend geschlossen; allein die Beziehung zu
einer von mehreren lernenden Personen reicht nicht aus. Historische Belege werden
dadurch nicht umgeschrieben. Stammdatenänderungen verändern finale Empfänger nicht.
Der PDF-Renderer und die konkrete Empfängergestaltung bleiben P11 vorbehalten.

Der Originalvergleich für Wiederherstellung vergleicht den geprüften Ausgang mit
dem geprüften Ziel in derselben normalisierten Darstellung. Er erlaubt nur die
ausdrücklich entfernten Kontaktfelder und notwendigen Repräsentationsänderungen
zusätzlich zu bestehenden Altmigrationen. Normale Schreibvorgänge verwenden
weiterhin den unveränderten Originalschutz. Änderungen etwa an `freeText`,
Originalbelegen oder bekannten Belegversionen werden nicht als P05-Migration
freigegeben.

## Bestandsbereinigung und Fehlerverhalten

Erst die erfolgreiche, ausdrücklich bestätigte Übernahme schreibt Schema 11.
Der migrationsspezifische Bereiniger entfernt abgeschaffte Kontaktfelder auch
aus internen Vorgänger-/Legacy-Kopien, Rohdaten im Wiederherstellungsarchiv und
bekannten Berichtsdarstellungen. Neue Löschvermerke enthalten nur `[entfernt]`,
keine ursprünglichen Inhalte. Aussteller-IBAN und Belegtexte bleiben erhalten.

Nicht lesbare interne Kopien mit möglichen abgeschafften Feldnamen verhindern
die Übernahme konservativ. Vorprüfung, Web Lock, Revisions-/Legacy-Guard,
Schreibbatch und Rücksetzung bei Fehlern bleiben bestehen. Die Regressionen
prüfen Fehler beim Schreiben von Hauptbestand, Vorgänger und Archiv sowie
unlesbare oder ungültige Nebenkopien: Sämtliche Ausgangsschlüssel bleiben dabei
unverändert, und ein anschließender erfolgreicher Versuch ist möglich.

Vor der Übernahme kann die vorhandene Rettungsaktion die unveränderte externe
Originaldatei exportieren. Eine solche ausdrücklich erzeugte Datei wird später
nicht durch die App bereinigt. Nach erfolgreicher Übernahme enthalten aktuelle
Speicherung und neu erzeugte Bestands-/Berichtsexporte die entfernten Inhalte
nicht mehr. Es wurden ausschließlich synthetische Testbestände verwendet;
kein realer Nutzerbestand wurde bearbeitet.

## Geänderte Dateien

Alle kurzen Dateinamen der folgenden Tabelle beziehen sich auf das genannte
Verzeichnis.

| Bereich | Dateien und Änderung |
| --- | --- |
| Datenmodell und Name | `src/types.ts`; `src/lib/contactName.ts`, `defaults.ts`; `src/views/People.tsx`: Schema 11, ein Name, entfernte Kontaktfelder und UI, bereinigte Demo |
| Rechnungsempfänger | `src/App.tsx`; `src/lib/commands.ts`, `documents.ts`, `invoiceActions.ts`, `recipients.ts`, `utils.ts`; `src/views/InvoiceEditor.tsx`: ausschließlich aktuelle `recipients`, abgeleitete Auswahl, Berechtigung für alle Lernenden |
| Altimport und Speicherung | `src/lib/envelope.ts`, `importState.ts`, `legacyValidation.ts`, `validation.ts`, `storage.ts`; neu `legacyContactsRecipients.ts`, `recoveryContactCleanup.ts`: explizite Versionierung, begrenzte Adapter, Kopienbereinigung und Schutzvergleich |
| Übernahmehinweise | `src/views/ImportReview.tsx`, `StorageRecovery.tsx`: Namensentscheidung und endgültige Kontaktbereinigung sichtbar erklärt |
| Neue P05-Regressionen | `tests/p05-contacts-recipients.test.ts`, `tests/browser/p05.spec.ts`: Bestandsbereinigung, Namenspriorität, Adressen, widersprüchliche Empfänger, unveränderte Originale, Schreibfehler, Reload und UI |
| Bestehende Logiktests | `tests/adult-recipients.test.ts`, `ap3.test.ts`, `ap6-integration.test.ts`, `commands.test.ts`, `documents.test.ts`, `duo-output.test.ts`, `duo.test.ts`, `invoice-split.test.ts`, `logic.test.ts`, `money-calendar.test.ts`, `payment-data.test.ts`, `payment-reporting.test.ts`, `print-job.test.ts`, `private-invoices.test.ts`, `safety.test.ts`, `stabilization.test.ts`: Schema-/Empfängerdarstellung und Schutzvergleiche angepasst |
| Testhelfer | `tests/documentFixtures.ts`, `duoFixtures.ts`: aktuelle Fixtures und ausdrücklich getrennte Altformat-Fixtures |
| Bestehende Browsertests | `tests/browser/documents.spec.ts`, `duo.spec.ts`, `fallback.spec.ts`, `print.spec.ts`, `stabilization.spec.ts`: ein Namensfeld, aktuelle Empfängerlisten, Schema 11 und neuere unbekannte Version 12 |
| Dokumentation | `README.md`, `docs/p05-contacts-recipients.md`: aktueller Kontakt-/Empfängerumfang und Abschlussbericht |

Grob gegenüber dem Ausgang: **209 Quellzeilen entfernt, 333 hinzugefügt** in
20 Quelldateien; netto 124 Zeilen zusätzlich, vor allem für begrenzte Migration
und sichere Kopienbereinigung. Entfernt sind fünf skalare Kontaktfelder,
Rechnungs-/Entwurfs-`guardianIds`, Snapshot-`guardians`, die getrennte
Namenszusammensetzung im normalen Speichern, `keepLegacyName` und die dazugehörigen
UI-Aktionen. `GuardianSnapshot` bleibt als gemeinsamer Empfängerdatentyp erhalten.

Thematische lokale Commits:

1. `57c65fd` – Kontaktfelder, Schema 11 und Empfängernormalisierung.
2. `64de8f1` – Bereinigung, eingefrorene Empfänger und Originalschutz testen.
3. Abschließender Commit – Browserregressionen, README und dieser Bericht.

Die entsprechenden ersten GitHub-Commits sind `58dc247`, `3152d25` und `13eb04f`.
Weitere thematische Commits beheben zwei Lintbefunde, einen verbliebenen
Altformat-Snapshotvergleich, Typen historischer Snapshot-Nachweise und
Browser-Fixtures/-Selektoren. Die echte historische Anwendung erhält ausschließlich
in ihrer Testeingabe die damals verpflichtenden, heute entfernten Kontaktfelder;
aktuelle Fixtures und Produktdaten erhalten sie nicht zurück.

## Prüfergebnisse

Umgebung: Node `24.19.0`, npm `11.9.0`; das Projekt verlangt Node 22.

| Prüfung | Vor Änderungen | Abschließender Stand |
| --- | --- | --- |
| `npm ci --fetch-retries=0 --fetch-timeout=15000` | HTTP 403 bei `yocto-queue`; keine Installation möglich | Kein erfolgreicher Installationsstand verfügbar |
| `npm run build` | Exit 127, `tsc` fehlt | Erneut Exit 127, `tsc` fehlt |
| `npm test` | Exit 127, `esbuild` fehlt | Erneut Exit 127, `esbuild` fehlt |
| `npm run lint` | Exit 127, `eslint` fehlt | Erneut Exit 127, `eslint` fehlt |
| Betroffene Browsertests | Historischer Vergleichscheckout nicht verfügbar | Exit 1: Git-Fetch von `ba7857fd9180fa392c42a0235643e478e5077ee5` erhält HTTP 403 |
| Ergänzende direkte Logiktests | — | **79/79 bestanden**, darunter **14 P05-Fälle** |
| Weitere unveränderte Logiktestkörper ohne Rendering | — | **78/78 bestanden**; 19 Renderingfälle bewusst nicht ausgeführt |
| TS/TSX-Syntaxprüfung | — | **80 Dateien**, keine Parserfehler oder ungenutzten Wertimporte gemeldet; keine Typprüfung oder Lint-Abnahme |
| `git diff --check` | Verifizierter sauberer Ausgang | Bestanden |

Der abschließende Browsertest-Aufruf umfasst `p05.spec.ts`, `documents.spec.ts`,
`storage.spec.ts`, `duo.spec.ts`, `fallback.spec.ts`, `print.spec.ts` und
`stabilization.spec.ts` in `tests/browser`. Er erreicht wegen des gesperrten
Git-Fetchs keinen Browserfall.

Die ergänzenden **157 bestandenen Logiktests** verwenden Nodes experimentelle
TypeScript-Transformation und einen temporären Extension-Resolver, keine Ersatz-
implementierung von React. Direkt ausgeführt wurden `p05-contacts-recipients`,
`storage`, `safety`, `duo`, `stabilization`, `ap6-integration`, `payment-reporting`,
`money-calendar`, `payment-data`, `print-job` und `downloads` aus `tests/*.test.ts`.
Weitere Testkörper aus `adult-recipients`, `ap3`, `commands`, `documents`,
`duo-output`, `invoice-split`, `private-invoices` und `logic` wurden mit unveränderten
Assertions ohne ihre React-Importe ausgeführt. Die 19 ausgeschlossenen Fälle
benötigen echtes React-Rendering und werden nicht als bestanden gezählt.
Temporäre Hilfsdateien sind kein Teil der Änderung.

## Annahmen und offene Punkte

- Nur die ausdrücklich abgeschafften Kontaktdaten werden entfernt. Sonstige
  unbekannte oder widersprüchliche Daten werden nicht stillschweigend bereinigt.
- Die bisher verwendete typisierte eingefrorene Empfängerliste bleibt bei
  widersprüchlichen parallelen Daten maßgebend; Gegenbelege bleiben im bestehenden
  Klärungspfad erhalten. Ohne diesen Pfad erfolgt keine automatische Übernahme.
- Gemeinsame neue Rechnungen setzen Berechtigung jedes Empfängers für alle
  Lernenden voraus. Zwei Eltern eines gemeinsamen Kindes bleiben möglich;
  fremde Haushaltsdaten werden nicht über eine teilweise Beziehung freigegeben.
- Die bestehenden Altmigrationen für Daten vor eingeführten Belegversionen bleiben
  erhalten. Die neue Empfängernormalisierung selbst liest ausschließlich die
  vorhandenen eingefrorenen Darstellungen.
- Die lokalen Umgebungssperren bestehen weiterhin. Für die Gesamtabnahme ist
  der vollständige Node-22-Lauf in PR 47 mit installierten Projektabhängigkeiten,
  Typprüfung/Build, regulärem Testlauf, Lint, Browser-/Dokumentfällen und Audit
  maßgebend. Lokale Ersatzprüfungen allein erlauben keine grüne Gesamtabnahme.
- Keine PDF-Neugestaltung, Zusatzfunktion, Preis-/Zahlungs-/Nummerierungsänderung,
  App-Neuaufteilung oder automatische Veröffentlichung.
