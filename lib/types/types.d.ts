/**
 * Public type surface of dsh-workgroup. Only types live here (no runtime
 * code) so both the host and client halves share one vocabulary.
 *
 * @module dsh-workgroup/src/types
 */
import type { SessionId } from '@deepseek-ai/dsh-session';
/** Identifies one workgroup record. */
export type WorkgroupId = string & {
    readonly __workgroupId: unique symbol;
};
/**
 * Brand a string as a {@link WorkgroupId}.
 * @param id - the raw group id.
 * @returns the same string, branded.
 */
export declare function WorkgroupId(id: string): WorkgroupId;
/** One member session of a workgroup with its role label. */
export interface WorkgroupMember {
    /** The member session id (top-level or continuable child). */
    readonly sessionId: SessionId;
    /** Free-text role label (e.g. 规划 / 执行 / 测试). */
    readonly role: string;
    /** ISO-8601 join time. */
    readonly joinedAt: string;
}
/** Read model of one workgroup, detached from any registry internals. */
export interface WorkgroupView {
    readonly id: WorkgroupId;
    readonly title: string;
    readonly ownerSessionId: SessionId;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly members: readonly WorkgroupMember[];
}
