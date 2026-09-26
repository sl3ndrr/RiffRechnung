import { sumCents } from '../lib/money'
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import type { Guardian, Invoice, Settings, Student } from '../types'
import { billingPeriodFromItems, buildInvoicePrintPageStyle, euro, footerTextForPrint, formatDateLong, formatIban, groupItemsByStudent, invoiceTotal, outputItemTotal, outputItemCents, outputUnitPrice, number, parseDate } from '../lib/utils'
import { paymentDataForInvoice } from '../lib/paymentData'
import { SMALL_BUSINESS_TAX_NOTICE, TAX_IDENTIFIER_LABELS, taxDataForInvoice } from '../lib/invoiceProfile'
import { generateGiroCode, resolveGiroCode, type GiroCodeEncoder } from '../lib/printJob'

interface InvoicePrintProps {
  invoice: Invoice | null
  guardians: Guardian[]
  students: Student[]
  settings: Settings
  requestId?: string
  includeGiroCode?: boolean
  giroCodeFallbackReason?: string
  onPrintReady?: (requestId: string, invoiceId: string, payload: string | null) => void
  onPrintError?: (requestId: string, invoiceId: string, message: string) => void
  /** Test seam for a real rejection path; production uses the bundled QR encoder. */
  qrEncoder?: GiroCodeEncoder
}

interface GeneratedQrCode {
  requestId: string
  invoiceId: string
  payload: string
  url: string
}


function defaultQrEncoder(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 420,
    color: { dark: '#111827', light: '#ffffff' },
  })
}

async function waitForPrintFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try { await document.fonts.ready } catch { /* A fallback font is still printable. */ }
}

export function InvoicePrint({ invoice, guardians, students, settings, requestId, includeGiroCode = true, giroCodeFallbackReason, onPrintReady, onPrintError, qrEncoder }: InvoicePrintProps) {
  const [qrCode, setQrCode] = useState<GeneratedQrCode | null>(null)
  const total = invoice ? invoiceTotal(invoice) : 0
  const period = invoice ? invoice.versionId ? invoice.period : billingPeriodFromItems(invoice.items, invoice.invoiceDate) : ''
  const source = invoice?.snapshot ?? invoice?.draftPrintSnapshot
  const legacyDraftWithoutPrintData = invoice?.status === 'draft' && !source
  const printInvoice = useMemo(() => invoice?.status === 'draft' && source ? { ...invoice, snapshot: source } : invoice, [invoice, source])
  const footerText = invoice ? footerTextForPrint(invoice.legalText) : ''
  const pageStyle = invoice ? buildInvoicePrintPageStyle(footerText, invoice.number) : ''
  const issuer = source?.issuer ?? (legacyDraftWithoutPrintData ? { name: '', street: '', postalCode: '', city: '', email: '', phone: '' } : settings.issuer)
  const account = printInvoice && !legacyDraftWithoutPrintData ? paymentDataForInvoice(printInvoice, settings) : { accountHolder: '', iban: '', bic: '', bankName: '' }
  const taxData = printInvoice && !legacyDraftWithoutPrintData ? taxDataForInvoice(printInvoice, settings) : { invoiceProfile: null, taxIdentifier: null }
  const taxOutput = source?.taxOutput
  const printedIdentifier = taxOutput ? taxOutput.identifier : taxData.invoiceProfile === 'small-business' ? taxData.taxIdentifier : null
  const printedNotice = taxOutput ? taxOutput.noticeText : taxData.invoiceProfile === 'small-business' && taxData.taxIdentifier?.value ? SMALL_BUSINESS_TAX_NOTICE : null
  const noticeInFooter = taxOutput?.noticePosition === 'footer'
  const recipientList = useMemo(() => {
    if (!invoice) return []
    if (source) return source.guardians
    if (legacyDraftWithoutPrintData) return []
    return invoice.guardianIds.flatMap((id) => {
      const guardian = guardians.find((item) => item.id === id)
      return guardian ? [{ id: guardian.id, name: guardian.name, email: guardian.email, ...guardian.address }] : []
    })
  }, [guardians, invoice, legacyDraftWithoutPrintData, source])
  const studentList = useMemo(() => {
    if (!invoice) return []
    if (source) return source.students
    if (legacyDraftWithoutPrintData) return []
    return invoice.studentIds.flatMap((id) => {
      const student = students.find((item) => item.id === id)
      return student ? [{ id: student.id, name: student.name }] : []
    })
  }, [invoice, legacyDraftWithoutPrintData, source, students])

  const groups = useMemo(() => {
    if (!invoice) return []
    if (invoice.studentIds.length > 1) {
      return groupItemsByStudent(invoice.items, invoice.studentIds).map(([key, items]) => ({
        key,
        label: studentList.find((student) => student.id === key)?.name ?? 'Unterricht',
        items,
      }))
    }
    const byMonth = new Map<string, typeof invoice.items>()
    invoice.items.forEach((item) => {
      const key = item.serviceDate.slice(0, 7) || invoice.invoiceDate.slice(0, 7)
      byMonth.set(key, [...(byMonth.get(key) ?? []), item])
    })
    return [...byMonth.entries()].map(([key, items]) => {
      const date = parseDate(`${key}-01`)
      const label = Number.isNaN(date.getTime()) ? period : new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(date)
      return { key, label, items }
    })
  }, [invoice, period, studentList])

  const giroCode = useMemo(() => printInvoice && !legacyDraftWithoutPrintData
    ? resolveGiroCode(printInvoice, settings, includeGiroCode)
    : { kind: 'unavailable' as const, reason: legacyDraftWithoutPrintData ? 'Historischer Entwurf ohne gesicherte Zahlungsdaten.' : 'Keine Rechnung ausgewählt.' },
  [includeGiroCode, legacyDraftWithoutPrintData, printInvoice, settings])

  useEffect(() => {
    setQrCode(null)
    const invoiceId = invoice?.id
    if (!invoiceId || !requestId) return
    let cancelled = false
    const readyWithoutQr = () => {
      void waitForPrintFonts().then(() => {
        if (!cancelled) onPrintReady?.(requestId, invoiceId, null)
      })
    }

    if (giroCode.kind === 'error') {
      onPrintError?.(requestId, invoiceId, giroCode.reason)
      return () => { cancelled = true }
    }
    if (giroCode.kind !== 'ready') {
      readyWithoutQr()
      return () => { cancelled = true }
    }

    const payload = giroCode.payload
    void generateGiroCode(payload, qrEncoder ?? defaultQrEncoder).then((url) => {
      if (!cancelled) setQrCode({ requestId, invoiceId, payload, url })
    }).catch((error) => {
      if (!cancelled) onPrintError?.(requestId, invoiceId, error instanceof Error ? error.message : 'GiroCode konnte nicht erzeugt werden.')
    })
    return () => { cancelled = true }
  }, [giroCode, invoice?.id, onPrintError, onPrintReady, qrEncoder, requestId])

  if (!invoice) return null
  const visibleQrCode = giroCode.kind === 'ready'
    && qrCode
    && qrCode.requestId === requestId
    && qrCode.invoiceId === invoice.id
    && qrCode.payload === giroCode.payload
    ? qrCode
    : null
  const salutation = recipientList.map((item) => item.name).join(' und ') || 'Damen und Herren'
  const giroCodeNotice = giroCode.kind === 'ready'
    ? null
    : giroCode.kind === 'disabled'
      ? giroCodeFallbackReason
        ? `Ohne GiroCode gedruckt: ${giroCodeFallbackReason}`
        : giroCode.reason
      : giroCode.kind === 'unavailable'
        ? `Kein GiroCode: ${giroCode.reason}`
        : `GiroCode nicht verfügbar: ${giroCode.reason}`
  const totalRow = <tr className="invoice-total-row">
    <td colSpan={2}>Summe</td>
    <td>{number.format(invoice.items.reduce((sum, item) => sum + item.quantity, 0))}</td>
    <td />
    <td>{euro.format(total)}</td>
  </tr>

  return (
    <article className="invoice-paper" aria-label={`Rechnung ${invoice.number ?? 'Entwurf'}`}>
      <style data-invoice-page-style>{pageStyle}</style>
      {invoice.status === 'draft' && <div className="invoice-draft-watermark" aria-hidden="true">ENTWURF</div>}
      <div className="invoice-paper__body">
        <header className="invoice-letterhead">
          <section className="invoice-recipient">
            {(issuer.name || issuer.street || issuer.postalCode || issuer.city) && <p className="invoice-senderline">{[issuer.name, issuer.street, [issuer.postalCode, issuer.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</p>}
            {recipientList.length > 0 && <p className="invoice-to">AN</p>}
            {recipientList.map((recipient) => (
              <div className="invoice-address" key={recipient.id}>
                <strong>{recipient.name}</strong>
                {recipient.street && <span>{recipient.street}</span>}
                {(recipient.postalCode || recipient.city) && <span>{[recipient.postalCode, recipient.city].filter(Boolean).join(' ')}</span>}
                {recipient.email && <small>{recipient.email}</small>}
              </div>
            ))}
          </section>
          <section className="invoice-meta">
            <h1>RECHNUNG</h1>
            {(source?.invoiceKind ?? invoice.invoiceKind) === 'small-amount' && <p>Kleinbetragsrechnung nach § 33 UStDV</p>}
            <div className="invoice-meta__rule" />
            <dl>
              <dt>Nr.:</dt><dd><strong>{invoice.number ?? 'ENTWURF'}</strong></dd>
              <dt>Datum:</dt><dd>{formatDateLong(invoice.invoiceDate)}</dd>
              <dt>Zeitraum:</dt><dd>{period}</dd>
              <dt>Fällig:</dt><dd><strong>{formatDateLong(invoice.dueDate)}</strong></dd>
              {(invoice.status !== 'draft' || issuer.name) && <><dt>Von:</dt><dd><strong>{issuer.name || '–'}</strong></dd></>}
              {(invoice.status !== 'draft' || issuer.street) && <><dt>Straße:</dt><dd>{issuer.street || '–'}</dd></>}
              {(invoice.status !== 'draft' || issuer.postalCode || issuer.city) && <><dt>PLZ/Ort:</dt><dd>{issuer.postalCode} {issuer.city}</dd></>}
              {(invoice.status !== 'draft' || issuer.phone) && <><dt>Tel.:</dt><dd>{issuer.phone || '–'}</dd></>}
              {(invoice.status !== 'draft' || issuer.email) && <><dt>E-Mail:</dt><dd>{issuer.email || '–'}</dd></>}
            </dl>
          </section>
        </header>

        <section className="invoice-intro">
          <p>Sehr geehrte/r {salutation},</p>
          <p>{invoice.introText}</p>
          <p><strong>Unterricht für:</strong> {studentList.map((student) => student.name).join(', ') || '–'}</p>
        </section>

        <table className="invoice-table">
          <thead>
            <tr><th>Datum</th><th>Titel / Thema</th><th>Std./Menge</th><th>Einzelpreis</th><th>Betrag</th></tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <PrintGroup invoice={invoice} key={group.key} label={group.label} items={group.items} showSubtotal={groups.length > 1} />
            ))}
            {!taxOutput && totalRow}
          </tbody>
          {taxOutput && <tbody className="invoice-final-rows">
            {totalRow}
            {(printedIdentifier?.value || printedNotice && !noticeInFooter) && <tr className="invoice-tax-row"><td colSpan={5}><section className="invoice-tax-data" aria-label="Steuerliche Angaben">
              {printedIdentifier?.value && <p><strong>{TAX_IDENTIFIER_LABELS[printedIdentifier.kind]}:</strong> {printedIdentifier.value}</p>}
              {printedNotice && !noticeInFooter && <p>{printedNotice}</p>}
            </section></td></tr>}
            {noticeInFooter && <tr className="invoice-total-footer-row"><td colSpan={5}><footer className="invoice-total-footer" aria-label="Fußzeile zur Endsumme">
              {footerText && <p>{footerText}</p>}
              {printedNotice && <p>{printedNotice}</p>}
            </footer></td></tr>}
          </tbody>}
        </table>

        {!taxOutput && taxData.invoiceProfile === 'small-business' && taxData.taxIdentifier?.value && <section className="invoice-tax-data" aria-label="Steuerliche Angaben"><p><strong>{TAX_IDENTIFIER_LABELS[taxData.taxIdentifier.kind]}:</strong> {taxData.taxIdentifier.value}</p><p>{SMALL_BUSINESS_TAX_NOTICE}</p></section>}

        <section className="invoice-payment-block">
          <section className="invoice-payment-copy">
            <p>Bitte überweisen Sie den Gesamtbetrag von <strong>{euro.format(total)}</strong> bis zum <strong>{formatDateLong(invoice.dueDate)}</strong> auf das folgende Konto:</p>
          </section>

          <section className={visibleQrCode ? 'invoice-payment' : 'invoice-payment invoice-payment--without-qr'}>
            <dl>
              <dt>Kontoinhaber:</dt><dd><strong>{account.accountHolder || '–'}</strong></dd>
              <dt>IBAN:</dt><dd className="mono">{formatIban(account.iban) || '–'}</dd>
              <dt>BIC:</dt><dd className="mono">{account.bic || '–'}</dd>
              <dt>Bank:</dt><dd>{account.bankName || '–'}</dd>
              <dt>Verwendungszweck:</dt><dd><strong>Rechnung {invoice.number ?? 'Entwurf'}</strong></dd>
            </dl>
            {visibleQrCode && <div className="invoice-qr">
              <img src={visibleQrCode.url} alt="EPC-QR-Code für die SEPA-Überweisung" onLoad={() => { void waitForPrintFonts().then(() => onPrintReady?.(visibleQrCode.requestId, visibleQrCode.invoiceId, visibleQrCode.payload)) }} onError={() => onPrintError?.(visibleQrCode.requestId, visibleQrCode.invoiceId, 'GiroCode konnte nicht geladen werden.')} />
              <p>Mit Banking-App scannen</p>
            </div>}
          </section>

          {giroCodeNotice && <p className="invoice-girocode-notice">{giroCodeNotice}</p>}
          {invoice.freeText && <p className="invoice-free-text">{invoice.freeText}</p>}
          <section className="invoice-closing">
            <div className="invoice-thanks"><p>Vielen Dank</p><strong>{issuer.name}</strong></div>
            <footer className="invoice-footer">
              <div className="invoice-footer__rule" />
              <div className="invoice-footer__content">{!noticeInFooter && <p>{footerText}</p>}<span className="invoice-footer__reference">Rechnung {invoice.number ?? 'Entwurf'} · Seitenzahl im Seitenrand</span></div>
            </footer>
          </section>
        </section>
      </div>
    </article>
  )
}

function PrintGroup({ invoice, label, items, showSubtotal }: { invoice: Invoice; label: string; items: Invoice['items']; showSubtotal: boolean }) {
  const subtotal = sumCents(items.map((item) => outputItemCents(invoice, item))) / 100
  return (
    <>
      <tr className="invoice-group-heading"><td colSpan={5}><strong>{label}</strong><span /></td></tr>
      {items.map((item, index) => (
        <tr className={index % 2 === 0 ? 'invoice-item-row invoice-item-row--tint' : 'invoice-item-row'} key={item.id}>
          <td>{item.serviceDate ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(parseDate(item.serviceDate)) : '–'}</td>
          <td>{item.description}</td>
          <td>{number.format(item.quantity)} {item.unit === 'Std.' ? '' : item.unit}</td>
          <td>{outputUnitPrice(invoice, item)}</td>
          <td>{euro.format(outputItemTotal(invoice, item))}</td>
        </tr>
      ))}
      {showSubtotal && (
        <tr className="invoice-subtotal-row">
          <td colSpan={2}><em>Zwischensumme {label}</em></td>
          <td>{number.format(items.reduce((sum, item) => sum + item.quantity, 0))}</td>
          <td />
          <td>{euro.format(subtotal)}</td>
        </tr>
      )}
    </>
  )
}
