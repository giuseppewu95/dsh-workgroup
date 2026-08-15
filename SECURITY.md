# Security

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report privately to the repository owner (see `package.json` `author` / `repository` for contact) with:

- the affected version(s),
- a minimal reproduction,
- the impact as you understand it.

You will receive an acknowledgement, and a fix will be coordinated before public disclosure.

## Threat model

`dsh-workgroup` runs inside the DeepSeek Harness host process and trusts it:

- The registry and delivery code run with the host's full authority; a compromised plugin is equivalent to a compromised host.
- Membership is the authorization credential for delivery — anyone who can invoke the model tools of a member session can send to the group. There is no per-member capability separation.
- The `/workgroup` HTTP API is protected by a loopback/same-origin trust fence (see `docs/ARCHITECTURE.md` §6), which defends against DNS-rebinding and cross-site reads. It is **not** authentication: with `--host 0.0.0.0`, any client that can reach the port and passes the fence (e.g. another process on the same machine) can read group membership. Keep the server on loopback, or accept that exposure.

## Data notes

- Workgroup records are stored in the harness profile's storage (`workgroup` domain unit); they are local to the machine and not encrypted beyond the profile's own protection.
- Delivered messages become part of the target session's durable log and are visible to that session's model and transcript.
- Destroying a group removes only the group record; delivered messages remain in member session logs.
