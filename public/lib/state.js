/**
 * Office state for one session, built by replaying its events in order.
 * Pure (no DOM): the scene and the side panels both read from it.
 *
 * Desk phases: off (nobody there yet) → think ⇄ tool → done | error → idle.
 * Time-based looks (happy for a few seconds, asleep when idle) are derived in
 * `deskLook(desk, now)` so a replayed session looks right without timers.
 */
import { ALL_DESKS, roleFor } from "./roles.js";
import { DELEGATE_TOOLS } from "./normalize.js";

export const TOOL_LABEL = {
  Read: "읽는 중",
  Write: "작성 중",
  Edit: "수정 중",
  MultiEdit: "수정 중",
  NotebookEdit: "노트북 수정",
  Bash: "실행 중",
  Grep: "검색 중",
  Glob: "파일 찾는 중",
  WebFetch: "웹 보는 중",
  WebSearch: "조사 중",
  Task: "업무 위임",
  Agent: "업무 위임",
  TodoWrite: "계획 정리",
  Skill: "스킬 사용",
};
export const toolLabel = (t) => TOOL_LABEL[t] || (t && t.startsWith("mcp__") ? "연동 도구" : t || "작업 중");

export const TOOL_ICON = {
  Read: "📖",
  Write: "📝",
  Edit: "✏️",
  MultiEdit: "✏️",
  Bash: "💻",
  Grep: "🔍",
  Glob: "🗂️",
  WebFetch: "🌐",
  WebSearch: "🔎",
  Task: "📨",
  Agent: "📨",
  TodoWrite: "📋",
};

const DONE_MS = 5000;
const ERROR_MS = 3500;
const SLEEP_MS = 60_000;
const STALE_MS = 150_000;
const LEAVE_MS = 240_000;

function newDesk(key) {
  return {
    key,
    phase: "off",
    since: 0,
    lastTs: 0,
    arrivedTs: 0,
    task: "",
    tool: null,
    target: "",
    toolCount: 0,
    errors: 0,
    agents: new Set(),
    bubble: null, // { text, ts, kind }
  };
}

export function createOffice(session = null) {
  const desks = Object.fromEntries(ALL_DESKS.map((d) => [d.key, newDesk(d.key)]));
  return {
    session,
    project: "",
    remote: null,
    desks,
    todos: [],
    request: "",
    stats: { tools: 0, delegations: 0, errors: 0, startTs: 0, lastTs: 0 },
    agentDesk: new Map(), // agent_id → desk key
    ended: false,
  };
}

function arrive(desk, ts) {
  if (desk.phase === "off" || desk.left) {
    desk.arrivedTs = ts;
    desk.left = false;
  }
}

function setPhase(desk, phase, ts) {
  desk.phase = phase;
  desk.since = ts;
  desk.lastTs = ts;
}

function say(desk, text, ts, kind = "info") {
  if (text) desk.bubble = { text, ts, kind };
}

function deskOf(o, ev) {
  if (ev.agentId && o.agentDesk.has(ev.agentId)) return o.desks[o.agentDesk.get(ev.agentId)];
  const key = roleFor(ev.agentType);
  if (ev.agentId && ev.agentType) o.agentDesk.set(ev.agentId, key);
  return o.desks[key];
}

/** Apply one normalized event (see normalize.js). Mutates and returns `o`. */
export function apply(o, ev) {
  const ts = ev.ts;
  if (!o.stats.startTs) o.stats.startTs = ts;
  o.stats.lastTs = ts;
  if (ev.project) o.project = ev.project;
  if (ev.remote) o.remote = ev.remote;
  const lead = o.desks.lead;
  if (lead.phase === "off") {
    arrive(lead, ts);
    setPhase(lead, "idle", ts);
  }
  const desk = deskOf(o, ev);

  switch (ev.kind) {
    case "session_start":
      o.ended = false;
      say(lead, "출근 완료! ☕", ts);
      break;
    case "prompt":
      o.request = ev.text;
      o.ended = false;
      setPhase(lead, "think", ts);
      say(lead, ev.text, ts, "prompt");
      break;
    case "tool_start": {
      arrive(desk, ts);
      setPhase(desk, "tool", ts);
      desk.tool = ev.tool;
      desk.target = ev.target;
      desk.toolCount++;
      o.stats.tools++;
      if (ev.todos) o.todos = ev.todos;
      if (ev.delegate) {
        const to = o.desks[roleFor(ev.delegate.type)];
        arrive(to, ts);
        setPhase(to, "think", ts);
        to.task = ev.delegate.description;
        to.pending = (to.pending || 0) + 1;
        say(to, ev.delegate.description, ts, "task");
        o.stats.delegations++;
        say(desk, `→ ${ALL_DESKS.find((d) => d.key === to.key).name}팀: ${ev.delegate.description}`, ts, "delegate");
      } else {
        say(desk, `${TOOL_ICON[ev.tool] || "🛠️"} ${ev.target || toolLabel(ev.tool)}`, ts, "tool");
      }
      break;
    }
    case "tool_end": {
      if (ev.ok === false) {
        desk.errors++;
        o.stats.errors++;
        setPhase(desk, "error", ts);
        say(desk, ev.text ? `앗, 실패: ${ev.text}` : "앗, 다시 해볼게요", ts, "error");
      } else if (desk.phase === "tool") {
        setPhase(desk, "think", ts);
      } else {
        desk.lastTs = ts;
      }
      // the main thread's Agent/Task call returns when the subagent is finished
      if (!ev.agentType && DELEGATE_TOOLS.has(ev.tool)) {
        const busy = Object.values(o.desks).find((d) => d.key !== "lead" && d.pending > 0 && !d.agents.size && ["think", "tool"].includes(d.phase));
        if (busy) {
          busy.pending--;
          setPhase(busy, "done", ts);
        }
      }
      break;
    }
    case "subagent_start":
      arrive(desk, ts);
      desk.agents.add(ev.agentId || "?");
      setPhase(desk, "think", ts);
      break;
    case "subagent_stop":
      desk.agents.delete(ev.agentId || "?");
      if (desk.pending > 0) desk.pending--;
      if (!desk.agents.size) setPhase(desk, "done", ts);
      say(desk, ev.text || "완료했습니다! ✅", ts, "done");
      break;
    case "stop":
      setPhase(lead, ev.ok === false ? "error" : "done", ts);
      say(lead, ev.ok === false ? "문제가 생겼어요" : ev.text || "요청 처리 완료!", ts, ev.ok === false ? "error" : "done");
      break;
    case "notify":
      setPhase(lead, "wait", ts);
      say(lead, `🔔 ${ev.text || "확인이 필요해요"}`, ts, "notify");
      break;
    case "compact":
      say(lead, "🧹 메모 정리 중…", ts);
      break;
    case "session_end":
      o.ended = true;
      for (const d of Object.values(o.desks)) if (d.phase !== "off") setPhase(d, "idle", ts);
      say(lead, "오늘 업무 끝! 👋", ts);
      break;
  }
  return o;
}

/**
 * What a desk looks like at `now`:
 *  - anim: sprite motion (sit | interact | happy | sad | sleep | idle)
 *  - status: short label for panels
 *  - present: character is at the desk (false → walks out / empty desk)
 */
export function deskLook(d, now, ended = false) {
  if (d.phase === "off") return { anim: null, status: "출근 전", tone: "off", present: false };
  const age = now - d.since;
  const quiet = now - d.lastTs;
  let phase = d.phase;
  if (phase === "done" && age > DONE_MS) phase = "idle";
  if (phase === "error" && age > ERROR_MS) phase = d.agents.size ? "think" : "idle";
  if ((phase === "think" || phase === "tool") && quiet > STALE_MS) phase = "idle";
  if (phase === "wait" && quiet > STALE_MS) phase = "idle";
  const present = d.key === "lead" ? !ended || quiet < 20_000 : !(phase === "idle" && quiet > LEAVE_MS);
  switch (phase) {
    case "tool":
      return { anim: "interact", status: toolLabel(d.tool), tone: "busy", present };
    case "think":
      return { anim: "sit", status: d.key === "lead" ? "생각 중" : "업무 파악 중", tone: "busy", present };
    case "wait":
      return { anim: "idle", status: "승인 대기", tone: "wait", present };
    case "done":
      return { anim: "happy", status: "완료!", tone: "done", present };
    case "error":
      return { anim: "sad", status: "오류", tone: "error", present };
    default:
      return quiet > SLEEP_MS ? { anim: "sleep", status: "휴식 중", tone: "idle", present } : { anim: "sit", status: "대기", tone: "idle", present };
  }
}

/** Sessions seen in an event list, newest activity first. */
export function listSessions(events) {
  const m = new Map();
  for (const e of events) {
    let s = m.get(e.session);
    if (!s) {
      s = { id: e.session, first: e.ts, last: e.ts, count: 0, project: "", title: "", remote: null };
      m.set(e.session, s);
    }
    s.last = Math.max(s.last, e.ts);
    s.count++;
    if (e.project) s.project = e.project;
    if (e.remote) s.remote = e.remote;
    if (e.kind === "prompt" && !s.title) s.title = e.text;
  }
  return [...m.values()].sort((a, b) => b.last - a.last);
}
