# Technik und Migration

Diese Beschreibung folgt dem integrierten Stand P01–P13 und dem kleinen Abschluss P14.
Die [Nutzeranleitung](../README.md) beschreibt die Bedienung; [historische Nachweise](evidence.md) ersetzen frühere Paketmatrizen und CI-Protokolle.

## Stack und Version

React 19, TypeScript 5.7 und Vite 6; Inter, Lucide und `qrcode` bleiben die vorhandenen UI-/GiroCode-Abhängigkeiten. Die genauen aufgelösten Versionen stehen in `package-lock.json`. `.nvmrc` verlangt Node 22.
`package.json.version` ist die einzige maßgebliche App-Version. `src/version.ts` importiert sie direkt für den bestehenden Info-Link; `resolveJsonModule` ist bereits konfiguriert. Paket und Lockfile bleiben unverändert. Die früher unabhängig vergebenen UI-/Release-Nummern sind historische Angaben, keine zweite aktuelle Versionsquelle.

## Lokale Speicherung

`StorageSession` schreibt nach Validierung und Originalschutzprüfung über eine Queue und einen originweiten Web Lock. Ohne Web Locks bleibt der echte Bestand schreibgeschützt; Export ist möglich. Der Demo-Modus verwendet keine echten Speicher-/Schreiblocks.
`localStorage` enthält den Speicherumschlag Version 4 mit Datenschema 15, Bestands-ID, Revision, Commit-ID, Abstammung und Daten. Hauptschlüssel ist `riffrechnung-state-v4`; ein vorheriger Stand und Wiederherstellungsnachweise bleiben im bestehenden Speicherprotokoll. Es gibt keine Serverübertragung von Rechnungsdaten durch die App und keine Verschlüsselung der lokalen Daten oder JSON-Dateien.

Vor jedem Schreiben werden aktuelle Speicher-/Legacy-Tokens geprüft. Ein anderer Tab oder alter Anwendungscode darf nicht unbemerkt überschrieben werden. Der vorhandene Batch-Schreiber stellt bei einem Schreibfehler die vorherigen Werte wieder her. Unbekannte neuere Formate bleiben schreibgeschützt.
Einstellungen werden ausdrücklich gespeichert. Export enthält ausschließlich gespeicherte Daten; Import benötigt Prüfung und Bestätigung.

Das Farbschema ist eine sofort gespeicherte Ausnahme: Topbar und Einstellungsauswahl verwenden denselben Handler und `changeThemeState` über `commit`. Der Command verändert ausschließlich `settings.theme`, ohne Kontodaten zu normalisieren oder eine unvollständige IBAN als neue Bankverbindung zu prüfen; Bestandsvalidierung und Originalschutz bleiben aktiv. Der Audit-Eintrag lautet „Farbschema geändert“. Das Einstellungsformular hält keine Theme-Kopie, und sein Speichern übernimmt das aktuelle Theme innerhalb der Speicher-Queue. Im Demo-Modus wird nichts in den echten Bestand geschrieben.

`riffrechnung-theme-hint` enthält nur `light`, `dark` oder `system` und wird ausschließlich aus bestätigten Einstellungen im echten Modus aktualisiert. Ein kleines Inline-Skript nutzt ihn vor dem App-Bundle; fehlende, ungültige oder nicht lesbare Hinweise bedeuten `system`. Er ist kein Bestandsdatum und keine Quelle der Wahrheit. `WorkspaceShell` wendet nach dem synchronen Laden vor dem ersten React-Paint die bestätigte Auswahl an, folgt Systemwechseln und synchronisiert `theme-color`. Bei späteren Wechseln der aufgelösten Farbe erlaubt die kurzzeitige Klasse `theme-changing` für 250 ms Farb-Transitions außerhalb des Rechnungspapiers. Der erste Paint bekommt keine Überblendung.

## Rückgängig-Meldungen

`undo.ts` verwendet gezielte Umkehrung statt einer vollständigen Bestandskopie. `prepareUndoChangeState` erfasst innerhalb des Commit-Producers die gelöschte Entität, ihre Listenposition und ausschließlich geänderte Zuordnungsfelder (`guardianIds`, Entwurfsempfänger, Lernenden-IDs und Positionen) beziehungsweise das Archivflag. Das Paket lebt nur in der Sitzung. `undoChangeState` prüft aktuelle Verweise und Empfängerberechtigungen sowie den erwarteten Stand betroffener Felder, bevor es sie wiederherstellt. Gelöschte oder inzwischen finalisierte Entwürfe und widersprüchliche Zuordnungsänderungen verhindern Undo atomar. Andere Felder, Einstellungen, neue Personen, Zähler, Zahlungen und Verwaltungshistorien bleiben erhalten. Historische Verweislücken eines gelöschten Korrekturentwurfs werden nicht mit heutigen Stammdaten gefüllt.

Wiederherstellungen laufen als neuer `commit` durch Bestandsvalidierung und Originalschutz, auch in der Demo. Eine Lernendenkennung wird identisch eingesetzt; `nextStudentCodeIndex` wird nicht zurückgedreht. Löschung/Archivwechsel und Umkehrung tragen jeweils einen eigenen Audit-Eintrag mit zusammengehörigen einmaligen Tokens. `commit` bestätigt den im Producer erzeugten Eintrag mit derselben ID einmal am Speicherübergang. Der Umkehr-Command lehnt eine Wiederholung anhand des Tokens beziehungsweise bereits vorhandener Entitäten ab. Bei Archivierung muss außerdem die jüngste Archivänderung zum Paket gehören: auch ein später erneut gleich gesetztes Flag macht ein älteres Paket ungültig. Die UI beansprucht eine Aktion synchron genau einmal, auch vor dem Ende des asynchronen Schreibens. Wiederherstellung/Zurücksetzen entfernen bestehende Undo-Meldungen; ein Moduswechsel räumt die gesamte Sitzung auf.

`useToasts` begrenzt die Anzeige auf drei Meldungen. Jeder Toast besitzt über `useToastTimer` einen aufräumbaren Timer: standardmäßig 4200 ms, für Undo 10 000 ms. Hover und Fokus sind unabhängige Pausengründe; erst nach dem Ende beider läuft die Restzeit weiter. Der Button prüft auch unmittelbar beim Klick den Ablauf. Der Fortschrittsbalken verwendet eine lineare `scaleX`-Animation; beide Bewegungspräferenzen blenden ihn aus, ohne die Frist zu ändern. Toasts fahren beim Erscheinen ein und werden nach der Exit-Animation entfernt. Ausgehende Meldungen sind sofort inert und stoppen ihren Timer; bei drei belegten Plätzen beginnt eine neue Meldung einschließlich ihrer Frist erst nach dem Freiwerden eines Platzes. Der stabile Portalhost liegt außerhalb des inerten App-Hintergrunds und bei offenem Dialog innerhalb dessen Fokusbereichs, ohne Timer oder Fokus beim Umhängen zurückzusetzen. `undo.test.ts` prüft Umkehrung, Konflikte und Replay; `browser/undo.spec.ts` prüft die Bedienung mit virtueller Playwright-Uhr.

## Globale Bewegung

`styles.css` bündelt Kurven und Dauern (140/220/320 ms) sowie `motion-fade`, `motion-rise`, `motion-scale` und die über `--stagger-index` steuerbare Klasse `motion-stagger`. Bewegung verändert ausschließlich Transform und Deckkraft; Farb-Transitions sind auf den kurzzeitigen Themewechsel begrenzt. Seitenwechsel starten nur die Deckkraftanimation des bestehenden `main`; es gibt keinen zweiten Seitenbaum, keinen Remount des Einstellungsformulars und keine Änderung der Fokus-/Inert-Verwaltung. Sidebar und mobile Navigation verwenden je einen transformierten Aktiv-Indikator. Schublade, Scrim, Schalter, Interaktionszustände, Speicherstatus, Demo-Banner und EmptyState nutzen dieselben Tokens. Nur der tatsächliche Speicherzustand `saving` pulsiert wiederholt.

`useReducedMotion` verfolgt die bestätigte Einstellung auf `html.reduce-motion` und die Medienabfrage. Beide Präferenzen kürzen alle Dauern auf 0,01 ms und entfernen auch Staffelverzögerungen. `useMotionPresence` behält genau einen Dialog, Scrim oder Toast während des Exits und räumt ihn spätestens nach seiner berechneten CSS-Dauer auf, auch ohne `animationend`. Wiederöffnen räumt den alten Timer/Listener auf. Bei reduzierter Bewegung entfällt diese Wartezeit. Modal behält Inhalt, Fokusfalle, Stack und Rückgabefokus bis zum tatsächlichen Entfernen; ausgehende Dialogaktionen können nicht erneut ausgelöst werden. ConfirmDialog verwendet dieselbe Grundlage. ImportReview lässt die Modal-Grenze für den Exit gemountet.

`invoice-paper`, `print-root` und sämtliche Druckelemente überschreiben Animationen und Transitions mit `none`; Motion-Utilities im Druck behalten Deckkraft 1. Der Druckablauf und `onPrintReady` warten auf keine Animation. Die Playwright-Hauptsuite verwendet `reducedMotion: 'reduce'`; die eigene `motion.spec.ts` überschreibt dies mit `no-preference` und prüft Dialoge, Timeout-Fallback, Toast/Undo, Navigation, Theme, Schublade einschließlich Desktop-Resize, reduzierte Dauern und Druck in Chromium, Firefox und WebKit. In CI laufen zwei Worker mit getrennten Browserkontexten und `testInfo`-Artefaktpfaden, lokal weiterhin einer. Damit bleibt die erweiterte Abdeckung im bestehenden zehnminütigen Jobbudget; Test- und Assertion-Timeouts werden nicht angehoben. Seiteninterne Eintritts-/Listenanimationen folgen erst in 3.AP7.

## Belegdaten, Nummern und Zahlungen

`DocumentVersion` ist die geschützte Quelle finaler Belege. Ausgabe-Snapshot, Ausgabezeitraum und gesicherte Centbeträge liegen jeweils einmal in der Belegversion; `selectInvoice` leitet die Ausgabesicht daraus ab. `content` speichert keine zweite Kopie dieser Ausgabeinformationen.
`safety.ts` schützt bekannte Versionen, historische Snapshot-Nachweise, Nummernregister, Zahlungen und bisherige Zuordnungen. Verwaltungs-/Klärungshistorien werden fortgeschrieben. Korrekturen erhalten neue Belegversionen und Nummern; das Original bleibt erhalten. Eine ausdrücklich bestätigte Zahlungstagskorrektur und neue Zahlungszuordnung sind vorgesehen, Ursprung/Betrag/Erfassungszeit und frühere Zuordnungshistorie bleiben geschützt.

`recipients` ist die einheitliche Quelle für Rechnungsempfänger. `Student.guardianIds` bleibt die notwendige Stammdatenzuordnung. Jeder gemeinsame Empfänger muss für alle ausgewählten Lernenden berechtigt sein. Die PDF-Ausgabe druckt jeden Empfänger mit dessen eigenen vorhandenen Anschriftteilen; fehlende historische Daten werden nicht aus heutigen Stammdaten ergänzt.

`invoiceNumbering.ts` vergibt `YYYY-NNNN-Kennung` jährlich je Person/Kombination. `a+b` wird nach Vergabereihenfolge kanonisiert und unterscheidet sich von `ab`. Reservierungen und höhere bekannte Zähler werden beim Restore übernommen. Alte globale/nichtjährliche/mehrdeutige Zähler werden konservative Mindeststände; dadurch können Lücken entstehen. Neue Kreise erhöhen keinen globalen Zähler.

`money.ts` berechnet neue Positionen mit ganzzahliger Dezimalarithmetik und kaufmännischer Centrundung je Position. Historische Ausgabebeträge werden nicht neu berechnet. `calendar.ts` behandelt Geschäftstage als gültige gregorianische `YYYY-MM-DD`-Daten und verwendet für „heute“ den lokalen Kalendertag. Arbeitsjahr/Zeitraum sowie Zahlungsstatus werden abgeleitet; historische Rohstatus-/Datumswerte bleiben Nachweise. Überfälligkeit verlangt einen offenen aktiven Anspruch. Unbekannte Zahlungstage werden nicht erfunden.

Neue Empfängerkonten verlangen eine gültige deutsche IBAN, Kontoinhaber und gegebenenfalls gültige BIC. Das GiroCode-Payload verwendet die eingefrorene Ausgabe. Druck wartet auf Schrift-/Bildbereitschaft und verwirft verspätete Ergebnisse einer anderen Anforderung. QR-Fehler benötigen eine ausdrückliche Fallbackbestätigung.
Kontakt-E-Mail ist optional und auf eine ASCII-dot-atom-Adresse ohne Anzeigenamen oder Steuerzeichen begrenzt (`mailbox.ts`); historische Abweichungen werden beim Import gemeldet, nicht still korrigiert.

## Rechnungsvorschau und PDF

`InvoicePrint` verwendet eigene helle Farben auf `.invoice-paper`, gebündelte Inter-Schriften und keine Animationen oder Transitions. `invoicePrintGroups` leitet ausschließlich für die Ausgabe chronologische Kalendermonate ab; die gespeicherte Positionsreihenfolge bleibt innerhalb eines Monats erhalten. Fehlende oder ungültige Leistungsdaten folgen in einer eigenen Gruppe. Positionen verwenden `outputItemCents`, Monatsbeträge `sumCents` und die Endsumme `invoiceTotalCents`. Ein einzelner Monat hat keine zusätzliche Zwischensumme. Weichen die Positionssummen vom eingefrorenen Gesamtbetrag ab oder überschreitet ihre Addition den sicheren Centbereich, bleibt die Ausgabe flach, ohne Beträge oder Originalreihenfolge zu ändern.

Die native Tabelle behält Spalten-/Gruppenüberschriften und den wiederholbaren Druckkopf. Positionszeilen werden zusammengehalten; Summe, die normale Textzeile „Privatrechnung“ und Zahlungsdaten bilden einen gemeinsamen Druckabschluss. Lange freie Hinweise dürfen danach weiterlaufen. Der Abschluss wird als unteilbarer Inline-Block gedruckt; `break-inside: avoid` allein genügt in Chromium bei verschachtelten Zahlungsdaten nicht. Die Rechnungsreferenz wird links unten über eine zusätzliche Seitenrandbox ausgegeben; die vorhandenen Seitenzählungs-/Referenzboxen bleiben erhalten. Browser mit `CSSMarginRule` blenden die normale Fußzeile nur im Druck aus, damit sie nicht doppelt erscheint oder eine zusätzliche Seite erzeugt. Ohne diese Unterstützung bleibt die gewöhnliche Fußzeile erhalten. Das Tabellenblau `#2474DF` ist gegenüber dem geschätzten Entwurfsblau etwas dunkler, damit die weiße kleine Schrift einen Kontrast von mindestens 4,5:1 erreicht. Empfängeranschriften, Lernendenzuordnung, Snapshots und der bestehende QR-Bereitschafts-/Fallbackablauf bleiben unverändert.

## Dashboard-Kennzahlen

`dashboardStats(state, now, year?)` in `dashboardStats.ts` ist eine reine Lesefunktion. Das Jahr folgt standardmäßig dem lokalen Jahr von `now`; `monthly.months` enthält immer die Monate 1–12. `availableYears` enthält die Jahre bestätigter Zahlungstage sowie das laufende Jahr, absteigend sortiert. Unbekannte historische Zahlungstage werden nicht aus Rohdaten oder Erfassungszeiten ergänzt.

Zahlungseingänge zählen jeden vorhandenen Zahlungsdatensatz genau einmal, unabhängig von seiner aktuellen Zuordnung und davon, ob der Beleg archiviert oder ersetzt ist. Eine gelöste oder geänderte Zuordnung entfernt keinen Geldfluss. Bestätigte Teilzahlungen zählen einzeln nach Zahlungstag; `confirmedPaymentDay` beschreibt dagegen die vollständige Begleichung eines Belegs. Unbekannte Tage gehören ausschließlich zu `paid.allTimeCents` und `paid.withoutConfirmedDay`, nicht zum Jahresbetrag oder zur Monatsreihe.

Offene Ansprüche verwenden die vorhandene Belegprojektion, `isActiveClaim`, `openCents` und `effectiveStatus`; archivierte Belege entfallen. Korrekturentwürfe ändern den Originalanspruch nicht. Empfänger- und Lernendenlabels folgen den eingefrorenen Ausgaben. Tagesdifferenzen entstehen über `calendarDaysBetween` ohne Millisekundenrechnung; zukünftige Rechnungen zeigen null Tage seit Ausstellung. `daysUntilDue` ist die nichtnegative Zahl der Kalendertage bis zur Fälligkeit. Berechenbare Entwürfe zählen in `drafts.count` und `totalCents`; eine Vorschau mit `null` zählt nur in `uncalculableCount`. `drafts.totalCount` umfasst beide Gruppen.

Alle Summen verwenden `sumCents`. Für Ansprüche ohne Überzahlung gilt Rechnungssumme = Zuordnung + Restbetrag. Bestehende Zuordnungen können eine niedrigere Korrektur überzahlen: gemäß `openCents` bleibt der Rest dann null, während der volle Zahlungseingang erhalten bleibt. Die Gleichheit lässt sich für diesen bereits unterstützten Fall nicht ohne Verfälschung der Zahlungen erzwingen. Die Fachtests prüfen beide Fälle sowie Jahreswechsel, Sommerzeit, historische Ausgabebeträge und Demo-Daten.

`Dashboard.tsx` verwendet `dashboardStats` über `useMemo` auf Bestand, injizierter Uhr und ausgewähltem Jahr. Die lokale Uhr wird minütlich aktualisiert; ohne ausdrückliche Jahreswahl folgt die Anzeige dem laufenden Jahr. `dashboardGreeting` begrüßt von 05:00 bis 10:59 mit „Guten Morgen“, von 11:00 bis 17:59 mit „Guten Tag“, sonst mit „Guten Abend“, ergänzt um das erste Wort des bestätigten Ausstellernamens. Das reine SVG-Monatsdiagramm skaliert ausschließlich Centwerte und ergänzt eine zugängliche Tabelle sowie sichtbare Beträge. Mobil ist das Diagramm bei Bedarf per Tastatur horizontal scrollbar.

Dashboard ist das Startziel und das Ziel erfolgreicher Wiederherstellung bzw. Rücksetzung. Ein Rechnungssprung setzt die bestehende Auswahl in `Invoices`; dessen Detail-Fokus und Escape-Rückkehr bleiben erhalten. Die Vorschau ist auf acht offene Ansprüche begrenzt. Der Listenlink setzt `unpaid`, das aktive, nicht archivierte Ansprüche mit positivem Rest über die vorhandenen Belegfunktionen filtert. „Person anlegen“ öffnet ohne vorhandene Erziehungsberechtigte deren Formular, sonst das Lernendenformular. Backup-Erinnerungen gelten ausschließlich im Echtmodus und verwenden den bestehenden Export aus `useLocalWorkspace`. Mehr als 30 Tage (je 24 Stunden) seit dem gespeicherten Exportzeitpunkt lösen die Erinnerung aus; Schema, Originalschutz, Speicherpfade, PDF und Version bleiben unverändert. Die Dashboard-Klassen enthalten keine neuen Animationen.

## Migration und ausdrücklich erlaubte Feldbereinigung

`inspectImport` unterstützt die vorhandenen Schemas 2–15 und prüft alte Formate über begrenzte Adapter. Die Vorschau schreibt nichts. `StorageSession.restore` prüft bekannte Originale, Bestandshistorie und Kennungen vor dem bestätigten Schreiben. Ein Fehler oder eine unlesbare verdächtige Nebenstruktur lässt die Ausgangsschlüssel unverändert. Vor einem Umstieg alte Tabs schließen und vorhandene externe Sicherungen aufbewahren; eine Rückkehr zu altem Code auf dem umgestellten Profil ist kein unterstützter Rückweg.

Der vereinbarte Schutz erlaubt ausdrücklich diese Löschungen, auch in Belegversionen, Konfliktnachweisen und internen Wiederherstellungskopien:

| Entfernte Daten | Vorhandene Adapter und Nachweise |
| --- | --- |
| `invoiceProfile`, `taxIdentifier`, `invoiceKind`, `taxPresentation`, `taxOutput` | `legacyTaxFields.ts`, `recoveryTaxCleanup.ts`; `private-invoices.test.ts` |
| Zahler-IBAN/`Guardian.iban`, `Guardian.paymentNote`, `Student.note`; alte separate Namensfelder | `legacyContactsRecipients.ts`, `recoveryContactCleanup.ts`; `p05-contacts-recipients.test.ts` |
| `introText`, `legalText`, `defaultLegalText`, `outputLegalText` | `legacyInvoiceTexts.ts`; `p09-invoice-texts.test.ts` |

Erfolgreiche Übernahme bereinigt diese Werte aus Hauptbestand, Vorgänger-/Legacy-Schlüsseln und internen Archiven. Die vorhandenen Tests prüfen zusätzlich Reload, normalen Export, Migrations-/Archivexport sowie unveränderte Ausgangswerte bei fehlgeschlagenen Writes. Ausstellerkonto, Beträge, Nummern, Empfänger, Leistungsdaten, Zahlungsnachweise und `freeText` (Rechnungshinweis) bleiben erhalten. Eigene Freitexte werden nicht nach früheren Begriffen durchsucht oder umgeschrieben. Neue aktuelle Daten und normale Exporte lehnen entfernte Felder durch die Schlüsselvalidierung ab.

Historische `separate`-Belege benötigen weiterhin die vorhandenen Altentwurfs-/Korrektur- und Klärungswege. `historicalSplit.ts`, Altvalidatoren und unabhängige Gold-Fixturen sind keine aktive neue Aufteilungsfunktion. Erfolgreich migrierte Arbeitsdaten enthalten keine Duo-Gruppen und kein Nummernmuster.

## Bekannte Bereinigungslücken

Die weitergehende Vorgabe „keine dauerhaften Kopien abgeschaffter Datenfelder“ ist für zwei bestehende Altpfade noch nicht vollständig erfüllt:

- `importState.ts` bewahrt bei Schema 8/9 das gesamte `duoGroups`-Objekt als `report.changes[].before`. `storage.ts` archiviert zusätzlich die bereinigte Eingangsdatei; `cleanRecoveryFields` entfernt die Gruppe nicht. Migrationsbericht und Wiederherstellungsarchiv können diese Daten weiterhin exportieren. `tests/duo.test.ts` erwartet diesen bisherigen Erhalt ausdrücklich.
- `legacyInvoiceNumbering.ts` entfernt `numberPattern`/`resetNumberAnnually` aus aktuellen Einstellungen, bewahrt ihre Werte aber im Migrationsbericht. Die internen Rohkopien werden dafür nicht bereinigt; Migrations-/Archivexport kann sie enthalten.

Diese Fach-/Migrationslücken werden in P14 gemeldet, nicht durch eine neue Migration behoben. Die normale aktuelle JSON-Sicherung enthält diese Felder nicht. Vorhandene alte Datei-Handles in IndexedDB bleiben gemäß dem integrierten P04-Verhalten unbenutzt; die Anwendung liest oder schreibt sie nicht (`tests/browser/storage.spec.ts`).

## Aktueller Prüfweg

Befehle aus `package.json`, `.github/workflows/quality.yml` und den beiden Playwright-Konfigurationen:

```sh
npm ci
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
# Unter Ubuntu/Debian: pdftotext für die PDF-Prüfungen bereitstellen.
sudo apt-get install -y poppler-utils
npm run test:browser
npm run test:migrations
npm audit --json
```

`npm test` bündelt alle `tests/*.test.ts` direkt über `scripts/bundle-tests.mjs` und führt die Fachtests mit `node --test` aus. Auch die schnellen Altformatregressionen gehören dazu. `npm run build` führt `tsc -b && vite build` aus; der Build prüft App, Node-Konfiguration und Tests. `npm run typecheck` ist als gezielter lokaler Befehl vorhanden, wird in CI nicht zusätzlich zum Build ausgeführt.

`test:browser` startet ausschließlich gewöhnliche Browser-/PDF-Fälle: Chromium als Hauptlauf, je drei JSON-Fallbackfälle in Chromium, Firefox und Linux-WebKit. `test:migrations` baut separat den unveränderten historischen Commit `ba7857fd9180fa392c42a0235643e478e5077ee5` und führt die beiden historischen Browserfälle unter derselben Origin aus. Dieser Befehl benötigt Git-Historie oder einen erreichbaren `origin` sowie die installierte Vite-/Playwright-Toolchain; temporäre Altcode-Pfade werden anschließend entfernt.
JSON-Ergebnisse stehen in `test-results/browser-results.json` und `test-results/migration-results.json`; synthetische PDFs und Fehlerkontext im selben Artefaktbereich. Der vorhandene CI-APT-Workaround und alle Gates bleiben unverändert.

Für lokale Entwicklung: `npm run dev`; zur Kontrolle des gebauten Ergebnisses: `npm run preview`.
Automatisierte PDF-Prüfungen decken Text, Seitenumbrüche, Empfängeranschriften, eingefrorene Konten, GiroCode und QR-Fallback in Chromium ab. Native Druckdialoge, physische Ausdrucke, Firefox-/Safari-PDF, Banking-App-Scans und reale Altbestände werden dadurch nicht als abgenommen behauptet. Historische visuelle P11-/P12-Nachweise stehen im [Nachweisindex](evidence.md).
