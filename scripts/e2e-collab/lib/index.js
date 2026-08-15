/**
 * Test-only multi-session collaboration driver (never shipped, never mounted
 * by a real profile): creates three real agents in one process — coordinator,
 * executor, tester — and lets them collaborate through the workgroup
 * capability. The coordinator forms a group, dispatches tasks to the executor
 * and tester, and they reply back through workgroup_send; the driver polls all
 * three to mutual quiescence and prints one `E2E_COLLAB_RESULT <json>` line
 * the e2e orchestrator (tests/e2e/run.mjs) asserts on.
 *
 * @module dsh-workgroup/scripts/e2e-collab
 */

import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { spawnWorkgroupSession, WorkgroupId } from 'dsh-workgroup'

export const name = 'e2e-collab-runner'
export const inject = ['agentDefaultModel', 'agents', 'sessions']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Aggregate the last assistant text from session events (mirrors dsh-headless). */
function summarize(events, firstSeq) {
  let started = false
  let text = ''
  for (const event of events) {
    if (event.seq < firstSeq) continue
    if (event.type === 'turn/start') { started = true; continue }
    if (!started) continue
    if (event.type === 'assistant/message') {
      const joined = (event.data.message.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text).join('')
      if (joined !== '') text = joined
    }
  }
  return text
}

/** Read the workgroup storage unit straight off disk for the report. */
function storageGroups() {
  const home = process.env.DSH_HOME
  if (!home) return []
  const path = `${home}/storages/workgroup.json`
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    const groups = parsed.tables?.groups ?? {}
    return Object.values(groups).map((g) => ({
      id: g.id,
      title: g.title,
      members: g.members.map((m) => ({ sessionId: m.sessionId, role: m.role })),
    }))
  } catch {
    return []
  }
}

/** Drive three agents to mutual quiescence and report the collaboration. */
async function run(ctx, io, statuses) {
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')
  if (agents === undefined || defaultModel === undefined || sessions === undefined) {
    io.stderr.write('e2e-collab: core services missing\n')
    io.exit(1)
    return
  }
  const selection = defaultModel.currentSelection()

  const makeAgent = async () => {
    const { agent } = await agents.create({
      sessionId: SessionId(`session-${randomUUID()}`),
      meta: { cwd: process.cwd() },
      agentOptions: {
        provider: selection.provider,
        model: selection.model,
      },
      setup: (agentCtx) => {
        installModelSelection(agentCtx, { current: selection, assembled: undefined })
      },
    })
    await agent.whenIdle()
    return agent
  }

  // Executor and tester exist first so the coordinator can invite them.
  const exec = await makeAgent()
  const test = await makeAgent()
  const coord = await makeAgent()

  const taskA =
    '你是跨会话协作测试中的项目协调者（规划/审查角色）。已知：执行者会话 id = ' + exec.id
    + '，测试者会话 id = ' + test.id + '，你自己的会话 id = ' + coord.id
    + '（调用 workgroup_list 可再次确认）。请严格按步骤完成一个小项目：\n'
    + '1) 调用 workgroup_create 创建标题为 e2e-collab 的工作群，members 参数包含 '
    + "{session_id: '" + exec.id + "', role: '执行'} 和 {session_id: '" + test.id + "', role: '测试'}。\n"
    + '2) 调用 workgroup_send 给 ' + exec.id + " 发消息：'请编写 Python 脚本 fib.py，输出斐波那契数列前 10 项（每行一项），完成后用 workgroup_send 把结果摘要发回给我的会话 " + coord.id + "。'\n"
    + '3) 调用 workgroup_send 给 ' + test.id + " 发消息：'请等待执行者完成（可以检查 fib.py 是否已存在，必要时隔几秒重试），然后用 workgroup_send 把你的审查意见（脚本输出是否正确）发回给我的会话 " + coord.id + "。'\n"
    + '4) 等待并接收执行者与测试者的回复。最后只输出一个 JSON 对象（不要输出其他文字）：'
    + '{\"group_id\": \"<群id>\", \"exec_reply\": \"<执行者回复摘要>\", \"test_reply\": \"<测试者回复摘要>\"}'

  io.stdout.write(`e2e-collab: coord=${coord.id}\n`)
  io.stdout.write(`e2e-collab: exec=${exec.id}\n`)
  io.stdout.write(`e2e-collab: test=${test.id}\n`)

  const firstSeq = coord.session.seq
  coord.followup(createUserMessage({ content: [{ type: 'text', text: taskA }], source: { kind: 'user' } }))

  // Poll all three to mutual quiescence (stable idle window), with a hard cap.
  const roster = [coord, exec, test]
  const startedAt = Date.now()
  const MAX_MS = 25 * 60 * 1000
  const STABLE_MS = 10000
  let stableMs = 0
  while (Date.now() - startedAt < MAX_MS) {
    await Promise.all(roster.map((agent) => agent.whenIdle()))
    const allIdle = roster.every((agent) => agent.status === 'idle')
    if (allIdle) {
      stableMs += 2000
      if (stableMs >= STABLE_MS) break
    } else {
      stableMs = 0
    }
    await sleep(2000)
  }

  for (const agent of roster) await sessions.flush(agent.session)

  // Guided spawn verification: create a fresh collaborator session with a role
  // background through the REAL agents registry, add it to the group, and
  // confirm it is live and a member.
  let spawn = null
  try {
    const group = storageGroups().find((g) => g.title === 'e2e-collab')
    if (group !== undefined) {
      const spawned = await spawnWorkgroupSession(ctx, {
        sender: coord,
        groupId: WorkgroupId(group.id),
        role: '记录员',
        background: '你是协作记录员，负责总结群内讨论与决策。',
      })
      const registry = ctx.get('workgroups')
      const view = registry?.get(WorkgroupId(group.id))
      spawn = {
        sessionId: String(spawned.sessionId),
        memberOfGroup: view?.members.some((m) => String(m.sessionId) === String(spawned.sessionId)) ?? false,
        live: ctx.get('agents')?.get(spawned.sessionId) !== undefined,
      }
    }
  } catch (error) {
    spawn = { error: error instanceof Error ? error.message : String(error) }
  }

  const report = {
    coord: coord.id,
    exec: exec.id,
    test: test.id,
    coord_final: summarize(coord.session.events, firstSeq),
    exec_final: summarize(exec.session.events, 0),
    test_final: summarize(test.session.events, 0),
    groups: storageGroups(),
    fib_exists: existsSync(`${process.cwd()}/fib.py`),
    timeout: Date.now() - startedAt >= MAX_MS,
    message_statuses: statuses,
    spawn,
  }
  io.stdout.write('E2E_COLLAB_RESULT ' + JSON.stringify(report) + '\n')
  io.exit(0)
}

export function apply(ctx) {
  const exit = ctx.get('appExit')
  if (exit === undefined) throw new Error('e2e-collab: the launcher must provide ctx.appExit')
  const io = { stdout: process.stdout, stderr: process.stderr, exit }
  // Collect every delivery-status transition observed in this process so the
  // orchestrator can assert the ack state machine against a real run.
  const statuses = []
  ctx.on('workgroup/message-status', (change) => {
    statuses.push({
      status: change.status,
      target: String(change.targetSessionId).slice(0, 12),
    })
  })
  run(ctx, io, statuses).catch((error) => {
    io.stderr.write(`e2e-collab: ${error instanceof Error ? error.message : String(error)}\n`)
    io.exit(1)
  })
}
