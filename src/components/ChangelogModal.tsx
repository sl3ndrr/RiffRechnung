import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, History } from 'lucide-react'
import changelogData from '../content/changelog.json'
import { Modal } from './Modal'

interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

interface ChangelogModalProps {
  open: boolean
  onClose: () => void
}

const changelog: ChangelogEntry[] = changelogData

function formatChangelogDate(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

export function ChangelogModal({ open, onClose }: ChangelogModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (open) setCurrentIndex(0)
  }, [open])

  const entry = changelog[currentIndex] ?? changelog[0]
  if (!entry) return null

  const hasOlderEntry = currentIndex < changelog.length - 1
  const hasNewerEntry = currentIndex > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Versionshistorie"
      eyebrow="RiffRechnung"
      size="small"
      initialFocus="title"
      footer={
        <div className="changelog-navigation" aria-label="Changelog-Historie">
          <button className="changelog-navigation__button" type="button" disabled={!hasOlderEntry} onClick={() => setCurrentIndex((index) => Math.min(index + 1, changelog.length - 1))} aria-label="Ältere Version anzeigen" title="Ältere Version">
            <ChevronLeft aria-hidden="true" />
          </button>
          <span className="changelog-navigation__position" aria-live="polite">{currentIndex + 1} von {changelog.length}</span>
          <button className="changelog-navigation__button" type="button" disabled={!hasNewerEntry} onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))} aria-label="Neuere Version anzeigen" title="Neuere Version">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      }
    >
      <article className="changelog-entry" key={entry.version} aria-live="polite">
        <header className="changelog-entry__header">
          <span className="changelog-entry__icon" aria-hidden="true"><History /></span>
          <h3>Version {entry.version}</h3>
          <p>Veröffentlicht am <time dateTime={entry.date}>{formatChangelogDate(entry.date)}</time></p>
        </header>
        <ul className="changelog-entry__changes">
          {entry.changes.map((change) => <li key={change}>{change}</li>)}
        </ul>
      </article>
    </Modal>
  )
}
