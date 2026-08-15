# dsh-workgroup

Durable workgroup capability for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): named groups of sessions with roles, cross-session messaging, and a browser panel to pick and open member sessions.

A workgroup lets you run a real collaboration loop across sessions — one session plans and reviews, one executes, one tests — with the main session as the coordinator:

```
主会话（统筹/规划/审查） ──工作群──▶ 执行会话
        │                            │
        └────────── 工作群 ──────────▶ 测试会话
```

## What you get

| Piece | Description |
|---|---|
| `ctx.workgroups` | Host service: durable registry (via `storage-domain`), member management, and authorized cross-session delivery |
| `workgroup_create` / `workgroup_list` / `workgroup_send` / `workgroup_members` | Model tools: form groups, assign roles (规划/执行/测试…), send messages to member sessions |
| Browser panel | A button in the session header listing the current session's groups and members with roles and status; click a member to open that session |
| `workgroup` message source | Messages delivered to a target session are logged as `user/message` with `source.kind: 'workgroup'` — model-visible, reconstructable from the log |

### How cross-session delivery works

Authorization is **durable membership**, not lineage: the sender's session and the target must be members of the same group, and self-send is rejected. The target is resolved by identity:

- a **live top-level session** receives the message as its next turn (`agent.followup`);
- a **cold top-level session** is resumed once per identity (deduplicated, like the built-in API resolver) and then receives it;
- a **continuable child of the sender** routes through `ctx.subagents.followup`, reusing the child's inbox and cold resume;
- anything else (one-shot children, children of another parent, unknown or deleted sessions) is rejected with a typed error and **no delivery happens**.

## Install

Prerequsites: dsh ≥ 0.1.0-rc.6, the `web` profile (or any profile with `storage-json` + `storage-domain` mounted).

```sh
# from npm (once published)
dsh plugin --profile web add dsh-workgroup

# or straight from this repository
dsh plugin --profile web add github:your-name/dsh-workgroup
```

Then restart `dsh --profile web`. The session header shows a "工作群" button once any workgroup exists.

> TUI/headless profiles work too: the model tools and the service are profile-agnostic; only the browser panel needs the web surface. Non-web profiles must mount `@deepseek-ai/dsh-storage-json` + `@deepseek-ai/dsh-storage-domain` (the web profile already does).

## Usage

1. **Plan** in the main session: delegate work to subagents (`subagent`), or open the sessions you want in the group.
2. **Form the group**: call `workgroup_create` with a title and optional members, or add sessions later with `workgroup_members add`.
3. **Assign roles**: `workgroup_members set_role` with labels like `规划`, `执行`, `测试`.
4. **Direct the work**: `workgroup_send` to a member session — the message becomes that session's next turn.
5. **Review**: read the member session's log with `session_trace` / `session_event_read` (workspace-authorized), then send findings back through the group.
6. **Watch live**: the browser panel lists member sessions with roles and running status; click a member to open it.

```text
You (planning session):
  workgroup_create(title: "发布流程", members: [{session_id: "<exec>", role: "执行"}, {session_id: "<test>", role: "测试"}])
  workgroup_send(group_id: "<g>", target_session_id: "<exec>", message: "按计划实现 X，完成后发报告")
  workgroup_send(group_id: "<g>", target_session_id: "<test>", message: "等实现完成后跑回归测试")

Execution session (receives each message as its next turn):
  ...works...
  report: "X 已完成，见 <path>"

You:
  session_trace(session_id: "<exec>")          # verify what actually landed
  workgroup_send(group_id: "<g>", target_session_id: "<test>", message: "可以开始回归")
```

## Development

```sh
npm install
npm run typecheck    # tsc --noEmit
npm test             # vitest: unit + component + composition
npm run build        # esbuild: lib/index.js (host ESM) + lib/client.js (browser)
```

The browser bundle is emitted in the harness's module-loader format (`window.__ModuleLoader__.load`), with platform modules left external; the host half keeps every package external and resolves them from the profile install at runtime.

### Package layout

```
cordis.patch.yml     # bundle patch: one row mounts both halves
src/index.ts         # host entry: registry service + tools + web API
src/registry.ts      # ctx.workgroups service (durable registry + delivery)
src/spec.ts          # storage-domain spec (zod schemas)
src/delivery.ts      # identity-based target resolution and delivery
src/tools.ts         # workgroup_* model tools + prompt section
src/web-api.ts       # read-only /workgroup JSON API for the browser half
src/client/          # browser half: header panel, locales, styles
tests/               # vitest suites (spec/registry/tools/web-api/panel/composition)
```

## Known Limitations and Deferred Work

- The browser panel is read-only (list + navigate); creating groups and adding members happens through the model tools.
- Workgroup messaging is point-to-point within a group; there is no multi-cast "group chat".
- Members are equal; `ownerSessionId` is descriptive only (the owner cannot be removed, but has no extra authority).
- Groups may span workspaces (messaging does not check `cwd`); reading a member's log is still governed by the workspace authorization of `session_trace` / `session_event_read`.
- Destroying a group removes only the group record; already-delivered messages stay in member session logs (they are immutable).
- The `/workgroup` HTTP API carries the same confused-deputy fence as the harness `/api` surface (loopback Host plus same-origin browser markers, mirrored locally because the harness does not export its fence). It is not an authentication layer; reachability still follows the webserver bind policy.
- Built artifacts (`lib/`) are committed to the repository so git-based installs work without a build step. Rebuild before publishing with `npm run build`.

## License

MIT
