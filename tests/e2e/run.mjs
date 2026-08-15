#!/usr/bin/env node
/**
 * dsh-workgroup real-model e2e baseline (test asset, never shipped).
 *
 * Rebuilds the verified multi-session collaboration flow in a throwaway
 * DSH_HOME: three real agents (coordinator/executor/tester) collaborate
 * through the workgroup capability; the run is then asserted on with hard
 * evidence (storage records, zstd session logs, produced artifact).
 *
 * Usage:
 *   node tests/e2e/run.mjs            # full run against the real model
 *   node tests/e2e/run.mjs --keep     # keep the temp DSH_HOME on failure
 *
 * Environment:
 *   E2E_CREDENTIALS_SOURCE   dir to copy .credentials.yaml/.env/settings.yaml
 *                            from (default ~/.dsh) — the ONLY credential path;
 *                            when absent the run SKIPS (exit 0), never fails.
 *   E2E_NODE_MODULES_SOURCE  dir to link as the temp profile's node_modules
 *                            (default ~/.dsh/profiles/web/node_modules)
 *   E2E_HOME                 fixed temp home (default: fresh temp dir)
 *   E2E_TIMEOUT_MS           hard cap for the model run (default 30 min)
 *
 * Exit codes: 0 = pass or skip, 1 = assertion/run failure.
 */

import { spawnSync, spawn } from 'node:child_process'
import {
  existsSync, mkdirSync, copyFileSync, cpSync, rmSync, symlinkSync,
  readFileSync, writeFileSync, readdirSync,
} from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

const args = process.argv.slice(2)
const keep = args.includes('--keep')

function skip(reason) {
  console.log(`E2E_SKIP ${reason}`)
  process.exit(0)
}

function fail(message) {
  console.error(`E2E_FAIL ${message}`)
  process.exit(1)
}

function writeFile(path, content) {
  writeFileSync(path, content, 'utf8')
}

function writeJson(path, value) {
  writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

/** Decode the per-frame zstd session log and return parsed events. */
function readSessionLog(home, sessionId) {
  const sessionsRoot = join(home, 'sessions')
  if (!existsSync(sessionsRoot)) return []
  const dirs = readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(sessionsRoot, d.name))
  for (const dir of dirs) {
    const logPath = join(dir, sessionId, 'session.jsonl.zstd')
    if (!existsSync(logPath)) continue
    const buf = readFileSync(logPath)
    const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
    const starts = []
    for (let i = 0; i < buf.length - 3; i++) {
      if (buf[i] === magic[0] && buf[i + 1] === magic[1] && buf[i + 2] === magic[2] && buf[i + 3] === magic[3]) {
        starts.push(i)
      }
    }
    const events = []
    for (let i = 0; i < starts.length; i++) {
      const end = i + 1 < starts.length ? starts[i + 1] : buf.length
      try {
        const decoded = zstdDecompressSync(buf.subarray(starts[i], end)).toString()
        for (const lineText of decoded.split('\n')) {
          if (lineText.trim() === '') continue
          try { events.push(JSON.parse(lineText)) } catch { /* torn tail */ }
        }
      } catch { /* corrupt frame: skip */ }
    }
    return events
  }
  return []
}

function isWorkgroupMessage(event, senders) {
  return event.type === 'user/message'
    && event.data?.source?.kind === 'workgroup'
    && senders.includes(event.data.source.senderSessionId)
}

// ── 1. Prerequisites: credentials, node_modules source, dsh CLI ─────────────
const credSrc = process.env.E2E_CREDENTIALS_SOURCE || join(homedir(), '.dsh')
for (const file of ['.credentials.yaml', 'settings.yaml']) {
  if (!existsSync(join(credSrc, file))) skip(`credential source ${credSrc} lacks ${file}`)
}

const nmSrc = process.env.E2E_NODE_MODULES_SOURCE
  || join(homedir(), '.dsh', 'profiles', 'web', 'node_modules')
if (!existsSync(nmSrc)) skip(`node_modules source missing: ${nmSrc}`)

const dshCheck = spawnSync('dsh', ['--version'], {
  encoding: 'utf8',
  // npm global bins on Windows are .cmd/.ps1 shims; node needs the shell.
  shell: process.platform === 'win32',
})
if (dshCheck.status !== 0) skip('dsh CLI not on PATH')

// ── 2. Build the throwaway DSH_HOME ─────────────────────────────────────────
const home = process.env.E2E_HOME || join(tmpdir(), `dsh-wg-e2e-${process.pid}-${Date.now()}`)
const profile = join(home, 'profiles', 'headless')
const nmDir = join(profile, 'node_modules')
const localPkg = join(nmDir, '@local', 'e2e-collab')
const workspace = join(home, 'workspace')
// The bundle resolver walks require.resolve.paths: headless/node_modules
// (linked below) then profiles/node_modules. dsh-workgroup is copied as a
// REAL directory into profiles/node_modules — the web profile's node_modules
// holds it as a relative symlink that node cannot follow through the link
// (libuv resolves relative links against the surface path; verified).
const wgCopy = join(home, 'profiles', 'node_modules', 'dsh-workgroup')
for (const dir of [profile, join(wgCopy, 'lib'), workspace]) {
  mkdirSync(dir, { recursive: true })
}

try {
  // Credentials: copied, never written into the repository.
  for (const file of ['.credentials.yaml', '.env', 'settings.yaml', '.anonymous-user-id']) {
    const src = join(credSrc, file)
    if (existsSync(src)) copyFileSync(src, join(home, file))
  }

  // node_modules: junction (Windows, no admin needed) / symlink (POSIX).
  try {
    symlinkSync(nmSrc, nmDir, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    throw new Error(`cannot link node_modules: ${error.message}`)
  }

  mkdirSync(join(localPkg, 'lib'), { recursive: true })

  // dsh-workgroup: real copy (package.json + patch + built lib) so the bundle
  // resolver and loader find it without any symlink traversal. Default source:
  // the fresh repo build; with E2E_WORKGROUP_TARBALL the npm tarball is
  // unpacked instead — a packaging smoke (publish gate).
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const tarball = process.env.E2E_WORKGROUP_TARBALL
  if (tarball !== undefined) {
    const unpack = join(home, 'unpack')
    mkdirSync(unpack, { recursive: true })
    const tar = spawnSync('tar', ['-xzf', tarball, '-C', unpack], { encoding: 'utf8' })
    if (tar.status !== 0) throw new Error(`cannot unpack tarball: ${tar.stderr}`)
    const pkgDir = join(unpack, 'package')
    copyFileSync(join(pkgDir, 'package.json'), join(wgCopy, 'package.json'))
    copyFileSync(join(pkgDir, 'cordis.patch.yml'), join(wgCopy, 'cordis.patch.yml'))
    cpSync(join(pkgDir, 'lib'), join(wgCopy, 'lib'), { recursive: true })
  } else {
    copyFileSync(join(repoRoot, 'package.json'), join(wgCopy, 'package.json'))
    copyFileSync(join(repoRoot, 'cordis.patch.yml'), join(wgCopy, 'cordis.patch.yml'))
    cpSync(join(repoRoot, 'lib'), join(wgCopy, 'lib'), { recursive: true })
  }

  // Test-only driver bundle.
  const driverSrc = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'e2e-collab')
  cpSync(driverSrc, localPkg, { recursive: true })

  // Profile composition: base + workgroup + driver; storage rows patched in
  // (the web-app layer normally inserts them; headless has no web layer).
  writeJson(join(profile, 'package.json'), {
    name: 'headless-e2e',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-workgroup', '@local/e2e-collab'] } },
  })
  writeFile(join(profile, 'cordis.yml'), '[]\n')
  writeFile(join(profile, 'cordis.patch.yml'), [
    '# Temporary e2e profile: base lacks the storage rows (the web-app layer',
    '# inserts them for the web profile), so mirror the web-app rows here.',
    '- insert:',
    "    - id: storage",
    "      name: '@deepseek-ai/dsh-storage'",
    '',
    "    - id: storage-json",
    "      name: '@deepseek-ai/dsh-storage-json'",
    '      config:',
    "        root: !!js dshHomePath('storages')",
    '',
    "    - id: storage-domain",
    "      name: '@deepseek-ai/dsh-storage-domain'",
    '      config:',
    '        backend: json',
    '',
  ].join('\n'))

  // ── 3. Run the real collaboration ─────────────────────────────────────────
  const timeoutMs = Number(process.env.E2E_TIMEOUT_MS || 30 * 60 * 1000)
  const dsh = spawn('dsh', ['--profile', 'headless'], {
    cwd: workspace,
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  let stdout = ''
  let stderr = ''
  dsh.stdout.on('data', (chunk) => { stdout += chunk })
  dsh.stderr.on('data', (chunk) => { stderr += chunk })
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { dsh.kill('SIGTERM'); resolve('timeout') }, timeoutMs)
    dsh.on('close', (exitCode) => { clearTimeout(timer); resolve(exitCode) })
    dsh.on('error', (error) => { clearTimeout(timer); resolve(`spawn-error: ${error.message}`) })
  })
  if (code === 'timeout') fail(`model run exceeded ${timeoutMs}ms`)
  if (code !== 0) {
    console.error(stderr.slice(-4000))
    fail(`dsh exited ${code}`)
  }

  // ── 4. Parse and assert on hard evidence ──────────────────────────────────
  const line = stdout.split('\n').find((l) => l.startsWith('E2E_COLLAB_RESULT '))
  if (line === undefined) fail('no E2E_COLLAB_RESULT line in output')
  const result = JSON.parse(line.slice('E2E_COLLAB_RESULT '.length))

  const failures = []
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(name)
  }

  check('run did not time out', result.timeout === false)
  check('coordinator final JSON present',
    typeof result.coord_final === 'string' && result.coord_final.includes('group_id'))

  const group = (result.groups ?? []).find((g) => g.title === 'e2e-collab')
  check('group e2e-collab created', group !== undefined)
  if (group !== undefined) {
    const roles = Object.fromEntries(group.members.map((m) => [m.sessionId, m.role]))
    check('three members', group.members.length === 3)
    check('owner is coordinator', roles[result.coord] === 'owner')
    check('executor role', roles[result.exec] === '执行')
    check('tester role', roles[result.test] === '测试')
  }

  // Cross-session messages must be durably logged with the workgroup source.
  const coordWorkgroup = readSessionLog(home, result.coord)
    .filter((e) => isWorkgroupMessage(e, [result.exec, result.test]))
  const execWorkgroup = readSessionLog(home, result.exec)
    .filter((e) => isWorkgroupMessage(e, [result.coord]))
  const testWorkgroup = readSessionLog(home, result.test)
    .filter((e) => isWorkgroupMessage(e, [result.coord]))
  check('coordinator received 2 workgroup replies', coordWorkgroup.length >= 2,
    `got ${coordWorkgroup.length}`)
  check('executor received the task', execWorkgroup.length >= 1,
    `got ${execWorkgroup.length}`)
  check('tester received the task', testWorkgroup.length >= 1,
    `got ${testWorkgroup.length}`)
  check('produced artifact fib.py', result.fib_exists === true)

  // Delivery-status state machine observed in the real run: at least one
  // message must reach turn_completed (a member processed it in-process).
  const statuses = result.message_statuses ?? []
  const finalStates = new Map()
  for (const entry of statuses) finalStates.set(entry.target, entry.status)
  const completedTargets = [...finalStates.values()].filter((s) => s === 'turn_completed').length
  check('ack: at least one message reached turn_completed', completedTargets >= 1,
    `states=${JSON.stringify(statuses.map((s) => `${s.target}:${s.status}`))}`)

  if (failures.length > 0) fail(`assertions failed: ${failures.join(', ')}`)
  console.log('E2E_PASS all assertions')
} finally {
  if (!keep) rmSync(home, { recursive: true, force: true })
  else console.log(`E2E_KEEP temp home retained: ${home}`)
}
