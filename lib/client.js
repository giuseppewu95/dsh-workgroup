window.__ModuleLoader__.load({ id: "dsh-workgroup", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/WorkgroupPanel.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
function groupRows(groups, summaries) {
  return groups.map((group) => ({
    group,
    members: group.members.map((member) => ({
      sessionId: member.sessionId,
      role: member.role,
      summary: summaries[member.sessionId]
    }))
  }));
}
function memberStatus(member, t) {
  if (member.summary === void 0) {
    return { state: "done", label: t("member.unavailable") };
  }
  if (member.summary.running) return { state: "ongoing", label: t("member.running") };
  return { state: "done", label: t("member.inactive") };
}
function lastActiveLabel(member, now, t) {
  if (member.summary === void 0 || member.summary.running) return void 0;
  const elapsed = Math.max(0, now - (member.summary.updatedAt ?? 0));
  if (elapsed < 6e4) return t("time.just_now");
  const minutes = Math.floor(elapsed / 6e4);
  if (minutes < 60) return t("time.minutes_ago", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hours_ago", { n: hours });
  return t("time.days_ago", { n: Math.floor(hours / 24) });
}
function memberTitle(member) {
  const title = member.summary?.displayTitle;
  return title === void 0 || title === "" ? member.sessionId : title;
}
function WorkgroupPanel({
  sessionId,
  useSessions,
  loadGroups,
  openMember,
  t
}) {
  const sessions = useSessions((state) => state);
  const summaries = sessions.byId;
  const [groups, setGroups] = (0, import_react.useState)([]);
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [error, setError] = (0, import_react.useState)(null);
  const [open, setOpen] = (0, import_react.useState)(false);
  const [expanded, setExpanded] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const rootRef = (0, import_react.useRef)(null);
  const triggerRef = (0, import_react.useRef)(null);
  const refresh = () => {
    setLoading(true);
    setError(null);
    void loadGroups(sessionId).then(
      (next) => {
        setGroups(next);
        setLoading(false);
      },
      (reason) => {
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      }
    );
  };
  const prevOpen = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    if (open && !prevOpen.current) refresh();
    prevOpen.current = open;
  }, [open]);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);
  const toggleBranch = (groupId) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const rows = groupRows(groups, summaries);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-wg-root", ref: rootRef, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        ref: triggerRef,
        type: "button",
        className: "dsh-wg-trigger",
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-label": t(groups.length === 0 ? "count.zero" : groups.length === 1 ? "count.one" : "count.other", { count: groups.length }),
        onClick: () => {
          setOpen(!open);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-wg-count", children: t(groups.length === 0 ? "count.zero" : groups.length === 1 ? "count.one" : "count.other", { count: groups.length }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? "dsh-wg-open" : void 0 })
        ]
      }
    ),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-wg-menu", role: "tree", "aria-label": t("tree.aria"), children: [
      loading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-wg-notice", children: "\u2026" }),
      error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-wg-error", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          t("load.error"),
          ": ",
          error
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", onClick: refresh, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconRefreshOutline14, {}),
          t("retry")
        ] })
      ] }),
      !loading && error === null && rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-wg-notice", children: t("empty") }),
      rows.map(({ group, members }) => {
        const isExpanded = expanded.has(group.id);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-wg-group", role: "treeitem", "aria-expanded": isExpanded, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: "dsh-wg-group-head",
              onClick: () => {
                toggleBranch(group.id);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronRightOutline14, { className: isExpanded ? "dsh-wg-open" : void 0 }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-wg-group-title", children: group.title }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-wg-group-meta", children: [
                  t("group.owner"),
                  ": ",
                  group.ownerSessionId
                ] })
              ]
            }
          ),
          isExpanded && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { role: "group", className: "dsh-wg-members", children: members.map((member) => {
            const status = memberStatus(member, t);
            const recent = lastActiveLabel(member, Date.now(), t);
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                type: "button",
                className: "dsh-wg-member",
                "aria-label": t("member.open"),
                onClick: () => {
                  openMember(member.sessionId);
                  setOpen(false);
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: status.state }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-wg-member-title", children: memberTitle(member) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-wg-member-role", children: member.role }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-wg-member-status", children: recent === void 0 ? status.label : `${status.label} \xB7 ${recent}` })
                ]
              },
              member.sessionId
            );
          }) })
        ] }, group.id);
      })
    ] })
  ] });
}

// src/client/locales.ts
var NS = "workgroup";
var zh = {
  "count.zero": "\u65E0\u5DE5\u4F5C\u7FA4",
  "count.one": "1 \u4E2A\u5DE5\u4F5C\u7FA4",
  "count.other": "{count} \u4E2A\u5DE5\u4F5C\u7FA4",
  "tree.aria": "\u5DE5\u4F5C\u7FA4\u6210\u5458",
  "group.owner": "\u521B\u5EFA\u8005",
  "member.open": "\u6253\u5F00\u8BE5\u4F1A\u8BDD",
  "member.running": "\u8FD0\u884C\u4E2D",
  "member.inactive": "\u7A7A\u95F2",
  "member.unavailable": "\u4E0D\u53EF\u7528",
  "time.just_now": "\u521A\u521A",
  "time.minutes_ago": "{n} \u5206\u949F\u524D",
  "time.hours_ago": "{n} \u5C0F\u65F6\u524D",
  "time.days_ago": "{n} \u5929\u524D",
  "empty": '\u672C\u4F1A\u8BDD\u4E0D\u5C5E\u4E8E\u4EFB\u4F55\u5DE5\u4F5C\u7FA4\u3002\u76F4\u63A5\u5BF9\u6A21\u578B\u8BF4"\u521B\u5EFA\u6807\u9898\u4E3A X \u7684\u5DE5\u4F5C\u7FA4"\u5373\u53EF\u5EFA\u7FA4\uFF1B\u6216\u8BA9\u5176\u4ED6\u4F1A\u8BDD\u628A\u4F60\u52A0\u5165\u5DF2\u6709\u7FA4\u3002',
  "load.error": "\u5DE5\u4F5C\u7FA4\u52A0\u8F7D\u5931\u8D25",
  "retry": "\u91CD\u8BD5"
};
var en = {
  "count.zero": "No workgroups",
  "count.one": "1 workgroup",
  "count.other": "{count} workgroups",
  "tree.aria": "Workgroup members",
  "group.owner": "Owner",
  "member.open": "Open this session",
  "member.running": "Running",
  "member.inactive": "Idle",
  "member.unavailable": "Unavailable",
  "time.just_now": "just now",
  "time.minutes_ago": "{n} min ago",
  "time.hours_ago": "{n} h ago",
  "time.days_ago": "{n} d ago",
  "empty": 'This session belongs to no workgroup. Tell the model "create a workgroup titled X" to start one, or have another session add you to an existing group.',
  "load.error": "Failed to load workgroups",
  "retry": "Retry"
};

// src/client/styles.ts
var WORKGROUP_CSS = `
.dsh-wg-root { position: relative; display: inline-flex; align-items: center; }
.dsh-wg-trigger {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  border: 1px solid var(--dsw-border, rgba(128,128,128,.35));
  background: transparent; color: inherit; font-size: 12px; cursor: pointer;
}
.dsh-wg-trigger:hover { background: var(--dsw-hover, rgba(128,128,128,.12)); }
.dsh-wg-count { white-space: nowrap; }
.dsh-wg-open { transform: rotate(90deg); transition: transform .12s ease; }
.dsh-wg-menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 50;
  min-width: 280px; max-width: 380px; max-height: 420px; overflow: auto;
  padding: 6px; border-radius: 10px;
  background: var(--dsw-surface, #fff); color: var(--dsw-text, #1a1a1a);
  border: 1px solid var(--dsw-border, rgba(128,128,128,.35));
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
}
.dsh-wg-notice, .dsh-wg-error { padding: 10px 12px; font-size: 12px; color: var(--dsw-text-muted, #666); }
.dsh-wg-error { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-wg-error button {
  display: inline-flex; align-items: center; gap: 4px;
  border: none; background: transparent; color: inherit; cursor: pointer; font-size: 12px;
}
.dsh-wg-group { display: flex; flex-direction: column; }
.dsh-wg-group-head {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 6px 8px; border: none; background: transparent; color: inherit;
  font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; border-radius: 6px;
}
.dsh-wg-group-head:hover { background: var(--dsw-hover, rgba(128,128,128,.12)); }
.dsh-wg-group-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-wg-group-meta { font-size: 11px; font-weight: 400; color: var(--dsw-text-muted, #666); }
.dsh-wg-members { display: flex; flex-direction: column; gap: 2px; padding-left: 18px; }
.dsh-wg-member {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 5px 8px; border: none; background: transparent; color: inherit;
  font-size: 12px; cursor: pointer; text-align: left; border-radius: 6px;
}
.dsh-wg-member:hover { background: var(--dsw-hover, rgba(128,128,128,.12)); }
.dsh-wg-member-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-wg-member-role { font-size: 11px; color: var(--dsw-accent, #4a6ee0); }
.dsh-wg-member-status { font-size: 11px; color: var(--dsw-text-muted, #666); }
`;

// src/client/index.ts
var inject = ["locale", "slots", "sessions"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-workgroup: dictionaries");
  if (typeof document !== "undefined" && !document.querySelector('style[data-plugin="dsh-workgroup"]')) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-workgroup";
    tag.textContent = WORKGROUP_CSS;
    document.head.appendChild(tag);
    ctx.effect(() => () => {
      tag.remove();
    }, "dsh-workgroup: stylesheet");
  }
  const face = () => ({
    loadGroups: async (sessionId) => {
      const response = await fetch(`/workgroup/list?sessionId=${encodeURIComponent(sessionId)}`);
      if (!response.ok) {
        throw new Error(`workgroup list failed: HTTP ${response.status}`);
      }
      const payload = await response.json();
      return payload.groups;
    },
    openMember: (sessionId) => {
      const sessions = ctx.get("sessions");
      if (sessions === void 0) return;
      const addressed = sessions.subagentAddress(sessionId);
      if (addressed !== void 0) {
        sessions.openSubagent(addressed);
        return;
      }
      try {
        sessions.open(sessionId);
      } catch {
      }
    }
  });
  ctx.slots.inject(
    "conversation.session.header.actions",
    () => ctx.slots.register({
      name: "conversation.session.header.actions",
      id: "workgroup-catalog",
      order: 20,
      locale: NS,
      inject: face
    }, WorkgroupPanel)
  );
}
return module.exports; } });
//# sourceMappingURL=client.js.map
