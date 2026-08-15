/**
 * dsh-workgroup browser half: registers the workgroup panel into the session
 * header action row. Data flows in through injected callbacks (host JSON API
 * via same-origin fetch) and the framework session kit.
 *
 * @module dsh-workgroup/src/client
 */

import type { ClientContext, ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { WorkgroupPanel } from './WorkgroupPanel.tsx'
import type { WorkgroupGroupWire, WorkgroupPanelInjected, WorkgroupPanelProps } from './WorkgroupPanel.tsx'
import { en, NS, zh, type WorkgroupKey } from './locales.ts'
import { WORKGROUP_CSS } from './styles.ts'

export type { WorkgroupGroupWire, WorkgroupPanelInjected, WorkgroupPanelProps } from './WorkgroupPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workgroup panel copy. */
    'workgroup': WorkgroupKey
  }
}

/** Required services: locale, slots, and the sessions kit. */
export const inject = ['locale', 'slots', 'sessions']

/**
 * Client plugin body: register the locale dictionary and the panel entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-workgroup: dictionaries')

  // One injected stylesheet per document, keyed so re-evaluation is idempotent.
  if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin="dsh-workgroup"]')) {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-workgroup'
    tag.textContent = WORKGROUP_CSS
    document.head.appendChild(tag)
  }

  // The inject face closes over the host JSON API and the sessions service.
  const face = (): WorkgroupPanelInjected => ({
    loadGroups: async (sessionId: SessionId) => {
      const response = await fetch(`/workgroup/list?sessionId=${encodeURIComponent(sessionId)}`)
      if (!response.ok) {
        throw new Error(`workgroup list failed: HTTP ${response.status}`)
      }
      const payload = await response.json() as { groups: WorkgroupGroupWire[] }
      return payload.groups
    },
    openMember: (sessionId: SessionId) => {
      // Cast through the service store: the host half imports the dsh-session
      // root entry, whose `Context.sessions: SessionStore` declaration merges
      // with the runtime's ISessions face in this shared program.
      const sessions = ctx.get('sessions') as ISessions | undefined
      if (sessions === undefined) return
      const addressed = sessions.subagentAddress(sessionId)
      if (addressed !== undefined) {
        sessions.openSubagent(addressed)
        return
      }
      try {
        sessions.open(sessionId)
      } catch {
        // A member whose session is no longer listed (archived or deleted)
        // cannot be opened; the panel keeps showing it so the user can see
        // the membership, and the click is a silent no-op.
      }
    },
  })

  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'workgroup-catalog',
      order: 20,
      locale: NS,
      inject: face,
    }, WorkgroupPanel),
  )
}
