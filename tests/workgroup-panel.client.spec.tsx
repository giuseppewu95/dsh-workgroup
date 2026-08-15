// @vitest-environment jsdom
/**
 * WorkgroupPanel component tests: rendering, expansion, member navigation,
 * and error states with driven props.
 *
 * @module dsh-workgroup/tests/workgroup-panel.client
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, screen } from '@testing-library/react'
import { WorkgroupPanel } from '../src/client/WorkgroupPanel.tsx'
import type { WorkgroupGroupWire, WorkgroupPanelProps } from '../src/client/WorkgroupPanel.tsx'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import { SessionId } from '@deepseek-ai/dsh-session'

afterEach(() => { cleanup() })

/** Build the full component props with driven data. */
function props(overrides: {
  groups?: WorkgroupGroupWire[]
  summaries?: Record<string, SessionSummary>
  loadError?: Error
  openMember?: (sessionId: string) => void
} = {}): WorkgroupPanelProps {
  const groups = overrides.groups ?? []
  const summaries = overrides.summaries ?? {}
  const state = {
    ids: Object.keys(summaries).map(SessionId),
    byId: summaries,
    current: undefined,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as SessionListState
  return {
    sessionId: SessionId('s1'),
    useSessions: (selector: (state: SessionListState) => unknown) => selector(state),
    useSession: () => ({}),
    useProjection: () => undefined,
    useWorkspaces: () => ({}),
    loadGroups: overrides.loadError === undefined
      ? vi.fn(async () => groups)
      : vi.fn(async () => { throw overrides.loadError }),
    openMember: overrides.openMember ?? vi.fn(),
    t: ((key: string, params?: Record<string, unknown>) => {
      const dict: Record<string, string> = {
        'count.zero': '无工作群',
        'count.one': '1 个工作群',
        'count.other': '{count} 个工作群',
        'tree.aria': '工作群成员',
        'group.owner': '创建者',
        'member.open': '打开该会话',
        'member.running': '运行中',
        'member.inactive': '空闲',
        'empty': '本会话不属于任何工作群。',
        'load.error': '工作群加载失败',
        'retry': '重试',
      }
      const text = dict[key] ?? key
      return params === undefined
        ? text
        : text.replaceAll('{count}', String(params.count))
    }) as never,
  } as unknown as WorkgroupPanelProps
}

const summary = (id: string, running: boolean, title: string): SessionSummary => ({
  id: SessionId(id),
  displayTitle: title,
  running,
  blank: false,
  updatedAt: 0,
})

describe('WorkgroupPanel', () => {
  it('shows the group count on the trigger', async () => {
    const groups: WorkgroupGroupWire[] = [{
      id: 'g1', title: '开发组', ownerSessionId: 's1',
      members: [{ sessionId: 's1', role: 'owner' }],
    }]
    render(<WorkgroupPanel {...props({ groups })} />)
    // The trigger opens the panel, which triggers the load; the count label
    // updates after the fetch resolves.
    fireEvent.click(screen.getByRole('button', { name: '无工作群' }))
    expect(await screen.findByRole('button', { name: '1 个工作群' })).toBeTruthy()
  })

  it('opens the menu and lists members with roles and status', async () => {
    const groups: WorkgroupGroupWire[] = [{
      id: 'g1', title: '开发组', ownerSessionId: 's1',
      members: [
        { sessionId: 's1', role: 'owner' },
        { sessionId: 's2', role: '执行' },
      ],
    }]
    const openMember = vi.fn()
    render(<WorkgroupPanel {...props({
      groups,
      summaries: {
        s1: summary('s1', false, '规划会话'),
        s2: summary('s2', true, '执行会话'),
      },
      openMember,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: '无工作群' }))
    // Expand the group after the fetch resolves.
    fireEvent.click(await screen.findByText('开发组'))
    expect(await screen.findByText('执行会话')).toBeTruthy()
    expect(screen.getByText('执行')).toBeTruthy()
    expect(screen.getByText('运行中')).toBeTruthy()
    // Navigate to the member.
    fireEvent.click(screen.getByText('执行会话'))
    expect(openMember).toHaveBeenCalledWith('s2')
  })

  it('shows the empty state when the session belongs to no group', async () => {
    render(<WorkgroupPanel {...props({ groups: [] })} />)
    fireEvent.click(screen.getByRole('button', { name: '无工作群' }))
    expect(await screen.findByText('本会话不属于任何工作群。')).toBeTruthy()
  })

  it('shows load errors with a retry', async () => {
    const { unmount } = render(<WorkgroupPanel {...props({ loadError: new Error('boom') })} />)
    fireEvent.click(screen.getByRole('button', { name: '无工作群' }))
    expect(await screen.findByText(/工作群加载失败/)).toBeTruthy()
    expect(screen.getByText('重试')).toBeTruthy()
    unmount()
  })
})
