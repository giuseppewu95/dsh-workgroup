# Contributing

Thanks for considering a contribution to `dsh-workgroup`.

## Ground rules

- **Behavior changes update the docs in the same commit**: `docs/ARCHITECTURE.md` (design rationale) when a design decision changes, and the READMEs (English + Chinese) when the user-facing contract changes.
- **Typed errors only**: new failure modes get a stable `WORKGROUP_*` code in `src/error.ts`; raw infrastructure errors never escape `send()`.
- **Model-visible text is contract**: tool descriptions and the system-prompt section are pinned; change them deliberately and update the tests that assert them.
- **No second mount**: the registry must stay mounted exactly once per process. A new plugin row that also provides `workgroups` breaks the boot (see AGENTS.md).
- **Chinese product copy, English comments**: UI copy lives in `src/client/locales.ts` with `zh` as the key source of truth.

## Development loop

```sh
npm install
npm run typecheck    # must pass before tests
npm test             # vitest; keep the suite green
npm run build        # regenerate lib/ before committing distribution artifacts
```

## Testing

- Unit tests live in `tests/` mirroring each module: `registry.spec.ts`, `tools.spec.ts`, `web-api.spec.ts`, `trust.spec.ts`, `spec.spec.ts`.
- Browser-half tests are jsdom (`// @vitest-environment jsdom` pragma) and assert user-visible behavior.
- `composition.spec.ts` mounts the real pieces at root (storage + registry + tools) and drives an end-to-end delivery.
- When you add a failure mode, add the rejection case to the authorization matrix in `registry.spec.ts`.

## Committing

- `lib/` is committed on purpose (build-free git installs). Always rebuild before committing a source change; a stale bundle is a bug.
- Write a descriptive commit message; reference the decision record when a design choice changes.

## Before opening a PR

1. `npm run typecheck && npm test && npm run build` all green.
2. READMEs and `CHANGELOG.md` updated (Unreleased section).
3. `docs/ARCHITECTURE.md` decision record extended when a new decision was made.
