/**
 * Browser data channel: a small JSON API served under `/workgroup` by the
 * host half, read by the browser half via same-origin fetch. The API is
 * read-only (list the current session's groups and members); mutations stay
 * with the model tools, exactly like the rest of the GUI surface.
 *
 * @module dsh-workgroup/src/web-api
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { WorkgroupRegistry } from './registry.ts'
import { isTrustedWorkgroupRequest } from './trust.ts'

/** Wire view of one member (plain JSON, no branded types). */
export interface WorkgroupMemberWire {
  readonly sessionId: string
  readonly role: string
}

/** Wire view of one group. */
export interface WorkgroupGroupWire {
  readonly id: string
  readonly title: string
  readonly ownerSessionId: string
  readonly members: readonly WorkgroupMemberWire[]
}

/** Wire response of the list endpoint. */
export interface WorkgroupListResponse {
  readonly groups: readonly WorkgroupGroupWire[]
}

/** Register the `/workgroup` prefix route when a web server is present. */
export function registerWorkgroupApi(
  ctx: Context,
  registry: WorkgroupRegistry,
): (() => void) | undefined {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return undefined
  // The same trusted authorities the harness /api fence accepts: the
  // connection service's trustedHosts (deployment config, e.g. a Tailscale or
  // LAN hostname). Without this, the panel's fetch 403s whenever the GUI is
  // reached through a non-loopback hostname.
  const connection = ctx.get('connection') as { trustedHosts?: readonly string[] } | undefined
  const trustedHosts = connection?.trustedHosts ?? []
  return webServer.register({
    kind: 'prefix',
    path: '/workgroup',
    handler: (req, res) => handleWorkgroupRequest(ctx, registry, trustedHosts, req, res),
  })
}

/** Dispatch one request by pathname and method. */
function handleWorkgroupRequest(
  ctx: Context,
  registry: WorkgroupRegistry,
  trustedHosts: readonly string[],
  req: IncomingMessage,
  res: ServerResponse,
): void {
  try {
    // Same confused-deputy fence the harness applies to /api: loopback Host
    // (or a declared trusted authority) plus same-origin browser markers.
    // Anything else gets 403 before any membership data is read.
    if (!isTrustedWorkgroupRequest(req.headers, trustedHosts)) {
      sendJson(res, 403, { error: 'untrusted request' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/workgroup/list' && (req.method === 'GET' || req.method === 'HEAD')) {
      const sessionId = url.searchParams.get('sessionId')
      if (sessionId === null || sessionId === '') {
        sendJson(res, 400, { error: 'missing sessionId' })
        return
      }
      const groups = registry.listForSession(sessionId as SessionId)
      const payload: WorkgroupListResponse = {
        groups: groups.map(group => ({
          id: group.id,
          title: group.title,
          ownerSessionId: group.ownerSessionId,
          members: group.members.map(member => ({
            sessionId: member.sessionId,
            role: member.role,
          })),
        })),
      }
      sendJson(res, 200, payload, req.method === 'HEAD')
      return
    }
    sendJson(res, 404, { error: `unknown workgroup route ${url.pathname}` })
  } catch (error) {
    ctx.logger.warn(`workgroup api error: ${String(error)}`)
    sendJson(res, 500, { error: 'internal' })
  }
}

/** Write one JSON response; HEAD sends headers only. */
function sendJson(res: ServerResponse, status: number, payload: unknown, headOnly = false): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(headOnly ? undefined : body)
}
