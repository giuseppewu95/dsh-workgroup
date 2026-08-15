/**
 * Typed errors for workgroup operations. Every failure carries a stable
 * machine-readable `code` so tools and the GUI can map it without parsing
 * messages.
 *
 * @module dsh-workgroup/src/error
 */

/** Stable error codes produced by the workgroup service and delivery. */
export type WorkgroupErrorCode =
  | 'WORKGROUP_NOT_FOUND'
  | 'WORKGROUP_NOT_MEMBER'
  | 'WORKGROUP_SELF_SEND'
  | 'WORKGROUP_TARGET_NOT_FOUND'
  | 'WORKGROUP_TARGET_UNAVAILABLE'
  | 'WORKGROUP_TARGET_OWNED'
  | 'WORKGROUP_MEMBER_EXISTS'
  | 'WORKGROUP_MEMBER_MISSING'
  | 'WORKGROUP_OWNER_REMOVAL'
  | 'WORKGROUP_NOT_OWNER'
  | 'WORKGROUP_INVALID_INPUT'
  | 'WORKGROUP_UNKNOWN'

/** One typed workgroup failure. */
export class WorkgroupError extends Error {
  /**
   * @param code - stable machine-readable code.
   * @param message - human-readable explanation.
   * @param options - optional cause for the underlying failure.
   */
  constructor(
    readonly code: WorkgroupErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options)
    this.name = 'WorkgroupError'
  }
}
