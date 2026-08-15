/**
 * Durable workgroup domain: named session groups with roles.
 *
 * Mirrors the workspace domain pattern (`@deepseek-ai/dsh-workspace`): the
 * zod schema is the durable-boundary validator, and the spec object is the
 * single source of the domain's identity, version, and record schemas.
 *
 * @module dsh-workgroup/src/spec
 */
import { z } from 'zod';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { WorkgroupId } from './types.ts';
/** One member session of a workgroup, with its free-text role (e.g. 规划/执行/测试). */
export declare const workgroupMember: z.ZodObject<{
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    role: z.ZodString;
    joinedAt: z.ZodString;
}, z.core.$strip>;
/** Durable shape of one workgroup record. Timestamps are ISO-8601 strings. */
export declare const workgroupRecord: z.ZodObject<{
    id: z.ZodPipe<z.ZodString, z.ZodTransform<WorkgroupId, string>>;
    title: z.ZodString;
    ownerSessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    members: z.ZodArray<z.ZodObject<{
        sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
        role: z.ZodString;
        joinedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** One stored workgroup record, inferred from {@link workgroupRecord}. */
export type WorkgroupRecord = z.infer<typeof workgroupRecord>;
/** Durable registry state: the authoritative display order of workgroup ids. */
export declare const workgroupDomainState: z.ZodObject<{
    initialized: z.ZodBoolean;
    workgroupIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<WorkgroupId, string>>>;
}, z.core.$strip>;
/** Durable registry state inferred from {@link workgroupDomainState}. */
export type WorkgroupDomainState = z.infer<typeof workgroupDomainState>;
/**
 * The workgroup domain spec: one `groups` table keyed by {@link WorkgroupId}
 * plus the order singleton. The registry opens this through
 * `ctx.storageDomain.open`.
 */
export declare const workgroupDomainSpec: {
    name: string;
    version: number;
    global: {
        schema: z.ZodObject<{
            initialized: z.ZodBoolean;
            workgroupIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<WorkgroupId, string>>>;
        }, z.core.$strip>;
        initial: {
            initialized: boolean;
            workgroupIds: never[];
        };
    };
    tables: {
        groups: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<WorkgroupId, {
            id: WorkgroupId;
            title: string;
            ownerSessionId: SessionId;
            createdAt: string;
            updatedAt: string;
            members: {
                sessionId: SessionId;
                role: string;
                joinedAt: string;
            }[];
        }>;
    };
};
