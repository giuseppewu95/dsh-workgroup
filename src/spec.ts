/**
 * Durable workgroup domain: named session groups with roles.
 *
 * Mirrors the workspace domain pattern (`@deepseek-ai/dsh-workspace`): the
 * zod schema is the durable-boundary validator, and the spec object is the
 * single source of the domain's identity, version, and record schemas.
 *
 * @module dsh-workgroup/src/spec
 */

import { z } from 'zod'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { WorkgroupId } from './types.ts'

/** Workgroup id schema at the durable boundary; branding has no runtime representation. */
const workgroupId = z.string().transform(value => value as WorkgroupId)

/** One member session of a workgroup, with its free-text role (e.g. 规划/执行/测试). */
export const workgroupMember = z.object({
  sessionId: z.string().transform(SessionId),
  role: z.string().min(1).max(64),
  joinedAt: z.string(),
})

/** Durable shape of one workgroup record. Timestamps are ISO-8601 strings. */
export const workgroupRecord = z.object({
  id: workgroupId,
  title: z.string().min(1).max(200),
  ownerSessionId: z.string().transform(SessionId),
  createdAt: z.string(),
  updatedAt: z.string(),
  members: z.array(workgroupMember),
})

/** One stored workgroup record, inferred from {@link workgroupRecord}. */
export type WorkgroupRecord = z.infer<typeof workgroupRecord>

/** Durable registry state: the authoritative display order of workgroup ids. */
export const workgroupDomainState = z.object({
  initialized: z.boolean(),
  workgroupIds: z.array(workgroupId),
})

/** Durable registry state inferred from {@link workgroupDomainState}. */
export type WorkgroupDomainState = z.infer<typeof workgroupDomainState>

/**
 * The workgroup domain spec: one `groups` table keyed by {@link WorkgroupId}
 * plus the order singleton. The registry opens this through
 * `ctx.storageDomain.open`.
 */
export const workgroupDomainSpec = defineDomain({
  name: 'workgroup',
  version: 1,
  global: {
    schema: workgroupDomainState,
    initial: { initialized: false, workgroupIds: [] },
  },
  tables: { groups: domainTable<WorkgroupId, WorkgroupRecord>(workgroupRecord) },
})
