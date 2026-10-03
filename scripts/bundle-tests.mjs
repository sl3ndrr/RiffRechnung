import { readdirSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

// Each subject file is an entry point, never imported by a registration hub.
// Clean only unit output so removed/renamed tests cannot run as stale bundles.
const outdir = '.test-dist/unit'
const entryPoints = readdirSync('tests').filter((name) => name.endsWith('.test.ts')).sort().map((name) => `tests/${name}`)
if (entryPoints.length === 0) throw new Error('Keine Fachtestdateien gefunden.')
rmSync(outdir, { recursive: true, force: true })
console.log(`Fachtests: ${entryPoints.length} direkte Testdateien`)
await build({ entryPoints, outdir, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'info' })
