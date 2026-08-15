/**
 * Workgroup message attribution: a user-role message one member session
 * addressed to another through a workgroup. Model-visible, so it is carried
 * by the target session's `user/message` event (the same "model-visible ⟺
 * logged" rule the subagent relay sources follow).
 *
 * @module dsh-workgroup/src/message-source
 */
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { WorkgroupId } from './types.ts';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        /** A message another workgroup member addressed to this session. */
        workgroup: WorkgroupMessageSource;
    }
}
/** Durable attribution for a cross-session workgroup message. */
export interface WorkgroupMessageSource {
    readonly kind: 'workgroup';
    /** A message another agent addressed to this one (`relay` context form). */
    readonly form: 'relay';
    /** Session id of the sending member. */
    readonly senderSessionId: SessionId;
    /** Workgroup id the message traveled through. */
    readonly groupId: WorkgroupId;
}
