/**
 * Workgroup message delivery: resolve the target session to a live Agent and
 * deliver one user-role message with `workgroup` attribution.
 *
 * Authorization is membership, not lineage: both the sender and the target
 * must be members of the same workgroup (checked by the caller before this
 * module runs). Delivery itself is identity-based:
 *
 * - a live top-level session delivers through `agent.followup()` (waking,
 *   the message becomes the target's next turn);
 * - a cold top-level session is resumed once per identity (deduplicated,
 *   mirroring `@deepseek-ai/dsh-api-remotes`'s resolver) and then delivers;
 * - a continuable child of the sender routes through
 *   `ctx.subagents.followup()`, which owns its inbox and cold resume;
 * - one-shot children, children of other parents, and unknown or deleted
 *   sessions are rejected with typed errors — no delivery.
 *
 * @module dsh-workgroup/src/delivery
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type ContentBlock } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { WorkgroupMessageSource } from './message-source.ts';
/** Delivery inputs the caller has already authorized. */
export interface WorkgroupDeliveryRequest {
    /** The exact live sender Agent (tool calls) or host-side identity holder. */
    readonly sender: Agent;
    /** The workgroup the message travels through. */
    readonly groupId: WorkgroupMessageSource['groupId'];
    /** The target member session id. */
    readonly targetSessionId: SessionId;
    /** Model-facing content to deliver. */
    readonly content: ContentBlock[];
    /** Caller-owned cancellation. */
    readonly signal: AbortSignal;
}
/** Resolve the target to a live Agent or reject with a typed error. */
export declare function resolveDeliveryTarget(ctx: Context, request: WorkgroupDeliveryRequest): Promise<Agent>;
/** Deliver one authorized message to its target. */
export declare function deliverWorkgroupMessage(ctx: Context, request: WorkgroupDeliveryRequest): Promise<void>;
