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

import type { IncomingHttpHeaders } from 'node:http'

/**
 * Whether one request may reach the workgroup API.
 * @param headers - the incoming request headers.
 * @param trustedHosts - deployment authorities (bare `host` or `host:port`,
 *   lowercase) accepted in addition to loopback, mirroring the harness `/api`
 *   configuration.
 */
export function isTrustedWorkgroupRequest(
  headers: IncomingHttpHeaders,
  trustedHosts: readonly string[] = [],
): boolean {
  const host = header(headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (header(headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** Whether a normalized URL hostname names the local loopback authority. */
function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost') return true
  if (hostname === '[::1]' || hostname === '::1') return true
  return /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

/**
 * Whether one parsed Host authority is among the declared trusted authorities.
 * Entries are bare `host` or `host:port` in canonical lowercase form (the
 * harness validates them at load); the wire Host matches by its normalized
 * `host` value (`hostname` without an explicit port, `hostname:port` with one).
 */
function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.includes(hostUrl.host) || trustedHosts.includes(hostUrl.hostname)
}
