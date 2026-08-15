/**
 * Build script: emits the host ESM half (lib/index.js), the browser client
 * bundle (lib/client.js) in the shape client-modules serves
 * (`window.__ModuleLoader__.load({ id, factory: (require) => {...} })` with
 * platform modules left external), and the TypeScript declarations
 * (lib/types) consumers resolve through the package `types`/`exports` fields.
 *
 * @module dsh-workgroup/scripts/build
 */

import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const ID = 'dsh-workgroup'

/** Platform modules the shell shares into the frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

await rm('lib', { recursive: true, force: true })

// Declarations first: tsc emits lib/types from src (noEmit off, declaration
// on, no JS so esbuild stays the single JS emitter). The declaration pass
// must not emit JS, so the JS flags are explicitly disabled.
const tsc = spawnSync('npx', [
  'tsc', '-p', 'tsconfig.build.json',
], { stdio: 'inherit', shell: process.platform === 'win32' })
if (tsc.status !== 0) process.exit(tsc.status ?? 1)

// Host half: plain ESM, every package and node: builtin external (resolved
// from the profile install at runtime); only relative imports are bundled.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  packages: 'external',
  external: ['node:*'],
  sourcemap: false,
  logLevel: 'info',
})

// Browser half: CJS closure handed to the module loader; platform modules
// stay external (the loader's require answers them). The banner defines the
// CJS globals the bundle assigns into, matching the harness's loader format.
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  external: [...PLATFORM_MODULES],
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {\n`
      + 'var module = { exports: {} }; var exports = module.exports;',
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})
