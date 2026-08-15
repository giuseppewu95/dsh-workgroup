/**
 * Workgroup message delivery status: a minimal, honest state machine over the
 * target session's observable lifecycle (see docs/decisions/2026-08-15-delivery-ack-boundary.md).
 *
 * States (exact infrastructure semantics, never overclaimed):
 * - `accepted`       — `send` validated and the delivery call succeeded;
 * - `queued`         — the target session log shows `agent/inbox/spliced`
 *                      with this message id (durable, survives process exit);
 * - `started`        — the target session log shows `user/message` with this
 *                      id (the target's model will see it);
 * - `turn_completed` — a `turn/end` with reason `completed`/`max-tokens`
 *                      closed the turn CONTAINING this message (turn-scoped,
 *                      NOT a per-message consumption proof);
 * - `failed`         — a `turn/end` with reason `error`/`aborted` closed that
 *                      turn, or delivery itself rejected (no status record).
 *
 * Transitions are strictly forward and idempotent: re-observing a state is a
 * no-op, going backwards is rejected, and terminal states (`turn_completed`,
 * `failed`) never change again.
 *
 * @module dsh-workgroup/src/ack
 */

import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkgroupId } from './types.ts'

/** One observed delivery status of a workgroup message. */
export type WorkgroupMessageStatus =
  | 'accepted'
  | 'queued'
  | 'started'
  | 'turn_completed'
  | 'failed'

/** Payload of the `workgroup/message-status` event. */
export interface WorkgroupMessageStatusChange {
  /** Stable message id minted at send time. */
  readonly messageId: MessageId
  /** The workgroup the message traveled through. */
  readonly groupId: WorkgroupId
  /** The member session the message was addressed to. */
  readonly targetSessionId: SessionId
  /** The newly observed status. */
  readonly status: WorkgroupMessageStatus
}

/** Forward order; terminal states share the top rank. */
const RANK: Record<WorkgroupMessageStatus, number> = {
  accepted: 0,
  queued: 1,
  started: 2,
  turn_completed: 3,
  failed: 3,
}

/** Whether a state may never change again. */
function isTerminal(status: WorkgroupMessageStatus): boolean {
  return status === 'turn_completed' || status === 'failed'
}

/**
 * Fold one observed status into the current one.
 * @param current - current status, or `undefined` when the message is unknown.
 * @param observed - the newly observed status.
 * @returns the resulting status, or `null` when the observation is a backwards
 *   or post-terminal transition that must be ignored.
 */
export function foldStatus(
  current: WorkgroupMessageStatus | undefined,
  observed: WorkgroupMessageStatus,
): WorkgroupMessageStatus | null {
  if (current === undefined) return observed
  if (current === observed) return current
  if (isTerminal(current)) return null
  return RANK[current] < RANK[observed] ? observed : null
}
