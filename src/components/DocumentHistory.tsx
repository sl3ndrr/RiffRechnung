import { useState } from 'react'
import type { AppState, Invoice } from '../types'
import { allocatedCents, isActiveClaim, versionFor } from '../lib/documents'
import { snapshotDifferences } from '../lib/documents'
import { downloadText, euro, invoicesToCsv } from '../lib/utils'


export interface DocumentHistoryActions {
  onCorrection: (invoice: Invoice, reason: string) => void
  onAllocatePayment: (paymentId: string, versionId: string | null, reason: string) => void
  onResolveConflicts: (versionId: string, reason: string) => void
}

export function DocumentHistory({ state, invoice, onSelect, onCorrection, onAllocatePayment, onResolveConflicts }: DocumentHistoryActions & { state: AppState; invoice: Invoice; onSelect: (id: string) => void }) {
  const [reason, setReason] = useState('')
  const [resolution, setResolution] = useState('')
  const version = versionFor(state, invoice)
  if (!version) return invoice.correction ? <p>Korrekturentwurf. Das Original und seine Nummer bleiben erhalten. Fehlende Personen bitte im Editor ausdrücklich neu zuordnen.</p> : null
  const versions = state.documentVersions.filter((entry) => entry.originalId === version.originalId)
  const admin = state.invoiceAdministration.find((entry) => entry.versionId === version.id)!
  const parent = versions.find((entry) => entry.id === version.replacesId)
  const payments = state.payments.filter((payment) => versions.some((entry) => entry.id === payment.sourceVersionId))
  const balance = version.amounts.totalCents - allocatedCents(state, version.id)
  const active = isActiveClaim(state, invoice)
  return <section className="document-history" aria-label="Belegversionen und Korrekturen">
    <h3>Belegversionen</h3>
    <p>{active ? 'Aktueller Forderungsbeleg' : 'Durch eine spätere Version ersetzt; keine zusätzliche aktive Forderung'}{admin.archived ? ' · Archiviert' : ''}.</p>
    {version.provenance === 'oldest-available' && <p className="field-hint field-hint--warning">Ältester verfügbarer Stand. Frühere vollständige Belege sind unbekannt und wurden nicht wiederhergestellt.</p>}
    <ol>{versions.map((entry) => <li key={entry.id}><button className="button button--text" onClick={() => onSelect(entry.invoiceId)} aria-current={entry.id === version.id ? 'true' : undefined}>{entry.content.number} · {entry.replacesId ? 'Korrektur' : 'Original / ältester Stand'}</button>{entry.reason && <p>Grund: {entry.reason}</p>}</li>)}</ol>
    {parent && <DifferenceTable title="Änderungen gegenüber dem ersetzten Beleg" before={parent.content} after={version.content} />}
    <details><summary>Gesicherte Ausgabeangaben</summary>
      <dl className="detail-list"><div><dt>Kontoinhaber</dt><dd>{invoice.snapshot?.accountHolder || 'Leer'}</dd></div><div><dt>IBAN</dt><dd>{invoice.snapshot?.iban || 'Leer'}</dd></div><div><dt>BIC</dt><dd>{invoice.snapshot?.bic || 'Leer'}</dd></div><div><dt>Bank</dt><dd>{invoice.snapshot?.bankName || 'Leer'}</dd></div></dl>
      <p>Einleitung: {invoice.introText}</p><p>Hinweis: {invoice.freeText}</p><p>Rechtstext: {invoice.legalText || 'Leer'}</p>
      <p>Betragsquelle: {version.amounts.source === 'number-register' ? 'Historisches Nummernregister' : 'Gesicherte bisherige Rechnungsausgabe'}.</p>
    </details>
    <button className="button button--text" onClick={() => downloadText(`beleg-${version.id}.csv`, invoicesToCsv([invoice], state.guardians, state.students), 'text/csv;charset=utf-8')}>Ausgewählte Version als CSV</button>
    {version.conflicts.length > 0 && <section className="form-errors" aria-label="Historische Abweichungen">
      <h4>Historische Abweichungen</h4>
      {version.conflicts.map((conflict, index) => <details key={index}><summary>{conflict.message}</summary><p>{conflict.path}</p>{conflict.values.map((value, i) => <pre key={i}>{value}</pre>)}</details>)}
      <p>Die gesicherten Angaben bleiben unverändert. Korrekturen erfolgen in einem neuen Beleg.</p>
      {admin.resolutions.map((entry, index) => <p key={index}>Klärung {entry.at}: {entry.reason}</p>)}
      <label className="field"><span>Ergebnis der Klärung</span><textarea value={resolution} onChange={(event) => setResolution(event.target.value)} /></label>
      <button className="button button--tonal" disabled={!resolution.trim()} onClick={() => { onResolveConflicts(version.id, resolution); setResolution('') }}>Klärung dokumentieren</button>
    </section>}
    {version.snapshotHistory.map((event) => <DifferenceTable key={event.id} title={`Historische Snapshot-Korrektur: ${event.label} (${event.at}) – kein vollständiger früherer Beleg`} before={event.snapshotCorrection?.oldValue} after={event.snapshotCorrection?.newValue} />)}
    {active && <div className="form-section"><label className="field"><span>Korrekturgrund</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><p>Das Original bleibt erhalten. Der Entwurf ersetzt die Forderung erst nach Finalisierung mit neuer Nummer. Zahlungen werden nicht automatisch übertragen.</p><button className="button button--tonal" disabled={!reason.trim() || state.invoices.some((entry) => entry.status === 'draft' && entry.correction?.replacesId === version.id)} onClick={() => onCorrection(invoice, reason)}>Korrekturentwurf erzeugen</button></div>}
    <h3>Zahlungszuordnung</h3>
    <p>{active ? 'Restforderung' : 'Saldo dieser Version'}: {euro.format(Math.max(0, balance) / 100)}{balance < 0 ? ` · Überzahlung: ${euro.format(-balance / 100)}` : ''}. Archivierung verändert die Forderung nicht.</p>
    {!payments.length && <p>Keine Zahlung erfasst.</p>}
    {payments.map((payment) => <PaymentAllocation key={payment.id} state={state} paymentId={payment.id} versionIds={versions.map((entry) => entry.id)} onAllocatePayment={onAllocatePayment} />)}
  </section>
}

function DifferenceTable({ title, before, after }: { title: string; before: unknown; after: unknown }) {
  const differences = snapshotDifferences(before, after)
  return <details><summary>{title}</summary><div className="table-scroll"><table><thead><tr><th>Feld</th><th>Vorher</th><th>Nachher</th></tr></thead><tbody>{differences.map((difference) => <tr key={difference.path}><td>{difference.path}</td><td>{difference.before}</td><td>{difference.after}</td></tr>)}</tbody></table></div>{!differences.length && <p>Keine Inhaltsabweichung.</p>}</details>
}

export function HistoricalSnapshotEvidence({ state }: { state: AppState }) {
  const evidence = state.historicalSnapshotCorrections.filter((event) => !state.documentVersions.some((version) => version.snapshotHistory.some((copy) => copy.id === event.id)))
  if (!evidence.length) return null
  return <section className="surface document-history" aria-label="Historische Snapshot-Differenzen ohne vollständigen Beleg">
    <h2>Historische Snapshot-Differenzen</h2>
    <p>Diese Angaben stammen aus der vorhandenen Aktivitätsliste. Ein vollständiger früherer Beleg ist dazu nicht verfügbar und wurde nicht rekonstruiert. Die Angaben bleiben unabhängig von späteren Aktivitäten erhalten.</p>
    {evidence.map((event) => <DifferenceTable key={event.id} title={`${event.label} · ${event.at} · damalige Beleg-ID: ${event.entityId ?? 'unbekannt'}`} before={event.snapshotCorrection?.oldValue} after={event.snapshotCorrection?.newValue} />)}
  </section>
}

function PaymentAllocation({ state, paymentId, versionIds, onAllocatePayment }: Pick<DocumentHistoryActions, 'onAllocatePayment'> & { state: AppState; paymentId: string; versionIds: string[] }) {
  const payment = state.payments.find((entry) => entry.id === paymentId)!
  const current = payment.allocations.at(-1)?.versionId ?? ''
  const [target, setTarget] = useState(current)
  const [reason, setReason] = useState('')
  const name = (id: string | null) => state.documentVersions.find((entry) => entry.id === id)?.content.number ?? 'Nicht zugeordnet'
  return <div className="payment-allocation">
    <p><strong>{euro.format(payment.amountCents / 100)}</strong> · Herkunft: {name(payment.sourceVersionId)} · Zuordnung: {name(current)} · Zahlungstag: {payment.paidAt?.slice(0, 10) ?? 'Unbekannt'}</p>
    {payment.provenance === 'legacy-status' && <p>Aus historischem Vollzahlungsstatus übernommen; kein zusätzlicher Zahlungsnachweis.</p>}
    <details><summary>Zuordnungsverlauf</summary><ol>{payment.allocations.map((entry, index) => <li key={index}>{name(entry.versionId)} · {entry.at} · {entry.reason}</li>)}</ol></details>
    <label className="field"><span>Zahlung zuordnen</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Zur manuellen Klärung offen lassen</option>{versionIds.map((id) => <option key={id} value={id}>{name(id)}</option>)}</select></label>
    <label className="field"><span>Zuordnungsgrund</span><input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <button className="button button--tonal" disabled={!reason.trim() || target === current} onClick={() => { onAllocatePayment(paymentId, target || null, reason); setReason('') }}>Zuordnung speichern</button>
  </div>
}
