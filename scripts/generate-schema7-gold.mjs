import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

// Run explicitly under Node 22 after npm ci. The audited source is never edited.
const commit = '1449d596e6538d32f4c22ef3a0b2f845ef1aed71'
const root = mkdtempSync(join(tmpdir(), 'riffrechnung-schema7-'))
const source = join(root, 'audit')
const target = join(root, 'fixture.mjs')
const entry = join(source, 'gold-entry.ts')
const output = resolve('tests/fixtures/schema7-audit.json')
try {
  try { execFileSync('git', ['cat-file', '-e', commit + '^{commit}'], { stdio: 'ignore' }) }
  catch { execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', commit], { stdio: 'ignore' }) }
  mkdirSync(source)
  execFileSync('tar', ['-x', '-C', source], { input: execFileSync('git', ['archive', commit], { maxBuffer: 32 * 1024 * 1024 }) })
  writeFileSync(entry, [
    "import { documentAt, documentFamily, documentDraft, editable, legacyFixture } from './tests/documentFixtures'",
    "import { saveInvoiceDraft, changeInvoiceStatus } from './src/lib/invoiceActions'",
    "import { createCorrectionDraft } from './src/lib/documents'",
    "import { captureLegacyDocuments } from './src/lib/importState'",
    "import { validateBackupState } from './src/lib/validation'",
    "const ids = (() => { let n = 0; return (prefix: string) => prefix + '-gold-' + (++n) })()",
    "const separate = () => ({ ...documentDraft(), guardianIds: ['g-b'], recipientStrategy: 'separate' as const, items: [{ ...documentDraft().items[0], id: 'separate-gold-position' }], introText: 'Nur Haushalt B', freeText: 'Synthetischer Einzelbeleg' })",
    "let issued = saveInvoiceDraft(documentFamily(), documentDraft(), true, documentAt, ids)",
    "issued = changeInvoiceStatus(issued, issued.invoices[0].id, 'paid', '2026-09-12T12:00:00.000Z', '2026-09-12')",
    "issued = createCorrectionDraft(issued, issued.invoices[0].id, 'Synthetische Korrektur', '2026-09-13T12:00:00.000Z')",
    "issued = saveInvoiceDraft(issued, editable(issued.invoices.at(-1)!), true, '2026-09-13T12:00:00.000Z', ids)",
    "issued = saveInvoiceDraft(issued, separate(), true, '2026-09-14T12:00:00.000Z', ids)",
    "validateBackupState(issued)",
    "const beforeOldest = saveInvoiceDraft(documentFamily(), separate(), true, documentAt, ids)",
    "const oldest = captureLegacyDocuments(legacyFixture(beforeOldest))",
    "validateBackupState(oldest)",
    "process.stdout.write(JSON.stringify({ sourceCommit: '" + commit + "', issuedCorrected: issued, oldestSeparate: oldest }))",
  ].join('\n'))
  await build({ entryPoints: [entry], outfile: target, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' })
  const raw = execFileSync(process.execPath, [target], { maxBuffer: 8 * 1024 * 1024 }).toString('utf8')
  if (process.argv.includes('--base64')) process.stdout.write('GOLD_BASE64=' + gzipSync(raw).toString('base64') + '\n')
  else {
    writeFileSync(output, JSON.stringify(JSON.parse(raw), null, 2) + '\n')
    process.stdout.write('Wrote ' + output + '; source ' + commit + '\n')
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}
