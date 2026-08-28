import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import type { Guardian, Invoice, Settings, Student } from '../types'
import { billingPeriodFromItems, buildEpcPayload, buildInvoicePrintPageStyle, euro, footerTextForPrint, formatDateLong, formatIban, groupItemsByStudent, invoiceTotal, isValidIban, itemTotal, number, parseDate } from '../lib/utils'

interface InvoicePrintProps {
  invoice: Invoice | null
  guardians: Guardian[]
  students: Student[]
  settings: Settings
  requestId?: string
  onPrintReady?: (requestId: string, invoiceId: string, payload: string | null) => void
  onPrintError?: (requestId: string, invoiceId: string, message: string) => void
}

interface GeneratedQrCode {
  requestId: string
  invoiceId: string
  payload: string
  url: string
}

export function InvoicePrint({ invoice, guardians, students, settings, requestId, onPrintReady, onPrintError }: InvoicePrintProps) {
  const [qrCode, setQrCode] = useState<GeneratedQrCode | null>(null)
  const total = invoice ? invoiceTotal(invoice) : 0
  const period = invoice ? billingPeriodFromItems(invoice.items, invoice.invoiceDate) : ''
  const source = invoice?.snapshot
  const footerText = invoice ? footerTextForPrint(invoice.legalText || source?.legalText || settings.defaultLegalText) : ''
  const pageStyle = invoice ? buildInvoicePrintPageStyle(footerText, invoice.number) : ''
  const issuer = source?.issuer ?? settings.issuer
  const account = {
    holder: source?.accountHolder ?? settings.accountHolder,
    iban: source?.iban ?? settings.iban,
    bic: source?.bic ?? settings.bic,
    bank: source?.bankName ?? settings.bankName,
  }
  const recipientList = useMemo(() => {
    if (!invoice) return []
    if (source?.guardians.length) return source.guardians
    return invoice.guardianIds.flatMap((id) => {
      const guardian = guardians.find((item) => item.id === id)
      return guardian ? [{ id: guardian.id, name: guardian.name, email: guardian.email, ...guardian.address }] : []
    })
  }, [guardians, invoice, source])
  const studentList = useMemo(() => {
    if (!invoice) return []
    if (source?.students.length) return source.students
    return invoice.studentIds.flatMap((id) => {
      const student = students.find((item) => item.id === id)
      return student ? [{ id: student.id, name: student.name }] : []
    })
  }, [invoice, source, students])

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

  const qrRequest = useMemo<{ payload: string | null; error: string | null }>(() => {
    if (!invoice || !invoice.number || !isValidIban(account.iban) || !account.holder || total <= 0) {
      return { payload: null, error: null }
    }
    try {
      return { payload: buildEpcPayload(invoice, settings, total), error: null }
    } catch (error) {
      return { payload: null, error: error instanceof Error ? error.message : 'GiroCode konnte nicht erzeugt werden.' }
    }
  }, [account.holder, account.iban, invoice, settings, total])

  useEffect(() => {
    setQrCode(null)
    const invoiceId = invoice?.id
    if (!invoiceId || !requestId) return
    if (qrRequest.error) {
      onPrintError?.(requestId, invoiceId, qrRequest.error)
      return
    }
    if (qrRequest.payload === null) {
      onPrintReady?.(requestId, invoiceId, null)
      return
    }
    const payload = qrRequest.payload
    let cancelled = false
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 420,
      color: { dark: '#111827', light: '#ffffff' },
    }).then((url) => !cancelled && setQrCode({ requestId, invoiceId, payload, url }))
      .catch(() => !cancelled && onPrintError?.(requestId, invoiceId, 'GiroCode konnte nicht erzeugt werden.'))
    return () => { cancelled = true }
  }, [invoice?.id, onPrintError, onPrintReady, qrRequest.error, qrRequest.payload, requestId])

  if (!invoice) return null
  const visibleQrCode = qrCode
    && qrCode.requestId === requestId
    && qrCode.invoiceId === invoice.id
    && qrCode.payload === qrRequest.payload
    ? qrCode
    : null
  const salutation = recipientList.map((item) => item.name).join(' und ') || 'Damen und Herren'

  return (
    <article className="invoice-paper" aria-label={`Rechnung ${invoice.number ?? 'Entwurf'}`}>
      <style data-invoice-page-style>{pageStyle}</style>
      {invoice.status === 'draft' && <div className="invoice-draft-watermark" aria-hidden="true">ENTWURF</div>}
      <div className="invoice-paper__body">
        <header className="invoice-letterhead">
          <section className="invoice-recipient">
            <p className="invoice-senderline">{[issuer.name, issuer.street, `${issuer.postalCode} ${issuer.city}`].filter(Boolean).join(' · ')}</p>
            <p className="invoice-to">AN</p>
            {recipientList.map((recipient) => (
              <div className="invoice-address" key={recipient.id}>
                <strong>{recipient.name}</strong>
                <span>{recipient.street}, {recipient.postalCode} {recipient.city}</span>
                <small>{recipient.email}</small>
              </div>
            ))}
          </section>
          <section className="invoice-meta">
            <h1>RECHNUNG</h1>
            <div className="invoice-meta__rule" />
            <dl>
              <dt>Nr.:</dt><dd><strong>{invoice.number ?? 'ENTWURF'}</strong></dd>
              <dt>Datum:</dt><dd>{formatDateLong(invoice.invoiceDate)}</dd>
              <dt>Zeitraum:</dt><dd>{period}</dd>
              <dt>Fällig:</dt><dd><strong>{formatDateLong(invoice.dueDate)}</strong></dd>
              <dt>Von:</dt><dd><strong>{issuer.name || '–'}</strong></dd>
              <dt>Straße:</dt><dd>{issuer.street || '–'}</dd>
              <dt>PLZ/Ort:</dt><dd>{issuer.postalCode} {issuer.city}</dd>
              <dt>Tel.:</dt><dd>{issuer.phone || '–'}</dd>
              <dt>E-Mail:</dt><dd>{issuer.email || '–'}</dd>
            </dl>
          </section>
        </header>

        <section className="invoice-intro">
          <p>Sehr geehrte/r {salutation},</p>
          <p>{invoice.introText}</p>
        </section>

        <table className="invoice-table">
          <thead>
            <tr><th>Datum</th><th>Titel / Thema</th><th>Std./Menge</th><th>Einzelpreis</th><th>Betrag</th></tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <PrintGroup key={group.key} label={group.label} items={group.items} showSubtotal={groups.length > 1} />
            ))}
            <tr className="invoice-total-row">
              <td colSpan={2}>Summe</td>
              <td>{number.format(invoice.items.reduce((sum, item) => sum + item.quantity, 0))}</td>
              <td />
              <td>{euro.format(total)}</td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-payment-block">
          <section className="invoice-payment-copy">
            <p>Bitte überweisen Sie den Gesamtbetrag von <strong>{euro.format(total)}</strong> bis zum <strong>{formatDateLong(invoice.dueDate)}</strong> auf das folgende Konto:</p>
          </section>

          <section className="invoice-payment">
            <dl>
              <dt>Kontoinhaber:</dt><dd><strong>{account.holder || '–'}</strong></dd>
              <dt>IBAN:</dt><dd className="mono">{formatIban(account.iban) || '–'}</dd>
              <dt>BIC:</dt><dd className="mono">{account.bic || '–'}</dd>
              <dt>Bank:</dt><dd>{account.bank || '–'}</dd>
              <dt>Verwendungszweck:</dt><dd><strong>Rechnung {invoice.number ?? 'Entwurf'}</strong></dd>
            </dl>
            <div className="invoice-qr">
              {visibleQrCode ? <img src={visibleQrCode.url} alt="EPC-QR-Code für die SEPA-Überweisung" onLoad={() => onPrintReady?.(visibleQrCode.requestId, visibleQrCode.invoiceId, visibleQrCode.payload)} onError={() => onPrintError?.(visibleQrCode.requestId, visibleQrCode.invoiceId, 'GiroCode konnte nicht geladen werden.')} /> : <span>GiroCode nach Finalisierung und mit gültiger IBAN</span>}
              <p>Mit Banking-App scannen</p>
            </div>
          </section>

          {invoice.freeText && <p className="invoice-free-text">{invoice.freeText}</p>}
          <div className="invoice-closing">
            <section className="invoice-thanks"><p>Vielen Dank</p><strong>{issuer.name}</strong></section>
            <footer className="invoice-footer">
              <div className="invoice-footer__rule" />
              <div className="invoice-footer__content"><p>{footerText}</p><span className="invoice-footer__page" aria-hidden="true">Seite …</span></div>
            </footer>
          </div>
        </div>
      </div>
    </article>
  )
}

function PrintGroup({ label, items, showSubtotal }: { label: string; items: Invoice['items']; showSubtotal: boolean }) {
  const subtotal = items.reduce((sum, item) => sum + itemTotal(item), 0)
  return (
    <>
      <tr className="invoice-group-heading"><td colSpan={5}><strong>{label}</strong><span /></td></tr>
      {items.map((item, index) => (
        <tr className={index % 2 === 0 ? 'invoice-item-row invoice-item-row--tint' : 'invoice-item-row'} key={item.id}>
          <td>{item.serviceDate ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(parseDate(item.serviceDate)) : '–'}</td>
          <td>{item.description}</td>
          <td>{number.format(item.quantity)} {item.unit === 'Std.' ? '' : item.unit}</td>
          <td>{euro.format(item.unitPrice)}</td>
          <td>{euro.format(itemTotal(item))}</td>
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
