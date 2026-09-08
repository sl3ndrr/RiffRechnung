import { mailboxError, MAILBOX_ERROR } from '../lib/mailbox'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Mail, MapPin, Pencil, Plus, Search, Trash2, UserRound, Users } from 'lucide-react'
import type { AppState, Guardian, Student } from '../types'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { sortPeople, studentCodeForIndex, uid, type PeopleSortMode } from '../lib/utils'

const GUARDIAN_FORM_ID = 'guardian-entry-form'
const STUDENT_FORM_ID = 'student-entry-form'

interface PeopleProps {
  state: AppState
  onSaveGuardian: (guardian: Guardian) => Promise<boolean>
  onSaveStudent: (student: Student) => Promise<boolean>
  onDeleteGuardian: (guardian: Guardian) => void
  onDeleteStudent: (student: Student) => void
}

const blankGuardian = (): Guardian => ({
  id: uid('guardian'),
  name: '', email: '', phone: '', iban: '', paymentNote: '',
  address: { street: '', postalCode: '', city: '' },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

const blankStudent = (): Student => ({
  id: uid('student'), name: '', billingCode: '', guardianIds: [], note: '', active: true,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

export function People({ state, onSaveGuardian, onSaveStudent, onDeleteGuardian, onDeleteStudent }: PeopleProps) {
  const [search, setSearch] = useState('')
  const [guardianForm, setGuardianForm] = useState<Guardian | null>(null)
  const [studentForm, setStudentForm] = useState<Student | null>(null)
  const [onlyActiveStudents, setOnlyActiveStudents] = useState(true)
  const [peopleSort, setPeopleSort] = useState<PeopleSortMode>('name-asc')
  const [error, setError] = useState('')
  const needle = search.toLocaleLowerCase('de-DE').trim()
  const students = useMemo(() => sortPeople(state.students.filter((student) => (
    (!onlyActiveStudents || student.active)
    && (!needle || `${student.name} ${student.note} ${student.guardianIds.map((id) => state.guardians.find((guardian) => guardian.id === id)?.name).join(' ')}`.toLocaleLowerCase('de-DE').includes(needle))
  )), peopleSort), [needle, onlyActiveStudents, peopleSort, state.guardians, state.students])
  const guardians = useMemo(() => sortPeople(state.guardians.filter((guardian) => !needle || `${guardian.name} ${guardian.email} ${guardian.address.city}`.toLocaleLowerCase('de-DE').includes(needle)), peopleSort), [needle, peopleSort, state.guardians])

  const closeGuardianForm = () => { setGuardianForm(null); setError('') }
  const closeStudentForm = () => { setStudentForm(null); setError('') }

  const saveGuardian = async () => {
    if (!guardianForm?.name.trim()) return setError('Bitte einen Namen eintragen.')
    if (mailboxError(guardianForm.email)) return setError(MAILBOX_ERROR)
    if (!await onSaveGuardian({ ...guardianForm, updatedAt: new Date().toISOString() })) return
    setGuardianForm(null)
    setError('')
  }

  const saveStudent = async () => {
    if (!studentForm?.name.trim()) return setError('Bitte den Namen des Kindes eintragen.')
    if (!studentForm.guardianIds.length) return setError('Bitte mindestens eine erziehungsberechtigte Person zuordnen.')
    if (!await onSaveStudent({ ...studentForm, updatedAt: new Date().toISOString() })) return
    setStudentForm(null)
    setError('')
  }

  return (
    <div className="page people-page">
      <header className="page-header">
        <div><p className="eyebrow">Stammdaten</p><h1>Familien</h1><p>Kinder und Erziehungsberechtigte übersichtlich miteinander verknüpft.</p></div>
        <div className="page-header__actions"><button className="button button--tonal" onClick={() => setGuardianForm(blankGuardian())}><UserRound aria-hidden="true" /> Elternteil</button><button className="button button--primary button--large" onClick={() => setStudentForm(blankStudent())}><Plus aria-hidden="true" /> Kind anlegen</button></div>
      </header>

      <div className="people-toolbar">
        <label className="search-field people-search"><Search aria-hidden="true" /><span className="sr-only">Familien durchsuchen</span><input type="search" placeholder="Nach Kind, Elternteil oder Ort suchen …" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="switch-row switch-row--compact people-active-filter"><span className="people-active-filter__copy"><strong>Nur aktive Kinder anzeigen</strong><small>{state.students.filter((student) => student.active).length} aktiv · {state.students.length} insgesamt</small></span><input type="checkbox" checked={onlyActiveStudents} onChange={(event) => setOnlyActiveStudents(event.target.checked)} /><i /></label>
        <label className="select-field people-sort"><span className="sr-only">Familienlisten sortieren</span><select value={peopleSort} onChange={(event) => setPeopleSort(event.target.value as PeopleSortMode)}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="created-desc">Neueste zuerst</option><option value="created-asc">Älteste zuerst</option></select><ChevronDown aria-hidden="true" /></label>
      </div>

      {!state.students.length && !state.guardians.length ? (
        <section className="surface"><EmptyState icon={Users} title="Noch keine Familie angelegt" description="Beginne mit einer erziehungsberechtigten Person und ordne anschließend ein Kind zu." action={<button className="button button--primary" onClick={() => setGuardianForm(blankGuardian())}><Plus aria-hidden="true" /> Elternteil anlegen</button>} /></section>
      ) : (
        <div className="people-layout">
          <section className="people-section">
            <div className="section-heading"><div><p className="eyebrow">Schüler:innen</p><h2>{students.length} Kinder</h2></div><button className="icon-button" onClick={() => setStudentForm(blankStudent())} aria-label="Kind hinzufügen"><Plus aria-hidden="true" /></button></div>
            <div className="student-grid">
              {students.map((student, index) => {
                const linked = student.guardianIds.flatMap((id) => state.guardians.filter((guardian) => guardian.id === id))
                return (
                  <article className="student-card" key={student.id} style={{ '--delay': `${Math.min(index, 8) * 28}ms` } as React.CSSProperties}>
                    <header><span className={`avatar avatar--large avatar--tone-${index % 4}`}>{student.name.slice(0, 1)}</span><span className="student-card__meta"><span className="student-code" title="Kennzeichen im Rechnungsnummernkreis">{student.billingCode}</span><span className={`active-dot ${student.active ? '' : 'active-dot--muted'}`} title={student.active ? 'Aktiv' : 'Inaktiv'} /></span></header>
                    <h3>{student.name}</h3>
                    <p>{student.note || 'Gitarrenunterricht'}</p>
                    <div className="student-card__guardians">{linked.map((guardian) => <span key={guardian.id}><UserRound aria-hidden="true" />{guardian.name}</span>)}</div>
                    <footer><button className="button button--text" onClick={() => setStudentForm(structuredClone(student))}><Pencil aria-hidden="true" /> Bearbeiten</button><button className="icon-button icon-button--small" onClick={() => onDeleteStudent(student)} aria-label={`${student.name} löschen`}><Trash2 aria-hidden="true" /></button></footer>
                  </article>
                )
              })}
              {!students.length && <EmptyState icon={Search} title="Kein Kind gefunden" description={onlyActiveStudents ? 'Passe die Suche an oder blende inaktive Kinder ein.' : 'Passe den Suchbegriff an.'} />}
            </div>
          </section>

          <section className="surface guardian-section">
            <div className="section-heading"><div><p className="eyebrow">Erziehungsberechtigte</p><h2>{guardians.length} Kontakte</h2></div><button className="icon-button" onClick={() => setGuardianForm(blankGuardian())} aria-label="Elternteil hinzufügen"><Plus aria-hidden="true" /></button></div>
            <div className="guardian-list">
              {guardians.map((guardian) => {
                const linkedStudents = state.students.filter((student) => student.guardianIds.includes(guardian.id))
                return (
                  <article className="guardian-row" key={guardian.id}>
                    <span className="avatar avatar--warm">{guardian.name.slice(0, 1)}</span>
                    <div className="guardian-row__main"><strong>{guardian.name}</strong><span><Mail aria-hidden="true" /> {guardian.email || 'Keine E-Mail'}</span><span><MapPin aria-hidden="true" /> {[guardian.address.postalCode, guardian.address.city].filter(Boolean).join(' ') || 'Keine Anschrift'}</span><small>{linkedStudents.map((student) => student.name).join(', ') || 'Noch keinem Kind zugeordnet'}</small></div>
                    <div className="guardian-row__actions"><button className="icon-button icon-button--small" onClick={() => setGuardianForm(structuredClone(guardian))} aria-label={`${guardian.name} bearbeiten`}><Pencil aria-hidden="true" /></button><button className="icon-button icon-button--small" onClick={() => onDeleteGuardian(guardian)} aria-label={`${guardian.name} löschen`}><Trash2 aria-hidden="true" /></button><ChevronRight aria-hidden="true" /></div>
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      )}

      <Modal open={Boolean(guardianForm)} onClose={closeGuardianForm} title={state.guardians.some((item) => item.id === guardianForm?.id) ? 'Elternteil bearbeiten' : 'Elternteil anlegen'} eyebrow="Erziehungsberechtigte Person" footer={<><button className="button button--text" type="button" onClick={closeGuardianForm}>Abbrechen</button><button className="button button--primary" type="submit" form={GUARDIAN_FORM_ID}>Speichern</button></>}>
        {guardianForm && <form className="form-stack" id={GUARDIAN_FORM_ID} onSubmit={(event) => { event.preventDefault(); saveGuardian() }}>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="form-grid form-grid--2"><label className="field field--full"><span>Name *</span><input autoFocus value={guardianForm.name} onChange={(event) => setGuardianForm({ ...guardianForm, name: event.target.value })} placeholder="Vor- und Nachname" /></label><label className="field"><span>E-Mail</span><input type="text" inputMode="email" aria-invalid={Boolean(mailboxError(guardianForm.email))} value={guardianForm.email} onChange={(event) => setGuardianForm({ ...guardianForm, email: event.target.value })} /></label><label className="field"><span>Telefon</span><input type="tel" value={guardianForm.phone} onChange={(event) => setGuardianForm({ ...guardianForm, phone: event.target.value })} /></label><label className="field field--full"><span>Straße & Hausnummer</span><input value={guardianForm.address.street} onChange={(event) => setGuardianForm({ ...guardianForm, address: { ...guardianForm.address, street: event.target.value } })} /></label><label className="field"><span>PLZ</span><input inputMode="numeric" value={guardianForm.address.postalCode} onChange={(event) => setGuardianForm({ ...guardianForm, address: { ...guardianForm.address, postalCode: event.target.value } })} /></label><label className="field"><span>Ort</span><input value={guardianForm.address.city} onChange={(event) => setGuardianForm({ ...guardianForm, address: { ...guardianForm.address, city: event.target.value } })} /></label><label className="field field--full"><span>IBAN / Zahlungsinfo (optional)</span><input value={guardianForm.iban} onChange={(event) => setGuardianForm({ ...guardianForm, iban: event.target.value })} placeholder="Nur falls für interne Zuordnung benötigt" /></label><label className="field field--full"><span>Interne Notiz</span><textarea rows={2} value={guardianForm.paymentNote} onChange={(event) => setGuardianForm({ ...guardianForm, paymentNote: event.target.value })} /></label></div>
        </form>}
      </Modal>

      <Modal open={Boolean(studentForm)} onClose={closeStudentForm} title={state.students.some((item) => item.id === studentForm?.id) ? 'Kind bearbeiten' : 'Kind anlegen'} eyebrow="Schüler:in" footer={<><button className="button button--text" type="button" onClick={closeStudentForm}>Abbrechen</button><button className="button button--primary" type="submit" form={STUDENT_FORM_ID}>Speichern</button></>}>
        {studentForm && <form className="form-stack" id={STUDENT_FORM_ID} onSubmit={(event) => { event.preventDefault(); saveStudent() }}>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="student-code-note"><span>{studentForm.billingCode || studentCodeForIndex(state.nextStudentCodeIndex)}</span><div><strong>Rechnungskennzeichen</strong><small>{studentForm.billingCode ? 'Bleibt diesem Kind dauerhaft zugeordnet.' : 'Wird beim Speichern automatisch und dauerhaft vergeben.'}</small></div></div>
          <label className="field"><span>Name *</span><input autoFocus value={studentForm.name} onChange={(event) => setStudentForm({ ...studentForm, name: event.target.value })} /></label>
          <fieldset className="chip-fieldset"><legend>Erziehungsberechtigte *</legend><div className="choice-chips">{state.guardians.map((guardian) => <label className={studentForm.guardianIds.includes(guardian.id) ? 'choice-chip is-selected' : 'choice-chip'} key={guardian.id}><input type="checkbox" checked={studentForm.guardianIds.includes(guardian.id)} onChange={() => setStudentForm({ ...studentForm, guardianIds: studentForm.guardianIds.includes(guardian.id) ? studentForm.guardianIds.filter((id) => id !== guardian.id) : [...studentForm.guardianIds, guardian.id] })} /><span className="avatar avatar--warm">{guardian.name.slice(0, 1)}</span>{guardian.name}</label>)}</div>{!state.guardians.length && <p className="field-hint field-hint--warning">Lege zuerst eine erziehungsberechtigte Person an.</p>}</fieldset>
          <label className="field"><span>Unterricht / interne Notiz</span><textarea rows={3} value={studentForm.note} onChange={(event) => setStudentForm({ ...studentForm, note: event.target.value })} placeholder="z. B. Duo-Unterricht · Freitag" /></label>
          <label className="switch-row"><span><strong>Aktiv</strong><small>In Auswahllisten für neue Rechnungen anzeigen</small></span><input type="checkbox" checked={studentForm.active} onChange={(event) => setStudentForm({ ...studentForm, active: event.target.checked })} /><i /></label>
        </form>}
      </Modal>
    </div>
  )
}
