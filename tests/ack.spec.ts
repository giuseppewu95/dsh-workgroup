/**
 * Delivery-status state machine tests: forward-only, idempotent transitions
 * with exact infrastructure semantics (see docs/decisions/2026-08-15-delivery-ack-boundary.md).
 *
 * @module dsh-workgroup/tests/ack
 */

import { describe, expect, it } from 'vitest'
import { foldStatus } from '../src/ack.ts'

describe('foldStatus', () => {
  it('accepts the first observation', () => {
    expect(foldStatus(undefined, 'accepted')).toBe('accepted')
    expect(foldStatus(undefined, 'queued')).toBe('queued')
  })

  it('is idempotent on repeat observations', () => {
    expect(foldStatus('queued', 'queued')).toBe('queued')
    expect(foldStatus('turn_completed', 'turn_completed')).toBe('turn_completed')
  })

  it('advances forward only', () => {
    expect(foldStatus('accepted', 'queued')).toBe('queued')
    expect(foldStatus('queued', 'started')).toBe('started')
    expect(foldStatus('started', 'turn_completed')).toBe('turn_completed')
    expect(foldStatus('started', 'failed')).toBe('failed')
  })

  it('rejects backwards transitions', () => {
    expect(foldStatus('started', 'accepted')).toBeNull()
    expect(foldStatus('turn_completed', 'started')).toBeNull()
  })

  it('never changes after a terminal state', () => {
    expect(foldStatus('turn_completed', 'failed')).toBeNull()
    expect(foldStatus('failed', 'turn_completed')).toBeNull()
    expect(foldStatus('failed', 'started')).toBeNull()
  })
})
