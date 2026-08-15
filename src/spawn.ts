/**
 * Guided collaborative-session spawning: create a fresh top-level session with
 * an optional model selection and role background, then add it to a workgroup
 * the caller belongs to. The caller is the authenticating identity (the model
 * tool's agent), so this stays inside the existing membership model — no
 * browser-facing write surface is involved.
 *
 * @module dsh-workgroup/src/spawn
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentRegistry } from '@deepseek-ai/dsh-agent'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkgroupError } from './error.ts'
import type { WorkgroupId } from './types.ts'

/** One guided spawn request, already authorized by the caller's membership. */
export interface WorkgroupSpawnOptions {
  /** The exact live calling Agent (authenticating identity). */
  readonly sender: Agent
  /** The workgroup the new session joins. */
  readonly groupId: WorkgroupId
  /** Role label for the new member (1..64 chars). */
  readonly role: string
  /** Optional model name; defaults to the current default selection. */
  readonly model?: string
  /** Optional role background injected as a scoped system-prompt section. */
  readonly background?: string
}

/** Result of a successful spawn. */
export interface WorkgroupSpawnResult {
  readonly sessionId: SessionId
  readonly groupId: WorkgroupId
}

/**
 * Spawn one session with the given model/background and add it to the group.
 * The new session is a fresh top-level session (a regular workgroup member),
 * created through the agents registry with a scoped setup that installs the
 * model selection and, when given, a `workgroup:role` system-prompt section
 * carrying the role background.
 */
export async function spawnWorkgroupSession(
  ctx: Context,
  options: WorkgroupSpawnOptions,
): Promise<WorkgroupSpawnResult> {
  const agents = ctx.get('agents') as AgentRegistry | undefined
  if (agents === undefined) {
    throw new WorkgroupError(
      'WORKGROUP_TARGET_UNAVAILABLE',
      'workgroup spawn requires the agents service, which is not mounted',
    )
  }
  const sessionId = SessionId(`session-${randomUUID()}`)
  const defaultModel = ctx.get('agentDefaultModel')
  const selection = defaultModel?.currentSelection()
  // The provider stays on the deployment route; only the model name may be
  // overridden. Without any selection and without an explicit model, no
  // agentOptions are passed (the runtime default applies).
  const model = options.model ?? selection?.model
  const provider = selection?.provider
  const agentOptions = provider === undefined && model === undefined
    ? undefined
    : { ...(provider === undefined ? {} : { provider }), ...(model === undefined ? {} : { model }) }

  await agents.create({
    sessionId,
    meta: { cwd: options.sender.session.header.cwd },
    ...(agentOptions === undefined ? {} : { agentOptions }),
    setup: (agentCtx) => {
      if (selection !== undefined) {
        agentCtx.effect(() => installModelSelection(agentCtx, { current: selection, assembled: undefined }),
          'workgroup.spawn: model selection')
      }
      if (options.background !== undefined && options.background.trim() !== '') {
        agentCtx.effect(() => agentCtx.systemPrompt.section({
          name: 'workgroup:role',
          order: 115,
          text: `You are a workgroup member with the role "${options.role}".\n\n${options.background}`,
        }), 'workgroup.spawn: role background')
      }
    },
  })

  const registry = ctx.get('workgroups')
  if (registry === undefined) {
    throw new WorkgroupError(
      'WORKGROUP_TARGET_UNAVAILABLE',
      'workgroup spawn requires the workgroups service, which is not mounted',
    )
  }
  await registry.addMember({ groupId: options.groupId, sessionId, role: options.role })
  return { sessionId, groupId: options.groupId }
}
