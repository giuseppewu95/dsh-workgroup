/**
 * Loader-composition test: mount the real plugin pieces (registry service,
 * tools, web API) the way the Loader mounts an entry at root, with the real
 * storage-domain composition and scripted peers, then drive the full send
 * path end to end.
 *
 * @module dsh-workgroup/tests/composition
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkgroupRegistry } from '../src/registry.ts'
import { applyTools } from '../src/tools.ts'
import { MemoryStorageBackend } from './memory-backend.ts'

/** Fake agent whose followup records delivered messages. */
function fakeAgent(id: string, delivered: unknown[]): Agent {
  return {
    id: SessionId(id),
    options: {},
    status: 'idle',
    session: {
      id: SessionId(id),
      header: { version: 0, id: SessionId(id), createdAt: 0 },
    },
    followup: (message: { source: unknown }) => { delivered.push({ id, source: message.source }) },
  } as unknown as Agent
}

describe('dsh-workgroup composition', () => {
  it('mounts the service and tools, then delivers a message end to end', async () => {
    const ctx = new Context()
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend())
    const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)

    // Scripted peers: two live top-level sessions and the tool registry.
    const delivered: unknown[] = []
    const sender = fakeAgent('s1', delivered)
    const receiver = fakeAgent('s2', delivered)
    ctx.provide('agents', { get: (id: SessionId) => id === SessionId('s2') ? receiver : sender } as never)

    const registered: Array<{ name: string }> = []
    ctx.provide('tools', {
      register: (definition: { name: string }) => {
        registered.push(definition)
        return () => {}
      },
    } as never)
    ctx.provide('systemPrompt', { section: () => {} } as never)

    // Mount at root exactly as the Loader mounts the entry.
    await ctx.plugin(WorkgroupRegistry)
    const toolsFiber = ctx.inject(['tools', 'systemPrompt', 'workgroups'], (toolsCtx) => {
      applyTools(toolsCtx)
    })
    await toolsFiber

    const workgroups = ctx.get('workgroups')
    expect(workgroups).toBeDefined()
    expect(registered.map(tool => tool.name).sort()).toEqual([
      'workgroup_create', 'workgroup_destroy', 'workgroup_list', 'workgroup_members',
      'workgroup_send', 'workgroup_status',
    ])

    // Drive the full flow through the service.
    const group = await workgroups!.create({ title: '开发组', owner: SessionId('s1') })
    await workgroups!.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    await workgroups!.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: '去执行' }],
      signal: new AbortController().signal,
    })

    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({
      id: 's2',
      source: { kind: 'workgroup', senderSessionId: SessionId('s1'), groupId: group.id },
    })
    // Durability: a second registry read sees the group.
    expect(workgroups!.listForSession(SessionId('s1'))).toHaveLength(1)
  })
})
