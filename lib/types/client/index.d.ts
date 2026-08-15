/**
 * dsh-workgroup browser half: registers the workgroup panel into the session
 * header action row. Data flows in through injected callbacks (host JSON API
 * via same-origin fetch) and the framework session kit.
 *
 * @module dsh-workgroup/src/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type WorkgroupKey } from './locales.ts';
export type { WorkgroupGroupWire, WorkgroupPanelInjected, WorkgroupPanelProps } from './WorkgroupPanel.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Workgroup panel copy. */
        'workgroup': WorkgroupKey;
    }
}
/** Required services: locale, slots, and the sessions kit. */
export declare const inject: string[];
/**
 * Client plugin body: register the locale dictionary and the panel entry.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
