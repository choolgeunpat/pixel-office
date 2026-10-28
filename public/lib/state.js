/**
 * Office state for one session, built by replaying its events in order.
 * Pure (no DOM): the scene, the overlay and the side panel all read from it.
 *
 * Desk phases: off (nobody there yet) → think ⇄ tool → done | error | wait → idle.
 * Time-based looks (happy for a few seconds, coffee break, asleep) are derived in
 * `deskLook(desk, now)` so a replayed session looks right without timers.
 */
import { ALL_DESKS, deskByKey, roleFor } from "./roles.js";
import { DELEGATE_TOOLS } from "./normalize.js";
import { action, STATUS } from "./plain.js";

const DONE_MS = 5000;
const ERROR_MS = 3500;
const BREAK_MS = 20_000;
const SLEEP_MS = 80_000;
const STALE_MS = 150_000;
const LEAVE_MS = 300_000;

/** coins earned: a finished request, a finished teammate, a checked-off to-do */
export const REWARD = { ticket: 10, qa: 5, teammate: 5, todo: 2 };

export const teamName = (key) => (key === "lead" ? "팀장" : `${deskByKey[key].name}팀`);

function newDesk(key) {
  return {
    key,
    phase: "off",
    since: 0,
    lastTs: 0,
    act: null, // current tool action (plain wording)
    task: "", // what the lead handed over
    last: "", // last result this desk reported
    toolCount: 0,
    errors: 0,
    pending: 0,
    agents: new Set(),
    bubble: null, // { text, ts, kind } — short-lived speech bubble
    left: false,
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
    todoDone: 0,
    request: "",
    tickets: [], // one per request: { id, title, startTs, endTs, status: doing|done|failed, tools, teams:Set }
    feed: [], // plain-language "what just happened", newest last
    rewards: [], // { ts, amount, desk, why }
    earned: 0,
    stats: { tools: 0, delegations: 0, errors: 0, startTs: 0, lastTs: 0 },
    agentDesk: new Map(), // agent_id → desk key
    ended: false,
  };
}

function arrive(desk, ts) {
  if (desk.phase === "off") desk.arrivedTs = ts;
}

function setPhase(desk, phase, ts) {
  desk.phase = phase;
  desk.since = ts;
  desk.lastTs = ts;
}

function say(desk, text, ts, kind = "info") {
  if (text) desk.bubble = { text, ts, kind };
}

function note(o, key, icon, text, ts) {
  const last = o.feed[o.feed.length - 1];
  if (last && last.desk === key && last.text === text) return;
  o.feed.push({ ts, desk: key, icon, text });
  if (o.feed.length > 80) o.feed.splice(0, o.feed.length - 80);
}

function reward(o, amount, desk, ts, why) {
  o.rewards.push({ ts, amount, desk, why });
  o.earned += amount;
}

function deskOf(o, ev) {
  if (ev.agentId && o.agentDesk.has(ev.agentId)) return o.desks[o.agentDesk.get(ev.agentId)];
  const key = roleFor(ev.agentType);
  if (ev.agentId && ev.agentType) o.agentDesk.set(ev.agentId, key);
  return o.desks[key];
}

const currentTicket = (o) => o.tickets[o.tickets.length - 1];

function closeTicket(o, status, ts) {
  const t = currentTicket(o);
  if (!t || t.status !== "doing") return null;
  t.status = status;
  t.endTs = ts;
  return t;
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
      say(lead, "좋은 아침이에요! ☕", ts);
      note(o, "lead", "☀️", "팀장이 출근했어요", ts);
      break;
    case "prompt": {
      o.request = ev.text;
      o.ended = false;
      closeTicket(o, "done", ts);
      o.tickets.push({ id: o.tickets.length + 1, title: ev.text, startTs: ts, endTs: 0, status: "doing", tools: 0, teams: new Set() });
      if (o.tickets.length > 30) o.tickets.shift();
      setPhase(lead, "think", ts);
      lead.act = null;
      say(lead, ev.text, ts, "request");
      note(o, "lead", "💬", `새 의뢰가 들어왔어요: ${ev.text}`, ts);
      break;
    }
    case "tool_start": {
      arrive(desk, ts);
      setPhase(desk, "tool", ts);
      desk.act = { ...action(ev.tool, ev.target, ev.cmdKind), tool: ev.tool };
      desk.toolCount++;
      o.stats.tools++;
      const tk = currentTicket(o);
      if (tk && tk.status === "doing") {
        tk.tools++;
        tk.teams.add(desk.key);
      }
      if (ev.todos) {
        o.todos = ev.todos;
        const done = ev.todos.filter((t) => t.status === "completed").length;
        if (done > o.todoDone) reward(o, (done - o.todoDone) * REWARD.todo, desk.key, ts, "todo");
        o.todoDone = done;
      }
      if (ev.delegate) {
        const to = o.desks[roleFor(ev.delegate.type)];
        arrive(to, ts);
        setPhase(to, "think", ts);
        to.task = ev.delegate.description;
        to.pending++;
        say(to, ev.delegate.description, ts, "task");
        o.stats.delegations++;
        desk.act = { ...desk.act, detail: `${teamName(to.key)} · ${ev.delegate.description}` };
        note(o, desk.key, "📨", `${teamName(desk.key)}이 ${teamName(to.key)}에 일을 맡겼어요: ${ev.delegate.description}`, ts);
      } else if (ev.tool !== "TodoWrite") {
        note(o, desk.key, desk.act.icon, `${teamName(desk.key)} · ${desk.act.long}${desk.act.detail ? ` (${desk.act.detail})` : ""}`, ts);
      }
      break;
    }
    case "tool_end": {
      if (ev.ok === false) {
        desk.errors++;
        o.stats.errors++;
        setPhase(desk, "error", ts);
        say(desk, "앗, 잘 안 됐어요. 다시 해볼게요", ts, "error");
        note(o, desk.key, "😵", `${teamName(desk.key)}에서 문제가 생겨서 다시 시도해요`, ts);
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
      note(o, desk.key, "🚪", `${teamName(desk.key)}이 일을 시작했어요`, ts);
      break;
    case "subagent_stop":
      desk.agents.delete(ev.agentId || "?");
      if (desk.pending > 0) desk.pending--;
      if (!desk.agents.size) setPhase(desk, "done", ts);
      desk.last = ev.text || "";
      desk.task = "";
      say(desk, ev.text || "다 끝냈어요! ✅", ts, "done");
      reward(o, REWARD.teammate, desk.key, ts, "teammate");
      note(o, desk.key, "✅", `${teamName(desk.key)}이 일을 마쳤어요${ev.text ? `: ${ev.text}` : ""}`, ts);
      break;
    case "stop": {
      const failed = ev.ok === false;
      setPhase(lead, failed ? "error" : "done", ts);
      lead.act = null;
      lead.last = ev.text || "";
      const t = closeTicket(o, failed ? "failed" : "done", ts);
      say(lead, failed ? "문제가 생겼어요" : ev.text || "의뢰를 끝냈어요!", ts, failed ? "error" : "done");
      if (t && !failed) reward(o, t.tools > 0 ? REWARD.ticket : REWARD.qa, "lead", ts, "ticket");
      note(o, "lead", failed ? "⚠️" : "🎉", failed ? "의뢰 처리 중 문제가 생겼어요" : "의뢰를 끝냈어요", ts);
      break;
    }
    case "notify":
      setPhase(lead, "wait", ts);
      say(lead, ev.text || "확인이 필요해요", ts, "notify");
      note(o, "lead", "✋", `대표님 확인이 필요해요${ev.text ? `: ${ev.text}` : ""}`, ts);
      break;
    case "compact":
      say(lead, "메모를 정리하는 중이에요 🧹", ts);
      break;
    case "session_end":
      o.ended = true;
      for (const d of Object.values(o.desks)) if (d.phase !== "off") setPhase(d, "idle", ts);
      closeTicket(o, "done", ts);
      say(lead, "오늘 업무 끝! 👋", ts);
      note(o, "lead", "👋", "오늘 업무를 마쳤어요", ts);
      break;
  }
  return o;
}

/**
 * What a desk looks like at `now`:
 *  anim     sprite motion (sit | interact | happy | sad | sleep | idle)
 *  status   short label for chips ("자료 읽는 중")
 *  tone     busy | done | error | wait | idle | coffee | off
 *  present  the character is in the office (false → walked out / empty desk)
 *  coffee   the character is at the coffee machine
 */
export function deskLook(d, now, ended = false) {
  if (d.phase === "off") return { anim: null, status: STATUS.off, tone: "off", present: false, coffee: false };
  const age = now - d.since;
  const quiet = now - d.lastTs;
  let phase = d.phase;
  if (phase === "done" && age > DONE_MS) phase = "idle";
  if (phase === "error" && age > ERROR_MS) phase = d.agents.size ? "think" : "idle";
  if ((phase === "think" || phase === "tool") && quiet > STALE_MS) phase = "idle";
  if (phase === "wait" && quiet > STALE_MS) phase = "idle";
  const present = d.key === "lead" ? !ended || quiet < 20_000 : !(phase === "idle" && quiet > LEAVE_MS);
  const mk = (anim, status, tone, coffee = false) => ({ anim, status, tone, present, coffee });
  switch (phase) {
    case "tool":
      return mk("interact", (d.act && d.act.short) || "작업 중", "busy");
    case "think":
      return mk("sit", d.key === "lead" ? STATUS.think : STATUS.thinkWorker, "busy");
    case "wait":
      return mk("idle", STATUS.wait, "wait");
    case "done":
      return mk("happy", STATUS.done, "done");
    case "error":
      return mk("sad", STATUS.error, "error");
    default:
      if (quiet < BREAK_MS) return mk("sit", STATUS.idle, "idle");
      if (quiet < SLEEP_MS) return mk("idle", STATUS.coffee, "coffee", true);
      return mk("sleep", STATUS.sleep, "idle");
  }
}

/** The second line of a desk card: what exactly they are working on. */
export function deskDetail(o, d, look) {
  if (look.tone === "off") return "";
  if (look.tone === "busy") {
    if (d.act && d.act.detail && look.anim === "interact") return d.act.detail;
    if (d.key === "lead") return o.request;
    return d.task;
  }
  if (look.tone === "wait") return "";
  if (look.tone === "done" || look.tone === "idle" || look.tone === "coffee") return d.last;
  return "";
}

/** One sentence for the "right now" strip. */
export function headline(o, now) {
  if (!o || !o.stats.startTs) return { text: "출근 대기 중 · 일을 맡겨 보세요", tone: "idle", busy: 0 };
  const looks = ALL_DESKS.map((x) => ({ d: o.desks[x.key], look: deskLook(o.desks[x.key], now, o.ended) }));
  if (looks.find((x) => x.d.key === "lead" && x.look.tone === "wait")) return { text: "대표님, 확인이 필요해요 ✋", tone: "wait", busy: 0 };
  const busy = looks.filter((x) => x.look.tone === "busy");
  if (busy.length) {
    const first = busy
      .slice(0, 2)
      .map((x) => `${teamName(x.d.key)} ${x.look.status}`)
      .join(" · ");
    return { text: `${first}${busy.length > 2 ? ` 외 ${busy.length - 2}명` : ""}`, tone: "busy", busy: busy.length };
  }
  if (looks.some((x) => x.look.tone === "error")) return { text: "잠깐 문제가 있었어요, 다시 해보는 중", tone: "error", busy: 0 };
  if (looks.some((x) => x.look.tone === "coffee")) return { text: "☕ 잠깐 커피 타임이에요", tone: "idle", busy: 0 };
  return { text: "지금은 모두 쉬는 중이에요", tone: "idle", busy: 0 };
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
