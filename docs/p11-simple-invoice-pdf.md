# P11 – einfache Privatrechnung

## Ausgangsbasis und Vorprüfung

- Integriertes `main`: `e48c820f74090af703cfbf815c94d6739efef83d` (Merge P10, PR #52). P01–P09 sind im Stand enthalten. Katalogbasis bleibt `4b697df747819c283747f196c172c26af24e155c`.
- Keine AGENTS.md im Repository; neuer Branch `simplify/p11-simple-invoice-pdf`. Der lokale Arbeitsbereich war leer. Wegen HTTP 403 beim Git-Klon wurden die 138 Dateien commitgebunden über den GitHub-Connector gelesen und als lokaler Vergleichsstand gesichert. Die veröffentlichten Commits bauen auf dem echten GitHub-Commit auf, nicht auf dem lokalen Hilfscommit.
- Vor Änderung: beide Anschriften kommen aus `snapshot.recipients`; P07 `selectInvoice` bindet die Ausgabe an die Belegversion; P09 entfernt alte Steuer-/Einleitungs-/Rechtstextfelder; P10 `useInvoicePrint` bindet Bereitschaft und expliziten QR-Fallback an den Druckauftrag.
- Lokale Umgebung: Node 24.19.0. `npm ci` scheitert mit Registry HTTP 403. `npm run build`, `npm test`, `npm run lint` wurden vor Änderungen ausgeführt und scheitern mangels tsc/esbuild/eslint. `npm run test:browser -- --project=chromium tests/browser/print.spec.ts tests/browser/documents.spec.ts` scheitert am nicht lokal verfügbaren historischen Commit; Git-Netzwerkzugriff ist blockiert.
- Tatsächliche Ausgangsprüfung: Quality [37117926548](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37117926548) auf `01cc75bffe1e23ddec01e62817970849d42e9a13` erfolgreich vor Implementierung: npm ci, Lint, 204 Fachtests, Typecheck, Build, 72 Browserprüfungen einschließlich Druck/PrintJob/PDF und Audit.
- Die Ausgangsprüfung verwendete den unveränderten Quality-Workflow auf einem nur um diesen Bericht ergänzten Ausgangsstand. Kein Merge und kein Deployment.

## Ergebnis

Ein Absenderblock enthält die vorhandenen Absenderdaten. Jeder ausgewählte Empfänger bekommt einen eigenen kompakten Namens-/Anschriftblock, auch bei identischer Anschrift. Fehlende Anschriftteile entfallen. Die gemeinsame Rechnung erhält weiterhin einen Gesamtbetrag, keine Aufteilung.

Die einfache Tabelle verwendet 10 pt statt 8,3 pt. Positionen bleiben in Belegreihenfolge, mit Einzelmenge und Einheit einschließlich „Std.“. Bei mehreren Lernenden steht der eingefrorene Name an der jeweiligen Position. Historische Lücken erhalten keine heutigen Ergänzungen und keine leeren Namenszeilen. Die Endsumme summiert ausschließlich Geld; die einzige automatisch erzeugte Privatzeile steht direkt darunter im vorhandenen gegen Seitenumbruch geschützten Tabellenblock.

Entfernt wurden Monats-/Lernendengruppen, PrintGroup, groupItemsByStudent, Zwischensummen und Mengen-Endsumme, Zebraflächen und blaue Linien, die wiederholten Absenderangaben, persönliche Anrede und Abschlussgruß, lange Zahlungsaufforderung, optionale Leerfeld-Striche sowie gedruckte QR-Fehlergründe und „Seitenzahl im Seitenrand“. Rund 100 Produktionszeilen entfallen netto. BIC und Bank werden nur bei vorhandenen Werten gedruckt. Die feste kurze Einleitung und der unveränderte optionale Rechnungshinweis bleiben. Der frühere ungenutzte Footertext-Parameter war im integrierten Ausgangsstand bereits entfernt.

Die bestehende QR-Erzeugung, Schrift-/Bildbereitschaft, Request-/Invoice-/Payload-Bindung, Verwerfen verspäteter Ergebnisse und der ausdrücklich bestätigte Druck ohne QR bleiben erhalten. Entfernt ist lediglich die Weitergabe des Fehlergrunds in das Kundendokument; der verständliche Anwendungsdialog bleibt. Betrag, Nummer, Konto und Empfänger stammen aus selectInvoice beziehungsweise dem eingefrorenen Druckauftrag. Fehlende historische Kontodaten werden nicht ergänzt. EPC-Regeln und qrcode-Abhängigkeiten sind unverändert.

## Geänderte Dateien

| Dateien | Änderung |
| --- | --- |
| src/components/InvoicePrint.tsx | Einfache Ausgabe und optionale Felder; Zuordnung je Position |
| src/styles.css | Nur PDF-Regeln: größere Schrift, sparsame Linien, fließender Hinweis |
| src/lib/invoiceOutput.ts | Nicht mehr benötigte Gruppierung entfernt; graue Seitenrandlinie |
| src/App.tsx, src/hooks/useInvoicePrint.ts, src/lib/printJob.ts | Nicht mehr gedruckten QR-Fehlergrund aus Props/Druckauftrag entfernt |
| tests/p11PrintFixtures.ts, tests/p11-simple-invoice-pdf.test.ts | Acht synthetische Layoutfälle, Geldsummen, eingefrorene Ausgabe, historische Lücken |
| tests/browser/print.spec.ts, tests/browser/documentPrintHarness.tsx | PDF-Text/Geometrie, echte QR-Bereitschaft, nachweislich verspäteter Encoder, bewusstes QR-Fallback-PDF |
| tests/logic.test.ts, tests/adult-recipients.test.ts, tests/browser/documents.spec.ts | Vorhandene Empfänger- und Textprüfungen auf feste Einleitung/Anschriftblock angepasst |
| docs/p11-simple-invoice-pdf.md | Ausgangs-, Änderungs- und Prüfbericht |

## Gerenderte Fälle und Sichtprüfung

Die acht P11-Fälle und die historische Kontolücke wurden im Chromium-PDF-Engine des unveränderten Quality-Workflows gerendert. Alle 20 Seiten dieser neun PDFs wurden visuell als Seitenübersicht geprüft; verschiedene/identische Anschriften, lange Namen und mehrseitige Abschlüsse zusätzlich groß. Keine abgeschnittenen Inhalte oder überlappenden Fußzeilen. Eine unabhängige lokale Auswertung aller Wortkoordinaten bestätigt Text innerhalb der Druckfläche und Abstand zur Seitenzahl. Der Abschlusslauf rendert zusätzlich das PDF des tatsächlich bestätigten QR-Fallback-Auftrags.

| Synthetischer Fall | Seiten | Geprüfter Inhalt |
| --- | ---: | --- |
| Ein Empfänger | 1 | Eigene Anschrift, Menge/Std., Nummer und Konto |
| Zwei verschiedene Anschriften | 1 | Empfaenger A: Testweg 2; Empfaenger B: Testweg 3; je 12345 Teststadt; gemeinsame 38,58 €, Geschwisterpositionen und gemischte Einheiten |
| Identische Anschriften | 1 | Beide Namen und je die gemeinsame Anschrift Testweg 2 sichtbar |
| Beide ohne Anschrift | 1 | Beide Namen bleiben sichtbar, keine Platzhalter |
| Teilanschriften | 1 | A nur 54321 Teilort A; B nur Teilweg B 9 |
| Lange Namen/Anschriften | 1 | Beide vollständigen Namen und jeweilige Straße/Ort umbrechen lesbar |
| Langer Rechnungshinweis | 2 | Alle 55 Zeilen einschließlich Hinweisende und Folgeseitenreferenz |
| 108 Geschwisterpositionen | 11 | Alle Positionen, Std./Pauschale/Stück; 1.388,88 € und Privatzeile gemeinsam auf Seite 11; wiederholter Tabellenkopf, Seitenzahlen |
| Historisch ohne Kontodaten | 1 | Beide Anschriften und 38,58 €, kein heutiges Konto, kein QR, keine technischen PDF-Texte |

Zusätzlich bleiben die vorhandenen Entwurfs-, Ein-/Zwei-/Mehrseiten-, Privatzeilen-, Migrations-, Original-/Korrektur- und PrintJob-Prüfungen bestehen. Die QR-Payload stimmt bytegleich mit Konto, Betrag und Nummer der ausgewählten Belegversion überein. Eine Encoder-Ablehnung meldet sich in der Anwendung. Die historische ungültige BIC bietet den ausdrücklichen Druck ohne QR; vor Bestätigung kein Druckaufruf, danach genau einer, mit denselben Bankdaten und ohne technische Texte im PDF. Der Race-Test startet nachweislich den ersten Encoder und wartet auf dessen verspätete Freigabe, bevor er die Bindung an den zweiten Auftrag prüft.

## Prüfläufe und Grenzen

- Ausgangslauf 37117926548: 204/204 Fachtests und 72/72 Browserprüfungen; npm ci, Lint, Typecheck, Build und Audit grün.
- Zwischenlauf [37118724309](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37118724309), Head 4619f232: 206/208 Fachtests. Zwei vorhandene Tests erwarteten noch die entfernte persönliche Anrede; ersetzt durch ausdrückliche Anschriftblock-Prüfungen. Keine fachlichen Schutzprüfungen entfernt.
- Zwischenlauf [37118841624](https://github.com/sl3ndrr/RiffRechnung/actions/runs/37118841624), Head 432422d6: Build/Lint/Typecheck, 208/208 Fachtests und 80/81 Browserprüfungen. Der lange Name war vollständig gerendert, aber pdftotext -layout mischte danebenliegende Metadaten hinein. Die vollständige Namens-/Anschriftprüfung verwendet zusätzlich pdftotext -raw; Tabellenprüfung und Geometrie bleiben erhalten. Alle neun P11-PDFs dieses Laufs wurden heruntergeladen und visuell geprüft.
- Abschließende Prüfung: unveränderter Quality-Workflow mit npm ci, npm run lint, npm test (209 Fachtests), npm run typecheck, npm run build, npm run test:browser (81 Prüfungen) und Audit. Commitgebundene Abschlussresultate und Ausführungslink stehen im [Entwurfs-PR #53](https://github.com/sl3ndrr/RiffRechnung/pull/53). Keine Wiederholungen/übersprungenen Fälle vorgesehen, keine CI-/Testhub-Änderung.
- Lokal wurden die angeforderten Befehle vor und nach Änderungen versucht; Registry-/Git-HTTP-403 verhindern die installierte Projekttoolchain und den historischen Browser-Checkout. Tatsächliche Projektprüfungen und PDF-Erzeugung erfolgen in GitHub Actions unter Node 22.

Annahmen: eingefrorene optionale Lücken bleiben leer; bei unvollständigen historischen Lernendennamen erscheinen nur vorhandene Namen. Ein eigener Rechnungshinweis bleibt einschließlich Zeilenumbrüchen unverändert, auch wenn er selbst einen rechtlichen Text enthält; abgeschaffte Felder werden nicht rekonstruiert.

Browsergrenzen/offene manuelle Abnahmen: Chromium-PDF und automatisierte Druckereignisse sind geprüft; native OS-Druckdialoge, physischer Ausdruck, Druck unter Firefox/Safari und Banking-App-Scans sind nicht freigegeben. Firefox und Linux-WebKit prüfen im vorhandenen Workflow den JSON-Fallback, nicht ihre PDF-Druckausgabe. Seitenrandboxen bleiben Browser-Erweiterung; normale Rechnung, Privatzeile und Rechnungsreferenz bleiben im vorhandenen Dokumentfluss. Kein neues Drucksystem und kein Anspruch auf neue Seitenzahlen-Unterstützung in Browsern ohne Margin-Box-Unterstützung.
