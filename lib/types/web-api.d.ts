/**
 * Browser data channel: a small JSON API served under `/workgroup` by the
 * host half, read by the browser half via same-origin fetch. The API is
 * read-only (list the current session's groups and members); mutations stay
 * with the model tools, exactly like the rest of the GUI surface.
 *
 * @module dsh-workgroup/src/web-api
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WorkgroupRegistry } from './registry.ts';
/** Wire view of one member (plain JSON, no branded types). */
export interface WorkgroupMemberWire {
    readonly sessionId: string;
    readonly role: string;
}
/** Wire view of one group. */
export interface WorkgroupGroupWire {
    readonly id: string;
    readonly title: string;
    readonly ownerSessionId: string;
    readonly members: readonly WorkgroupMemberWire[];
}
/** Wire response of the list endpoint. */
export interface WorkgroupListResponse {
    readonly groups: readonly WorkgroupGroupWire[];
}
/** Register the `/workgroup` prefix route when a web server is present. */
export declare function registerWorkgroupApi(ctx: Context, registry: WorkgroupRegistry): (() => void) | undefined;
