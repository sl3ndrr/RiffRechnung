# P11 – einfache Privatrechnung

## Ausgangsbasis und Vorprüfung

- Integriertes `main`: `e48c820f74090af703cfbf815c94d6739efef83d` (Merge P10, PR #52). P01–P09 sind im Stand enthalten. Katalogbasis bleibt `4b697df747819c283747f196c172c26af24e155c`.
- Keine AGENTS.md im Repository; neuer Branch `simplify/p11-simple-invoice-pdf`. Der lokale Arbeitsbereich war leer. Wegen HTTP 403 beim Git-Klon wurden die 138 Dateien commitgebunden über den GitHub-Connector gelesen und als lokaler Vergleichsstand gesichert. Die veröffentlichten Commits bauen auf dem echten GitHub-Commit auf, nicht auf dem lokalen Hilfscommit.
- Vor Änderung: beide Anschriften kommen aus `snapshot.recipients`; P07 `selectInvoice` bindet die Ausgabe an die Belegversion; P09 entfernt alte Steuer-/Einleitungs-/Rechtstextfelder; P10 `useInvoicePrint` bindet Bereitschaft und expliziten QR-Fallback an den Druckauftrag.
- Lokale Umgebung: Node 24.19.0. `npm ci` scheitert mit Registry HTTP 403. `npm run build`, `npm test`, `npm run lint` wurden vor Änderungen ausgeführt und scheitern mangels tsc/esbuild/eslint. `npm run test:browser -- --project=chromium tests/browser/print.spec.ts tests/browser/documents.spec.ts` scheitert am nicht lokal verfügbaren historischen Commit; Git-Netzwerkzugriff ist blockiert.
- Für eine tatsächliche Ausgangsprüfung wird der unveränderte Quality-Workflow auf einem nur um diesen Bericht ergänzten Ausgangsstand über den Entwurfs-PR ausgeführt. Kein Merge und kein Deployment.

## Ergebnis

Implementierung und abschließende Prüfnachweise folgen im selben Branch.
