// src/registry.ts
import { randomUUID } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";

// src/delivery.ts
import { createUserMessage } from "@deepseek-ai/dsh-llm";

// src/error.ts
var WorkgroupError = class extends Error {
  /**
   * @param code - stable machine-readable code.
   * @param message - human-readable explanation.
   * @param options - optional cause for the underlying failure.
   */
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
    this.name = "WorkgroupError";
  }
};

// src/delivery.ts
async function resolveDeliveryTarget(ctx, request) {
  const { sender, targetSessionId } = request;
  const agents = requireAgents(ctx);
  const live = agents.get(targetSessionId);
  if (live !== void 0) {
    if (live.session.header.origin === "subagent") {
      if (live.session.header.parentSession !== sender.id) {
        throw new WorkgroupError(
          "WORKGROUP_TARGET_OWNED",
          `workgroup target "${targetSessionId}" is a subagent child of another session`
        );
      }
      return live;
    }
    return live;
  }
  const persistence = ctx.get("sessionPersistence");
  if (persistence === void 0) {
    throw new WorkgroupError(
      "WORKGROUP_TARGET_UNAVAILABLE",
      "workgroup delivery to a cold session requires session persistence, which is not mounted"
    );
  }
  let meta;
  try {
    meta = (await persistence.list(request.signal)).find((candidate) => candidate.id === targetSessionId);
  } catch (error) {
    request.signal.throwIfAborted();
    throw new WorkgroupError(
      "WORKGROUP_TARGET_UNAVAILABLE",
      `workgroup target "${targetSessionId}" could not be inspected`
    );
  }
  if (meta === void 0 || meta.origin === "subagent") {
    throw new WorkgroupError(
      meta === void 0 ? "WORKGROUP_TARGET_NOT_FOUND" : "WORKGROUP_TARGET_OWNED",
      meta === void 0 ? `workgroup target "${targetSessionId}" does not exist` : `workgroup target "${targetSessionId}" is a subagent child and is not resumable here`
    );
  }
  const agent = await resumeOnce(ctx, agents, targetSessionId);
  return agent;
}
function requireAgents(ctx) {
  const agents = ctx.get("agents");
  if (agents === void 0) {
    throw new WorkgroupError(
      "WORKGROUP_TARGET_UNAVAILABLE",
      "workgroup delivery requires the agents service, which is not mounted"
    );
  }
  return agents;
}
var resumes = /* @__PURE__ */ new Map();
async function resumeOnce(ctx, agents, sessionId) {
  const pending = resumes.get(sessionId);
  if (pending !== void 0) return pending;
  const attempt = (async () => {
    try {
      const agentDefaultModel = ctx.get("agentDefaultModel");
      const selection = agentDefaultModel?.currentSelection();
      const handle = await agents.resume({
        resumeSessionId: sessionId,
        ...selection === void 0 ? {} : {
          agentOptions: {
            ...selection.provider === void 0 ? {} : { provider: selection.provider },
            ...selection.model === void 0 ? {} : { model: selection.model }
          }
        }
      });
      return handle.agent;
    } catch (error) {
      throw new WorkgroupError(
        "WORKGROUP_TARGET_UNAVAILABLE",
        `workgroup target "${sessionId}" could not be resumed`,
        { cause: error }
      );
    } finally {
      resumes.delete(sessionId);
    }
  })();
  resumes.set(sessionId, attempt);
  return attempt;
}
async function deliverWorkgroupMessage(ctx, request) {
  const target = await resolveDeliveryTarget(ctx, request);
  const source = {
    kind: "workgroup",
    form: "relay",
    senderSessionId: request.sender.id,
    groupId: request.groupId
  };
  if (target.session.header.origin === "subagent") {
    const subagents = ctx.get("subagents");
    if (subagents === void 0) {
      throw new WorkgroupError(
        "WORKGROUP_TARGET_UNAVAILABLE",
        "workgroup delivery to a subagent child requires the subagents service, which is not mounted"
      );
    }
    try {
      await subagents.followup(request.sender, request.targetSessionId, request.content, {
        source,
        signal: request.signal
      });
    } catch (error) {
      request.signal.throwIfAborted();
      throw new WorkgroupError(
        "WORKGROUP_TARGET_UNAVAILABLE",
        `workgroup target "${request.targetSessionId}" is not a resumable continuable child`,
        { cause: error }
      );
    }
    return;
  }
  const message = createUserMessage({ content: request.content, source });
  target.followup(message);
}

// src/spec.ts
import { z } from "zod";
import { SessionId } from "@deepseek-ai/dsh-session";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
var workgroupId = z.string().transform((value) => value);
var workgroupMember = z.object({
  sessionId: z.string().transform(SessionId),
  role: z.string().min(1).max(64),
  joinedAt: z.string()
});
var workgroupRecord = z.object({
  id: workgroupId,
  title: z.string().min(1).max(200),
  ownerSessionId: z.string().transform(SessionId),
  createdAt: z.string(),
  updatedAt: z.string(),
  members: z.array(workgroupMember)
});
var workgroupDomainState = z.object({
  initialized: z.boolean(),
  workgroupIds: z.array(workgroupId)
});
var workgroupDomainSpec = defineDomain({
  name: "workgroup",
  version: 1,
  global: {
    schema: workgroupDomainState,
    initial: { initialized: false, workgroupIds: [] }
  },
  tables: { groups: domainTable(workgroupRecord) }
});

// src/types.ts
function WorkgroupId(id) {
  return id;
}

// src/registry.ts
var ROLE_MIN = 1;
var ROLE_MAX = 64;
var TITLE_MIN = 1;
var TITLE_MAX = 200;
var WorkgroupRegistry = class extends Service {
  static inject = ["storageDomain"];
  groups = /* @__PURE__ */ new Map();
  table;
  global;
  state;
  operationTail = Promise.resolve();
  constructor(ctx) {
    super(ctx, "workgroups");
  }
  /** Serialize one read-modify-write operation behind all earlier ones. */
  enqueueOperation(operation) {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(() => void 0, () => void 0);
    return result;
  }
  /** Open the domain, load records, and rebuild the cache. */
  async [Service.init]() {
    const domain = await this.ctx.storageDomain.open(workgroupDomainSpec);
    this.ctx.effect(() => () => domain.close(), "workgroup.domainClose");
    this.table = domain.table("groups");
    this.global = domain.global;
    this.state = domain.global.get();
    for (const [key, record] of this.table.entries()) this.groups.set(record.id, record);
    if (!this.state.initialized) {
      this.state = { initialized: true, workgroupIds: [] };
      await this.global.set(this.state);
    }
  }
  /**
   * Create a workgroup. The owner session becomes the first member.
   * @param options - title, owner, and optional initial members.
   * @returns the created view.
   * @throws {WorkgroupError} when the title or any role violates its bounds.
   */
  async create(options) {
    return this.enqueueOperation(async () => {
      validateTitle(options.title);
      for (const member of options.members ?? []) validateRole(member.role);
      const id = WorkgroupId(randomUUID());
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const seen = /* @__PURE__ */ new Set([options.owner]);
      const members = [
        { sessionId: options.owner, role: "owner", joinedAt: now },
        ...(options.members ?? []).filter((member) => {
          if (seen.has(member.sessionId)) return false;
          seen.add(member.sessionId);
          return true;
        }).map((member) => ({ ...member, joinedAt: now }))
      ];
      const record = {
        id,
        title: options.title,
        ownerSessionId: options.owner,
        createdAt: now,
        updatedAt: now,
        members
      };
      await this.table.put(id, record);
      this.groups.set(id, record);
      this.state = { ...this.state, workgroupIds: [...this.state.workgroupIds, id] };
      await this.global.set(this.state);
      this.ctx.emit("workgroup/created", { groupId: id });
      return this.viewOf(record);
    });
  }
  /**
   * All workgroups in durable creation order.
   * @returns detached views.
   */
  list() {
    return this.state.workgroupIds.map((id) => this.groups.get(id)).filter((record) => record !== void 0).map((record) => this.viewOf(record));
  }
  /**
   * Workgroups one session belongs to, in durable creation order.
   * @param sessionId - the member session.
   * @returns the matching views.
   */
  listForSession(sessionId) {
    return this.list().filter((group) => group.members.some((member) => member.sessionId === sessionId));
  }
  /**
   * Look up one workgroup.
   * @param id - the workgroup id.
   * @returns the view, or `undefined` when unknown.
   */
  get(id) {
    const record = this.groups.get(id);
    return record === void 0 ? void 0 : this.viewOf(record);
  }
  /**
   * Add a member to a workgroup.
   * @param options - group, session, and role.
   * @throws {WorkgroupError} when the group is unknown, the member already
   *   exists, or the role violates its bounds.
   */
  async addMember(options) {
    return this.enqueueOperation(async () => {
      validateRole(options.role);
      const record = this.require(options.groupId);
      if (record.members.some((member) => member.sessionId === options.sessionId)) {
        throw new WorkgroupError(
          "WORKGROUP_MEMBER_EXISTS",
          `session "${options.sessionId}" is already a member of workgroup "${options.groupId}"`
        );
      }
      const next = {
        ...record,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        members: [
          ...record.members,
          { sessionId: options.sessionId, role: options.role, joinedAt: (/* @__PURE__ */ new Date()).toISOString() }
        ]
      };
      await this.updateRecord(next);
      this.ctx.emit("workgroup/member-added", {
        groupId: options.groupId,
        sessionId: options.sessionId,
        role: options.role
      });
      return this.viewOf(next);
    });
  }
  /**
   * Remove a member from a workgroup. The owner cannot be removed.
   * @param groupId - the workgroup id.
   * @param sessionId - the member session id.
   * @throws {WorkgroupError} on unknown group, missing member, or owner removal.
   */
  async removeMember(groupId, sessionId) {
    return this.enqueueOperation(async () => {
      const record = this.require(groupId);
      if (sessionId === record.ownerSessionId) {
        throw new WorkgroupError("WORKGROUP_OWNER_REMOVAL", "the owner session cannot be removed from its workgroup");
      }
      const removed = record.members.find((member) => member.sessionId === sessionId);
      if (removed === void 0) {
        throw new WorkgroupError("WORKGROUP_MEMBER_MISSING", `session "${sessionId}" is not a member`);
      }
      const next = {
        ...record,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        members: record.members.filter((member) => member.sessionId !== sessionId)
      };
      await this.updateRecord(next);
      this.ctx.emit("workgroup/member-removed", { groupId, sessionId, role: removed.role });
      return this.viewOf(next);
    });
  }
  /**
   * Change one member's role.
   * @param groupId - the workgroup id.
   * @param sessionId - the member session id.
   * @param role - the new role label (1..64 chars).
   * @throws {WorkgroupError} on unknown group, missing member, or an out-of-bounds role.
   */
  async setRole(groupId, sessionId, role) {
    return this.enqueueOperation(async () => {
      validateRole(role);
      const record = this.require(groupId);
      if (!record.members.some((member) => member.sessionId === sessionId)) {
        throw new WorkgroupError("WORKGROUP_MEMBER_MISSING", `session "${sessionId}" is not a member`);
      }
      const next = {
        ...record,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        members: record.members.map((member) => member.sessionId === sessionId ? { ...member, role } : member)
      };
      await this.updateRecord(next);
      return this.viewOf(next);
    });
  }
  /**
   * Permanently destroy a workgroup. Delivered messages stay in member
   * session logs (they are immutable); only the group record is removed.
   * @param groupId - the workgroup id.
   * @throws {WorkgroupError} when the group is unknown.
   */
  async destroy(groupId) {
    return this.enqueueOperation(async () => {
      this.require(groupId);
      await this.table.delete(groupId);
      this.groups.delete(groupId);
      this.state = { ...this.state, workgroupIds: this.state.workgroupIds.filter((id) => id !== groupId) };
      await this.global.set(this.state);
      this.ctx.emit("workgroup/destroyed", { groupId });
    });
  }
  /**
   * Deliver a message from one member to another member of the same group.
   * Authorization is durable membership: the sender's session must be a
   * member, the target must be a member, and self-send is rejected. Delivery
   * resolves the target (live, cold-resumed top-level, or the sender's
   * continuable child) and appends the `workgroup`-sourced user message.
   * @param options - sender, group, target, content, and cancellation.
   * @throws {WorkgroupError} on authorization or delivery failures; the
   *   message is not delivered on any rejection.
   */
  async send(options) {
    const record = this.require(options.groupId);
    if (!record.members.some((member) => member.sessionId === options.sender.id)) {
      throw new WorkgroupError(
        "WORKGROUP_NOT_MEMBER",
        `session "${options.sender.id}" is not a member of workgroup "${options.groupId}"`
      );
    }
    if (options.targetSessionId === options.sender.id) {
      throw new WorkgroupError("WORKGROUP_SELF_SEND", "a workgroup message cannot target the sender itself");
    }
    if (!record.members.some((member) => member.sessionId === options.targetSessionId)) {
      throw new WorkgroupError(
        "WORKGROUP_NOT_MEMBER",
        `session "${options.targetSessionId}" is not a member of workgroup "${options.groupId}"`
      );
    }
    await deliverWorkgroupMessage(this.ctx, {
      sender: options.sender,
      groupId: options.groupId,
      targetSessionId: options.targetSessionId,
      content: options.content,
      signal: options.signal
    });
  }
  require(groupId) {
    const record = this.groups.get(groupId);
    if (record === void 0) {
      throw new WorkgroupError("WORKGROUP_NOT_FOUND", `workgroup "${groupId}" does not exist`);
    }
    return record;
  }
  async updateRecord(next) {
    await this.table.put(next.id, next);
    this.groups.set(next.id, next);
  }
  viewOf(record) {
    return {
      id: record.id,
      title: record.title,
      ownerSessionId: record.ownerSessionId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      members: record.members
    };
  }
};
function validateRole(role) {
  if (typeof role !== "string" || role.length < ROLE_MIN || role.length > ROLE_MAX) {
    throw new WorkgroupError(
      "WORKGROUP_INVALID_INPUT",
      `role must be a string of ${ROLE_MIN}..${ROLE_MAX} characters`
    );
  }
}
function validateTitle(title) {
  if (typeof title !== "string" || title.length < TITLE_MIN || title.length > TITLE_MAX) {
    throw new WorkgroupError(
      "WORKGROUP_INVALID_INPUT",
      `title must be a string of ${TITLE_MIN}..${TITLE_MAX} characters`
    );
  }
}

// src/tools.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import { SessionId as SessionId2 } from "@deepseek-ai/dsh-session";
var inject = ["tools", "systemPrompt"];
var PROMPT_TEXT = "Use workgroup_create to form a named group of sessions with roles (e.g. \u89C4\u5212/\u6267\u884C/\u6D4B\u8BD5), workgroup_list to see the groups your session belongs to and their members, workgroup_send to deliver a message to another member session (it becomes that session's next turn), workgroup_members to add, remove, or re-role members, and workgroup_destroy to dissolve a group you own. Collaboration loop: delegate work to member sessions, have each member report its result back through the group with workgroup_send, and open any member session in the GUI to read its transcript.";
function memberRow(sessionId, role) {
  return `- ${sessionId} (${role})`;
}
function groupRow(group) {
  const members = group.members.map((member) => memberRow(member.sessionId, member.role)).join("\n");
  return `## ${group.title} (${group.id})
owner: ${group.ownerSessionId}
${members}`;
}
function applyTools(ctx) {
  ctx.systemPrompt.section({ name: "tool:workgroup", order: 114, text: PROMPT_TEXT });
  ctx.tools.register(defineTool({
    name: "workgroup_create",
    description: "Create a durable workgroup: a named group of sessions with role labels. The calling session becomes the owner and first member. Use it to organize a cross-session collaboration (for example a planning session, an execution session, and a test session) before delegating work.",
    parameters: {
      title: {
        type: "string",
        required: true,
        description: "Display title of the workgroup (1-200 characters)."
      },
      members: {
        type: "array",
        description: "Optional initial member sessions with roles.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            session_id: { type: "string", required: true, description: "Session id of the member." },
            role: { type: "string", required: true, description: "Role label (1-64 characters), e.g. \u89C4\u5212/\u6267\u884C/\u6D4B\u8BD5." }
          }
        }
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          groupId: { type: "string", required: true },
          title: { type: "string", required: true }
        }
      },
      render: (args, value) => [{
        type: "text",
        text: `workgroup "${value.title}" created (${value.groupId})`
      }]
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent);
      const view = await ctx.workgroups.create({
        title: args.title,
        owner: agent.id,
        members: (args.members ?? []).map((member) => ({
          sessionId: SessionId2(member.session_id),
          role: member.role
        }))
      });
      return { groupId: view.id, title: view.title };
    }
  }));
  ctx.tools.register(defineTool({
    name: "workgroup_list",
    description: "List the workgroups the calling session belongs to, with every member session and its role. Use it to recall which sessions collaborate on a shared effort before sending messages or reading their logs.",
    parameters: {},
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const agent = requireAgent(exec.agent);
      const groups = ctx.workgroups.listForSession(agent.id);
      if (groups.length === 0) return "This session belongs to no workgroups.";
      return groups.map((group) => groupRow(group)).join("\n\n");
    }
  }));
  ctx.tools.register(defineTool({
    name: "workgroup_send",
    description: "Deliver a message to another member session of the same workgroup. The message becomes that session's next turn: if it is working, the message waits until its current turn finishes. This call returns confirmation of delivery, not the target's answer \u2014 have the target report back through the group, or open its session in the GUI to read the transcript. A failure means the message was NOT delivered.",
    parameters: {
      group_id: {
        type: "string",
        required: true,
        description: "Workgroup id returned by workgroup_create or workgroup_list."
      },
      target_session_id: {
        type: "string",
        required: true,
        description: "Member session id to deliver the message to."
      },
      message: {
        type: "string",
        required: true,
        description: "The message to deliver."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          delivered: { type: "boolean", required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: value.delivered ? "message delivered to the target session" : "message delivery failed"
      }]
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent);
      await ctx.workgroups.send({
        sender: agent,
        groupId: WorkgroupId(args.group_id),
        targetSessionId: SessionId2(args.target_session_id),
        content: [{ type: "text", text: args.message }],
        signal: exec.signal
      });
      return { delivered: true };
    }
  }));
  ctx.tools.register(defineTool({
    name: "workgroup_members",
    description: "Manage workgroup membership: add a session, remove a session, or change a session's role. Roles are free-text labels (1-64 characters) such as \u89C4\u5212/\u6267\u884C/\u6D4B\u8BD5. The owner cannot be removed.",
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ["add", "remove", "set_role"],
        description: "add: add a member; remove: remove a member; set_role: change a member's role."
      },
      group_id: {
        type: "string",
        required: true,
        description: "Workgroup id returned by workgroup_create or workgroup_list."
      },
      session_id: {
        type: "string",
        required: true,
        description: "Session id of the member to add, remove, or re-role."
      },
      role: {
        type: "string",
        description: "Required for add and set_role: the role label (1-64 characters)."
      }
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent);
      const groupId = WorkgroupId(args.group_id);
      const sessionId = SessionId2(args.session_id);
      if (args.action !== "remove" && (args.role === void 0 || args.role === "")) {
        throw new WorkgroupError("WORKGROUP_INVALID_INPUT", "workgroup_members add/set_role requires a role");
      }
      const view = ctx.workgroups.get(groupId);
      if (view === void 0) {
        throw new WorkgroupError("WORKGROUP_NOT_FOUND", `workgroup "${groupId}" does not exist`);
      }
      if (!view.members.some((member) => member.sessionId === agent.id)) {
        throw new WorkgroupError("WORKGROUP_NOT_MEMBER", `session "${agent.id}" is not a member of this workgroup`);
      }
      switch (args.action) {
        case "add":
          await ctx.workgroups.addMember({ groupId, sessionId, role: args.role });
          return `session "${sessionId}" added to workgroup "${groupId}" with role "${args.role}"`;
        case "remove":
          await ctx.workgroups.removeMember(groupId, sessionId);
          return `session "${sessionId}" removed from workgroup "${groupId}"`;
        case "set_role":
          await ctx.workgroups.setRole(groupId, sessionId, args.role);
          return `session "${sessionId}" role set to "${args.role}" in workgroup "${groupId}"`;
      }
    }
  }));
  ctx.tools.register(defineTool({
    name: "workgroup_destroy",
    description: "Permanently dissolve a workgroup that the calling session owns. Only the owner can destroy a group; already-delivered messages stay in member session logs (they are immutable).",
    parameters: {
      group_id: {
        type: "string",
        required: true,
        description: "Workgroup id returned by workgroup_create or workgroup_list."
      }
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent);
      const groupId = WorkgroupId(args.group_id);
      const view = ctx.workgroups.get(groupId);
      if (view === void 0) {
        throw new WorkgroupError("WORKGROUP_NOT_FOUND", `workgroup "${groupId}" does not exist`);
      }
      if (view.ownerSessionId !== agent.id) {
        throw new WorkgroupError(
          "WORKGROUP_NOT_OWNER",
          `session "${agent.id}" is not the owner of workgroup "${groupId}"`
        );
      }
      await ctx.workgroups.destroy(groupId);
      return `workgroup "${groupId}" destroyed`;
    }
  }));
}
function requireAgent(agent) {
  if (agent === void 0) {
    throw new WorkgroupError("WORKGROUP_UNKNOWN", "workgroup tools require a calling agent (exec.agent was undefined)");
  }
  return agent;
}

// src/trust.ts
function isTrustedWorkgroupRequest(headers) {
  const host = header(headers, "host");
  if (host === void 0) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === void 0) return false;
  if (!isLoopbackHostname(hostUrl.hostname)) return false;
  if (header(headers, "sec-fetch-site") === "cross-site") return false;
  const origin = header(headers, "origin");
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}
function header(headers, name2) {
  const value = headers[name2];
  return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return void 0;
  }
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost") return true;
  if (hostname === "[::1]" || hostname === "::1") return true;
  return /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

// src/web-api.ts
function registerWorkgroupApi(ctx, registry) {
  const webServer = ctx.get("webServer");
  if (webServer === void 0) return void 0;
  return webServer.register({
    kind: "prefix",
    path: "/workgroup",
    handler: (req, res) => handleWorkgroupRequest(ctx, registry, req, res)
  });
}
function handleWorkgroupRequest(ctx, registry, req, res) {
  try {
    if (!isTrustedWorkgroupRequest(req.headers)) {
      sendJson(res, 403, { error: "untrusted request" });
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/workgroup/list" && (req.method === "GET" || req.method === "HEAD")) {
      const sessionId = url.searchParams.get("sessionId");
      if (sessionId === null || sessionId === "") {
        sendJson(res, 400, { error: "missing sessionId" });
        return;
      }
      const groups = registry.listForSession(sessionId);
      const payload = {
        groups: groups.map((group) => ({
          id: group.id,
          title: group.title,
          ownerSessionId: group.ownerSessionId,
          members: group.members.map((member) => ({
            sessionId: member.sessionId,
            role: member.role
          }))
        }))
      };
      sendJson(res, 200, payload, req.method === "HEAD");
      return;
    }
    sendJson(res, 404, { error: `unknown workgroup route ${url.pathname}` });
  } catch (error) {
    ctx.logger.warn(`workgroup api error: ${String(error)}`);
    sendJson(res, 500, { error: "internal" });
  }
}
function sendJson(res, status, payload, headOnly = false) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(headOnly ? void 0 : body);
}

// src/index.ts
var name = "dsh-workgroup";
var inject2 = ["storageDomain", ...inject];
async function apply(ctx) {
  await ctx.plugin(WorkgroupRegistry);
  ctx.inject(["tools", "systemPrompt", "workgroups"], (toolsCtx) => {
    applyTools(toolsCtx);
  });
  const registry = ctx.get("workgroups");
  if (registry !== void 0) {
    const dispose = registerWorkgroupApi(ctx, registry);
    if (dispose !== void 0) {
      ctx.effect(() => dispose, "workgroup.webApi");
    }
  }
}
export {
  WorkgroupError,
  WorkgroupId,
  WorkgroupRegistry,
  apply,
  inject2 as inject,
  name,
  workgroupDomainSpec,
  workgroupDomainState,
  workgroupRecord
};
