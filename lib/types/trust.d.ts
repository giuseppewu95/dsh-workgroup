/**
 * Browser-trust fence for the plugin's `/workgroup` HTTP API, mirroring the
 * harness's `/api` fence (`@deepseek-ai/dsh-client-connection`'s
 * `isTrustedApiRequest`). The harness does not export its fence, so this
 * plugin keeps a self-contained copy of the same rule: Host must be loopback
 * or a declared trusted authority, a cross-site `sec-fetch-site` is refused,
 * and an attached Origin must equal the Host authority. This is a
 * confused-deputy defense, not authentication; the webserver bind policy still
 * owns reachability.
 *
 * Trusted authorities come from the same source the harness uses for `/api`
 * (`ctx.webRuntime.trustedHosts`), so a deployment reachable through a
 * Tailscale/LAN hostname trusts the same names for both surfaces.
 *
 * @module dsh-workgroup/src/trust
 */
import type { IncomingHttpHeaders } from 'node:http';
/**
 * Whether one request may reach the workgroup API.
 * @param headers - the incoming request headers.
 * @param trustedHosts - deployment authorities (bare `host` or `host:port`,
 *   lowercase) accepted in addition to loopback, mirroring the harness `/api`
 *   configuration.
 */
export declare function isTrustedWorkgroupRequest(headers: IncomingHttpHeaders, trustedHosts?: readonly string[]): boolean;
