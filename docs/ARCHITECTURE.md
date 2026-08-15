# Architecture

Design rationale for `dsh-workgroup`. Read this before changing behavior; it records the decisions a fresh reader cannot infer from code alone. The README is the user-facing contract; this document is the design record.

## 1. Problem and goal

DeepSeek Harness already gives a coordinator session everything it needs to delegate: continuable subagents (`subagent`, `send_message`, `list_agents`, `report`), a GUI catalog of sub-sessions, and a GUI that can open any session to read its transcript. What it does **not** provide is a durable, first-class grouping of *sessions* with roles, and point-to-point messaging between *arbitrary* group members.

`dsh-workgroup` adds exactly that: a durable workgroup entity (named group + members + roles), a delivery path for member-to-member messages, and a browser panel that makes membership visible and navigable. The main session acts as the coordinator (plan → delegate → review → feedback).

## 2. Layering

```
browser half (src/client)          host half (src)
  WorkgroupPanel.tsx                 index.ts      ← Loader entry, both halves
  locales.ts / styles.ts               │
        │ fetch /workgroup/*           ├─ registry.ts   ctx.workgroups service
        │                              ├─ delivery.ts   target resolution + send
        ▼                              ├─ tools.ts      workgroup_* model tools
  webServer route ──── trust.ts ────►  ├─ web-api.ts    read-only JSON API
                                       ├─ spec.ts       storage-domain domain
                                       ├─ error.ts      typed errors
                                       ├─ message-source.ts  MessageSourceMap merge
                                       └─ types.ts      WorkgroupId brand + views
```

Rules:

- **The registry is the only owner of durable state.** It wraps the `workgroup` storage-domain unit; every mutation goes through the domain write chain (durability first, then memory, then events). Tools and the web API are thin adapters over it.
- **The browser half is pure presentation.** It reads via the host JSON API and the framework session kit; it never touches the registry directly. Data crossing the boundary is plain JSON (wire types in `WorkgroupGroupWire`).
- **Dependencies flow one way** (see the arrow diagram): entry → services → primitives. No cycles; `tools.ts` imports `registry.ts` for types only.

## 3. The durable model

Defined in `src/spec.ts` as a `storage-domain` spec (`defineDomain`):

```
domain 'workgroup' (version 1)
  global: { initialized, workgroupIds[] }        ← authoritative display order
  table 'groups': WorkgroupId → WorkgroupRecord
    { id, title, ownerSessionId, createdAt, updatedAt,
      members: [{ sessionId, role, joinedAt }] }
```

Design decisions:

- **Roles are free-text labels** (1..64 chars), not an enum. The vocabulary (规划/执行/测试) is a convention the model and the user agree on, not a fixed set — a plugin must not presume a closed role taxonomy.
- **The owner is a member with role `owner`** and cannot be removed. Members are otherwise equal; the only owner authority is dissolving the group (`workgroup_destroy`).
- **`workgroupIds` order is the display order**, mirroring the workspace domain pattern. Reads are synchronous from an in-memory cache; the cache is authoritative in-process and rebuilt from the domain at boot.
- **Bounds are validated at the service layer, not only in the zod schema.** `storage-domain` validates stored records only when the unit loads; a malformed value written today would refuse to load tomorrow, poisoning the whole domain. `validateRole`/`validateTitle` run before any write.
- **Resource bounds are protocol constants, not configuration.** 64 workgroups, 32 members per group, 256 KiB serialized bytes per message — generous ceilings that keep a misbehaving or malicious caller from growing the registry or payloads without bound. They are abuse guards, not quotas; configurable limits can wait for a real user hitting one.

## 4. Delivery semantics

The heart of the capability. `send(sender, groupId, targetSessionId, content)`:

1. **Authorize**: sender and target must both be members of the same group; self-send is rejected. Membership is the credential — not lineage, not `cwd`.
2. **Resolve the target by identity** (`src/delivery.ts`):
   - live top-level session → `agent.followup(message)` (waking; the message becomes the target's next turn);
   - cold top-level session → `ctx.agents.resume` once per identity (deduplicated via an in-flight map, mirroring `@deepseek-ai/dsh-api-remotes`'s resolver), then followup;
   - continuable child of the sender → `ctx.subagents.followup` (the continuation manager owns the child's inbox and cold resume);
   - one-shot children, children of another parent, unknown or deleted sessions → typed `WorkgroupError`, **no delivery**.
3. **Attribution**: the message is a `user/message` event with `source.kind: 'workgroup'` (merged into `MessageSourceMap`). Model-visible ⟺ logged: the target's transcript reconstructs the message and its sender.

Failure mapping is strict: every infrastructure failure (persistence unavailable, resume rejection, followup rejection) becomes a typed `WORKGROUP_*` error; raw errors never escape `send()`. Cancellation (`signal`) is honored and an aborted send never delivers.

## 5. Concurrency

All registry mutations (`create`, `addMember`, `removeMember`, `setRole`, `destroy`) serialize on one `operationTail` promise chain. Reads are lock-free from the in-memory cache. Rationale: the storage-domain `put` is atomic per call, but "read record → compute next → put" is not; concurrent member additions must not lose updates. The chain is per-registry (one host instance), which is the only valid scope for a process-singleton registry.

## 6. The browser channel and trust

The GUI half reads `/workgroup/list` over same-origin fetch. The harness's `/api` surface carries a confused-deputy fence (loopback Host + same-origin browser markers) in `@deepseek-ai/dsh-client-connection` — but that fence is not exported. `src/trust.ts` mirrors the same rule locally so the plugin's route is not a bypass:

- Host header must be a loopback authority;
- `sec-fetch-site: cross-site` is refused;
- an attached `Origin` must equal the Host authority.

This is a defense against DNS-rebinding and cross-site reads, **not** authentication; reachability still follows the webserver bind policy (documented in the README).

## 7. Model tools and prompt design

`workgroup_create`, `workgroup_list`, `workgroup_send`, `workgroup_members`, `workgroup_destroy`, `workgroup_status` are thin adapters over the registry, following the harness tool contract (`defineTool`). Tool descriptions are written from the model's perspective and pin the exact vocabulary the model sees; the system-prompt section (`tool:workgroup`) points at the collaboration loop — delegate to member sessions, have each member report its result back through `workgroup_send`, open any member session in the GUI to read its transcript, and dissolve the group with `workgroup_destroy` when the owner is done. dsh 0.1.0-rc.6 ships no model-facing log-read tool, so the loop closes through member reports rather than a read-back tool.

Delivery status (`workgroup_status`) is an in-process observation of the target session's durable lifecycle events (`agent/inbox/spliced`, `user/message` with the send-side message id, `turn/end{reason}`), folded by a forward-only idempotent state machine (`accepted → queued → started → turn_completed | failed`). `turn_completed` is turn-scoped by design: it proves the turn *containing* the message ended, not that the model consumed that exact message. A target processed in another process stays at the last in-process observation. See `docs/decisions/2026-08-15-delivery-ack-boundary.md`.

## 8. Distribution model

- One npm package, one `cordis.patch.yml` row. The host half mounts through the Loader; the browser half is discovered by `client-modules` via the `dsh.client` manifest.
- `lib/` is committed so git-based installs need no build step.
- Peer dependencies on `@deepseek-ai/dsh-*` ≥ 0.1.0-rc.6; the plugin resolves them from the profile install at runtime (host half keeps every package external in the bundle; the browser half externalizes platform modules).
- The package's `files` whitelist covers `cordis.patch.yml`, `lib/`, and declarations; `npm run build` must run before publish.

## 9. Known design limits (accepted)

- Point-to-point messaging only; no group multicast.
- The panel is read-only (list + navigate); mutations go through model tools.
- Groups may span workspaces; member transcripts are read by opening the session in the GUI or by asking the member to report back (no model-facing log-read tool in dsh 0.1.0-rc.6).
- Destroy removes only the group record; delivered messages remain in member logs (immutable).
- Cold-resumed agents stay live in the registry (no dispose), matching the host's own resolver semantics; this is deliberate — a follow-up message may target them again.

## Decision record

| # | Decision | Rationale |
|---|---|---|
| 1 | Membership (not lineage) authorizes delivery | Sibling/peer collaboration is the point; lineage would exclude top-level peers |
| 2 | Free-text roles, validated bounds | Closed enums would impose a taxonomy on users; bounds prevent domain poisoning |
| 3 | Service-layer validation on every write | storage-domain validates on load only; fail loud at the write |
| 4 | Operation chain serializes mutations | Prevents lost updates on concurrent member edits |
| 5 | Local trust-fence mirror | Harness fence is unexported; a plugin route must not bypass it |
| 6 | `lib/` committed | Git installs without build steps |
| 7 | One patch row for both halves | A second row double-registers the service (verified failure mode) |
| 8 | `workgroups` never row-injected | The registry is mounted by the same plugin's apply; row-level inject deadlocks |
| 9 | Cold-resumed agents not disposed | Matches host resolver semantics; supports follow-up delivery |
| 10 | `workgroup` message source with `relay` form | Model-visible ⟺ logged; consistent with `coordinator`/`subagent-report` sources |
| 11 | Owner-only destroy (`workgroup_destroy`) | Dissolving a shared coordination context is a lifecycle act; the flat model keeps membership egalitarian, not dissolution |
| 12 | No model-facing log-read tool in the loop guidance | dsh 0.1.0-rc.6 ships none; the loop closes through member reports back through the group |
