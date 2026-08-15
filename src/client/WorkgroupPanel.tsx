/**
 * Workgroup panel: lists the current session's workgroups and members with
 * roles, status, and one-click navigation. Pure presentation — data arrives
 * through props (workgroup list from the host API, session state from
 * `useSessions`), and navigation goes through injected callbacks.
 *
 * @module dsh-workgroup/src/client/WorkgroupPanel
 */

import { useEffect, useRef, useState } from 'react'
import {
  IconChevronDownOutline14, IconChevronRightOutline14, IconRefreshOutline14, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId, SessionListState, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import { NS, type WorkgroupKey } from './locales.ts'

/** Wire shape of the host `/workgroup/list` response (mirrors src/web-api.ts). */
export interface WorkgroupGroupWire {
  readonly id: string
  readonly title: string
  readonly ownerSessionId: string
  readonly members: readonly { readonly sessionId: string; readonly role: string }[]
}

/** Business actions supplied by the slot registration. */
export interface WorkgroupPanelInjected {
  /** Fetch the groups the given session belongs to (host JSON API). */
  loadGroups: (sessionId: SessionId) => Promise<WorkgroupGroupWire[]>
  /** Navigate to one member session (top-level or addressed child). */
  openMember: (sessionId: SessionId) => void
}

/** Full props after the session-header action accepts the owner currency. */
export type WorkgroupPanelProps =
  PropsRuntime<'conversation.session.header.actions'> & WorkgroupPanelInjected & PropsLocale<typeof NS>

/** Translate one key. */
type Translate = PropsLocale<typeof NS>['t']

/** One panel row of a member session. */
interface MemberRow {
  readonly sessionId: string
  readonly role: string
  readonly summary: SessionSummary | undefined
}

/** Group rows with their member rows resolved against the session list. */
function groupRows(
  groups: readonly WorkgroupGroupWire[],
  summaries: Readonly<Record<string, SessionSummary>>,
): ReadonlyArray<{ readonly group: WorkgroupGroupWire; readonly members: readonly MemberRow[] }> {
  return groups.map(group => ({
    group,
    members: group.members.map(member => ({
      sessionId: member.sessionId,
      role: member.role,
      summary: summaries[member.sessionId],
    })),
  }))
}

/** Status label and dot for one member row. */
function memberStatus(member: MemberRow, t: Translate): { state: 'ongoing' | 'done'; label: string } {
  if (member.summary === undefined) return { state: 'done', label: t('member.inactive') }
  return member.summary.running
    ? { state: 'ongoing', label: t('member.running') }
    : { state: 'done', label: t('member.inactive') }
}

/** Member row title: durable title, then id. */
function memberTitle(member: MemberRow): string {
  const title = member.summary?.displayTitle
  return title === undefined || title === '' ? member.sessionId : title
}

/**
 * Render the workgroup panel.
 * @param props - session kit, injected data access, and locale.
 * @returns the panel element tree.
 */
export function WorkgroupPanel({
  sessionId, useSessions, loadGroups, openMember, t,
}: WorkgroupPanelProps) {
  const sessions = useSessions(state => state)
  const summaries = sessions.byId
  const [groups, setGroups] = useState<readonly WorkgroupGroupWire[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const refresh = (): void => {
    setLoading(true)
    setError(null)
    void loadGroups(sessionId).then(
      (next) => {
        setGroups(next)
        setLoading(false)
      },
      (reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoading(false)
      },
    )
  }

  // Load on open and refresh when the panel becomes visible again.
  const prevOpen = useRef(false)
  useEffect(() => {
    if (open && !prevOpen.current) refresh()
    prevOpen.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => { document.removeEventListener('pointerdown', closeOutside) }
  }, [open])

  const toggleBranch = (groupId: string): void => {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const rows = groupRows(groups, summaries as Readonly<Record<string, SessionSummary>>)

  return (
    <div className="dsh-wg-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dsh-wg-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(groups.length === 0 ? 'count.zero' : groups.length === 1 ? 'count.one' : 'count.other', { count: groups.length })}
        onClick={() => { setOpen(!open) }}
      >
        <span className="dsh-wg-count">{t(groups.length === 0 ? 'count.zero' : groups.length === 1 ? 'count.one' : 'count.other', { count: groups.length })}</span>
        <IconChevronDownOutline14 className={open ? 'dsh-wg-open' : undefined} />
      </button>
      {open && (
        <div className="dsh-wg-menu" role="tree" aria-label={t('tree.aria')}>
          {loading && <div className="dsh-wg-notice">…</div>}
          {error !== null && (
            <div className="dsh-wg-error">
              <span>{t('load.error')}: {error}</span>
              <button type="button" onClick={refresh}><IconRefreshOutline14 />{t('retry')}</button>
            </div>
          )}
          {!loading && error === null && rows.length === 0 && (
            <div className="dsh-wg-notice">{t('empty')}</div>
          )}
          {rows.map(({ group, members }) => {
            const isExpanded = expanded.has(group.id)
            return (
              <div key={group.id} className="dsh-wg-group" role="treeitem" aria-expanded={isExpanded}>
                <button
                  type="button"
                  className="dsh-wg-group-head"
                  onClick={() => { toggleBranch(group.id) }}
                >
                  <IconChevronRightOutline14 className={isExpanded ? 'dsh-wg-open' : undefined} />
                  <span className="dsh-wg-group-title">{group.title}</span>
                  <span className="dsh-wg-group-meta">{t('group.owner')}: {group.ownerSessionId}</span>
                </button>
                {isExpanded && (
                  <div role="group" className="dsh-wg-members">
                    {members.map(member => {
                      const status = memberStatus(member, t)
                      return (
                        <button
                          key={member.sessionId}
                          type="button"
                          className="dsh-wg-member"
                          aria-label={t('member.open')}
                          onClick={() => { openMember(member.sessionId as SessionId); setOpen(false) }}
                        >
                          <StateDot state={status.state} />
                          <span className="dsh-wg-member-title">{memberTitle(member)}</span>
                          <span className="dsh-wg-member-role">{member.role}</span>
                          <span className="dsh-wg-member-status">{status.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Style-less types only; styling lives in the client bundle's injected stylesheet. */
export type { WorkgroupKey }
