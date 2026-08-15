# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Minimal message delivery loop: `send` returns a stable `message_id`; a
  forward-only, idempotent status machine (`accepted → queued → started →
  turn_completed | failed`) observes the target session's durable lifecycle
  (`agent/inbox/spliced`, `user/message` with the same id, `turn/end{reason}`)
  and emits `workgroup/message-status`; new `workgroup_status` tool queries the
  observed state (`unknown` when this process has no record). `turn_completed`
  is explicitly turn-scoped, not a per-message consumption proof. See
  `docs/decisions/2026-08-15-delivery-ack-boundary.md`.
- Real-model e2e baseline (`npm run test:e2e`): repeatable multi-session collaboration flow in a throwaway `DSH_HOME` (coordinator/executor/tester), asserting durable group records, `workgroup`-sourced messages in target session logs, the produced artifact, and at least one message reaching `turn_completed`. Skips (exit 0) without credentials; never part of `npm test`/CI.
- Resource limits as protocol constants (not config): 64 workgroups, 32 members per group (owner included), 256 KiB serialized bytes per message (UTF-8). Enforced at the service layer with a new `WORKGROUP_LIMIT_EXCEEDED` code; no partial writes on rejection.
- Panel: idle members show a relative last-active label derived from the session kit (`updatedAt`), no new API or authorization surface.

## [Unreleased]

### Added

- `workgroup_spawn` tool: guided creation of a new collaborator session with an optional model override and a role background (injected as a scoped `workgroup:role` system-prompt section), automatically added to the calling session's workgroup. Stays inside the model-tool identity model — no browser write surface.

### Fixed

- `/workgroup` trust fence now accepts the deployment's `trustedHosts` (read from the connection service — the exact same source the harness `/api` fence uses) in addition to loopback — the panel previously 403'd when the GUI was reached through a Tailscale/LAN hostname.
- Panel empty state now guides onboarding (how to create or join a workgroup).

## [0.1.0] - 2026-08-15

### Added

- Durable workgroup registry (`ctx.workgroups`): named groups, member roles, member management, destroy — over a `storage-domain` unit (`workgroup` domain, version 1).
- Cross-session message delivery (`workgroup` message source, `relay` form): live top-level followup, deduplicated cold resume, continuable-child routing via `ctx.subagents.followup`; typed `WORKGROUP_*` errors, no delivery on failure.
- Model tools: `workgroup_create`, `workgroup_list`, `workgroup_send`, `workgroup_members`, `workgroup_destroy` (owner-only dissolution, `WORKGROUP_NOT_OWNER`), plus a `tool:workgroup` system-prompt section.
- Browser panel: session-header action listing the current session's groups and members with roles and status, click to open a member session; zh/en locales.
- Read-only `/workgroup/list` JSON API with a loopback/same-origin trust fence mirroring the harness `/api` surface.
- Distributable as a profile plugin bundle: `dsh plugin --profile web add dsh-workgroup` (npm) or a git URL; committed `lib/` for build-free git installs.
- Test suite: 63 tests (domain spec, registry + authorization matrix, tools, web API, trust fence, jsdom panel, loader composition, real-model e2e).
- `AGENTS.md` — fresh-session onboarding (layout, commands, design facts, troubleshooting).
- `docs/ARCHITECTURE.md` — design rationale: layering, delivery semantics, concurrency, trust model, decision record (12 decisions).
- `CONTRIBUTING.md`, `SECURITY.md`, `.github/workflows/ci.yml`, `.env.example`.
- Full package metadata (`keywords`, `repository`, `homepage`, `bugs`, `author`, `engines`, `prepublishOnly`, `sideEffects`).

### Fixed

- Delivery reads the `agents` service through `ctx.get` instead of property access — the Loader mounts the plugin on an entry context whose inject list is only `['storageDomain']`, so `ctx.agents` threw "cannot get property without inject" and every cold-resume/live `workgroup_send` failed in a real profile (caught by real-model e2e; unit regression test added).
- Prompt guidance and docs no longer reference `session_trace` / `session_event_read` — dsh 0.1.0-rc.6 ships no such tools; the review loop closes through member reports back via `workgroup_send` or the GUI transcript.
- `create` deduplicates repeated non-owner member entries (only the owner was filtered before).
- `workgroup_members` reports `WORKGROUP_INVALID_INPUT` for a missing role and `WORKGROUP_NOT_FOUND` for an unknown group (was `WORKGROUP_UNKNOWN` / `WORKGROUP_NOT_MEMBER`).
- Browser half removes its injected stylesheet on plugin stop; unused locale keys dropped.
- `engines` floor now matches the harness runtime (`^22.19.0 || >=24.0.0`).
- Build now emits TypeScript declarations (`lib/types`) so the package `types` field resolves.
- Built artifacts committed to the repository for git-based installs.
- Registry mutations serialized on one operation chain (no lost updates); title/role bounds validated at the service layer.
- `workgroup/member-removed` carries the removed member's real role; owner dedup on create.
- Cold-resume and subagent-followup failures map to typed `WorkgroupError`.
- Trust fence applied to `/workgroup` (403 for untrusted hosts); HEAD responses carry no body.
- Tools register through an inject face that waits for `workgroups` (row-level inject would deadlock).
