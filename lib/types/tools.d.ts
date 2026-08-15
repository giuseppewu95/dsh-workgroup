/**
 * Model-facing workgroup tools: create groups, list the caller's groups,
 * send cross-session messages, and manage membership. Thin adapters over
 * `ctx.workgroups`; authorization belongs to the service.
 *
 * @module dsh-workgroup/src/tools
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Services the tool registration needs. `workgroups` is resolved through the
 * inject face at registration time (see `apply` in src/index.ts), never as a
 * plugin-row dependency: the registry is mounted by the same plugin, so a
 * row-level inject would deadlock on its own apply.
 */
export declare const inject: string[];
/** Register the four workgroup tools and their prompt guidance. */
export declare function applyTools(ctx: Context): void;
