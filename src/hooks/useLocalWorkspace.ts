import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, AuditEvent, ToastMessage } from '../types'
import { recordActivity } from '../lib/commands'
import { loadLastBackupAt, StorageSession, StorageConflict, recordBackupExport, STORAGE_KEY, LEGACY_STORAGE_KEY, type StorageRecoveryState } from '../lib/storage'
import { assertOriginalsPreserved } from '../lib/safety'
import { downloadText } from '../lib/downloads'
import { uid } from '../lib/identities'

// Owns the confirmed local state and the existing storage boundary. Views receive
// it only after persistence succeeds; pending writes also guard navigation.
export function useLocalWorkspace(mode: 'real' | 'demo', toast: (message: string, tone?: ToastMessage['tone']) => void) {
  const [session] = useState(() => new StorageSession({ mode }))
  const initialLoad = session.initial
  const [state, setState] = useState<AppState>(session.state)
  const [recovery, setRecovery] = useState<StorageRecoveryState | null>(() => initialLoad.status === 'recovery' ? initialLoad : null)
  const stateRef = useRef(state)
  const pendingWrites = useRef(0)
  const [saveStateLabel, setSaveStateLabel] = useState<'saved' | 'saving' | 'error'>('saved')
  const [localSaveError, setLocalSaveError] = useState<string | null>(null)
  const [externalChangeDetected, setExternalChangeDetected] = useState(false)
  const [savedAt, setSavedAt] = useState(() => new Date())
  const [lastBackupAt, setLastBackupAt] = useState(() => mode === 'real' ? loadLastBackupAt() : null)

  const commit = useCallback(async (producer: (current: AppState) => AppState, label: string, entityType: AuditEvent['entityType'], entityId?: string, activityId?: string | (() => string | undefined)): Promise<boolean> => {
    pendingWrites.current++
    setSaveStateLabel('saving')
    setLocalSaveError(null)
    try {
      const committed = await session.change((current) => {
        const next = producer(current)
        assertOriginalsPreserved(current, next)
        const at = new Date().toISOString()
        const eventId = typeof activityId === 'function' ? activityId() : activityId
        // Undo commands carry their replay token in the audit event. Confirm
        // that same event once at the storage boundary, without duplicating it.
        return recordActivity(eventId ? { ...next, audit: next.audit.filter((event) => event.id !== eventId) } : next,
          { id: eventId ?? uid('event'), at, label, entityType, entityId })
      })
      stateRef.current = committed
      setState(committed)
      setSavedAt(new Date())
      pendingWrites.current--
      setSaveStateLabel(pendingWrites.current ? 'saving' : 'saved')
      setExternalChangeDetected(false)
      return true
    } catch (error) {
      pendingWrites.current--
      const message = error instanceof Error ? error.message : 'Änderung konnte nicht gespeichert werden.'
      setSaveStateLabel('error')
      setLocalSaveError(message)
      if (error instanceof StorageConflict) setExternalChangeDetected(true)
      toast(message, 'error')
      return false
    }
  }, [session, toast])

  useEffect(() => {
    if (mode === 'demo') return
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== LEGACY_STORAGE_KEY && event.key !== null) return
      try { session.checkCurrent() } catch { setExternalChangeDetected(true) }
    }
    try { session.checkCurrent() } catch (error) {
      setExternalChangeDetected(true)
      setLocalSaveError(error instanceof Error ? error.message : 'Speicher muss geprüft werden.')
    }
    if (!navigator.locks) setLocalSaveError('Dieser Browser hat keine Web Locks. Speichern bleibt gesperrt; JSON-Export ist möglich.')
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [mode, session])

  const restore = async (rawData: string): Promise<boolean> => {
    setSaveStateLabel('saving')
    try {
      const restored = await session.restore(rawData)
      stateRef.current = restored
      setState(restored)
      setRecovery(null)
      setLocalSaveError(null)
      setSaveStateLabel('saved')
      setSavedAt(new Date())
      setExternalChangeDetected(false)
      toast(`Wiederherstellung lokal gespeichert, Revision ${session.revision?.revision ?? 'Demo'}. Der vorherige Stand und die Eingangsdaten bleiben bereinigt gesichert.`, 'success')
      return true
    } catch (error) {
      setSaveStateLabel('error')
      setLocalSaveError(error instanceof Error ? error.message : 'Wiederherstellung fehlgeschlagen.')
      toast(error instanceof Error ? error.message : 'Wiederherstellung fehlgeschlagen.', 'error')
      return false
    }
  }

  const reset = async () => {
    pendingWrites.current++
    setSaveStateLabel('saving')
    try {
      const next = await session.resetAllLocalData()
      stateRef.current = next
      setState(next)
      setLocalSaveError(null)
      setExternalChangeDetected(false)
      setLastBackupAt(null)
      setSavedAt(new Date())
      setSaveStateLabel('saved')
    } catch (error) {
      setSaveStateLabel('error')
      setLocalSaveError(error instanceof Error ? error.message : 'Zurücksetzen fehlgeschlagen.')
      if (error instanceof StorageConflict) setExternalChangeDetected(true)
      throw error
    } finally { pendingWrites.current-- }
  }

  const exportBackup = () => {
    downloadText(`riffrechnung-backup-${new Date().toISOString().slice(0, 10)}.json`, session.export())
    try {
      if (mode === 'real') setLastBackupAt(recordBackupExport())
    } catch {
      setLastBackupAt(new Date().toISOString())
    }
    toast('JSON-Export des zuletzt bestätigten Stands gestartet.', 'info')
  }

  return { session, state, stateRef, recovery, pendingWrites, commit, restore, reset, exportBackup,
    saveStateLabel, localSaveError, externalChangeDetected, savedAt, lastBackupAt }
}
