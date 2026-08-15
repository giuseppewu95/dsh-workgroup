/**
 * Model tool tests: registration, schema enforcement, and execute behavior
 * against a scripted registry.
 *
 * @module dsh-workgroup/tests/tools
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkgroupId } from '../src/types.ts'
import { applyTools } from '../src/tools.ts'
import type { WorkgroupView } from '../src/types.ts'

/** Scripted tool registry collecting registered definitions. */
function toolHarness() {
  const ctx = new Context()
  const registered: Array<{ name: string; execute: (...args: unknown[]) => unknown; parameters: Record<string, unknown> }> = []
  const sections: string[] = []
  ctx.provide('tools', {
    register: (definition: { name: string; execute: (...args: unknown[]) => unknown; parameters: Record<string, unknown> }) => {
      registered.push(definition)
      return () => {}
    },
  } as never)
  ctx.provide('systemPrompt', {
    section: (entry: { name: string }) => { sections.push(entry.name) },
  } as never)
  applyTools(ctx as never)
  return { ctx, registered, sections }
}

/** Fake agent for exec.agent. */
function fakeAgent(id: string): Agent {
  return { id: SessionId(id) } as unknown as Agent
}

/** Registry double with recording send. */
function registryDouble(send = vi.fn(async () => ({ delivered: true, messageId: 'm1' }))) {
  const groups: WorkgroupView[] = []
  return {
    groups,
    create: vi.fn(async (opts: { title: string; owner: string }) => {
      const view: WorkgroupView = {
        id: WorkgroupId(`g${groups.length + 1}`),
        title: opts.title,
        ownerSessionId: SessionId(String(opts.owner)),
        createdAt: 't',
        updatedAt: 't',
        members: [{ sessionId: SessionId(String(opts.owner)), role: 'owner', joinedAt: 't' }],
      }
      groups.push(view)
      return view
    }),
    listForSession: vi.fn(() => groups),
    get: vi.fn((id: WorkgroupId) => groups.find(group => group.id === id)),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    setRole: vi.fn(),
    destroy: vi.fn(),
    statusOf: vi.fn(() => 'started'),
    send,
  }
}

describe('workgroup tools', () => {
  it('registers seven tools and one prompt section', () => {
    const { registered, sections } = toolHarness()
    expect(registered.map(tool => tool.name).sort()).toEqual([
      'workgroup_create', 'workgroup_destroy', 'workgroup_list', 'workgroup_members',
      'workgroup_send', 'workgroup_spawn', 'workgroup_status',
    ])
    expect(sections).toEqual(['tool:workgroup'])
  })

  it('workgroup_create creates and returns the group id', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_create')!
    const result = await tool.execute(
      { title: '开发组', members: [{ session_id: 's2', role: '执行' }] },
      { agent: fakeAgent('s1'), signal: new AbortController().signal },
    ) as { groupId: string; title: string }
    expect(result.title).toBe('开发组')
    expect(registry.create).toHaveBeenCalledWith({
      title: '开发组',
      owner: SessionId('s1'),
      members: [{ sessionId: SessionId('s2'), role: '执行' }],
    })
  })

  it('workgroup_list renders the caller groups', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: '开发组', owner: 's1' })
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_list')!
    const result = await tool.execute({}, { agent: fakeAgent('s1'), signal: new AbortController().signal }) as string
    expect(result).toContain('开发组')
    expect(result).toContain('owner')
  })

  it('workgroup_send delivers through the registry', async () => {
    const { ctx, registered } = toolHarness()
    const send = vi.fn(async () => ({ delivered: true, messageId: 'm1' }))
    const registry = registryDouble(send)
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_send')!
    const result = await tool.execute(
      { group_id: 'g1', target_session_id: 's2', message: '去执行' },
      { agent: fakeAgent('s1'), signal: new AbortController().signal },
    ) as { delivered: boolean; message_id: string }
    expect(result.delivered).toBe(true)
    expect(result.message_id).toBe('m1')
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0].sender.id).toBe(SessionId('s1'))
    expect(send.mock.calls[0][0].targetSessionId).toBe(SessionId('s2'))
    expect(send.mock.calls[0][0].content).toEqual([{ type: 'text', text: '去执行' }])
  })

  it('workgroup_send fails loud when the registry rejects', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble(vi.fn(async () => {
      throw new Error('WORKGROUP_NOT_MEMBER')
    }))
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_send')!
    await expect(tool.execute(
      { group_id: 'g1', target_session_id: 's2', message: 'x' },
      { agent: fakeAgent('s1'), signal: new AbortController().signal },
    )).rejects.toThrow('WORKGROUP_NOT_MEMBER')
  })

  it('workgroup_members add/remove/set_role dispatch', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: 'g', owner: 's1' })
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_members')!
    const exec = { agent: fakeAgent('s1'), signal: new AbortController().signal }
    await tool.execute({ action: 'add', group_id: 'g1', session_id: 's2', role: '执行' }, exec)
    expect(registry.addMember).toHaveBeenCalledWith({
      groupId: WorkgroupId('g1'), sessionId: SessionId('s2'), role: '执行',
    })
    await tool.execute({ action: 'set_role', group_id: 'g1', session_id: 's2', role: '测试' }, exec)
    expect(registry.setRole).toHaveBeenCalledWith(WorkgroupId('g1'), SessionId('s2'), '测试')
    await tool.execute({ action: 'remove', group_id: 'g1', session_id: 's2' }, exec)
    expect(registry.removeMember).toHaveBeenCalledWith(WorkgroupId('g1'), SessionId('s2'))
  })

  it('workgroup_members rejects a caller outside the group', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: 'g', owner: 's1' })
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_members')!
    await expect(tool.execute(
      { action: 'add', group_id: 'g1', session_id: 's2', role: '执行' },
      { agent: fakeAgent('outsider'), signal: new AbortController().signal },
    )).rejects.toThrow('not a member')
  })

  it('workgroup_members requires a role for add and set_role', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: 'g', owner: 's1' })
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_members')!
    await expect(tool.execute(
      { action: 'add', group_id: 'g1', session_id: 's2' },
      { agent: fakeAgent('s1'), signal: new AbortController().signal },
    )).rejects.toMatchObject({ code: 'WORKGROUP_INVALID_INPUT', message: expect.stringContaining('requires a role') })
  })

  it('workgroup_members reports WORKGROUP_NOT_FOUND for an unknown group', async () => {
    const { ctx, registered } = toolHarness()
    ctx.provide('workgroups', registryDouble() as never)
    const tool = registered.find(entry => entry.name === 'workgroup_members')!
    await expect(tool.execute(
      { action: 'add', group_id: 'nope', session_id: 's2', role: '执行' },
      { agent: fakeAgent('s1'), signal: new AbortController().signal },
    )).rejects.toMatchObject({ code: 'WORKGROUP_NOT_FOUND' })
  })

  it('workgroup_destroy dissolves a group the caller owns', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: 'g', owner: 's1' })
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_destroy')!
    const result = await tool.execute(
      { group_id: 'g1' },
      { agent: fakeAgent('s1'), signal: new AbortController().signal },
    ) as string
    expect(result).toContain('destroyed')
    expect(registry.destroy).toHaveBeenCalledWith(WorkgroupId('g1'))
  })

  it('workgroup_destroy rejects a non-owner caller', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: 'g', owner: 's1' })
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_destroy')!
    await expect(tool.execute(
      { group_id: 'g1' },
      { agent: fakeAgent('s2'), signal: new AbortController().signal },
    )).rejects.toMatchObject({ code: 'WORKGROUP_NOT_OWNER' })
    expect(registry.destroy).not.toHaveBeenCalled()
  })

  it('workgroup_status reports the observed status', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: 'g', owner: 's1' })
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_status')!
    const status = await tool.execute(
      { group_id: 'g1', message_id: 'm1' },
      { agent: fakeAgent('s1'), signal: new AbortController().signal },
    ) as string
    expect(status).toBe('started')
  })

  it('workgroup_status reports unknown when no record exists', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: 'g', owner: 's1' })
    ;(registry.statusOf as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_status')!
    const status = await tool.execute(
      { group_id: 'g1', message_id: 'ghost' },
      { agent: fakeAgent('s1'), signal: new AbortController().signal },
    ) as string
    expect(status).toBe('unknown')
  })

  it('workgroup_status rejects a caller outside the group', async () => {
    const { ctx, registered } = toolHarness()
    const registry = registryDouble()
    await registry.create({ title: 'g', owner: 's1' })
    ctx.provide('workgroups', registry as never)
    const tool = registered.find(entry => entry.name === 'workgroup_status')!
    await expect(tool.execute(
      { group_id: 'g1', message_id: 'm1' },
      { agent: fakeAgent('outsider'), signal: new AbortController().signal },
    )).rejects.toMatchObject({ code: 'WORKGROUP_NOT_MEMBER' })
  })

  it('rejects agentless execution', async () => {
    const { ctx, registered } = toolHarness()
    ctx.provide('workgroups', registryDouble() as never)
    const tool = registered.find(entry => entry.name === 'workgroup_create')!
    await expect(tool.execute(
      { title: 't' },
      { signal: new AbortController().signal },
    )).rejects.toThrow('calling agent')
  })
})
