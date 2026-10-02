# P06 – Feste Nummerierung je Person beziehungsweise Kombination

## Grundlage und Umfang

Katalogbasis: `4b697df747819c283747f196c172c26af24e155c`.
Ausgangsstand: `e75343eb2c2f2bcebafea8cbd27fe5b0f6ee4e95` auf `main`,
nach Integration von P01–P05. Branch: `simplify/p06-invoice-numbering`.
Repository und Arbeitsverzeichnis enthalten keine `AGENTS.md`. Der Arbeitsbaum
war vor den Änderungen leer bzw. nach Materialisierung des Ausgangsstands sauber.
Der direkte Git-Clone ist in dieser Umgebung gesperrt; Dateien wurden über den
GitHub-Connector aus dem exakten Ausgangscommit gelesen. Die Remote-Commits
basieren auf diesem Commit, nicht auf dem lokalen Hilfs-Snapshot.

Katalogeintrag wörtlich:

> E44
> Fundort: Settings.numberPattern/resetNumberAnnually; Student.billingCode; AppState.counters/nextStudentCodeIndex; utils.nextInvoiceAllocation
> Problem: Nummernkreise pro Lernendem/Kombination, Platzhaltersprache und Legacy-Schlüssel.
> Vorschlag: Wenn nicht nötig: fest YYYY-NNNN und ein Jahreszähler für neue Rechnungen; alte Nummern/Reservierungen behalten.

Die verbindliche Abweichung ist umgesetzt: kein globaler Jahreszähler ohne
Personenkennung. Neue Nummern verwenden ausschließlich **YYYY-NNNN-Kennung**.
Nicht geändert: Rechnungsempfänger und ihre P05-Repräsentation, Unterrichtspreise,
Rechnungstexte, Zahlungen, Backup-Bedienung und PDF-Layout. Keine neuen
Nummernverwaltungsfunktionen, Aufteilungen, Kombinationseingaben oder Freigaben.

## Neue Vergabe

- Beispiele: `2026-0007-a`, `2026-0003-a+b`, `2026-10000-aa`.
- Die Folge ist mindestens vierstellig; höhere Folgen werden nicht abgeschnitten.
- Zähler speichern weiterhin die **nächste** verfügbare Folge:
  `2026:a`, `2026:b` und `2026:a+b` sind eigenständige Kreise.
- Kombinationen entstehen aus vorhandenen `billingCode`-Werten, nach ihrer
  bestehenden Vergabereihenfolge sortiert und mit `+` verbunden.
  `a+b` und `b+a` sind derselbe Kreis; `ab` ist ein eigenständiger Personencode.
  Der Vergleich nutzt Länge und Zeichenfolge, damit auch sehr lange Codes ohne
  Rundungsverlust dieselbe Vergabereihenfolge behalten.
- Ein Abschluss für `a+b` erhöht ausschließlich dessen Kombinationszähler.
  Zwei erziehungsberechtigte Empfänger für `a` verwenden weiterhin `a`.
- `Student.billingCode`, `nextStudentCodeIndex` und vorhandene mehrstellige Codes
  bleiben erhalten. Bestehende Personen übernehmen beim Speichern immer ihren
  bisherigen Code. Umbenennung, Sortierung, Deaktivierung, Empfängerwechsel
  und Reload ändern ihn nicht. Restore mit geänderter Kennung derselben
  Personen-ID wird abgewiesen.
- Neue Jahre haben eigene Kreise. Nummern werden weiterhin erst bei Finalisierung
  vergeben. Korrekturen erhalten neue Nummern; Originale bleiben unverändert.
- Vergabe berücksichtigt Nummern in Rechnungen, gesicherten Belegversionen,
  Reservierungslisten und deren Registerbelegen. Niedrige Zähler dürfen bereits
  vergebene Folgen nicht wiederverwenden. Erschöpfte sichere Ganzzahlen sperren
  die Vergabe, statt eine ungenaue Folge zu schreiben.
- GiroCode benutzt weiterhin `invoice.number` der tatsächlich vergebenen
  Belegversion. Es gibt keine davon unabhängige Musterberechnung.

## Versionierung und geschützte Migration

Persistierte Daten und Speicherumschläge verwenden **Schema 12**; die vorhandene
Speicherversion 4 bleibt bestehen. Aktuelle Daten akzeptieren weder `numberPattern`
noch `resetNumberAnnually`. Schemas 2–11 werden zuerst mit ihren jeweiligen
Altformatregeln validiert. P01–P05 laufen weiterhin auf ihren bisherigen Stufen;
anschließend übernimmt der neue Adapter die Nummerierung. Schema 11 wird ohne
erneute Empfänger- oder Kontaktmigration unmittelbar übernommen.

Ein lokaler Altbestand bleibt bis zur ausdrücklichen Übernahme im bestehenden
Recovery-Modus. Vorschau verändert keinen Eingang. Originalschutz, Web Locks,
Revisionsfolge, Archivierung und atomarer Schreib-/Rollback-Pfad bleiben bestehen.
Erfolgreicher Import/Export/Reload ist idempotent. Ein erneuter Import alter
Backups übernimmt außerdem höhere lokal bekannte Zähler und Reservierungen.
Fehler oder unbekannte neuere Formate überschreiben den Bestand nicht.

Fehlen bei gesicherten Originalen heutige Lernendenstammdaten, wird eine erkennbare
Kennung aus der alten Nummernevidenz verwendet. Ohne erkennbare Kennung schützt
ein konservativer Jahres-Mindeststand die bekannte Folge. Es werden keine Personen
oder fehlenden Originalinhalte rekonstruiert.

Alle bestehenden Rechnungsnummern, Beleginhalte und Reservierungsobjekte bleiben
exakt erhalten. Alte Zählerschlüssel bleiben vorhanden; Werte werden niemals
gesenkt und gegebenenfalls auf einen belegten höheren Mindeststand angehoben.
Sie sind Migrationsnachweise und keine aktive freie Konfiguration.

| Alter Input | Konservative Übernahme |
|---|---|
| `2026:a` | Jahreskreis erhalten; mindestens nach der höchsten bekannten vergebenen/reservierten Folge fortsetzen |
| `2026-a` | Zusätzlich unter `2026:a` reservieren; alten Schlüssel behalten |
| `2026:b+a` | Zusätzlich kanonisch unter `2026:a+b` reservieren |
| Unsegmentiertes `2026:ab` | `ab` erhalten; zusätzlich alle durch vorhandene Codes erklärbaren alten Kombinationen, etwa `a+b`, reservieren |
| Personenbezogenes `global:a` | Den Mindeststand für `a` im Umstiegsjahr und in allen bekannten Rechnungs-, Register- und Zählerjahren übernehmen |
| Nicht personenbezogenes `global`, Jahreskey wie `2026` oder unbekannter Schlüssel | Konservativer Jahres-Mindeststand `Jahr:*` für alle Kreise der betroffenen Jahre; unbekannte globale Zuordnung für sämtliche bekannten Jahre und das Umstiegsjahr |
| Reservierung mit erkennbarer Kennung | Folge in ihrem jährlichen Kreis schützen; alte Standardnummern und das damalige freie Muster dienen ausschließlich zum Lesen von Nummernevidenz |
| Reservierung mit Folge, aber ohne eindeutige Kennung | Jahres-Mindeststand für alle Kreise dieses Jahres; die Reservierung selbst bleibt unverändert |

Bei alter Einstellung `resetNumberAnnually=false` werden außerdem alle bekannten
Zähler-, Beleg- und Reservierungsfolgen über sämtliche bekannten Jahre und das
Umstiegsjahr übernommen. Dies schützt nichtjährliche Folgen auch bei fehlendem
globalem Zählerschlüssel. Unzuordenbare Reservierungen setzen in diesem Fall
den gemeinsamen Mindeststand für diese Jahre.

`Jahr:*` ist ausschließlich eine interne Migrationsuntergrenze. Neue Rechnungen
erhöhen **keinen** globalen Zähler. Einzel- und Kombinationszähler laufen danach
unabhängig weiter. Bei mehrdeutigen Altkeys kann die konservative Übernahme Lücken
erzeugen; eine bereits laufende Folge wird dafür nicht zurückgesetzt.

**Annahme:** Das Umstiegsjahr ist das lokale Kalenderjahr der Übernahme.
Global zählende Altbestände starten darin und in bekannten Bestandsjahren oberhalb
der bisherigen Folgen. Spätere neue, bisher nicht bekannte Jahre beginnen regulär
jährlich bei 1. Nicht gespeicherte verlorene Historie wird nicht rekonstruiert.
Die konkrete Zuordnung und das Umstiegsjahr stehen in den einzelnen Änderungen
des Migrationsberichts. Rohmuster bleiben nur als Altinput/Archivnachweis erhalten;
die laufende Anwendung führt keine Platzhaltersprache mehr aus.

## Geänderte Dateien und Abbau

| Dateien | Änderung |
|---|---|
| `src/lib/utils.ts` | Festes Format, jährlich getrennte Kreise, Nummern-/Folgeschutz; aktiver Musterformatter und `ensureStudentCodePattern` entfernt |
| `src/types.ts`, `src/lib/defaults.ts`, `src/lib/settings.ts`, `src/views/Settings.tsx` | Zwei persistierte Optionen und zwei Formulareingaben entfernt; feste Vorschau und frisch generierte Beispieldaten; Schema-12-Defaults |
| `src/lib/legacyInvoiceNumbering.ts` | Begrenzter Altformatadapter für konservative Zähler-/Reservierungsübernahme |
| `src/lib/importState.ts`, `src/lib/legacyValidation.ts`, `src/lib/validation.ts`, `src/lib/envelope.ts`, `src/lib/storage.ts`, `src/lib/legacyContactsRecipients.ts` | Schema 12, validierte Schema-11-Übernahme, ursprüngliche P05-Stufe, Restore-Schutz stabiler Kennungen |
| `tests/p06-invoice-numbering.test.ts`, `tests/browser/p06.spec.ts` | Zehn neue Logikfälle und ein Browserfall für Migration, UI, getrennte Kreise, Kennungen, Reservierungen, Korrekturen, GiroCode und Reload |
| `tests/documentFixtures.ts` | Explizite historische Einstellungen und schemaabhängige Empfängerfixtures |
| `tests/logic.test.ts`, `tests/commands.test.ts`, `tests/documents.test.ts`, `tests/safety.test.ts`, `tests/invoice-split.test.ts`, `tests/adult-recipients.test.ts`, `tests/ap3.test.ts`, `tests/ap6-integration.test.ts`, `tests/duo.test.ts`, `tests/money-calendar.test.ts`, `tests/p05-contacts-recipients.test.ts`, `tests/payment-reporting.test.ts`, `tests/private-invoices.test.ts` | Aktuelle Format-/Versionsannahmen aktualisiert; historische Nummernfixtures und Originalprüfungen erhalten; höhere Migrationsmindeststände ausdrücklich prüfen |
| `tests/browser/accessibility.spec.ts`, `tests/browser/documents.spec.ts`, `tests/browser/duo.spec.ts`, `tests/browser/p05.spec.ts`, `tests/browser/stabilization.spec.ts` | Aktuelle Nummern-/Versionsannahmen und unbekannte Zukunftsversion aktualisiert |
| `README.md`, `docs/p06-invoice-numbering.md` | Festes Format und Abschlussbericht |

Grob **85 alte Quellzeilen ersetzt/entfernt**, darunter die Muster-Ergänzungsfunktion,
die aktive Platzhalterauswertung, der Legacy-Fallback in der laufenden Vergabe,
die globale Reset-Verzweigung, zwei Settings-Felder und zwei UI-Optionen.
Der notwendige Migrations- und Kollisionsschutz ergänzt Quellzeilen;
das Paket ist deshalb insgesamt kein reiner Netto-Zeilenabbau.

## Prüfungen

Vor Änderungen wurden `npm run build`, `npm test`, `npm run lint` und die
vorhandenen Erstellungstests in `tests/browser/documents.spec.ts` aufgerufen.
Lokal blockierte `npm ci` mit HTTP 403 beim npm-Download; ein kombinierter
Offline-Cache war ebenfalls unvollständig. Die ersten drei Aufrufe scheiterten
an fehlenden Werkzeugen, der Browserwrapper am nicht verfügbaren historischen
Git-Commit `ba7857fd9180fa392c42a0235643e478e5077ee5`.

Der **exakte Ausgangsstand** wurde zusätzlich anhand der bereits erfolgreich
ausgeführten [Quality 37041004781](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37041004781)
geprüft: Node 22.23.3, npm 10.9.9; Installation, Lint, **175/175 Logiktests**,
Typecheck und Build sowie **61/61 Browser-/PDF-Fälle** bestanden.

Nach Änderungen wurden die geforderten lokalen Aufrufe wiederholt. Build und
Lint fehlen lokal weiterhin wegen unvollständiger Abhängigkeiten; `npm test`
erreicht das Bundle, kann aber `qrcode` nicht laden. Der Browserwrapper bleibt
am historischen Git-Checkout blockiert. Mit exakt gecachtem esbuild bestanden
**10/10 P06-Fälle** und **61/61 direkt ausführbare Bestandsfälle**. Der App-Bundle-
Syntaxcheck und `git diff --check` bestanden ebenfalls.

Die vollständige Schlussprüfung mit unverändertem Lockfile bestand auf GitHub:
[Quality 37046372062](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37046372062)
prüfte Produkt-/Testcommit `ae82dd96aa21cfc02ac6d3d01bea6fd258ef76be`
mit Node 22.23.3 und npm 10.9.9.

| Prüfung | Ergebnis |
|---|---|
| `npm ci` | Bestanden |
| `npm run lint` | Bestanden |
| `npm test` | **185/185 bestanden**, darunter zehn P06-Fälle |
| `npm run typecheck` | Bestanden |
| `npm run build` | Bestanden |
| `npm run test:browser` | **62/62 bestanden**, einschließlich vorhandener Erstellung-/PDF-Tests und neuem P06-Fall |
| `npm audit` | **0 Schwachstellen** |
| Lokaler P06-Lauf / direkt ausführbare Bestandsfälle | **10/10 / 61/61 bestanden** |
| Vollständige lokale Pflichtprüfungen | Wegen gesperrtem/unvollständigem Dependency-Download bzw. historischem Git-Checkout nicht ausführbar; vollständig durch CI abgedeckt |

Der abschließende Dokumentationscommit ändert ausschließlich README und diesen
Bericht; die vollständige Abnahme gilt dem oben genannten Produkt-/Testcommit.
Keine funktionalen P06-Punkte sind offen. Die lokale Umgebungsbegrenzung bleibt
bestehen. Es wurde weder gemergt noch deployt;
der [PR 48](https://github.com/sl3ndrr/RiffRechnung/pull/48) bleibt ein Draft.
