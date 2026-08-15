# dsh-workgroup

DeepSeek Harness 的可分发插件：带角色的持久会话分组（工作群）、跨会话消息投递，以及浏览器端成员面板。

用它可以跑真正的跨会话协作闭环——一个会话统筹/规划/审查，一个会话执行，一个会话测试验证，主会话作为协调者：

```
主会话（统筹/规划/审查） ──工作群──▶ 执行会话
        │                            │
        └────────── 工作群 ──────────▶ 测试会话
```

## 功能

| 组成 | 说明 |
|---|---|
| `ctx.workgroups` | Host 服务：持久注册表（基于 storage-domain）、成员管理、授权跨会话投递 |
| `workgroup_create` / `workgroup_list` / `workgroup_send` / `workgroup_members` / `workgroup_destroy` | 模型工具：建群、分配角色（规划/执行/测试…）、向成员会话发消息、解散自己创建的群 |
| 浏览器面板 | 会话头部按钮：列出本会话所属群与成员（角色 + 运行状态），点击成员直接打开该会话 |
| `workgroup` 消息源 | 投递到目标会话的消息以 `user/message`（`source.kind: 'workgroup'`）落日志——模型可见、可从日志重建 |

### 跨会话投递如何工作

授权依据是**持久成员关系**而非血缘：发送者会话与目标必须是同一群成员，禁止自我发送。目标按身份分派：

- **在线顶层会话**：消息作为其下一轮次送达（`agent.followup`）；
- **冷顶层会话**：按身份去重恢复一次（与内置 API 解析器一致）后送达；
- **发送者的可继续子会话**：委托 `ctx.subagents.followup`，复用子会话 inbox 与冷恢复；
- 其余情况（一次性子会话、他人子会话、未知或已删会话）：返回类型化错误，**不投递**。

## 安装

前置：dsh ≥ 0.1.0-rc.6，`web` profile（或任何挂载了 `storage-json` + `storage-domain` 的 profile）。

```sh
# 从 npm（发布后）
dsh plugin --profile web add dsh-workgroup

# 或直接从本仓库
dsh plugin --profile web add github:giuseppewu95/dsh-workgroup
```

然后重启 `dsh --profile web`。会话头部出现「工作群」按钮（有工作群时可见）。

> TUI/headless profile 同样可用：模型工具与服务与平台无关，只有浏览器面板依赖 web 界面。非 web profile 需自行挂载 `@deepseek-ai/dsh-storage-json` + `@deepseek-ai/dsh-storage-domain`（web profile 已内置）。

## 用法

1. **主会话规划**：把工作委派给 subagent，或打开你想要的会话。
2. **建群**：`workgroup_create`（标题 + 可选初始成员），之后可用 `workgroup_members add` 追加。
3. **分配角色**：`workgroup_members set_role`，标签如 `规划`、`执行`、`测试`。
4. **派发工作**：`workgroup_send` 给成员会话——消息成为该会话的下一轮次。
5. **审查**：让成员经工作群回传结果（`workgroup_send` 是双向的），或在 GUI 中打开成员会话阅读其记录，再把意见经工作群发回。
6. **实时查看**：浏览器面板显示成员角色与运行状态，点击即可打开对应会话。

```text
你（规划会话）：
  workgroup_create(title: "发布流程", members: [{session_id: "<exec>", role: "执行"}, {session_id: "<test>", role: "测试"}])
  workgroup_send(group_id: "<g>", target_session_id: "<exec>", message: "按计划实现 X，完成后发报告")
  workgroup_send(group_id: "<g>", target_session_id: "<test>", message: "等实现完成后跑回归测试")

执行会话（每条消息作为下一轮次收到）：
  ...工作...
  report: "X 已完成，见 <path>"

你：
  workgroup_send(group_id: "<g>", target_session_id: "<exec>", message: "报告已收到，请补充 <path> 的测试用例")
  workgroup_send(group_id: "<g>", target_session_id: "<test>", message: "可以开始回归")
```

## 开发

```sh
npm install
npm run typecheck    # tsc --noEmit
npm test             # vitest：单元 + 组件 + 组合
npm run build        # esbuild lib/index.js（host ESM）+ lib/client.js（浏览器）+ tsc lib/types（类型声明）
```

### 真实模型 e2e（可选）

`npm run test:e2e` 用真实模型重放完整多会话协作流程：构建一次性临时 `DSH_HOME`（系统临时目录，绝不触碰你的 profile/数据），启动 headless profile，驱动协调者/执行者/测试者三个会话走 `workgroup_create`/`workgroup_send`，并对硬证据断言——持久化的群记录、目标会话日志中的 `workgroup` 来源消息、以及协作产物。

```sh
npm run test:e2e                # 使用 ~/.dsh 凭证与 web profile 的 node_modules
E2E_CREDENTIALS_SOURCE=... npm run test:e2e   # 从其他 dsh home 取凭证
npm run test:e2e -- --keep      # 失败时保留临时 DSH_HOME 以便调试
```

无凭证时打印 `E2E_SKIP` 并以 0 退出——无 key 环境不会失败，且**不属于**常规 `npm test` 或 CI。凭证只会从 `E2E_CREDENTIALS_SOURCE`（默认 `~/.dsh`）复制进临时 home；仓库中不写入任何敏感信息。

浏览器 bundle 采用 harness 的模块加载器格式（`window.__ModuleLoader__.load`），平台模块保持 external；host 半面所有依赖 external，运行时从 profile 安装解析。

### 包结构

```
cordis.patch.yml     # bundle patch：一行同时挂载两个半面
src/index.ts         # host 入口：注册表服务 + 工具 + web API
src/registry.ts      # ctx.workgroups 服务（持久注册表 + 投递）
src/spec.ts          # storage-domain spec（zod schema）
src/delivery.ts      # 基于身份的目标准则与投递
src/tools.ts         # workgroup_* 模型工具 + prompt section
src/web-api.ts       # 供浏览器半面读取的只读 /workgroup JSON API
src/trust.ts         # /workgroup 的回环/同源围栏（镜像 harness /api）
src/error.ts         # WorkgroupError + 稳定 WORKGROUP_* 错误码
src/message-source.ts# 'workgroup' MessageSourceMap 合并
src/types.ts         # WorkgroupId 品牌 + WorkgroupView
src/client/          # 浏览器半面：WorkgroupPanel.tsx、locales、样式
tests/               # vitest（spec/registry/tools/web-api/trust/panel/composition）
docs/ARCHITECTURE.md # 设计理念（分层、投递、并发、信任、决策记录）
AGENTS.md            # 新手会话快速上手：结构、命令、设计要点
```

## 已知限制与待办

- 浏览器面板只读（列表 + 跳转）；建群与加员通过模型工具完成。
- 工作群消息是群内点对点，暂不支持群广播。
- 成员权限平等；`ownerSessionId` 仅作记录——owner 不可被移除，且只有 owner 能解散群（`workgroup_destroy`）。
- 群可跨 workspace（消息投递不校验 `cwd`）；阅读成员记录通过 GUI 打开该会话，或让成员经工作群回传结果。
- 销毁群只删除群记录；已投递消息保留在成员会话日志中（日志不可变）。
- `/workgroup` HTTP API 采用与 harness `/api` 相同的 confused-deputy 防护（回环 Host + 同源浏览器标记；因 harness 未导出其围栏，插件本地镜像同一规则）。这不是认证层；可达性仍由 webserver 绑定策略决定。
- 构建产物（`lib/`）已提交到仓库，git 安装无需构建步骤；发布前请重新 `npm run build`。

## License

MIT
