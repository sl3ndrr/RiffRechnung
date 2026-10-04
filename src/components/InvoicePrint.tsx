import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import type { Guardian, Invoice, InvoiceItem, Settings, Student } from '../types'
import { billingPeriodFromItems, buildInvoicePrintPageStyle, invoicePrintGroups, invoiceServiceDate, outputItemCents, outputUnitPrice } from '../lib/invoiceOutput'
import { euro, formatDateLong, number } from '../lib/utils'
import { formatIban } from '../lib/paymentData'
import { invoiceTotalCents } from '../lib/money'
import { paymentDataForInvoice } from '../lib/paymentData'
import { generateGiroCode, resolveGiroCode, type GiroCodeEncoder } from '../lib/printJob'
import { liveRecipient, recipientKey, recipientRefs, snapshotRecipients } from '../lib/recipients'

interface InvoicePrintProps {
  invoice: Invoice | null
  guardians: Guardian[]
  students: Student[]
  settings: Settings
  pendingNumberLabel?: string
  requestId?: string
  includeGiroCode?: boolean
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

export function InvoicePrint({ invoice, guardians, students, settings, pendingNumberLabel, requestId, includeGiroCode = true, onPrintReady, onPrintError, qrEncoder }: InvoicePrintProps) {
  const [qrCode, setQrCode] = useState<GeneratedQrCode | null>(null)
  const totalCents = invoice ? invoiceTotalCents(invoice) : 0
  const groups = useMemo(() => invoice ? invoicePrintGroups(invoice) : null, [invoice])
  const period = invoice ? invoice.versionId ? invoice.period ?? '' : billingPeriodFromItems(invoice.items, invoice.invoiceDate) : ''
  const source = invoice?.snapshot ?? invoice?.draftPrintSnapshot
  const legacyDraftWithoutPrintData = invoice?.status === 'draft' && !source
  const printInvoice = useMemo(() => invoice?.status === 'draft' && source ? { ...invoice, snapshot: source } : invoice, [invoice, source])
  const pageStyle = invoice ? buildInvoicePrintPageStyle(invoice.number) : ''
  const hasPrintMarginBoxes = typeof window !== 'undefined' && 'CSSMarginRule' in window
  const issuer = source?.issuer ?? (legacyDraftWithoutPrintData ? { name: '', street: '', postalCode: '', city: '', email: '', phone: '' } : settings.issuer)
  const account = printInvoice && !legacyDraftWithoutPrintData ? paymentDataForInvoice(printInvoice, settings) : { accountHolder: '', iban: '', bic: '', bankName: '' }
  const recipientList = useMemo(() => {
    if (!invoice) return []
    if (source) return snapshotRecipients(source)
    if (legacyDraftWithoutPrintData) return []
    return recipientRefs(invoice).flatMap((ref) => {
      const person = liveRecipient(ref, guardians, students)
      return person ? [person] : []
    })
  }, [guardians, invoice, legacyDraftWithoutPrintData, source, students])
  const studentList = useMemo(() => {
    if (!invoice) return []
    if (source) return source.students
    if (legacyDraftWithoutPrintData) return []
    return invoice.studentIds.flatMap((id) => {
      const student = students.find((item) => item.id === id)
      return student ? [{ id: student.id, name: student.name }] : []
    })
  }, [invoice, legacyDraftWithoutPrintData, source, students])

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
  const showStudentPerItem = invoice.studentIds.length > 1 || studentList.length > 1
  const lastOutputItem = groups ? groups.at(-1)?.items.at(-1) : invoice.items.at(-1)
  const itemRow = (item: InvoiceItem) => {
    const studentName = studentList.find((student) => student.id === item.studentId)?.name
    return (
      <tr className="invoice-item-row" key={item.id} data-last-item={item === lastOutputItem ? 'true' : undefined}>
        <td>{invoiceServiceDate(item.serviceDate)}</td>
        <td>{showStudentPerItem && studentName && <span className="invoice-item-student">{studentName}</span>}{item.description}</td>
        <td>{number.format(item.quantity)} {item.unit}</td>
        <td>{outputUnitPrice(invoice, item)}</td>
        <td>{euro.format(outputItemCents(invoice, item) / 100)}</td>
      </tr>
    )
  }
  return (
    <article className="invoice-paper" data-margin-boxes={hasPrintMarginBoxes ? 'true' : undefined} aria-label={`Rechnung ${invoice.number ?? 'Entwurf'}`}>
      <style data-invoice-page-style>{pageStyle}</style>
      {invoice.status === 'draft' && <div className="invoice-draft-watermark" aria-hidden="true">ENTWURF</div>}
      <div className="invoice-paper__body">
        <header className="invoice-letterhead">
          <section className="invoice-address invoice-issuer">
            {issuer.name && <strong>{issuer.name}</strong>}
            {issuer.street && <span>{issuer.street}</span>}
            {(issuer.postalCode || issuer.city) && <span>{[issuer.postalCode, issuer.city].filter(Boolean).join(' ')}</span>}
            {(issuer.phone || issuer.email) && <span>{[issuer.phone, issuer.email].filter(Boolean).join(' · ')}</span>}
          </section>
          <div className="invoice-letterhead__details">
            <section className="invoice-recipient">
              {recipientList.map((recipient) => (
                <div className="invoice-address" key={recipientKey(recipient)}>
                  <strong>{recipient.name}</strong>
                  {recipient.street && <span>{recipient.street}</span>}
                  {(recipient.postalCode || recipient.city) && <span>{[recipient.postalCode, recipient.city].filter(Boolean).join(' ')}</span>}
                </div>
              ))}
            </section>
            <section className="invoice-meta">
              <h1>Rechnung</h1>
              <dl>
                <dt>Nr.:</dt><dd><strong>{invoice.number ?? pendingNumberLabel ?? 'ENTWURF'}</strong></dd>
                <dt>Datum:</dt><dd>{formatDateLong(invoice.invoiceDate)}</dd>
                {period && <><dt>Zeitraum:</dt><dd>{period}</dd></>}
              </dl>
            </section>
          </div>
        </header>

        <section className="invoice-intro">
          <p>Hiermit stelle ich die folgenden Leistungen in Rechnung.</p>
          {!showStudentPerItem && studentList.length === 1 && <p><strong>Unterricht für:</strong> {studentList[0].name}</p>}
        </section>

        <table className="invoice-table">
          <colgroup><col className="invoice-table__date" /><col /><col className="invoice-table__quantity" /><col className="invoice-table__price" /><col className="invoice-table__amount" /></colgroup>
          <thead>
            <tr><th scope="col">Datum</th><th scope="col">Leistung</th><th scope="col">Menge</th><th scope="col">Einzelpreis</th><th scope="col">Betrag</th></tr>
          </thead>
          {groups ? groups.map((group) => (
            <tbody className="invoice-month-group" key={group.key}>
              <tr className="invoice-group-gap" aria-hidden="true"><td colSpan={5} /></tr>
              <tr className="invoice-group-heading"><th scope="rowgroup" colSpan={5}>{group.title}</th></tr>
              {group.items.map(itemRow)}
              {groups.length > 1 && <tr className="invoice-subtotal-row"><th scope="row" colSpan={4}>{group.subtotalLabel}</th><td>{euro.format(group.totalCents / 100)}</td></tr>}
              <tr className="invoice-group-end" aria-hidden="true"><td colSpan={5} /></tr>
            </tbody>
          )) : <tbody className="invoice-flat-items">{invoice.items.map(itemRow)}</tbody>}
        </table>

        <section className="invoice-summary">
          <p className="invoice-total-row"><span>Summe</span><strong>{euro.format(totalCents / 100)}</strong></p>
          <p className="invoice-private-row">Privatrechnung</p>
          <section className="invoice-payment-block">
            {invoice.dueDate && <p className="invoice-payment-copy">Zahlbar bis {formatDateLong(invoice.dueDate)}.</p>}
            <section className={visibleQrCode ? 'invoice-payment' : 'invoice-payment invoice-payment--without-qr'}>
              <dl>
                {account.accountHolder && <><dt>Kontoinhaber:</dt><dd>{account.accountHolder}</dd></>}
                {account.iban && <><dt>IBAN:</dt><dd className="mono">{formatIban(account.iban)}</dd></>}
                {account.bic && <><dt>BIC:</dt><dd className="mono">{account.bic}</dd></>}
                {account.bankName && <><dt>Bank:</dt><dd>{account.bankName}</dd></>}
                <dt>Verwendungszweck:</dt><dd>Rechnung {invoice.number ?? 'Entwurf'}</dd>
              </dl>
              {visibleQrCode && <div className="invoice-qr">
                <img src={visibleQrCode.url} alt="EPC-QR-Code für die SEPA-Überweisung" onLoad={() => { void waitForPrintFonts().then(() => onPrintReady?.(visibleQrCode.requestId, visibleQrCode.invoiceId, visibleQrCode.payload)) }} onError={() => onPrintError?.(visibleQrCode.requestId, visibleQrCode.invoiceId, 'GiroCode konnte nicht geladen werden.')} />
                <p>Mit Banking-App scannen</p>
              </div>}
            </section>
          </section>
        </section>
        {invoice.freeText && <p className="invoice-free-text">{invoice.freeText}</p>}
      </div>
      <footer className="invoice-footer">Rechnung {invoice.number ?? 'Entwurf'}</footer>
    </article>
  )
}
