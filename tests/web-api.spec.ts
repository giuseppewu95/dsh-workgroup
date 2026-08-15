/**
 * Web API tests: the /workgroup/list JSON endpoint over a scripted registry.
 *
 * @module dsh-workgroup/tests/web-api
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkgroupId } from '../src/types.ts'
import { registerWorkgroupApi } from '../src/web-api.ts'
import type { WorkgroupRegistry } from '../src/registry.ts'

/** Minimal registry double exposing listForSession. */
function registryDouble(): Pick<WorkgroupRegistry, 'listForSession'> {
  return {
    listForSession: (sessionId: SessionId) => [
      {
        id: WorkgroupId('g1'),
        title: '开发组',
        ownerSessionId: SessionId('s1'),
        createdAt: 't',
        updatedAt: 't',
        members: [
          { sessionId: SessionId('s1'), role: 'owner', joinedAt: 't' },
          { sessionId: SessionId('s2'), role: '执行', joinedAt: 't' },
        ],
      },
    ].filter(group => group.members.some(member => member.sessionId === sessionId)),
  }
}

/** Capture one fake response. */
function fakeRes() {
  const state = { status: 0, body: '' }
  const res = {
    writeHead: (status: number, _headers: Record<string, string>) => { state.status = status },
    end: (body: string) => { state.body = body },
  } as unknown as ServerResponse
  return { res, state }
}

/** Build one fake request. */
function fakeReq(path: string): IncomingMessage {
  return { url: path, method: 'GET', headers: { host: '127.0.0.1:3080' } } as unknown as IncomingMessage
}

/** Boot a context with a scripted webServer capturing the registered handler. */
async function boot() {
  const ctx = new Context()
  const handlers: Array<(r: IncomingMessage, s: ServerResponse) => void> = []
  ctx.provide('webServer', {
    register: (route: { handler: (r: IncomingMessage, s: ServerResponse) => void }) => {
      handlers.push(route.handler)
      return () => {}
    },
  } as never)
  ctx.provide('workgroups', registryDouble() as never)
  const dispose = registerWorkgroupApi(ctx, registryDouble() as unknown as WorkgroupRegistry)
  return { ctx, handlers, dispose }
}

describe('/workgroup/list', () => {
  it('returns the caller groups as JSON', async () => {
    const { handlers } = await boot()
    expect(handlers).toHaveLength(1)
    const { res, state } = fakeRes()
    await handlers[0](fakeReq('/workgroup/list?sessionId=s1'), res)
    expect(state.status).toBe(200)
    const payload = JSON.parse(state.body) as { groups: Array<{ id: string; title: string; members: unknown[] }> }
    expect(payload.groups).toHaveLength(1)
    expect(payload.groups[0].title).toBe('开发组')
    expect(payload.groups[0].members).toHaveLength(2)
  })

  it('returns an empty list for a session with no groups', async () => {
    const { handlers } = await boot()
    const { res, state } = fakeRes()
    await handlers[0](fakeReq('/workgroup/list?sessionId=ghost'), res)
    expect(state.status).toBe(200)
    expect(JSON.parse(state.body)).toEqual({ groups: [] })
  })

  it('rejects a missing sessionId', async () => {
    const { handlers } = await boot()
    const { res, state } = fakeRes()
    await handlers[0](fakeReq('/workgroup/list'), res)
    expect(state.status).toBe(400)
  })

  it('404s unknown routes', async () => {
    const { handlers } = await boot()
    const { res, state } = fakeRes()
    await handlers[0](fakeReq('/workgroup/other'), res)
    expect(state.status).toBe(404)
  })

  it('403s an untrusted host before reading any data', async () => {
    const { handlers } = await boot()
    const { res, state } = fakeRes()
    const req = { url: '/workgroup/list?sessionId=s1', method: 'GET', headers: { host: 'evil.example' } }
    await handlers[0](req as never, res)
    expect(state.status).toBe(403)
  })

  it('403s a cross-site browser marker', async () => {
    const { handlers } = await boot()
    const { res, state } = fakeRes()
    const req = {
      url: '/workgroup/list?sessionId=s1',
      method: 'GET',
      headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' },
    }
    await handlers[0](req as never, res)
    expect(state.status).toBe(403)
  })

  it('does not register when no web server is mounted', () => {
    const ctx = new Context()
    ctx.provide('workgroups', registryDouble() as never)
    const dispose = registerWorkgroupApi(ctx, registryDouble() as unknown as WorkgroupRegistry)
    expect(dispose).toBeUndefined()
  })
})
