# P12 – ruhiges Bildschirmdesign und CSS-Bereinigung

## Ausgangsstand und Arbeitsweise

Katalogbasis: `4b697df747819c283747f196c172c26af24e155c`. Integriertes `main`: `77f7f812f65adcdc2a4ecf8a27ecd40024ace4bf`, Merge P11/PR #53. Die Repository-Historie enthält P01–P11 (PRs #43–#53). Keine AGENTS.md im vollständigen Repository-Baum. Der Arbeitsbereich enthielt keinen Checkout und keine Benutzeränderungen. Branch: `simplify/p12-calm-screen-design`.

Der direkte Git-Klon wurde mit HTTP 403 abgewiesen. 141 Dateien wurden commitgebunden über das ausgewählte GitHub-Plugin gelesen; jede Blob-SHA und der gesamte Tree `e88ca7a2947468a982726a7901d25a7305e3f83d` wurden lokal bestätigt. Der lokale Hilfscommit dient nur dem Vergleich. Veröffentlichte thematische Commits bauen auf dem echten `main` auf.

Vor Änderungen versucht: `npm ci`, `npm run build`, `npm test`, `npm run lint`, `npm run test:browser -- --project=chromium tests/browser/accessibility.spec.ts tests/browser/p10.spec.ts tests/browser/print.spec.ts`. Registry HTTP 403 verhindert tsc/esbuild/eslint; der Browserwrapper kann seinen historischen Commit ohne Git-Zugriff nicht holen. Lokales Node: 24.19.0. Keine Abhängigkeit, CI-Konfiguration oder Testhub-Struktur geändert.

Tatsächlicher Ausgangsnachweis: [Lauf 37140089518](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37140089518), exakt `77f7f812`, alle Quality-Schritte erfolgreich: npm ci, Lint, 209/209 Fachtests, Typecheck, Build, 81/81 Browserprüfungen und Audit unter Node 22.23.3. Das dortige Deployment stammt aus dem vorherigen Merge; P12 löst keine Veröffentlichung aus.

Vorprüfung: reduzierte P10-Oberfläche mit Rechnungen, Personen und Einstellungen; P11 verwendet eine einfache Positionstabelle, eingefrorene Empfängeranschriften und denselben GiroCode-/Druckauftrag. `src/content/about.ts` fehlt bereits seit P02 und wird nicht wiederhergestellt.

## Änderung und Grenzen

Neutrale helle/dunkle Flächen, Blau als einziger Interaktionsakzent, Radien aus der vorhandenen Skala (8/12 px), gemeinsame Abstandstokens und kleinere Überschriften. Lesbare Labels im Formular/Editor (14 px statt 10/8 px), sonstige kleine Bildschirmtexte mindestens 12 px. Erforderliche Fehler-, Erfolgs- und Warnfarben bleiben erhalten. Dekorative Keyframes, Transitionen, Blur, Schatten und Kartenversatz entfallen. Strukturelle Transformationen für eingeklappte Navigation, Skip-Link und Switch-Zustand bleiben. System-/Hell-/Dunkel-Einstellung sowie gespeicherte und System-Bewegungspräferenzen bleiben funktional. Fokus wird als kontrastierende Kontur gezeigt.

Pro Position: Datum, Beschreibung, Menge, Einzelpreis und Betrag als Kernbereich. Einheit, Art (Solo/Duo) und bei mehreren Lernenden deren Zuordnung stehen direkt sichtbar in einer ruhigen zweiten Zeile; kein neuer Aufklappzustand. Kleinere Ansichten stapeln die Felder. Footeraktionen umbrechen anhand ihrer tatsächlichen Beschriftung; „Abbrechen“ wird auch bei 320 px vollständig dargestellt. Mengensteuerung erhält größere Minus-/Plus-Tasten in derselben visuellen und Tab-Reihenfolge. Bestehende Handler, Grenzen, Rechenwerte und Speicherformate sind unverändert.

Mobil bleibt der abgeleitete Zahlungsstand direkt unter Nummer und Datum sichtbar: Offen, Bezahlt, Überfällig bzw. Entwurf. Desktop behält die Statusspalte; der mobile Zusatz wird dort ausgeblendet. Zeitraum/gesonderte Statusspalte sind mobil sekundär. Die schmale Tabelle lässt Nummern, Namen und Überschriften umbrechen und hält Aktionen erreichbar. Ein eigener Headernachweis schützt vor überlappenden Beschriftungen bei 320 px.

Unverändert: Modelle, Berechnung, Nummerierung, Empfängerdaten, Selbstzahler, beide gemeinsamen Empfänger, GiroCode, Navigation und Druckaufträge. Sowohl alle `.print-root`/`.invoice-*`-PDF-Regeln als auch der vollständige `@media print`-Block sind bytegleich mit P11. Die globale Bildschirmtypografie trifft keine PDF-Schriftgrößen; die PDF-Ausgabe setzt eigene Größen und verwendet keine Formular-/Kartenklassen.

## CSS-Nichtverwendung und Quellmuster

Vor Löschung wurde der gesamte aktuelle `src`-Baum einschließlich zusammengesetzter `className`-Ausdrücke, CSSProperties und dynamischer Klassennamen geprüft.

| Katalog | Nachweis / Ergebnis |
| --- | --- |
| E35 segmented-control | Kein TSX-/Runtime-Vorkommen; vier Basisregeln und die mobile Regel entfernt |
| E35 segmented-field | Kein TSX-/Runtime-Vorkommen; aus zwei geteilten Selektoren entfernt, chip-fieldset erhalten |
| E35 status-editor__reopen | Kein TSX-/Runtime-Vorkommen; beide Regeln entfernt, aktuelle Zahlungsaktionen erhalten |
| E35 invoice-qr > span | Im integrierten P11-Stand bereits entfernt; bestehende img/p-Regeln weiterhin verwendet |
| E45 | Sieben dekorative Keyframes sowie zugehörige Animationen/Transitionen/Blur/Schatten und unbenötigte Farb-/Motion-/Shadow-Tokens entfernt; TSX-Verzögerung und dynamische Avatar-Farben samt drei Regeln entfallen |
| E61 | Sieben readFileSync-Aufrufe und 19 Quellmusterassertionen entfernt; zwei reine Quelltests entfallen, Fach-/Markupprüfungen erhalten |

Keine Tests werden auf neue konkrete CSS-Abstands-, Schriftgrößen- oder Switch-Geometriezahlen festgelegt. Neue numerische Schwellen sind Kontrastanforderungen (Text 4,5:1; Bedienelement/Fokus 3:1), kombiniert mit echter Bedienung und sichtbarer Geometrie.

| Entfernter Quellnachweis | Verhaltensnachweis |
| --- | --- |
| JSX-Submit, Formularverknüpfung, textarea | stabilization: echte Footer-Submits für Erziehungsberechtigte/Lernende per Enter, mehrzeiliger Hinweis und Reload; p12: Enter im Preisfeld speichert alle Kern-/Zusatzfelder und beide Empfänger |
| Aktiv-Filter-Initialisierung, Checkbox-Markup, Switch-Farben/Schrift/Geometrie | stabilization: Deaktivierung, Standardfilter, Einblenden; p12: Tab/Space, sichtbarer Fokus, Knopfkontrast und tatsächlich gerenderte Textkontraste in beiden Themes |
| createPortal(document.body) | p12: Aktionsmenü per Tastatur, vollständig im Viewport und tatsächlich per Hit-Test sichtbar, Escape stellt Triggerfokus wieder her; reine Menüpositions-/Handler-Fachtests bleiben |
| Draft-Positions-JSX / Download-Markup | p12: Entwurfspositionen sichtbar, finaler Beleg ohne bearbeitbare Positionsübersicht; p10: Haupt-/Finalaktionen und Tastaturfocus; bestehende Druckaktionen bleiben |
| Fixe Wasserzeichen-CSS | echte Chromium-PDFs in print.spec.ts, Entwurf mit Wasserzeichen, finale Belege ohne; vorhandene Markup-Unterscheidung bleibt |

## Geänderte Dateien

- `src/styles.css`: Bildschirmtokens, Flächen, Typografie, Fokus, Editor/Mengensteuerung und mobile Liste; dokumentierte tote Regeln entfernt, PDF-Bereiche identisch.
- `src/views/InvoiceEditor.tsx`: Kern-/Zusatzgruppen, Positionskopf, erreichbare Löschtaste und Reihenfolge der Mengentasten.
- `src/views/Invoices.tsx`: mobiler abgeleiteter Status in Rechnungszelle.
- `src/views/People.tsx`: dekorative Verzögerung/Avatar-Farbwechsel entfernt.
- `src/components/WorkspaceShell.tsx`: Theme-Metafarbe auf die neutrale Bildschirmfläche abgestimmt.
- `src/views/Settings.tsx`: Beschreibung der bestehenden Bewegungspräferenz an ruhiges Design angepasst.
- `tests/logic.test.ts`: ausschließlich die oben ersetzten Quellmusterprüfungen entfernt.
- `tests/browser/p12.spec.ts`: zwölf neue Browserprüfungen, gerenderte Kontraste, Felder/Geometrie, Keyboard, Status/Themes und Screenshots.
- `tests/browser/stabilization.spec.ts`: bestehende Footer-Submits ausdrücklich per Enter.
- `tests/browser/documents.spec.ts`: bestehender Zahlungs-/PDF-Ende-zu-Ende-Test wartet auf den bestätigten Schreibabschluss statt sofortigen Speicherlesen.
- `docs/p12-calm-screen-design.md`: dieser Bericht.

## Abnahme

Zwischenlauf [37141497405](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37141497405) auf `30acd61a`: Build/Lint/Typecheck und 207/207 Fachtests grün, 81/93 Browserprüfungen erfolgreich. Acht neue Fälle hatten einen falschen Label-Locator für den Preis, drei neue Listenfälle doppelte Fixture-Positions-IDs. Ein bestehender Zahlungs-/PDF-Test las vor dem Schreibabschluss. Locator/Fixtures korrigiert; der Zahlungstest wartet nun gezielt auf die erwartete gespeicherte Zahlungsanzahl. Keine fachliche Prüfung abgeschwächt oder Zahlungscode geändert. Alle vorhandenen Accessibility- und P11-PDF-Prüfungen erfolgreich.

Die erste visuelle Prüfung umfasst alle 21 P11-Seiten (acht Layoutfälle, historische Kontolücke und QR-Fallback), acht Editoransichten in beiden Themes sowie die vorhandenen Fokus-/Kontrastbilder. Ohne sichtbare Druckänderung. Die schmale Footerbeschriftung wurde dabei als abgeschnitten erkannt und durch passenden Buttonumbruch korrigiert; ein zusätzlicher Geometrienachweis prüft vollständige Beschriftungen. Die abschließenden Editor-/Listen-/Personenbilder und konkrete Abnahme werden im PR dokumentiert.

Die Abschlussresultate, der geprüfte konkrete Head und der unveränderte Quality-Lauf sind im [Entwurfs-PR #54](https://github.com/sl3ndrr/RiffRechnung/pull/54) dokumentiert. Build, Fachtests, Lint, Typecheck, alle Browserfälle einschließlich Accessibility/Editor und vollständige P11-Druckregression werden erneut ausgeführt. Kein Merge und kein Deployment.

Annahmen: Einheit/Art bleiben ohne Aufklappen sichtbar; Lernendenauswahl je Position bleibt bei mehreren ausgewählten Lernenden nötig. Bei einer Person bleibt die vorhandene implizite Zuordnung erhalten. „Offen“ ist nur das mobile Label des vorhandenen abgeleiteten sent-Zustands, kein neuer Status.

Native OS-Druckdialoge, physische Ausdrucke, Firefox-/Safari-PDF und Banking-App-Scans werden hier nicht neu abgenommen. Firefox und Linux-WebKit decken weiterhin den bestehenden JSON-Fallback ab. Lokale Projektbefehle bleiben durch Netzwerk-/Toolchain-Grenzen blockiert; maßgeblich sind die commitgebundenen GitHub-Actions-Prüfungen und heruntergeladenen synthetischen Bildschirm-/PDF-Nachweise.
