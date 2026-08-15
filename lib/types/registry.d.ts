/**
 * Workgroup registry service (`ctx.workgroups`): durable named groups of
 * sessions with roles, plus cross-session message delivery. The registry is
 * a process singleton owned by the host composition (like `workspaceRegistry`
 * and `subagents`): the GUI and the model tools both read it across sessions.
 *
 * @module dsh-workgroup/src/registry
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { WorkgroupId, type WorkgroupView } from './types.ts';
export { WorkgroupError } from './error.ts';
export type { WorkgroupErrorCode } from './error.ts';
export { workgroupDomainSpec, workgroupDomainState, workgroupRecord } from './spec.ts';
export type { WorkgroupDomainState, WorkgroupRecord } from './spec.ts';
export type { WorkgroupMember, WorkgroupView } from './types.ts';
export { WorkgroupId } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        workgroups: WorkgroupRegistry;
    }
    interface Events {
        'workgroup/created'(change: {
            groupId: WorkgroupId;
        }): void;
        'workgroup/destroyed'(change: {
            groupId: WorkgroupId;
        }): void;
        'workgroup/member-added'(change: WorkgroupMemberChange): void;
        'workgroup/member-removed'(change: WorkgroupMemberChange): void;
    }
}
/** Options for creating a workgroup. */
export interface WorkgroupCreateOptions {
    /** Display title (1..200 chars). */
    readonly title: string;
    /** The creating session; becomes the owner and the first member. */
    readonly owner: SessionId;
    /** Optional initial members with roles. */
    readonly members?: readonly {
        readonly sessionId: SessionId;
        readonly role: string;
    }[];
}
/** Options for adding one member. */
export interface WorkgroupAddMemberOptions {
    readonly groupId: WorkgroupId;
    readonly sessionId: SessionId;
    readonly role: string;
}
/** Options for sending a message to one group member. */
export interface WorkgroupSendOptions {
    /** The exact live sending Agent; its session must be a member. */
    readonly sender: Agent;
    readonly groupId: WorkgroupId;
    readonly targetSessionId: SessionId;
    readonly content: ContentBlock[];
    readonly signal: AbortSignal;
}
/** Event payload shared by the member-mutation events. */
export interface WorkgroupMemberChange {
    readonly groupId: WorkgroupId;
    readonly sessionId: SessionId;
    readonly role: string;
}
/**
 * Durable workgroup registry. All mutations funnel through the domain write
 * chain (durability first, then memory, then `domain/changed`); reads are
 * synchronous from the in-memory record cache. Every read-modify-write
 * operation is serialized on one operation chain so concurrent callers
 * cannot interleave and lose updates.
 */
export declare class WorkgroupRegistry extends Service {
    static inject: string[];
    private readonly groups;
    private table;
    private global;
    private state;
    private operationTail;
    constructor(ctx: Context);
    /** Serialize one read-modify-write operation behind all earlier ones. */
    private enqueueOperation;
    /** Open the domain, load records, and rebuild the cache. */
    protected [Service.init](): Promise<void>;
    /**
     * Create a workgroup. The owner session becomes the first member.
     * @param options - title, owner, and optional initial members.
     * @returns the created view.
     * @throws {WorkgroupError} when the title or any role violates its bounds.
     */
    create(options: WorkgroupCreateOptions): Promise<WorkgroupView>;
    /**
     * All workgroups in durable creation order.
     * @returns detached views.
     */
    list(): WorkgroupView[];
    /**
     * Workgroups one session belongs to, in durable creation order.
     * @param sessionId - the member session.
     * @returns the matching views.
     */
    listForSession(sessionId: SessionId): WorkgroupView[];
    /**
     * Look up one workgroup.
     * @param id - the workgroup id.
     * @returns the view, or `undefined` when unknown.
     */
    get(id: WorkgroupId): WorkgroupView | undefined;
    /**
     * Add a member to a workgroup.
     * @param options - group, session, and role.
     * @throws {WorkgroupError} when the group is unknown, the member already
     *   exists, or the role violates its bounds.
     */
    addMember(options: WorkgroupAddMemberOptions): Promise<WorkgroupView>;
    /**
     * Remove a member from a workgroup. The owner cannot be removed.
     * @param groupId - the workgroup id.
     * @param sessionId - the member session id.
     * @throws {WorkgroupError} on unknown group, missing member, or owner removal.
     */
    removeMember(groupId: WorkgroupId, sessionId: SessionId): Promise<WorkgroupView>;
    /**
     * Change one member's role.
     * @param groupId - the workgroup id.
     * @param sessionId - the member session id.
     * @param role - the new role label (1..64 chars).
     * @throws {WorkgroupError} on unknown group, missing member, or an out-of-bounds role.
     */
    setRole(groupId: WorkgroupId, sessionId: SessionId, role: string): Promise<WorkgroupView>;
    /**
     * Permanently destroy a workgroup. Delivered messages stay in member
     * session logs (they are immutable); only the group record is removed.
     * @param groupId - the workgroup id.
     * @throws {WorkgroupError} when the group is unknown.
     */
    destroy(groupId: WorkgroupId): Promise<void>;
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
    send(options: WorkgroupSendOptions): Promise<void>;
    private require;
    private updateRecord;
    private viewOf;
}
