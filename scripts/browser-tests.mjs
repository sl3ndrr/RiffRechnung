import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

// Real historical application, served under the SAME origin as the current app.
// Its source is immutable; the current installed toolchain builds only the fixture.
const legacyCommit = 'ba7857fd9180fa392c42a0235643e478e5077ee5'
const source = resolve('.test-dist/legacy-source')
const target = resolve('public/legacy')
if (existsSync(source) || existsSync(target)) throw new Error('Temporärer Legacy-Testpfad ist bereits belegt. Bitte vor dem Test prüfen.')
try {
  try { execFileSync('git', ['cat-file', '-e', `${legacyCommit}^{commit}`], { stdio: 'ignore' }) }
  catch { execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', legacyCommit], { stdio: 'inherit' }) }
  mkdirSync(source, { recursive: true })
  execFileSync('tar', ['-x', '-C', source], { input: execFileSync('git', ['archive', legacyCommit]) })
  console.log(`Historischer Browser-Test: ${legacyCommit}, gleiche Origin, synthetische Daten`)
  execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', source, '--base', '/legacy/', '--outDir', target], { stdio: 'inherit' })
  const result = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(source, { recursive: true, force: true })
  rmSync(target, { recursive: true, force: true })
}
