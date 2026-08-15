/**
 * Workgroup panel: lists the current session's workgroups and members with
 * roles, status, and one-click navigation. Pure presentation — data arrives
 * through props (workgroup list from the host API, session state from
 * `useSessions`), and navigation goes through injected callbacks.
 *
 * @module dsh-workgroup/src/client/WorkgroupPanel
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client';
import { NS, type WorkgroupKey } from './locales.ts';
/** Wire shape of the host `/workgroup/list` response (mirrors src/web-api.ts). */
export interface WorkgroupGroupWire {
    readonly id: string;
    readonly title: string;
    readonly ownerSessionId: string;
    readonly members: readonly {
        readonly sessionId: string;
        readonly role: string;
    }[];
}
/** Business actions supplied by the slot registration. */
export interface WorkgroupPanelInjected {
    /** Fetch the groups the given session belongs to (host JSON API). */
    loadGroups: (sessionId: SessionId) => Promise<WorkgroupGroupWire[]>;
    /** Navigate to one member session (top-level or addressed child). */
    openMember: (sessionId: SessionId) => void;
}
/** Full props after the session-header action accepts the owner currency. */
export type WorkgroupPanelProps = PropsRuntime<'conversation.session.header.actions'> & WorkgroupPanelInjected & PropsLocale<typeof NS>;
/**
 * Render the workgroup panel.
 * @param props - session kit, injected data access, and locale.
 * @returns the panel element tree.
 */
export declare function WorkgroupPanel({ sessionId, useSessions, loadGroups, openMember, t, }: WorkgroupPanelProps): import("react").JSX.Element;
/** Style-less types only; styling lives in the client bundle's injected stylesheet. */
export type { WorkgroupKey };
