/**
 * Registry service tests: create/list/get, member mutations, durability,
 * events, and the full authorization-rejection matrix for `send`.
 *
 * @module dsh-workgroup/tests/registry
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkgroupError, WorkgroupRegistry } from '../src/registry.ts'
import { WorkgroupId } from '../src/types.ts'
import { MemoryStorageBackend } from './memory-backend.ts'

/** One fake live Agent for sender identity. */
function fakeAgent(id: string): Agent {
  return {
    id: SessionId(id),
    options: {},
    status: 'idle',
    session: {
      id: SessionId(id),
      header: { version: 0, id: SessionId(id), createdAt: 0 },
    },
    followup: () => {},
  } as unknown as Agent
}

interface Harness {
  ctx: Context
  fiber: { dispose: () => Promise<void> }
  registry: WorkgroupRegistry
  followups: Array<{ id: string; source: unknown }>
  resume: ReturnType<typeof vi.fn>
  /** Register a live agent under an id. */
  addAgent: (agent: Agent) => void
}

async function harness(pool = new Map(), withAgents = true): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)

  const followups: Array<{ id: string; source: unknown }> = []
  const resume = vi.fn()
  const live = new Map<string, Agent>()
  if (withAgents) {
    ctx.provide('agents', {
      get: (id: SessionId) => live.get(String(id)),
      resume,
    } as never)
  }

  const fiber = await ctx.plugin(WorkgroupRegistry)
  return {
    ctx,
    fiber: fiber as unknown as { dispose: () => Promise<void> },
    registry: ctx.workgroups,
    followups,
    resume,
    addAgent: (agent: Agent) => { live.set(String(agent.id), agent) },
  }
}

const signal = new AbortController().signal

describe('create / list / get', () => {
  it('creates a group with the owner as first member', async () => {
    const { registry } = await harness()
    const view = await registry.create({ title: '开发组', owner: SessionId('s1') })
    expect(view.ownerSessionId).toBe(SessionId('s1'))
    expect(view.members).toHaveLength(1)
    expect(view.members[0].role).toBe('owner')
    expect(registry.get(view.id)?.title).toBe('开发组')
    expect(registry.listForSession(SessionId('s1'))).toHaveLength(1)
    expect(registry.listForSession(SessionId('other'))).toHaveLength(0)
  })

  it('persists across a reopened registry', async () => {
    const pool = new Map()
    const first = await harness(pool)
    const view = await first.registry.create({ title: '持久', owner: SessionId('s1') })
    await first.fiber.dispose()
    const second = await harness(pool)
    expect(second.registry.get(view.id)?.title).toBe('持久')
    await second.fiber.dispose()
  })
})

describe('member mutations', () => {
  it('adds, re-roles, and removes a member', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    expect(registry.get(group.id)?.members).toHaveLength(2)
    await registry.setRole(group.id, SessionId('s2'), '测试')
    expect(registry.get(group.id)?.members[1].role).toBe('测试')
    await registry.removeMember(group.id, SessionId('s2'))
    expect(registry.get(group.id)?.members).toHaveLength(1)
  })

  it('rejects duplicate members and missing members', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await expect(registry.addMember({ groupId: group.id, sessionId: SessionId('s1'), role: 'x' }))
      .rejects.toMatchObject({ code: 'WORKGROUP_MEMBER_EXISTS' })
    await expect(registry.removeMember(group.id, SessionId('nobody')))
      .rejects.toMatchObject({ code: 'WORKGROUP_MEMBER_MISSING' })
  })

  it('rejects owner removal', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await expect(registry.removeMember(group.id, SessionId('s1')))
      .rejects.toMatchObject({ code: 'WORKGROUP_OWNER_REMOVAL' })
  })

  it('rejects unknown groups', async () => {
    const { registry } = await harness()
    await expect(registry.get(WorkgroupId('nope'))).toBeUndefined()
    await expect(registry.addMember({ groupId: WorkgroupId('nope'), sessionId: SessionId('s2'), role: 'x' }))
      .rejects.toMatchObject({ code: 'WORKGROUP_NOT_FOUND' })
    await expect(registry.destroy(WorkgroupId('nope')))
      .rejects.toMatchObject({ code: 'WORKGROUP_NOT_FOUND' })
  })

  it('drops an explicit owner entry on create (no duplicate member)', async () => {
    const { registry } = await harness()
    const group = await registry.create({
      title: 'g',
      owner: SessionId('s1'),
      members: [{ sessionId: SessionId('s1'), role: '规划' }],
    })
    expect(group.members).toHaveLength(1)
    expect(group.members[0].role).toBe('owner')
  })

  it('drops repeated non-owner entries on create (first occurrence wins)', async () => {
    const { registry } = await harness()
    const group = await registry.create({
      title: 'g',
      owner: SessionId('s1'),
      members: [
        { sessionId: SessionId('s2'), role: '执行' },
        { sessionId: SessionId('s2'), role: '测试' },
        { sessionId: SessionId('s3'), role: '测试' },
      ],
    })
    expect(group.members).toHaveLength(3)
    expect(group.members[1]).toMatchObject({ sessionId: SessionId('s2'), role: '执行' })
    expect(group.members[2]).toMatchObject({ sessionId: SessionId('s3'), role: '测试' })
  })
})

describe('input validation', () => {
  it('rejects an out-of-bounds role on create', async () => {
    const { registry } = await harness()
    await expect(registry.create({
      title: 'g',
      owner: SessionId('s1'),
      members: [{ sessionId: SessionId('s2'), role: 'x'.repeat(65) }],
    })).rejects.toMatchObject({ code: 'WORKGROUP_INVALID_INPUT' })
  })

  it('rejects an out-of-bounds role on addMember and setRole', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await expect(registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '' }))
      .rejects.toMatchObject({ code: 'WORKGROUP_INVALID_INPUT' })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    await expect(registry.setRole(group.id, SessionId('s2'), 'x'.repeat(65)))
      .rejects.toMatchObject({ code: 'WORKGROUP_INVALID_INPUT' })
  })

  it('rejects an out-of-bounds title on create', async () => {
    const { registry } = await harness()
    await expect(registry.create({ title: '', owner: SessionId('s1') }))
      .rejects.toMatchObject({ code: 'WORKGROUP_INVALID_INPUT' })
    await expect(registry.create({ title: 'x'.repeat(201), owner: SessionId('s1') }))
      .rejects.toMatchObject({ code: 'WORKGROUP_INVALID_INPUT' })
  })

  it('serializes concurrent member mutations without lost updates', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    // Ten concurrent adds: every one must land despite read-modify-write races.
    await Promise.all(Array.from({ length: 10 }, (_, index) => (
      registry.addMember({ groupId: group.id, sessionId: SessionId(`s${index + 2}`), role: `r${index}` })
    )))
    expect(registry.get(group.id)?.members).toHaveLength(11)
  })
})

describe('member events', () => {
  it('carries the removed member role in member-removed', async () => {
    const { ctx, registry } = await harness()
    const seen: Array<{ sessionId: SessionId; role: string }> = []
    ctx.on('workgroup/member-removed', (change) => { seen.push(change) })
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    await registry.removeMember(group.id, SessionId('s2'))
    expect(seen).toEqual([{ groupId: group.id, sessionId: SessionId('s2'), role: '执行' }])
  })
})

describe('destroy', () => {
  it('removes the group and its membership', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.destroy(group.id)
    expect(registry.get(group.id)).toBeUndefined()
    expect(registry.list()).toHaveLength(0)
  })
})

describe('send authorization matrix', () => {
  it('maps a missing agents service to a typed delivery error', async () => {
    // Regression: delivery must read `agents` through ctx.get. The Loader
    // mounts the plugin on an entry context whose own inject list is only
    // ['storageDomain']; property access (ctx.agents) fails behind the loader's
    // isolate boundary with an untyped error. With no agents service at all,
    // ctx.get returns undefined and the typed WORKGROUP_TARGET_UNAVAILABLE is
    // the contract — a property-access regression would throw TypeError here.
    const { registry } = await harness(new Map(), false)
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    await expect(registry.send({
      sender: fakeAgent('s1'),
      groupId: group.id,
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: 'x' }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_TARGET_UNAVAILABLE' })
  })

  it('delivers to a live top-level member', async () => {
    const { registry, followups, addAgent } = await harness()
    const sender = fakeAgent('s1')
    const receiver = fakeAgent('s2')
    receiver.followup = (message: { source: unknown }) => { followups.push({ id: 's2', source: message.source }) }
    addAgent(sender)
    addAgent(receiver)
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    await registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: '去执行' }],
      signal,
    })
    expect(followups).toHaveLength(1)
    expect(followups[0].id).toBe('s2')
    expect(followups[0].source).toMatchObject({ kind: 'workgroup', senderSessionId: SessionId('s1') })
  })

  it('rejects a non-member sender', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await expect(registry.send({
      sender: fakeAgent('outsider'),
      groupId: group.id,
      targetSessionId: SessionId('s1'),
      content: [{ type: 'text', text: 'x' }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_NOT_MEMBER' })
  })

  it('rejects a non-member target', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await expect(registry.send({
      sender: fakeAgent('s1'),
      groupId: group.id,
      targetSessionId: SessionId('outsider'),
      content: [{ type: 'text', text: 'x' }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_NOT_MEMBER' })
  })

  it('rejects self-send', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await expect(registry.send({
      sender: fakeAgent('s1'),
      groupId: group.id,
      targetSessionId: SessionId('s1'),
      content: [{ type: 'text', text: 'x' }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_SELF_SEND' })
  })

  it('rejects unknown groups', async () => {
    const { registry } = await harness()
    await expect(registry.send({
      sender: fakeAgent('s1'),
      groupId: WorkgroupId('nope'),
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: 'x' }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_NOT_FOUND' })
  })

  it('routes to a continuable child of the sender through the subagents service', async () => {
    const { ctx, registry, addAgent } = await harness()
    const followup = vi.fn(async () => 'mid')
    ctx.provide('subagents', { followup } as never)
    const sender = fakeAgent('s1')
    addAgent(sender)
    const child = fakeAgent('child1')
    child.session.header.origin = 'subagent'
    child.session.header.parentSession = SessionId('s1')
    addAgent(child)
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('child1'), role: '执行' })
    await registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('child1'),
      content: [{ type: 'text', text: '去执行' }],
      signal,
    })
    expect(followup).toHaveBeenCalledOnce()
    expect(followup.mock.calls[0][0].id).toBe('s1')
    expect(followup.mock.calls[0][1]).toBe(SessionId('child1'))
  })

  it('rejects a child of another parent', async () => {
    const { registry, addAgent } = await harness()
    const child = fakeAgent('child2')
    child.session.header.origin = 'subagent'
    child.session.header.parentSession = SessionId('other-parent')
    addAgent(child)
    const sender = fakeAgent('s1')
    addAgent(sender)
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('child2'), role: '执行' })
    await expect(registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('child2'),
      content: [{ type: 'text', text: 'x' }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_TARGET_OWNED' })
  })

  it('resumes a cold top-level target once and delivers', async () => {
    const { ctx, registry, resume } = await harness()
    const target = fakeAgent('cold1')
    const followups: unknown[] = []
    target.followup = (message: { source: unknown }) => { followups.push(message.source) }
    resume.mockResolvedValue({ agent: target })
    ctx.provide('sessionPersistence', {
      list: async () => [{ version: 0, id: SessionId('cold1'), createdAt: 0 }],
    } as never)
    const sender = fakeAgent('s1')
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('cold1'), role: '执行' })
    await registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('cold1'),
      content: [{ type: 'text', text: '唤醒' }],
      signal,
    })
    expect(resume).toHaveBeenCalledOnce()
    expect(followups).toHaveLength(1)
  })

  it('maps a cold resume failure to a typed delivery error', async () => {
    const { ctx, registry, resume } = await harness()
    resume.mockRejectedValue(new Error('boom'))
    ctx.provide('sessionPersistence', {
      list: async () => [{ version: 0, id: SessionId('cold1'), createdAt: 0 }],
    } as never)
    const sender = fakeAgent('s1')
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('cold1'), role: '执行' })
    await expect(registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('cold1'),
      content: [{ type: 'text', text: 'x' }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_TARGET_UNAVAILABLE' })
  })

  it('rejects an unknown cold target', async () => {
    const { ctx, registry } = await harness()
    ctx.provide('sessionPersistence', { list: async () => [] } as never)
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('ghost'), role: 'x' })
    await expect(registry.send({
      sender: fakeAgent('s1'),
      groupId: group.id,
      targetSessionId: SessionId('ghost'),
      content: [{ type: 'text', text: 'x' }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_TARGET_NOT_FOUND' })
  })
})

describe('events', () => {
  it('emits lifecycle events on mutations', async () => {
    const { ctx, registry } = await harness()
    const seen: string[] = []
    ctx.on('workgroup/created', () => { seen.push('created') })
    ctx.on('workgroup/member-added', () => { seen.push('added') })
    ctx.on('workgroup/member-removed', () => { seen.push('removed') })
    ctx.on('workgroup/destroyed', () => { seen.push('destroyed') })
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: 'x' })
    await registry.removeMember(group.id, SessionId('s2'))
    await registry.destroy(group.id)
    expect(seen).toEqual(['created', 'added', 'removed', 'destroyed'])
  })
})

describe('error types', () => {
  it('carries stable codes', () => {
    const error = new WorkgroupError('WORKGROUP_NOT_FOUND', 'missing')
    expect(error.code).toBe('WORKGROUP_NOT_FOUND')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('resource limits', () => {
  it('rejects creating beyond the workgroup cap without partial writes', async () => {
    const { registry } = await harness()
    for (let i = 0; i < 64; i++) {
      await registry.create({ title: `g${i}`, owner: SessionId(`s${i}`) })
    }
    await expect(registry.create({ title: 'g65', owner: SessionId('s65') }))
      .rejects.toMatchObject({ code: 'WORKGROUP_LIMIT_EXCEEDED' })
    expect(registry.list()).toHaveLength(64)
  })

  it('accepts an initial member set at the cap and rejects beyond it', async () => {
    const { registry } = await harness()
    const atCap = Array.from({ length: 31 }, (_, i) => ({ sessionId: SessionId(`m${i}`), role: 'x' }))
    const ok = await registry.create({ title: 'g', owner: SessionId('s0'), members: atCap })
    expect(ok.members).toHaveLength(32)
    const over = Array.from({ length: 32 }, (_, i) => ({ sessionId: SessionId(`o${i}`), role: 'x' }))
    await expect(registry.create({ title: 'g2', owner: SessionId('s1'), members: over }))
      .rejects.toMatchObject({ code: 'WORKGROUP_LIMIT_EXCEEDED' })
    expect(registry.list()).toHaveLength(1)
  })

  it('rejects adding a member beyond the cap without partial writes', async () => {
    const { registry } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s0') })
    for (let i = 0; i < 31; i++) {
      await registry.addMember({ groupId: group.id, sessionId: SessionId(`m${i}`), role: 'x' })
    }
    await expect(registry.addMember({ groupId: group.id, sessionId: SessionId('m31'), role: 'x' }))
      .rejects.toMatchObject({ code: 'WORKGROUP_LIMIT_EXCEEDED' })
    expect(registry.get(group.id)?.members).toHaveLength(32)
  })

  it('rejects a message over the serialized byte cap before any delivery', async () => {
    const { registry, addAgent } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    const sender = fakeAgent('s1')
    const receiver = fakeAgent('s2')
    const followups: string[] = []
    receiver.followup = (message: { content?: unknown }) => { followups.push(String(message.content)) }
    addAgent(sender)
    addAgent(receiver)
    await expect(registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: 'x'.repeat(300 * 1024) }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_LIMIT_EXCEEDED' })
    expect(followups).toHaveLength(0)
    await registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: 'x'.repeat(100 * 1024) }],
      signal,
    })
    expect(followups).toHaveLength(1)
  })

  it('measures message size in UTF-8 bytes, not characters', async () => {
    const { registry, addAgent } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    const sender = fakeAgent('s1')
    const receiver = fakeAgent('s2')
    receiver.followup = () => {}
    addAgent(sender)
    addAgent(receiver)
    // 100_000 CJK chars = 300_000 UTF-8 bytes (> cap) but 100_000 "characters"
    // (< cap): a char-count check would wrongly pass.
    await expect(registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: '测'.repeat(100_000) }],
      signal,
    })).rejects.toMatchObject({ code: 'WORKGROUP_LIMIT_EXCEEDED' })
  })
})

describe('delivery status observation', () => {
  /** One live delivery plus the fake session/event source for the target. */
  async function delivered() {
    const { ctx, registry, addAgent } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    const sender = fakeAgent('s1')
    const receiver = fakeAgent('s2')
    receiver.followup = () => {}
    addAgent(sender)
    addAgent(receiver)
    const result = await registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: '去执行' }],
      signal,
    })
    const target = { id: SessionId('s2') }
    return { ctx, registry, group, result, target }
  }

  /** Emit one target-session lifecycle event through the cordis event bus. */
  function emit(ctx: Context, target: { id: SessionId }, type: string, data: unknown): void {
    ctx.emit('session/event', target, { type, data })
  }

  it('records accepted on send and advances through observed lifecycle events', async () => {
    const { ctx, registry, group, result, target } = await delivered()
    expect(registry.statusOf(group.id, result.messageId)).toBe('accepted')

    emit(ctx, target, 'agent/inbox/spliced', { target: 'next-turn', inserted: [{ id: result.messageId }] })
    expect(registry.statusOf(group.id, result.messageId)).toBe('queued')

    emit(ctx, target, 'user/message', { id: result.messageId })
    expect(registry.statusOf(group.id, result.messageId)).toBe('started')

    emit(ctx, target, 'turn/end', { reason: { kind: 'completed' } })
    expect(registry.statusOf(group.id, result.messageId)).toBe('turn_completed')
  })

  it('maps an error turn to failed and freezes terminal states', async () => {
    const { ctx, registry, group, result, target } = await delivered()
    emit(ctx, target, 'agent/inbox/spliced', { target: 'next-turn', inserted: [{ id: result.messageId }] })
    emit(ctx, target, 'user/message', { id: result.messageId })
    emit(ctx, target, 'turn/end', { reason: { kind: 'error', error: { code: 'X' } } })
    expect(registry.statusOf(group.id, result.messageId)).toBe('failed')
    // Post-terminal observations are ignored.
    emit(ctx, target, 'user/message', { id: result.messageId })
    expect(registry.statusOf(group.id, result.messageId)).toBe('failed')
  })

  it('ignores unrelated sessions, other message ids, and non-terminal turn reasons', async () => {
    const { ctx, registry, group, result, target } = await delivered()
    const other = { id: SessionId('s9') }
    emit(ctx, other, 'agent/inbox/spliced', { target: 'next-turn', inserted: [{ id: result.messageId }] })
    expect(registry.statusOf(group.id, result.messageId)).toBe('accepted')
    emit(ctx, target, 'agent/inbox/spliced', { target: 'next-turn', inserted: [{ id: 'other-id' }] })
    emit(ctx, target, 'user/message', { id: 'other-id' })
    expect(registry.statusOf(group.id, result.messageId)).toBe('accepted')
    emit(ctx, target, 'turn/end', { reason: { kind: 'blocked' } })
    expect(registry.statusOf(group.id, result.messageId)).toBe('accepted')
  })

  it('emits workgroup/message-status for every forward transition', async () => {
    const { ctx, registry, addAgent } = await harness()
    const group = await registry.create({ title: 'g', owner: SessionId('s1') })
    await registry.addMember({ groupId: group.id, sessionId: SessionId('s2'), role: '执行' })
    const sender = fakeAgent('s1')
    const receiver = fakeAgent('s2')
    receiver.followup = () => {}
    addAgent(sender)
    addAgent(receiver)
    const seen: string[] = []
    ctx.on('workgroup/message-status', (change: { messageId: string; status: string }) => {
      seen.push(`${change.status}`)
    })
    const result = await registry.send({
      sender,
      groupId: group.id,
      targetSessionId: SessionId('s2'),
      content: [{ type: 'text', text: '去执行' }],
      signal,
    })
    const target = { id: SessionId('s2') }
    emit(ctx, target, 'agent/inbox/spliced', { target: 'next-turn', inserted: [{ id: result.messageId }] })
    emit(ctx, target, 'user/message', { id: result.messageId })
    emit(ctx, target, 'turn/end', { reason: { kind: 'completed' } })
    expect(seen).toEqual(['accepted', 'queued', 'started', 'turn_completed'])
  })

  it('returns unknown for ids not recorded in this process', async () => {
    const { registry } = await harness()
    expect(registry.statusOf(WorkgroupId('g1'), 'never-sent' as never)).toBeUndefined()
  })
})

afterEach(() => {})
