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

import type { IncomingHttpHeaders } from 'node:http'

/** Whether one request may reach the workgroup API. */
export function isTrustedWorkgroupRequest(headers: IncomingHttpHeaders): boolean {
  const host = header(headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname)) return false
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
