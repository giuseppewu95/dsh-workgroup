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

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentRegistry } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { WorkgroupError } from './error.ts'
import type { WorkgroupMessageSource } from './message-source.ts'

/** Delivery inputs the caller has already authorized. */
export interface WorkgroupDeliveryRequest {
  /** The exact live sender Agent (tool calls) or host-side identity holder. */
  readonly sender: Agent
  /** The workgroup the message travels through. */
  readonly groupId: WorkgroupMessageSource['groupId']
  /** The target member session id. */
  readonly targetSessionId: SessionId
  /** Model-facing content to deliver. */
  readonly content: ContentBlock[]
  /** Caller-owned cancellation. */
  readonly signal: AbortSignal
}

/** Resolve the target to a live Agent or reject with a typed error. */
export async function resolveDeliveryTarget(
  ctx: Context,
  request: WorkgroupDeliveryRequest,
): Promise<Agent> {
  const { sender, targetSessionId } = request
  const agents = requireAgents(ctx)
  const live = agents.get(targetSessionId)
  if (live !== undefined) {
    // A continuable child of the sender is owned by the continuation manager;
    // deliver through it below instead of followup directly.
    if (live.session.header.origin === 'subagent') {
      if (live.session.header.parentSession !== sender.id) {
        throw new WorkgroupError(
          'WORKGROUP_TARGET_OWNED',
          `workgroup target "${targetSessionId}" is a subagent child of another session`,
        )
      }
      return live
    }
    return live
  }

  // Cold target: only a top-level persisted session may be resumed by this
  // plugin. Subagent-owned identities keep the continuation manager's fence.
  const persistence = ctx.get('sessionPersistence') as SessionPersistence | undefined
  if (persistence === undefined) {
    throw new WorkgroupError(
      'WORKGROUP_TARGET_UNAVAILABLE',
      'workgroup delivery to a cold session requires session persistence, which is not mounted',
    )
  }
  let meta: SessionHeader | undefined
  try {
    meta = (await persistence.list(request.signal)).find(candidate => candidate.id === targetSessionId)
  } catch (error) {
    request.signal.throwIfAborted()
    throw new WorkgroupError(
      'WORKGROUP_TARGET_UNAVAILABLE',
      `workgroup target "${targetSessionId}" could not be inspected`,
    )
  }
  if (meta === undefined || meta.origin === 'subagent') {
    throw new WorkgroupError(
      meta === undefined ? 'WORKGROUP_TARGET_NOT_FOUND' : 'WORKGROUP_TARGET_OWNED',
      meta === undefined
        ? `workgroup target "${targetSessionId}" does not exist`
        : `workgroup target "${targetSessionId}" is a subagent child and is not resumable here`,
    )
  }
  const agent = await resumeOnce(ctx, agents, targetSessionId)
  return agent
}

/** Resolve the agents service through the store (never property access: the
 * registry's context injects only storageDomain, and property access without
 * a declared inject throws in Cordis). */
function requireAgents(ctx: Context): AgentRegistry {
  const agents = ctx.get('agents') as AgentRegistry | undefined
  if (agents === undefined) {
    throw new WorkgroupError(
      'WORKGROUP_TARGET_UNAVAILABLE',
      'workgroup delivery requires the agents service, which is not mounted',
    )
  }
  return agents
}

/** In-flight cold resumes per identity; never expires, exactly like api-remotes. */
const resumes = new Map<SessionId, Promise<Agent>>()

/** Resume a cold top-level session once per identity, deduplicating concurrent callers. */
async function resumeOnce(
  ctx: Context,
  agents: AgentRegistry,
  sessionId: SessionId,
): Promise<Agent> {
  const pending = resumes.get(sessionId)
  if (pending !== undefined) return pending
  const attempt = (async () => {
    try {
      const agentDefaultModel = ctx.get('agentDefaultModel')
      const selection = agentDefaultModel?.currentSelection()
      const handle = await agents.resume({
        resumeSessionId: sessionId,
        ...selection === undefined
          ? {}
          : {
            agentOptions: {
              ...selection.provider === undefined ? {} : { provider: selection.provider },
              ...selection.model === undefined ? {} : { model: selection.model },
            },
          },
      })
      return handle.agent
    } catch (error) {
      // Resume failures surface as one typed delivery failure: the caller
      // cannot act on registry internals, and the id stays resumable for a
      // later attempt (the finally below frees the dedupe slot).
      throw new WorkgroupError(
        'WORKGROUP_TARGET_UNAVAILABLE',
        `workgroup target "${sessionId}" could not be resumed`,
        { cause: error },
      )
    } finally {
      resumes.delete(sessionId)
    }
  })()
  resumes.set(sessionId, attempt)
  return attempt
}

/** Deliver one authorized message to its target. */
export async function deliverWorkgroupMessage(
  ctx: Context,
  request: WorkgroupDeliveryRequest,
): Promise<void> {
  const target = await resolveDeliveryTarget(ctx, request)
  const source: WorkgroupMessageSource = {
    kind: 'workgroup',
    form: 'relay',
    senderSessionId: request.sender.id,
    groupId: request.groupId,
  }
  if (target.session.header.origin === 'subagent') {
    // The continuation manager owns the child's inbox and cold resume; the
    // sender is its durable direct parent (checked above). A one-shot child
    // has no Activation and its descriptor rejects resume, so the manager's
    // NOT_RESUMABLE failure is mapped to the typed delivery error.
    const subagents = ctx.get('subagents')
    if (subagents === undefined) {
      throw new WorkgroupError(
        'WORKGROUP_TARGET_UNAVAILABLE',
        'workgroup delivery to a subagent child requires the subagents service, which is not mounted',
      )
    }
    try {
      await subagents.followup(request.sender, request.targetSessionId, request.content, {
        source,
        signal: request.signal,
      })
    } catch (error) {
      request.signal.throwIfAborted()
      throw new WorkgroupError(
        'WORKGROUP_TARGET_UNAVAILABLE',
        `workgroup target "${request.targetSessionId}" is not a resumable continuable child`,
        { cause: error },
      )
    }
    return
  }
  const message = createUserMessage({ content: request.content, source })
  target.followup(message)
}
