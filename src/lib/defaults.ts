import type { AppState, Guardian, Invoice, InvoiceDraft, InvoiceItem, LessonType, Settings, Student } from '../types'

export const defaultSettings: Settings = {
  issuer: {
    name: '',
    street: '',
    postalCode: '',
    city: '',
    email: '',
    phone: '',
  },
  accountHolder: '',
  iban: '',
  bic: '',
  bankName: '',
  privateRate: 30,
  duoRate: 20,
  numberPattern: '{YYYY}-{K}-{NNNN}',
  resetNumberAnnually: true,
  paymentTermDays: 14,
  defaultLegalText: 'Privatrechnung | Umsatzsteuerbefreit gemäß § 19 UStG (Kleinunternehmerregelung).',
  theme: 'system',
  reducedMotion: false,
}

export function emptyState(): AppState {
  return {
    schemaVersion: 2,
    guardians: [],
    students: [],
    invoices: [],
    voidedInvoiceNumbers: [],
    settings: structuredClone(defaultSettings),
    counters: {},
    nextStudentCodeIndex: 0,
    audit: [],
    updatedAt: new Date().toISOString(),
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function createEmptyInvoiceDraft(settings: Settings): InvoiceDraft {
  const invoiceDate = new Date()
  const dueDate = new Date(invoiceDate)
  dueDate.setDate(dueDate.getDate() + settings.paymentTermDays)
  const monthName = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(invoiceDate)

  return {
    invoiceDate: isoDate(invoiceDate),
    dueDate: isoDate(dueDate),
    period: monthName,
    guardianIds: [],
    studentIds: [],
    recipientStrategy: 'joint',
    items: [],
    introText: 'Hiermit stelle ich die Unterrichtseinheiten im Fach Gitarre für den genannten Zeitraum in Rechnung.',
    freeText: '',
    legalText: settings.defaultLegalText,
  }
}

export function createDemoState(referenceDate = new Date()): AppState {
  const reference = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate
  const now = reference.toISOString()
  const currentYear = reference.getFullYear()
  const currentMonth = reference.getMonth()
  const currentDay = reference.getDate()
  const seededAt = '2025-01-02T09:00:00.000Z'

  const demoIban = (index: number) => {
    const bban = `00000000${String(index).padStart(10, '0')}`
    let remainder = 0
    for (const digit of `${bban}131400`) remainder = (remainder * 10 + Number(digit)) % 97
    return `DE${String(98 - remainder).padStart(2, '0')}${bban}`
  }

  const guardianSeeds = [
    { id: 'guardian-demo-claudia-schneider', name: 'Claudia Schneider', email: 'claudia.schneider@example.de', phone: '+49 221 555 11 01', address: { street: 'Lindenweg 8', postalCode: '50931', city: 'Köln' }, family: 'Schneider' },
    { id: 'guardian-demo-tobias-schneider', name: 'Tobias Schneider', email: 'tobias.schneider@example.de', phone: '+49 221 555 11 02', address: { street: 'Lindenweg 8', postalCode: '50931', city: 'Köln' }, family: 'Schneider' },
    { id: 'guardian-demo-aylin-yilmaz', name: 'Aylin Yılmaz', email: 'aylin.yilmaz@example.de', phone: '+49 221 555 12 01', address: { street: 'Rosenstraße 14', postalCode: '50678', city: 'Köln' }, family: 'Yılmaz' },
    { id: 'guardian-demo-murat-yilmaz', name: 'Murat Yılmaz', email: 'murat.yilmaz@example.de', phone: '+49 221 555 12 02', address: { street: 'Rosenstraße 14', postalCode: '50678', city: 'Köln' }, family: 'Yılmaz' },
    { id: 'guardian-demo-anna-becker', name: 'Anna Becker', email: 'anna.becker@example.de', phone: '+49 221 555 13 01', address: { street: 'Berrenrather Straße 96', postalCode: '50937', city: 'Köln' }, family: 'Becker' },
    { id: 'guardian-demo-thomas-hoffmann', name: 'Thomas Hoffmann', email: 'thomas.hoffmann@example.de', phone: '+49 221 555 14 01', address: { street: 'Neusser Straße 221', postalCode: '50733', city: 'Köln' }, family: 'Hoffmann' },
    { id: 'guardian-demo-linh-nguyen', name: 'Linh Nguyen', email: 'linh.nguyen@example.de', phone: '+49 221 555 15 01', address: { street: 'Aachener Straße 318', postalCode: '50933', city: 'Köln' }, family: 'Nguyen' },
    { id: 'guardian-demo-katharina-wagner', name: 'Katharina Wagner', email: 'katharina.wagner@example.de', phone: '+49 221 555 16 01', address: { street: 'Sülzburgstraße 42', postalCode: '50937', city: 'Köln' }, family: 'Wagner' },
    { id: 'guardian-demo-sebastian-wagner', name: 'Sebastian Wagner', email: 'sebastian.wagner@example.de', phone: '+49 221 555 16 02', address: { street: 'Sülzburgstraße 42', postalCode: '50937', city: 'Köln' }, family: 'Wagner' },
    { id: 'guardian-demo-marco-romano', name: 'Marco Romano', email: 'marco.romano@example.de', phone: '+49 221 555 17 01', address: { street: 'Deutzer Freiheit 73', postalCode: '50679', city: 'Köln' }, family: 'Romano' },
  ]
  const guardians: Guardian[] = guardianSeeds.map((guardian, index) => ({
    id: guardian.id,
    name: guardian.name,
    email: guardian.email,
    phone: guardian.phone,
    address: guardian.address,
    iban: demoIban(index + 1),
    paymentNote: `Monatliche Sammelrechnung für Familie ${guardian.family} per E-Mail`,
    createdAt: seededAt,
    updatedAt: seededAt,
  }))

  const studentSeeds: Array<{
    id: string
    name: string
    billingCode: string
    guardianIds: string[]
    note: string
    lessonType: LessonType
    weekdays: [number, number]
    duration: number
  }> = [
    { id: 'student-demo-mia-schneider', name: 'Mia Schneider', billingCode: 'a', guardianIds: ['guardian-demo-claudia-schneider', 'guardian-demo-tobias-schneider'], note: 'Solo-Unterricht · Montag und Donnerstag · 45 Minuten', lessonType: 'solo', weekdays: [1, 4], duration: .75 },
    { id: 'student-demo-jonas-schneider', name: 'Jonas Schneider', billingCode: 'b', guardianIds: ['guardian-demo-claudia-schneider', 'guardian-demo-tobias-schneider'], note: 'Duo-Unterricht mit Elif · Dienstag und Freitag · 45 Minuten', lessonType: 'duo', weekdays: [2, 5], duration: .75 },
    { id: 'student-demo-elif-yilmaz', name: 'Elif Yılmaz', billingCode: 'c', guardianIds: ['guardian-demo-aylin-yilmaz', 'guardian-demo-murat-yilmaz'], note: 'Duo-Unterricht mit Jonas · Dienstag und Freitag · 45 Minuten', lessonType: 'duo', weekdays: [2, 5], duration: .75 },
    { id: 'student-demo-deniz-yilmaz', name: 'Deniz Yılmaz', billingCode: 'd', guardianIds: ['guardian-demo-aylin-yilmaz', 'guardian-demo-murat-yilmaz'], note: 'Solo-Unterricht · Mittwoch und Samstag · 60 Minuten', lessonType: 'solo', weekdays: [3, 6], duration: 1 },
    { id: 'student-demo-paul-becker', name: 'Paul Becker', billingCode: 'e', guardianIds: ['guardian-demo-anna-becker'], note: 'Solo-Unterricht · Montag und Mittwoch · 45 Minuten', lessonType: 'solo', weekdays: [1, 3], duration: .75 },
    { id: 'student-demo-sophie-hoffmann', name: 'Sophie Hoffmann', billingCode: 'f', guardianIds: ['guardian-demo-thomas-hoffmann'], note: 'Duo-Unterricht mit Noah · Mittwoch und Freitag · 45 Minuten', lessonType: 'duo', weekdays: [3, 5], duration: .75 },
    { id: 'student-demo-minh-nguyen', name: 'Minh Nguyen', billingCode: 'g', guardianIds: ['guardian-demo-linh-nguyen'], note: 'Solo-Unterricht · Dienstag und Donnerstag · 60 Minuten', lessonType: 'solo', weekdays: [2, 4], duration: 1 },
    { id: 'student-demo-emma-wagner', name: 'Emma Wagner', billingCode: 'h', guardianIds: ['guardian-demo-katharina-wagner', 'guardian-demo-sebastian-wagner'], note: 'Solo-Unterricht · Montag und Donnerstag · 45 Minuten', lessonType: 'solo', weekdays: [1, 4], duration: .75 },
    { id: 'student-demo-noah-wagner', name: 'Noah Wagner', billingCode: 'i', guardianIds: ['guardian-demo-katharina-wagner', 'guardian-demo-sebastian-wagner'], note: 'Duo-Unterricht mit Sophie · Mittwoch und Freitag · 45 Minuten', lessonType: 'duo', weekdays: [3, 5], duration: .75 },
    { id: 'student-demo-luca-romano', name: 'Luca Romano', billingCode: 'j', guardianIds: ['guardian-demo-marco-romano'], note: 'Solo-Unterricht · Dienstag und Samstag · 60 Minuten', lessonType: 'solo', weekdays: [2, 6], duration: 1 },
  ]
  const students: Student[] = studentSeeds.map((student) => ({
    id: student.id,
    name: student.name,
    billingCode: student.billingCode,
    guardianIds: student.guardianIds,
    note: student.note,
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  }))

  const families = [
    { id: 'schneider', guardianIds: ['guardian-demo-claudia-schneider', 'guardian-demo-tobias-schneider'], studentIds: ['student-demo-mia-schneider', 'student-demo-jonas-schneider'] },
    { id: 'yilmaz', guardianIds: ['guardian-demo-aylin-yilmaz', 'guardian-demo-murat-yilmaz'], studentIds: ['student-demo-elif-yilmaz', 'student-demo-deniz-yilmaz'] },
    { id: 'becker', guardianIds: ['guardian-demo-anna-becker'], studentIds: ['student-demo-paul-becker'] },
    { id: 'hoffmann', guardianIds: ['guardian-demo-thomas-hoffmann'], studentIds: ['student-demo-sophie-hoffmann'] },
    { id: 'nguyen', guardianIds: ['guardian-demo-linh-nguyen'], studentIds: ['student-demo-minh-nguyen'] },
    { id: 'wagner', guardianIds: ['guardian-demo-katharina-wagner', 'guardian-demo-sebastian-wagner'], studentIds: ['student-demo-emma-wagner', 'student-demo-noah-wagner'] },
    { id: 'romano', guardianIds: ['guardian-demo-marco-romano'], studentIds: ['student-demo-luca-romano'] },
  ]

  const settings = structuredClone(defaultSettings)
  settings.issuer = {
    name: 'Max Mustermann',
    street: 'Musterweg 12',
    postalCode: '50674',
    city: 'Köln',
    email: 'max.mustermann@example.de',
    phone: '+49 221 555 01 00',
  }
  settings.accountHolder = 'Max Mustermann'
  settings.iban = demoIban(100)
  settings.bic = 'MUSTDEFFXXX'
  settings.bankName = 'Musterbank Köln'

  const monthFormatter = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const topics = {
    solo: ['Gitarrenunterricht', 'Akkordtechnik', 'Rhythmustraining', 'Fingerstyle', 'Songbegleitung'],
    duo: ['Duo-Unterricht', 'Rhythmus & Zusammenspiel', 'Ensemble-Spiel', 'Akkordwechsel', 'Songbegleitung'],
  }
  const sequenceByScope = new Map<string, number>()

  const lessonItemsFor = (family: typeof families[number], year: number, month: number): InvoiceItem[] => family.studentIds.flatMap((studentId) => {
    const profile = studentSeeds.find((student) => student.id === studentId)
    if (!profile) return []
    const lastDay = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate()
    const dates = Array.from({ length: lastDay }, (_, index) => index + 1)
      .filter((day) => profile.weekdays.includes(new Date(Date.UTC(year, month, day, 12)).getUTCDay()))
    return dates.map((day, index): InvoiceItem => ({
      id: `item-demo-${year}-${String(month + 1).padStart(2, '0')}-${family.id}-${profile.billingCode}-${String(index + 1).padStart(2, '0')}`,
      studentId,
      serviceDate: isoDate(new Date(Date.UTC(year, month, day, 12))),
      lessonType: profile.lessonType,
      description: `${topics[profile.lessonType][index % topics[profile.lessonType].length]} (${profile.lessonType === 'duo' ? 'Duo' : 'Solo'})`,
      quantity: profile.duration,
      unit: 'Std.',
      unitPrice: profile.lessonType === 'duo' ? settings.duoRate : settings.privateRate,
    }))
  }).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.studentId.localeCompare(b.studentId))

  const createInvoice = (family: typeof families[number], year: number, month: number, status: 'paid' | 'sent' | 'draft'): Invoice => {
    const isCurrentMonth = year === currentYear && month === currentMonth
    const invoiceDay = isCurrentMonth ? currentDay : new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate()
    const invoiceDateValue = new Date(Date.UTC(year, month, invoiceDay, 12))
    const dueDateValue = new Date(invoiceDateValue)
    dueDateValue.setUTCDate(dueDateValue.getUTCDate() + settings.paymentTermDays)
    const paidAtValue = new Date(invoiceDateValue)
    paidAtValue.setUTCDate(paidAtValue.getUTCDate() + 5)
    const finalized = status !== 'draft'
    const studentCode = family.studentIds
      .map((studentId) => studentSeeds.find((student) => student.id === studentId)?.billingCode ?? '')
      .join('+')
    const counterKey = `${year}:${studentCode}`
    const sequence = finalized ? (sequenceByScope.get(counterKey) ?? 0) + 1 : null
    if (sequence) sequenceByScope.set(counterKey, sequence)
    const number = sequence ? `${year}-${studentCode}-${String(sequence).padStart(4, '0')}` : null
    const createdAt = new Date(Date.UTC(year, month, invoiceDay, 8)).toISOString()
    const sentAt = new Date(Date.UTC(year, month, invoiceDay, 10)).toISOString()
    const paidAt = paidAtValue.toISOString()
    const updatedAt = status === 'paid' ? paidAt : isCurrentMonth ? now : sentAt

    return {
      id: `invoice-demo-${year}-${String(month + 1).padStart(2, '0')}-${family.id}`,
      number,
      sequence,
      year,
      invoiceDate: isoDate(invoiceDateValue),
      dueDate: isoDate(dueDateValue),
      period: monthFormatter.format(new Date(Date.UTC(year, month, 1, 12))),
      status,
      guardianIds: family.guardianIds,
      studentIds: family.studentIds,
      recipientStrategy: 'joint',
      items: lessonItemsFor(family, year, month),
      introText: 'Hiermit stelle ich die Unterrichtseinheiten im Fach Gitarre für den genannten Zeitraum in Rechnung.',
      freeText: status === 'draft' ? 'Entwurf: Termine und Zuordnung sind vorbereitet und können vor der Finalisierung angepasst werden.' : '',
      legalText: settings.defaultLegalText,
      ...(finalized ? {
        snapshot: {
          issuer: structuredClone(settings.issuer),
          guardians: family.guardianIds.flatMap((guardianId) => {
            const guardian = guardians.find((item) => item.id === guardianId)
            return guardian ? [{ id: guardian.id, name: guardian.name, email: guardian.email, ...guardian.address }] : []
          }),
          students: family.studentIds.flatMap((studentId) => {
            const student = students.find((item) => item.id === studentId)
            return student ? [{ id: student.id, name: student.name }] : []
          }),
          accountHolder: settings.accountHolder,
          iban: settings.iban,
          bic: settings.bic,
          bankName: settings.bankName,
          legalText: settings.defaultLegalText,
        },
        sentAt,
      } : {}),
      ...(status === 'paid' ? { paidAt } : {}),
      createdAt,
      updatedAt,
    }
  }

  const invoices: Invoice[] = []
  let historyYear = 2025
  let historyMonth = 0
  while (historyYear < currentYear || historyYear === currentYear && historyMonth < currentMonth) {
    families.forEach((family) => invoices.push(createInvoice(family, historyYear, historyMonth, 'paid')))
    historyMonth += 1
    if (historyMonth === 12) {
      historyYear += 1
      historyMonth = 0
    }
  }
  families.forEach((family, index) => invoices.push(createInvoice(family, currentYear, currentMonth, index < 2 ? 'sent' : 'draft')))

  return {
    schemaVersion: 2,
    guardians,
    students,
    invoices,
    voidedInvoiceNumbers: [],
    settings,
    counters: Object.fromEntries([...sequenceByScope].map(([key, sequence]) => [key, sequence + 1])),
    nextStudentCodeIndex: students.length,
    audit: [{ id: 'event-demo-data-loaded', at: now, label: 'Vollständige Beispieldaten ab Januar 2025 angelegt', entityType: 'system' }],
    updatedAt: now,
  }
}
