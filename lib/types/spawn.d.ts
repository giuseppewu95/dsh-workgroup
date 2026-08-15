/**
 * Guided collaborative-session spawning: create a fresh top-level session with
 * an optional model selection and role background, then add it to a workgroup
 * the caller belongs to. The caller is the authenticating identity (the model
 * tool's agent), so this stays inside the existing membership model — no
 * browser-facing write surface is involved.
 *
 * @module dsh-workgroup/src/spawn
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { WorkgroupId } from './types.ts';
/** One guided spawn request, already authorized by the caller's membership. */
export interface WorkgroupSpawnOptions {
    /** The exact live calling Agent (authenticating identity). */
    readonly sender: Agent;
    /** The workgroup the new session joins. */
    readonly groupId: WorkgroupId;
    /** Role label for the new member (1..64 chars). */
    readonly role: string;
    /** Optional model name; defaults to the current default selection. */
    readonly model?: string;
    /** Optional role background injected as a scoped system-prompt section. */
    readonly background?: string;
}
/** Result of a successful spawn. */
export interface WorkgroupSpawnResult {
    readonly sessionId: SessionId;
    readonly groupId: WorkgroupId;
}
/**
 * Spawn one session with the given model/background and add it to the group.
 * The new session is a fresh top-level session (a regular workgroup member),
 * created through the agents registry with a scoped setup that installs the
 * model selection and, when given, a `workgroup:role` system-prompt section
 * carrying the role background.
 */
export declare function spawnWorkgroupSession(ctx: Context, options: WorkgroupSpawnOptions): Promise<WorkgroupSpawnResult>;
