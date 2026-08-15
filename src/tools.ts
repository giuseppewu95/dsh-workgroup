/**
 * Model-facing workgroup tools: create groups, list the caller's groups,
 * send cross-session messages, and manage membership. Thin adapters over
 * `ctx.workgroups`; authorization belongs to the service.
 *
 * @module dsh-workgroup/src/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkgroupError } from './error.ts'
import { WorkgroupId } from './types.ts'
import type {} from './registry.ts'

/**
 * Services the tool registration needs. `workgroups` is resolved through the
 * inject face at registration time (see `apply` in src/index.ts), never as a
 * plugin-row dependency: the registry is mounted by the same plugin, so a
 * row-level inject would deadlock on its own apply.
 */
export const inject = ['tools', 'systemPrompt']

/** Guidance text for the model, registered as a system-prompt section. */
const PROMPT_TEXT =
  'Use workgroup_create to form a named group of sessions with roles (e.g. 规划/执行/测试), workgroup_list '
  + 'to see the groups your session belongs to and their members, workgroup_send to deliver a message to '
  + 'another member session (it becomes that session\'s next turn), workgroup_members to add, remove, or '
  + 're-role members, and workgroup_destroy to dissolve a group you own. Collaboration loop: delegate work '
  + 'to member sessions, have each member report its result back through the group with workgroup_send, and '
  + 'open any member session in the GUI to read its transcript.'

/** Render one member for the list tool. */
function memberRow(sessionId: string, role: string): string {
  return `- ${sessionId} (${role})`
}

/** Render one group for the list tool. */
function groupRow(group: {
  id: string
  title: string
  ownerSessionId: string
  members: readonly { sessionId: string; role: string }[]
}): string {
  const members = group.members.map(member => memberRow(member.sessionId, member.role)).join('\n')
  return `## ${group.title} (${group.id})\nowner: ${group.ownerSessionId}\n${members}`
}

/** Register the four workgroup tools and their prompt guidance. */
export function applyTools(ctx: Context): void {
  ctx.systemPrompt.section({ name: 'tool:workgroup', order: 114, text: PROMPT_TEXT })

  ctx.tools.register(defineTool({
    name: 'workgroup_create',
    description:
      'Create a durable workgroup: a named group of sessions with role labels. The calling session becomes '
      + 'the owner and first member. Use it to organize a cross-session collaboration (for example a planning '
      + 'session, an execution session, and a test session) before delegating work.',
    parameters: {
      title: {
        type: 'string',
        required: true,
        description: 'Display title of the workgroup (1-200 characters).',
      },
      members: {
        type: 'array',
        description: 'Optional initial member sessions with roles.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            session_id: { type: 'string', required: true, description: 'Session id of the member.' },
            role: { type: 'string', required: true, description: 'Role label (1-64 characters), e.g. 规划/执行/测试.' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          groupId: { type: 'string', required: true },
          title: { type: 'string', required: true },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `workgroup "${value.title}" created (${value.groupId})`,
      }],
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent)
      const view = await ctx.workgroups.create({
        title: args.title,
        owner: agent.id,
        members: (args.members ?? []).map(member => ({
          sessionId: SessionId(member.session_id),
          role: member.role,
        })),
      })
      return { groupId: view.id, title: view.title }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workgroup_list',
    description:
      'List the workgroups the calling session belongs to, with every member session and its role. Use it to '
      + 'recall which sessions collaborate on a shared effort before sending messages or reading their logs.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const agent = requireAgent(exec.agent)
      const groups = ctx.workgroups.listForSession(agent.id)
      if (groups.length === 0) return 'This session belongs to no workgroups.'
      return groups.map(group => groupRow(group)).join('\n\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workgroup_send',
    description:
      'Deliver a message to another member session of the same workgroup. The message becomes that session\'s '
      + 'next turn: if it is working, the message waits until its current turn finishes. This call returns '
      + 'confirmation of delivery, not the target\'s answer — have the target report back through the group, '
      + 'or open its session in the GUI to read the transcript. A failure means the message was NOT delivered.',
    parameters: {
      group_id: {
        type: 'string',
        required: true,
        description: 'Workgroup id returned by workgroup_create or workgroup_list.',
      },
      target_session_id: {
        type: 'string',
        required: true,
        description: 'Member session id to deliver the message to.',
      },
      message: {
        type: 'string',
        required: true,
        description: 'The message to deliver.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          delivered: { type: 'boolean', required: true },
          message_id: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.delivered ? 'message delivered to the target session' : 'message delivery failed',
      }],
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent)
      const result = await ctx.workgroups.send({
        sender: agent,
        groupId: WorkgroupId(args.group_id),
        targetSessionId: SessionId(args.target_session_id),
        content: [{ type: 'text', text: args.message }],
        signal: exec.signal,
      })
      return { delivered: true, message_id: result.messageId }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workgroup_members',
    description:
      'Manage workgroup membership: add a session, remove a session, or change a session\'s role. Roles are '
      + 'free-text labels (1-64 characters) such as 规划/执行/测试. The owner cannot be removed.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['add', 'remove', 'set_role'],
        description: 'add: add a member; remove: remove a member; set_role: change a member\'s role.',
      },
      group_id: {
        type: 'string',
        required: true,
        description: 'Workgroup id returned by workgroup_create or workgroup_list.',
      },
      session_id: {
        type: 'string',
        required: true,
        description: 'Session id of the member to add, remove, or re-role.',
      },
      role: {
        type: 'string',
        description: 'Required for add and set_role: the role label (1-64 characters).',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent)
      const groupId = WorkgroupId(args.group_id)
      const sessionId = SessionId(args.session_id)
      if (args.action !== 'remove' && (args.role === undefined || args.role === '')) {
        throw new WorkgroupError('WORKGROUP_INVALID_INPUT', 'workgroup_members add/set_role requires a role')
      }
      // The caller must belong to the group to manage it.
      const view = ctx.workgroups.get(groupId)
      if (view === undefined) {
        throw new WorkgroupError('WORKGROUP_NOT_FOUND', `workgroup "${groupId}" does not exist`)
      }
      if (!view.members.some(member => member.sessionId === agent.id)) {
        throw new WorkgroupError('WORKGROUP_NOT_MEMBER', `session "${agent.id}" is not a member of this workgroup`)
      }
      switch (args.action) {
        case 'add':
          await ctx.workgroups.addMember({ groupId, sessionId, role: args.role as string })
          return `session "${sessionId}" added to workgroup "${groupId}" with role "${args.role as string}"`
        case 'remove':
          await ctx.workgroups.removeMember(groupId, sessionId)
          return `session "${sessionId}" removed from workgroup "${groupId}"`
        case 'set_role':
          await ctx.workgroups.setRole(groupId, sessionId, args.role as string)
          return `session "${sessionId}" role set to "${args.role as string}" in workgroup "${groupId}"`
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workgroup_destroy',
    description:
      'Permanently dissolve a workgroup that the calling session owns. Only the owner can destroy a group; '
      + 'already-delivered messages stay in member session logs (they are immutable).',
    parameters: {
      group_id: {
        type: 'string',
        required: true,
        description: 'Workgroup id returned by workgroup_create or workgroup_list.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent)
      const groupId = WorkgroupId(args.group_id)
      const view = ctx.workgroups.get(groupId)
      if (view === undefined) {
        throw new WorkgroupError('WORKGROUP_NOT_FOUND', `workgroup "${groupId}" does not exist`)
      }
      if (view.ownerSessionId !== agent.id) {
        throw new WorkgroupError(
          'WORKGROUP_NOT_OWNER',
          `session "${agent.id}" is not the owner of workgroup "${groupId}"`,
        )
      }
      await ctx.workgroups.destroy(groupId)
      return `workgroup "${groupId}" destroyed`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'workgroup_status',
    description:
      'Query the delivery status of one workgroup message sent to a member session. Status is observed '
      + 'in-process and moves forward: accepted → queued → started → turn_completed | failed. '
      + 'turn_completed means the turn CONTAINING the message ended — the target may have processed other '
      + 'messages in the same turn, so it is not a per-message consumption proof. unknown means this process '
      + 'has no record (e.g. after a restart or delivery from another process).',
    parameters: {
      group_id: {
        type: 'string',
        required: true,
        description: 'Workgroup id returned by workgroup_create or workgroup_list.',
      },
      message_id: {
        type: 'string',
        required: true,
        description: 'Message id returned by workgroup_send.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent)
      const groupId = WorkgroupId(args.group_id)
      const view = ctx.workgroups.get(groupId)
      if (view === undefined) {
        throw new WorkgroupError('WORKGROUP_NOT_FOUND', `workgroup "${groupId}" does not exist`)
      }
      if (!view.members.some(member => member.sessionId === agent.id)) {
        throw new WorkgroupError('WORKGROUP_NOT_MEMBER', `session "${agent.id}" is not a member of this workgroup`)
      }
      const status = ctx.workgroups.statusOf(groupId, args.message_id as MessageId)
      return status === undefined ? 'unknown' : status
    },
  }))
}

/** Require an exact live calling agent for sender authority. */
function requireAgent(agent: Agent | undefined): Agent {
  if (agent === undefined) {
    throw new WorkgroupError('WORKGROUP_UNKNOWN', 'workgroup tools require a calling agent (exec.agent was undefined)')
  }
  return agent
}
