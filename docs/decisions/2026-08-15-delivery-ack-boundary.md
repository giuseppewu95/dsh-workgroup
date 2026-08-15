# Decision: message delivery-acknowledgement capability boundary

Date: 2026-08-15 · Status: accepted · Scope: Goal 3 of the v0.1.x baseline

## Question

After `workgroup_send` delivers a message, is there a reliable, observable
target turn-lifecycle signal? Can we distinguish queued / started / completed /
failed, and can one stable message id be traced from send to target processing?

## Evidence (source chains and a real-instance experiment)

| Claim | Status | Evidence |
|---|---|---|
| `Agent.followup(msg)` appends a durable `agent/inbox/spliced` session event with the full message object | confirmed | `@deepseek-ai/dsh-agent` lib/index.js: `send()` → `this.inbox.splice("next-turn", Infinity, 0, [message])` → `this.session.append("agent/inbox/spliced", splice)` |
| `createUserMessage` mints `id: MessageId(crypto.randomUUID())` and that id survives into the inbox splice | confirmed | `@deepseek-ai/dsh-llm` lib/index.js line 168; splice `inserted` carries the message object verbatim |
| The agent loop consumes the inbox and appends `user/message` with the SAME id | confirmed | `@deepseek-ai/dsh-agent-loop`: `send()`; turn loop `session.append("user/message", message)`; real run: inbox `insertedIds=["73e39324…"]` then `user/message id=73e39324…` |
| `turn/start` / `turn/end{reason}` delimit one turn | confirmed | `@deepseek-ai/dsh-agent-loop` lib/index.js lines 523/592; real run: `seq 4 turn/start … seq 1014 turn/end reason="completed"` |
| `turn/end` reasons enumerate completion vs failure | confirmed | `TurnEndReasonMap` in `@deepseek-ai/dsh-session` types: `completed | aborted | blocked | error | max-tokens | interrupted` |
| A turn proves the workgroup message was *processed* | **partial** | The message is appended to the session (processing started) with its own id; the following `turn/end` closes the turn that CONTAINS it. A turn may fold several messages, so `turn_completed` is turn-scoped, not a per-message consumption proof |

## Real-run event sequence (executor session, e2e baseline)

```
seq 3    agent/inbox/spliced  inserted=[{id 73e39324…}]   ← queued (durable)
seq 4    turn/start
seq 5    agent/inbox/spliced  inserted=[]                   ← inbox drained
seq 7    user/message         id=73e39324… source=workgroup ← started
seq 1014 turn/end             reason=completed              ← turn completed
```

## Decision: A — message-level id + turn-scoped completion

Adopt for Goal 5, with exact names that do not overclaim:

- `accepted` — `send` validated and the delivery call succeeded (host-side fact).
- `queued` — the target session log contains `agent/inbox/spliced` with this message id (durable; survives process exit and resume).
- `started` — the target session log contains `user/message` with this id (the target's model will see it).
- `turn_completed` — a `turn/end` with reason `completed` (or `max-tokens`) appears after that `user/message`; **turn-scoped, not a per-message consumption proof** (a turn may contain several messages).
- `failed` — a `turn/end` with reason `error`/`aborted` appears after that `user/message`, or delivery itself rejected.

## Reliability boundaries

- Signals are read from the **target session's durable log**, so a status
  survives the sending process exiting; a cold-resumed target in another
  process is observable the same way.
- What is NOT provable: which exact message a `turn_completed` turn processed
  when several messages shared the turn; whether the target's model actually
  *understood* the message (only that it reached the model context).
- `queued` with no later `user/message` stays `queued` (a pending inbox), it is
  NOT failed — an honest "not yet started".

## Not implemented now

- No generic cross-session log reading (the plugin never reads a member's full
  session log — only the events of its own delivered message ids).
- No `workgroup_status` query tool unless Goal 5 proves no query entry exists.

See also: `decision-2026-08-15-panel-write-boundary.md`.
