# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `AGENTS.md` — fresh-session onboarding (layout, commands, design facts, troubleshooting).
- `docs/ARCHITECTURE.md` — design rationale: layering, delivery semantics, concurrency, trust model, decision record.
- `CONTRIBUTING.md`, `SECURITY.md`.
- Full package metadata (`keywords`, `repository`, `homepage`, `bugs`, `author`, `engines`, `prepublishOnly`, `sideEffects`).

## [0.1.0] - 2026-08-15

### Added

- Durable workgroup registry (`ctx.workgroups`): named groups, member roles, member management, destroy — over a `storage-domain` unit (`workgroup` domain, version 1).
- Cross-session message delivery (`workgroup` message source, `relay` form): live top-level followup, deduplicated cold resume, continuable-child routing via `ctx.subagents.followup`; typed `WORKGROUP_*` errors, no delivery on failure.
- Model tools: `workgroup_create`, `workgroup_list`, `workgroup_send`, `workgroup_members`, plus a `tool:workgroup` system-prompt section.
- Browser panel: session-header action listing the current session's groups and members with roles and status, click to open a member session; zh/en locales.
- Read-only `/workgroup/list` JSON API with a loopback/same-origin trust fence mirroring the harness `/api` surface.
- Distributable as a profile plugin bundle: `dsh plugin --profile web add dsh-workgroup` (npm) or a git URL; committed `lib/` for build-free git installs.
- Test suite: 58 tests (domain spec, registry + authorization matrix, tools, web API, trust fence, jsdom panel, loader composition).

### Fixed (review pass, commit `50abfcd`)

- Build now emits TypeScript declarations (`lib/types`) so the package `types` field resolves.
- Built artifacts committed to the repository for git-based installs.
- Registry mutations serialized on one operation chain (no lost updates); title/role bounds validated at the service layer.
- `workgroup/member-removed` carries the removed member's real role; owner dedup on create.
- Cold-resume and subagent-followup failures map to typed `WorkgroupError`.
- Trust fence applied to `/workgroup` (403 for untrusted hosts); HEAD responses carry no body.
- Tools register through an inject face that waits for `workgroups` (row-level inject would deadlock).
