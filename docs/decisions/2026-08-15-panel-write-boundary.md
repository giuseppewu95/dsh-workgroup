# Decision: panel → host write boundary (no trusted identity channel)

Date: 2026-08-15 · Status: accepted (B: no trusted channel — panel write is cut) · Scope: Goal 4 of the v0.1.x baseline

## Question

Does a static dsh client bundle have an official client → host RPC/Remote
channel whose requests are bound to the calling session/user, so the host can
authorize panel-driven mutations without trusting a browser-supplied sessionId?

## Evidence

| Claim | Status | Evidence |
|---|---|---|
| A generic Connection RPC channel exists for static plugins | confirmed | `@deepseek-ai/dsh-client-connection` types: host `ctx.connection.rpc.handle(channel, handler, {authority})` / `.intercept('/api', matcher, handler, {authority})`; client `ClientConnectionRpc.call(channel, endpoint, payload, signal)` |
| The host handler receives caller identity | **false** | `ConnectionRpcHandler = (endpoint, payload, signal) => RpcResult` — no session/user context. The `/api` gateway (`dsh-host-apiproxy`) validates only content-type, the JSON envelope, and the trust fence (loopback / trusted-host / same-origin markers); nothing binds a call to a session |
| The host can verify the caller instead of trusting a browser-supplied sessionId | false | Any client that passes the fence (any same-machine page/process) may send arbitrary payloads, including arbitrary sessionIds; fence is a confused-deputy defense, not authentication (matches `SECURITY.md`) |
| The dynamic-plugin Package-private JSON method (`harness.handle`) applies to this static bundle shape | not applicable | That mechanism belongs to dynamic Cordis plugins; no equivalent identity-carrying channel was found for static bundles |
| An equivalent secure mechanism exists | false | No other client → host surface with verified identity was found |

## Decision: B — cut panel write

Panel-triggered mutations (create group, add member, destroy) are **not**
implemented. The read-only `/workgroup/list` surface stays. Mutations continue
to go through the model tools, where the calling agent's identity is real
(`exec.agent`).

Rejected designs (per the security red lines):

- browser submitting an arbitrary sessionId over HTTP — rejected (no identity);
- treating the loopback/origin fence as authentication — rejected;
- a bare HTTP mutation endpoint acting for arbitrary sessions — rejected;
- weakening tool permission boundaries for panel convenience — rejected.

Revisit only when dsh ships a channel whose host handlers receive a verified
session identity (e.g. a future typed Remote with an authenticated caller).

See also: `decision-2026-08-15-delivery-ack-boundary.md`.
