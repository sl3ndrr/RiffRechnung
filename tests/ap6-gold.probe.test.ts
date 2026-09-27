import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('AP6 Probe: schema7-Goldfixture-Generator ist im Testeinstieg registriert', () => {
  const output = execFileSync(process.execPath, ['scripts/generate-schema7-gold.mjs', '--base64'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  process.stdout.write(output)
  assert.fail('Absichtlich rot: Registrierung und Audit-Generator nachgewiesen; Probe vor Ergebniscommit entfernen.')
})
