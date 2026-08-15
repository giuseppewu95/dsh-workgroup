/**
 * Browser-trust fence for the plugin's `/workgroup` HTTP API, mirroring the
 * harness's `/api` fence (`@deepseek-ai/dsh-client-connection`'s
 * `isTrustedApiRequest`). The harness does not export its fence, so this
 * plugin keeps a self-contained copy of the same rule: Host must be loopback,
 * a cross-site `sec-fetch-site` is refused, and an attached Origin must equal
 * the Host authority. This is a confused-deputy defense, not authentication;
 * the webserver bind policy still owns reachability.
 *
 * @module dsh-workgroup/src/trust
 */
import type { IncomingHttpHeaders } from 'node:http';
/** Whether one request may reach the workgroup API. */
export declare function isTrustedWorkgroupRequest(headers: IncomingHttpHeaders): boolean;
