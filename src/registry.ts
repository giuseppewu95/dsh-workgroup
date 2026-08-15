/**
 * Workgroup registry service (`ctx.workgroups`): durable named groups of
 * sessions with roles, plus cross-session message delivery. The registry is
 * a process singleton owned by the host composition (like `workspaceRegistry`
 * and `subagents`): the GUI and the model tools both read it across sessions.
 *
 * @module dsh-workgroup/src/registry
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { DomainGlobal, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { deliverWorkgroupMessage } from './delivery.ts'
import { WorkgroupError } from './error.ts'
import { workgroupDomainSpec, type WorkgroupDomainState, type WorkgroupRecord } from './spec.ts'
import { WorkgroupId, type WorkgroupView } from './types.ts'
import type { WorkgroupMember } from './types.ts'

export { WorkgroupError } from './error.ts'
export type { WorkgroupErrorCode } from './error.ts'
export { workgroupDomainSpec, workgroupDomainState, workgroupRecord } from './spec.ts'
export type { WorkgroupDomainState, WorkgroupRecord } from './spec.ts'
export type { WorkgroupMember, WorkgroupView } from './types.ts'
export { WorkgroupId } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    workgroups: WorkgroupRegistry
  }
  interface Events {
    'workgroup/created'(change: { groupId: WorkgroupId }): void
    'workgroup/destroyed'(change: { groupId: WorkgroupId }): void
    'workgroup/member-added'(change: WorkgroupMemberChange): void
    'workgroup/member-removed'(change: WorkgroupMemberChange): void
  }
}

/** Options for creating a workgroup. */
export interface WorkgroupCreateOptions {
  /** Display title (1..200 chars). */
  readonly title: string
  /** The creating session; becomes the owner and the first member. */
  readonly owner: SessionId
  /** Optional initial members with roles. */
  readonly members?: readonly { readonly sessionId: SessionId; readonly role: string }[]
}

/** Options for adding one member. */
export interface WorkgroupAddMemberOptions {
  readonly groupId: WorkgroupId
  readonly sessionId: SessionId
  readonly role: string
}

/** Options for sending a message to one group member. */
export interface WorkgroupSendOptions {
  /** The exact live sending Agent; its session must be a member. */
  readonly sender: Agent
  readonly groupId: WorkgroupId
  readonly targetSessionId: SessionId
  readonly content: ContentBlock[]
  readonly signal: AbortSignal
}

/** Event payload shared by the member-mutation events. */
export interface WorkgroupMemberChange {
  readonly groupId: WorkgroupId
  readonly sessionId: SessionId
  readonly role: string
}

/**
 * Durable workgroup registry. All mutations funnel through the domain write
 * chain (durability first, then memory, then `domain/changed`); reads are
 * synchronous from the in-memory record cache.
 */
export class WorkgroupRegistry extends Service {
  static inject = ['storageDomain']

  private readonly groups = new Map<WorkgroupId, WorkgroupRecord>()
  private table!: KvTable<WorkgroupId, WorkgroupRecord>
  private global!: DomainGlobal<WorkgroupDomainState>
  private state!: WorkgroupDomainState

  constructor(ctx: Context) {
    super(ctx, 'workgroups')
  }

  /** Open the domain, load records, and rebuild the cache. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(workgroupDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'workgroup.domainClose')
    this.table = domain.table('groups')
    this.global = domain.global
    this.state = domain.global.get()
    for (const [key, record] of this.table.entries()) this.groups.set(record.id, record)
    if (!this.state.initialized) {
      this.state = { initialized: true, workgroupIds: [] }
      await this.global.set(this.state)
    }
  }

  /**
   * Create a workgroup. The owner session becomes the first member.
   * @param options - title, owner, and optional initial members.
   * @returns the created view.
   */
  async create(options: WorkgroupCreateOptions): Promise<WorkgroupView> {
    const id = WorkgroupId(randomUUID())
    const now = new Date().toISOString()
    const members = [
      { sessionId: options.owner, role: 'owner', joinedAt: now },
      ...(options.members ?? []).map(member => ({ ...member, joinedAt: now })),
    ]
    const record: WorkgroupRecord = {
      id,
      title: options.title,
      ownerSessionId: options.owner,
      createdAt: now,
      updatedAt: now,
      members,
    }
    await this.table.put(id, record)
    this.groups.set(id, record)
    this.state = { ...this.state, workgroupIds: [...this.state.workgroupIds, id] }
    await this.global.set(this.state)
    this.ctx.emit('workgroup/created', { groupId: id })
    return this.viewOf(record)
  }

  /**
   * All workgroups in durable creation order.
   * @returns detached views.
   */
  list(): WorkgroupView[] {
    return this.state.workgroupIds
      .map(id => this.groups.get(id))
      .filter((record): record is WorkgroupRecord => record !== undefined)
      .map(record => this.viewOf(record))
  }

  /**
   * Workgroups one session belongs to, in durable creation order.
   * @param sessionId - the member session.
   * @returns the matching views.
   */
  listForSession(sessionId: SessionId): WorkgroupView[] {
    return this.list().filter(group => group.members.some(member => member.sessionId === sessionId))
  }

  /**
   * Look up one workgroup.
   * @param id - the workgroup id.
   * @returns the view, or `undefined` when unknown.
   */
  get(id: WorkgroupId): WorkgroupView | undefined {
    const record = this.groups.get(id)
    return record === undefined ? undefined : this.viewOf(record)
  }

  /**
   * Add a member to a workgroup.
   * @param options - group, session, and role.
   * @throws {WorkgroupError} when the group is unknown or the member already exists.
   */
  async addMember(options: WorkgroupAddMemberOptions): Promise<WorkgroupView> {
    const record = this.require(options.groupId)
    if (record.members.some(member => member.sessionId === options.sessionId)) {
      throw new WorkgroupError(
        'WORKGROUP_MEMBER_EXISTS',
        `session "${options.sessionId}" is already a member of workgroup "${options.groupId}"`,
      )
    }
    const next: WorkgroupRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      members: [
        ...record.members,
        { sessionId: options.sessionId, role: options.role, joinedAt: new Date().toISOString() },
      ],
    }
    await this.updateRecord(next)
    this.ctx.emit('workgroup/member-added', {
      groupId: options.groupId,
      sessionId: options.sessionId,
      role: options.role,
    })
    return this.viewOf(next)
  }

  /**
   * Remove a member from a workgroup. The owner cannot be removed.
   * @param groupId - the workgroup id.
   * @param sessionId - the member session id.
   * @throws {WorkgroupError} on unknown group, missing member, or owner removal.
   */
  async removeMember(groupId: WorkgroupId, sessionId: SessionId): Promise<WorkgroupView> {
    const record = this.require(groupId)
    if (sessionId === record.ownerSessionId) {
      throw new WorkgroupError('WORKGROUP_OWNER_REMOVAL', 'the owner session cannot be removed from its workgroup')
    }
    if (!record.members.some(member => member.sessionId === sessionId)) {
      throw new WorkgroupError('WORKGROUP_MEMBER_MISSING', `session "${sessionId}" is not a member`)
    }
    const next: WorkgroupRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      members: record.members.filter(member => member.sessionId !== sessionId),
    }
    await this.updateRecord(next)
    this.ctx.emit('workgroup/member-removed', { groupId, sessionId, role: '' })
    return this.viewOf(next)
  }

  /**
   * Change one member's role.
   * @param groupId - the workgroup id.
   * @param sessionId - the member session id.
   * @param role - the new role label (1..64 chars).
   * @throws {WorkgroupError} on unknown group or missing member.
   */
  async setRole(groupId: WorkgroupId, sessionId: SessionId, role: string): Promise<WorkgroupView> {
    const record = this.require(groupId)
    if (!record.members.some(member => member.sessionId === sessionId)) {
      throw new WorkgroupError('WORKGROUP_MEMBER_MISSING', `session "${sessionId}" is not a member`)
    }
    const next: WorkgroupRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      members: record.members.map(member => member.sessionId === sessionId ? { ...member, role } : member),
    }
    await this.updateRecord(next)
    return this.viewOf(next)
  }

  /**
   * Permanently destroy a workgroup. Delivered messages stay in member
   * session logs (they are immutable); only the group record is removed.
   * @param groupId - the workgroup id.
   * @throws {WorkgroupError} when the group is unknown.
   */
  async destroy(groupId: WorkgroupId): Promise<void> {
    this.require(groupId)
    await this.table.delete(groupId)
    this.groups.delete(groupId)
    this.state = { ...this.state, workgroupIds: this.state.workgroupIds.filter(id => id !== groupId) }
    await this.global.set(this.state)
    this.ctx.emit('workgroup/destroyed', { groupId })
  }

  /**
   * Deliver a message from one member to another member of the same group.
   * Authorization is durable membership: the sender's session must be a
   * member, the target must be a member, and self-send is rejected. Delivery
   * resolves the target (live, cold-resumed top-level, or the sender's
   * continuable child) and appends the `workgroup`-sourced user message.
   * @param options - sender, group, target, content, and cancellation.
   * @throws {WorkgroupError} on authorization or delivery failures; the
   *   message is not delivered on any rejection.
   */
  async send(options: WorkgroupSendOptions): Promise<void> {
    const record = this.require(options.groupId)
    if (!record.members.some(member => member.sessionId === options.sender.id)) {
      throw new WorkgroupError(
        'WORKGROUP_NOT_MEMBER',
        `session "${options.sender.id}" is not a member of workgroup "${options.groupId}"`,
      )
    }
    if (options.targetSessionId === options.sender.id) {
      throw new WorkgroupError('WORKGROUP_SELF_SEND', 'a workgroup message cannot target the sender itself')
    }
    if (!record.members.some(member => member.sessionId === options.targetSessionId)) {
      throw new WorkgroupError(
        'WORKGROUP_NOT_MEMBER',
        `session "${options.targetSessionId}" is not a member of workgroup "${options.groupId}"`,
      )
    }
    await deliverWorkgroupMessage(this.ctx, {
      sender: options.sender,
      groupId: options.groupId,
      targetSessionId: options.targetSessionId,
      content: options.content,
      signal: options.signal,
    })
  }

  private require(groupId: WorkgroupId): WorkgroupRecord {
    const record = this.groups.get(groupId)
    if (record === undefined) {
      throw new WorkgroupError('WORKGROUP_NOT_FOUND', `workgroup "${groupId}" does not exist`)
    }
    return record
  }

  private async updateRecord(next: WorkgroupRecord): Promise<void> {
    await this.table.put(next.id, next)
    this.groups.set(next.id, next)
  }

  private viewOf(record: WorkgroupRecord): WorkgroupView {
    return {
      id: record.id,
      title: record.title,
      ownerSessionId: record.ownerSessionId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      members: record.members,
    }
  }
}
