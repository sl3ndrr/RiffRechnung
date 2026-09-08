import { canonical, descendsFrom, fingerprint, type StorageEnvelope } from './envelope'
import { inspectImport, type ImportPreview } from './importState'

export class StorageConflict extends Error {}
export interface BackupEntry { name: string; raw: string; fingerprint: string; preview: ImportPreview | null; error: string | null }
export interface DirectoryInspection { entries: BackupEntry[]; head: StorageEnvelope | null; conflict: string | null }
export interface DirectoryBinding { handle: FileSystemDirectoryHandle; datasetId: string; legacyFiles: Array<{ name: string; fingerprint: string }> }

export async function ensureWritePermission(handle: FileSystemDirectoryHandle, request = false): Promise<boolean> {
  if (!handle.queryPermission) throw new Error('Die Dateiberechtigung kann nicht sicher geprüft werden. Bitte JSON exportieren.')
  if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true
  return request && Boolean(handle.requestPermission) && await handle.requestPermission!({ mode: 'readwrite' }) === 'granted'
}

// This is a dedicated backup folder. Every JSON file, including sync conflict copies,
// is inspected. File dates and filename order never choose a winner.
export async function inspectBackupDirectory(handle: FileSystemDirectoryHandle): Promise<DirectoryInspection> {
  if (!handle.values) throw new Error('Der Ordner kann nicht vollständig gelesen werden. Bitte JSON exportieren oder einen unterstützten Browser verwenden.')
  const entries: BackupEntry[] = []
  for await (const child of handle.values()) {
    if (child.kind !== 'file' || !child.name.toLowerCase().endsWith('.json')) continue
    const file = await (child as FileSystemFileHandle).getFile()
    const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer())
    const result = inspectImport(raw)
    entries.push({ name: child.name, raw, fingerprint: await fingerprint(raw), preview: result.ok ? result.value : null, error: result.ok ? null : result.errors.map((error) => error.message).join(' ') })
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  const valid = entries.flatMap((entry) => entry.preview?.envelope ? [entry.preview.envelope] : [])
  let head: StorageEnvelope | null = null
  for (const envelope of valid) {
    if (!head || await descendsFrom(envelope, head)) head = envelope
    else if (!await descendsFrom(head, envelope)) return { entries, head: null, conflict: 'Widersprüchliche Sicherungen: Bestand, Revision oder Inhalt weichen voneinander ab. Alle Dateien bleiben erhalten.' }
  }
  return { entries, head, conflict: entries.some((entry) => !entry.preview) ? 'Mindestens eine Datei ist beschädigt oder hat ein unbekanntes Format. Alle Dateien bleiben unverändert.' : null }
}

export async function checkDirectory(binding: DirectoryBinding, envelope: StorageEnvelope): Promise<DirectoryInspection> {
  const inspection = await inspectBackupDirectory(binding.handle)
  if (inspection.conflict) throw new StorageConflict(inspection.conflict)
  if (binding.datasetId !== envelope.datasetId) throw new StorageConflict('Der Backup-Ordner gehört zu einem anderen Bestand. Bitte einen anderen Zielort wählen.')
  for (const entry of inspection.entries.filter((item) => !item.preview?.envelope)) {
    if (!binding.legacyFiles.some((accepted) => accepted.name === entry.name && accepted.fingerprint === entry.fingerprint)) throw new StorageConflict('Altbackup ohne Bestands-ID: ausdrückliche Zuordnung durch Wiederherstellung erforderlich.')
  }
  for (const accepted of binding.legacyFiles) {
    if (!inspection.entries.some((entry) => entry.name === accepted.name && entry.fingerprint === accepted.fingerprint)) throw new StorageConflict('Ein ausdrücklich zugeordnetes Altbackup wurde außerhalb der Anwendung verändert oder entfernt.')
  }
  if (inspection.head && !await descendsFrom(envelope, inspection.head)) throw new StorageConflict('Die Sicherung stammt aus einem anderen oder neueren Verlauf. Bitte Wiederherstellung prüfen oder einen anderen Zielort wählen.')
  return inspection
}

// Only StorageSession calls this function, inside the same origin-wide lock as
// local changes. It creates a NEW file and never opens an existing file writable.
export async function appendBackup(binding: DirectoryBinding, envelope: StorageEnvelope, checkLocal: () => void): Promise<void> {
  const handle = binding.handle
  if (!await ensureWritePermission(handle)) throw new Error('Datei-Backup ausstehend: Schreibberechtigung fehlt. Bitte über „Jetzt sichern“ freigeben.')
  const inspection = await checkDirectory(binding, envelope)
  if (inspection.head && canonical(inspection.head) === canonical(envelope)) return
  checkLocal()
  // Unique attempt name also permits retrying after a failed close.
  const name = `riffrechnung-v4-${envelope.revision}-${crypto.randomUUID()}.json`
  try {
    await handle.getFileHandle(name, { create: false })
    throw new StorageConflict('Der neue Dateiname ist bereits belegt. Bitte erneut versuchen.')
  } catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error }
  // Recheck as close to createWritable as the API allows. Web Locks do NOT lock
  // another device or a sync client; immutable files retain any concurrent branch.
  await checkDirectory(binding, envelope)
  if (!await ensureWritePermission(handle)) throw new Error('Schreibberechtigung wurde entzogen.')
  checkLocal()
  const file = await handle.getFileHandle(name, { create: true })
  let stream: FileSystemWritableFileStream | undefined
  try {
    if (!file.createWritable) throw new Error('Sicheres Datei-Schreiben fehlt. Bitte JSON exportieren.')
    stream = await file.createWritable()
    await stream.write(JSON.stringify(envelope, null, 2))
    await stream.close()
    const reread = await (await file.getFile()).text()
    if (canonical(JSON.parse(reread)) !== canonical(envelope)) throw new StorageConflict('Der geschriebene Inhalt stimmt nicht überein; die Datei bleibt als Konflikt erhalten.')
  } catch (error) {
    try { await stream?.abort() } catch { /* Preserve original failure. */ }
    // Only our freshly created attempt can be removed. Existing copies never are.
    // If removal is unavailable/denied, inspection exposes the remaining file.
    if (!(error instanceof StorageConflict)) {
      try { await handle.removeEntry(name) } catch { /* Next inspection reports a conflict; use another target. */ }
    }
    throw error
  }
  checkLocal()
  await checkDirectory(binding, envelope)
}
