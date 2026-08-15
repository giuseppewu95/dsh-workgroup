/**
 * Domain spec tests: zod validation, domain opening, and record round-trips.
 *
 * @module dsh-workgroup/tests/spec
 */

import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { workgroupDomainSpec, workgroupRecord, workgroupMember } from '../src/spec.ts'
import { WorkgroupId } from '../src/types.ts'

describe('workgroupRecord', () => {
  it('accepts a valid record', () => {
    const parsed = workgroupRecord.parse({
      id: WorkgroupId('g1'),
      title: '我的工作群',
      ownerSessionId: SessionId('s1'),
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
      members: [{ sessionId: SessionId('s2'), role: '执行', joinedAt: '2026-08-15T00:00:00.000Z' }],
    })
    expect(parsed.title).toBe('我的工作群')
    expect(parsed.members[0].sessionId).toBe(SessionId('s2'))
  })

  it('rejects an empty title', () => {
    expect(() => workgroupRecord.parse({
      id: WorkgroupId('g1'),
      title: '',
      ownerSessionId: SessionId('s1'),
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
      members: [],
    })).toThrow()
  })

  it('rejects an empty role', () => {
    expect(() => workgroupMember.parse({
      sessionId: SessionId('s2'),
      role: '',
      joinedAt: '2026-08-15T00:00:00.000Z',
    })).toThrow()
  })

  it('bounds the role length', () => {
    expect(() => workgroupMember.parse({
      sessionId: SessionId('s2'),
      role: 'x'.repeat(65),
      joinedAt: '2026-08-15T00:00:00.000Z',
    })).toThrow()
  })
})

describe('workgroupDomainSpec', () => {
  it('declares the expected identity and layout', () => {
    expect(workgroupDomainSpec.name).toBe('workgroup')
    expect(workgroupDomainSpec.version).toBe(1)
    expect(Object.keys(workgroupDomainSpec.tables)).toEqual(['groups'])
  })
})
