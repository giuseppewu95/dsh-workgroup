/**
 * Guided spawn tests: session creation wiring (model/background injection)
 * and group membership side effect.
 *
 * @module dsh-workgroup/tests/spawn
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkgroupError } from '../src/error.ts'
import { spawnWorkgroupSession } from '../src/spawn.ts'
import { WorkgroupId } from '../src/types.ts'

/** Fake live agent with a session header carrying cwd. */
function fakeAgent(id: string): Agent {
  return {
    id: SessionId(id),
    session: {
      header: { version: 0, id: SessionId(id), createdAt: 0, cwd: 'C:\\ws' },
    },
  } as unknown as Agent
}

/** Scripted ctx: agents.create captures options; workgroups.addMember records. */
function harness() {
  const ctx = new Context()
  const created: Array<Record<string, unknown>> = []
  const members: Array<{ groupId: unknown; sessionId: unknown; role: unknown }> = []
  const sections: Array<{ name: string; text: string }> = []
  ctx.provide('agents', {
    create: (options: Record<string, unknown>) => {
      created.push(options)
      return Promise.resolve({ agent: { id: options.sessionId } })
    },
  } as never)
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'opencode-go', model: 'deepseek-v4-flash' }),
  } as never)
  ctx.provide('workgroups', {
    addMember: (options: { groupId: unknown; sessionId: unknown; role: unknown }) => {
      members.push(options)
      return Promise.resolve({})
    },
  } as never)
  // systemPrompt captured through the setup callback's agentCtx.
  const capture = { agentCtx: undefined as unknown }
  return { ctx, created, members, sections, capture }
}

describe('spawnWorkgroupSession', () => {
  it('creates a session with the default model and adds it to the group', async () => {
    const { ctx, created, members } = harness()
    const result = await spawnWorkgroupSession(ctx, {
      sender: fakeAgent('s1'),
      groupId: WorkgroupId('g1'),
      role: '执行',
    })
    expect(created).toHaveLength(1)
    expect(created[0].sessionId).toBe(result.sessionId)
    expect(created[0].agentOptions).toEqual({ provider: 'opencode-go', model: 'deepseek-v4-flash' })
    expect(members).toEqual([{ groupId: WorkgroupId('g1'), sessionId: result.sessionId, role: '执行' }])
  })

  it('honors an explicit model override', async () => {
    const { ctx, created } = harness()
    await spawnWorkgroupSession(ctx, {
      sender: fakeAgent('s1'),
      groupId: WorkgroupId('g1'),
      role: '测试',
      model: 'glm-4.6',
    })
    expect(created[0].agentOptions).toEqual({ provider: 'opencode-go', model: 'glm-4.6' })
  })

  it('injects the role background as a scoped system-prompt section', async () => {
    const { ctx, created } = harness()
    await spawnWorkgroupSession(ctx, {
      sender: fakeAgent('s1'),
      groupId: WorkgroupId('g1'),
      role: '测试',
      background: '你是质量负责人，只关心回归风险。',
    })
    const setup = created[0].setup as (agentCtx: {
      effect: (fn: () => unknown) => void
      on: () => () => void
      systemPrompt: { section: (entry: { name: string; text: string }) => void }
    }) => void
    const sections: Array<{ name: string; text: string }> = []
    setup({
      effect: (fn: () => unknown) => { fn() },
      on: () => () => {},
      systemPrompt: { section: (entry: { name: string; text: string }) => { sections.push(entry) } },
    })
    expect(sections).toHaveLength(1)
    expect(sections[0].name).toBe('workgroup:role')
    expect(sections[0].text).toContain('你是质量负责人')
    expect(sections[0].text).toContain('"测试"')
  })

  it('fails typed when the agents service is missing', async () => {
    const ctx = new Context()
    ctx.provide('workgroups', { addMember: async () => ({}) } as never)
    await expect(spawnWorkgroupSession(ctx, {
      sender: fakeAgent('s1'),
      groupId: WorkgroupId('g1'),
      role: 'x',
    })).rejects.toMatchObject({ code: 'WORKGROUP_TARGET_UNAVAILABLE' })
  })

  it('fails typed when the workgroups service is missing', async () => {
    const ctx = new Context()
    ctx.provide('agents', { create: async () => ({ agent: {} }) } as never)
    await expect(spawnWorkgroupSession(ctx, {
      sender: fakeAgent('s1'),
      groupId: WorkgroupId('g1'),
      role: 'x',
    })).rejects.toMatchObject({ code: 'WORKGROUP_TARGET_UNAVAILABLE' })
  })

  it('propagates addMember rejections (e.g. member cap)', async () => {
    const ctx = new Context()
    ctx.provide('agents', { create: async () => ({ agent: {} }) } as never)
    ctx.provide('workgroups', {
      addMember: async () => { throw new WorkgroupError('WORKGROUP_LIMIT_EXCEEDED', 'cap') },
    } as never)
    await expect(spawnWorkgroupSession(ctx, {
      sender: fakeAgent('s1'),
      groupId: WorkgroupId('g1'),
      role: 'x',
    })).rejects.toMatchObject({ code: 'WORKGROUP_LIMIT_EXCEEDED' })
  })
})
