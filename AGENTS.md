# AGENTS.md

Agent instructions for working in this repository. Read this first; it exists so a fresh agent session can pick up the project quickly without re-deriving its shape.

## What this is

`dsh-workgroup` is a distributable plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It adds a durable "workgroup" capability: named groups of sessions with roles (规划/执行/测试…), authorized cross-session message delivery, and a browser panel that lists a session's groups and members.

It is **not** part of the harness monorepo. It is a standalone npm package whose manifest declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, making it installable as a profile plugin layer. It depends on the published `@deepseek-ai/dsh-*` packages as peers.

## Repository layout

```
cordis.patch.yml       # bundle patch: one row mounts both halves (host + dsh.client)
src/
  index.ts             # host entry: mounts registry, registers tools, web API
  registry.ts          # ctx.workgroups service: durable registry + delivery (the core)
  spec.ts              # storage-domain domain spec (zod schemas)
  delivery.ts          # identity-based target resolution + message delivery
  tools.ts             # workgroup_* model tools + system-prompt section
  web-api.ts           # read-only /workgroup JSON API for the browser half
  trust.ts             # loopback/same-origin fence for /workgroup (mirrors harness /api)
  error.ts             # WorkgroupError + stable codes
  message-source.ts    # 'workgroup' MessageSourceMap merge
  types.ts             # WorkgroupId brand + WorkgroupView
  client/              # browser half: WorkgroupPanel.tsx, locales.ts, styles.ts, index.ts
tests/                 # vitest suites, one per module + composition + jsdom panel
scripts/build.mjs      # esbuild (host ESM + browser bundle) + tsc declarations
docs/ARCHITECTURE.md   # design rationale (read before changing behavior)
```

## Commands

```sh
npm install          # install dev deps (peer deps resolve from a dsh profile at runtime)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (unit + component + composition)
npm run build        # esbuild lib/index.js (host) + lib/client.js (browser) + tsc lib/types
npm publish          # after build; files whitelist covers lib/ + cordis.patch.yml
```

## Key design facts (the ones that matter when editing)

1. **One row mounts both halves.** `cordis.patch.yml` inserts a single `workgroup` row. The Loader runs the host half; `client-modules` scans Loader entries for a `dsh.client` manifest and serves `lib/client.js`. Never add a second row for the same package — it would re-run the host apply and double-register the `workgroups` service.

2. **`workgroups` must never be a row-level inject.** The registry is mounted by the plugin's own `apply` (`ctx.plugin(WorkgroupRegistry)`). Putting `workgroups` in the entry `inject` array would deadlock: the plugin waits for a service its own apply provides. Tools get it through a nested `ctx.inject(['tools', 'systemPrompt', 'workgroups'], …)` face in `src/index.ts`.

3. **Authorization is durable membership, never lineage.** `send()` checks both sender and target are members of the same group and rejects self-send, before any delivery. Target resolution: live top-level → `agent.followup`; cold top-level → deduplicated `ctx.agents.resume`; continuable child of sender → `ctx.subagents.followup`; everything else → typed error, no delivery.

4. **Registry writes are serialized and validated.** All read-modify-write operations run on one `operationTail` chain (concurrent mutations cannot lose updates). Title/role bounds are validated at the service layer because `storage-domain` validates **only on load** — an oversized value would poison the whole domain at boot.

5. **The `/workgroup` API is a confused-deputy surface.** It mirrors the harness `/api` fence locally (`src/trust.ts`): loopback Host plus same-origin browser markers; untrusted requests get 403 before any membership data is read. This is a defense, not authentication.

6. **`lib/` is committed.** Git-based installs (`dsh plugin add github:…`) must work without a build step. Rebuild before publishing: `npm run build`.

7. **Messages are model-visible ⟺ logged.** Delivery appends `user/message` with `source.kind: 'workgroup'` (via `MessageSourceMap` merge) so the target session's log reconstructs the message.

## Conventions

- Plain TypeScript, ESM (`"type": "module"`), strict mode. No `import` of runtime values across `@deepseek-ai` packages in the browser half (platform modules stay external in the bundle).
- Local relative imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`).
- Chinese product copy in `locales.ts` (`zh` is the key source of truth, `en` mirrors it); English code comments.
- Typed errors only: `WorkgroupError` with a stable `WORKGROUP_*` code; never let raw infrastructure errors escape `send()`.
- A change to behavior updates `docs/ARCHITECTURE.md` (design rationale) and the READMEs in the same commit.
- Tests live in `tests/` mirroring each module (`registry.spec.ts`, `tools.spec.ts`, …); jsdom tests carry a `// @vitest-environment jsdom` pragma.

## Troubleshooting

- **Test failure about `.css` imports** (katex): the `css-stub` plugin in `vitest.config.ts` handles it; if a new dep imports CSS, ensure it's inlined (`server.deps.inline`) or the stub catches it.
- **"service workgroups has been registered"** at boot: a second row/plugin mounts the registry twice. Check `cordis.patch.yml` and that no other plugin provides `workgroups`.
- **Domain won't open at boot**: a stored record violates the zod schema (e.g. an oversized role written before validation existed). Remove the offending `workgroup.json` unit or fix the record.
- **Panel shows no groups**: the browser half fetches `/workgroup/list`; check the trust fence (Host header must be loopback) and that `storage-domain` is mounted.
