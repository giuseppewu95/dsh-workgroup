/**
 * dsh-workgroup entry: mounts the workgroup registry service, registers the
 * `workgroup_*` model tools and their prompt guidance, and (when a web
 * server is present) serves the small JSON API the browser half reads.
 *
 * @module dsh-workgroup
 */

import type { Context } from '@deepseek-ai/cordis'
import { WorkgroupRegistry } from './registry.ts'
import { applyTools, inject as toolsInject } from './tools.ts'
import { registerWorkgroupApi } from './web-api.ts'

export { WorkgroupError } from './error.ts'
export { workgroupDomainSpec, workgroupDomainState, workgroupRecord } from './spec.ts'
export type { WorkgroupDomainState, WorkgroupRecord } from './spec.ts'
export type { WorkgroupMember, WorkgroupView } from './types.ts'
export { WorkgroupId } from './types.ts'
export { WorkgroupRegistry } from './registry.ts'
export type {
  WorkgroupAddMemberOptions, WorkgroupCreateOptions, WorkgroupSendOptions, WorkgroupSendResult,
} from './registry.ts'
export { spawnWorkgroupSession } from './spawn.ts'
export type { WorkgroupSpawnOptions, WorkgroupSpawnResult } from './spawn.ts'

export const name = 'dsh-workgroup'
export const inject = ['storageDomain', ...toolsInject]

/**
 * Mount the registry and register the model tools.
 * @param ctx - host context carrying storageDomain (and, later, tools).
 */
export async function apply(ctx: Context): Promise<void> {
  await ctx.plugin(WorkgroupRegistry)
  // Tools resolve the registry through this inject face (never a row-level
  // dependency, which would deadlock on the plugin's own apply above).
  ctx.inject(['tools', 'systemPrompt', 'workgroups'], (toolsCtx) => {
    applyTools(toolsCtx)
  })
  const registry = ctx.get('workgroups') as WorkgroupRegistry | undefined
  if (registry !== undefined) {
    const dispose = registerWorkgroupApi(ctx, registry)
    if (dispose !== undefined) {
      ctx.effect(() => dispose, 'workgroup.webApi')
    }
  }
}
