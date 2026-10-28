/**
 * Claude Code hook payload → compact office event.
 *
 * Shared by the server (which never stores raw payloads) and the browser demo.
 * Everything user-provided is clipped here, so file contents and long outputs
 * never reach the event log.
 */

const clip = (s, n) => {
  if (s == null) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

const shortPath = (p) => {
  if (!p) return "";
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/");
};

const host = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return clip(u, 40);
  }
};

/** Agent/Task are the delegation tools (renamed across Claude Code versions). */
export const DELEGATE_TOOLS = new Set(["Task", "Agent"]);

/** One short line describing what a tool call touches. */
export function describeTarget(tool, input) {
  const i = input && typeof input === "object" ? input : {};
  switch (tool) {
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return shortPath(i.file_path || i.notebook_path);
    case "Bash":
      return clip(i.description || i.command, 60);
    case "Grep":
    case "Glob":
      return clip(i.pattern, 50);
    case "WebFetch":
      return host(i.url);
    case "WebSearch":
      return clip(i.query, 50);
    case "Task":
    case "Agent":
      return clip(i.description || i.prompt, 60);
    case "TodoWrite":
      return `할 일 ${Array.isArray(i.todos) ? i.todos.length : 0}개`;
    case "Skill":
      return clip(i.skill || i.command, 40);
    default:
      if (tool && tool.startsWith("mcp__")) return clip(tool.split("__").slice(2).join(" "), 40);
      return clip(i.description || i.path || i.query || "", 50);
  }
}

function todosOf(input) {
  if (!input || !Array.isArray(input.todos)) return null;
  return input.todos.slice(0, 20).map((t) => ({
    text: clip(t.content || t.subject || t.activeForm, 80),
    status: ["pending", "in_progress", "completed"].includes(t.status) ? t.status : "pending",
  }));
}

function failed(resp) {
  if (!resp || typeof resp !== "object") return false;
  return resp.is_error === true || resp.success === false || (typeof resp.error === "string" && resp.error.length > 0);
}

/**
 * @param {object} raw  hook stdin JSON (see https://code.claude.com/docs/en/hooks)
 * @param {number} ts   receive time (ms)
 * @returns {object|null} office event, or null for events the office ignores
 */
export function normalize(raw, ts = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const meta = raw._pixel && typeof raw._pixel === "object" ? raw._pixel : {};
  const ev = {
    ts,
    session: clip(raw.session_id || "unknown", 80),
    agentId: raw.agent_id ? clip(raw.agent_id, 80) : null,
    agentType: raw.agent_type ? clip(raw.agent_type, 60) : null,
    project: clip(meta.repo || shortPath(raw.cwd).split("/").pop() || "", 60),
    remote: meta.remote ? clip(meta.remote, 80) : null,
  };
  const tool = raw.tool_name ? clip(raw.tool_name, 60) : null;
  switch (raw.hook_event_name) {
    case "SessionStart":
      return { ...ev, kind: "session_start", text: clip(raw.source, 20) };
    case "UserPromptSubmit":
      return { ...ev, kind: "prompt", text: clip(raw.prompt, 240) };
    case "PreToolUse": {
      const out = { ...ev, kind: "tool_start", tool, target: describeTarget(tool, raw.tool_input), useId: raw.tool_use_id || null };
      if (DELEGATE_TOOLS.has(tool)) {
        const i = raw.tool_input || {};
        out.delegate = { type: clip(i.subagent_type || "general-purpose", 60), description: clip(i.description || i.prompt, 120) };
      }
      const todos = tool === "TodoWrite" ? todosOf(raw.tool_input) : null;
      if (todos) out.todos = todos;
      return out;
    }
    case "PostToolUse":
      return { ...ev, kind: "tool_end", tool, useId: raw.tool_use_id || null, ok: !failed(raw.tool_response) };
    case "PostToolUseFailure":
      return { ...ev, kind: "tool_end", tool, useId: raw.tool_use_id || null, ok: false, text: clip(raw.error, 120) };
    case "SubagentStart":
      return { ...ev, kind: "subagent_start" };
    case "SubagentStop":
      return { ...ev, kind: "subagent_stop", text: clip(raw.last_assistant_message, 160) };
    case "Stop":
      return { ...ev, kind: "stop", text: clip(raw.last_assistant_message, 160) };
    case "StopFailure":
      return { ...ev, kind: "stop", ok: false, text: clip(raw.error || raw.reason, 120) };
    case "Notification":
      return { ...ev, kind: "notify", text: clip(raw.message, 120) };
    case "PreCompact":
      return { ...ev, kind: "compact" };
    case "SessionEnd":
      return { ...ev, kind: "session_end", text: clip(raw.reason, 40) };
    default:
      return null;
  }
}
