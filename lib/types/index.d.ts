/**
 * dsh-workgroup entry: mounts the workgroup registry service, registers the
 * `workgroup_*` model tools and their prompt guidance, and (when a web
 * server is present) serves the small JSON API the browser half reads.
 *
 * @module dsh-workgroup
 */
import type { Context } from '@deepseek-ai/cordis';
export { WorkgroupError } from './error.ts';
export { workgroupDomainSpec, workgroupDomainState, workgroupRecord } from './spec.ts';
export type { WorkgroupDomainState, WorkgroupRecord } from './spec.ts';
export type { WorkgroupMember, WorkgroupView } from './types.ts';
export { WorkgroupId } from './types.ts';
export { WorkgroupRegistry } from './registry.ts';
export type { WorkgroupAddMemberOptions, WorkgroupCreateOptions, WorkgroupSendOptions, WorkgroupSendResult, } from './registry.ts';
export { spawnWorkgroupSession } from './spawn.ts';
export type { WorkgroupSpawnOptions, WorkgroupSpawnResult } from './spawn.ts';
export declare const name = "dsh-workgroup";
export declare const inject: string[];
/**
 * Mount the registry and register the model tools.
 * @param ctx - host context carrying storageDomain (and, later, tools).
 */
export declare function apply(ctx: Context): Promise<void>;
