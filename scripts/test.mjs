// better-sqlite3 is compiled for Electron's ABI, so run Vitest under Electron's Node runtime.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const args = process.argv.slice(2)
const r = spawnSync(electron, [vitest, ...(args.length ? args : ['run'])], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(r.status ?? 1)
