import { normalize } from "./lib/normalize.js";
import { ALL_DESKS, LEAD, ROLES, deskByKey, roleFor } from "./lib/roles.js";
import { apply, createOffice, deskLook, listSessions, toolLabel, TOOL_ICON } from "./lib/state.js";
import { startDemo } from "./lib/sim.js";
import { loadMeta, Character } from "./office/sprites.js";
import { OfficeScene } from "./office/scene.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ------------------------------------------------------------------ route
const path = location.pathname;
const roomKey = (path.match(/^\/r\/([A-Za-z0-9_-]{12,64})\/?$/) || [])[1] || null;
const isDemo = !roomKey;
const ORIGIN = location.origin;
const roomUrl = roomKey ? `${ORIGIN}/r/${roomKey}` : null;

// ------------------------------------------------------------------ state
let events = [];
let selected = "auto"; // session id or "auto" (follow the latest active session)
let office = createOffice();
let officeSession = null;
let clockOffset = 0; // browser clock − server clock
let stopDemo = null;
let seq = 0;

const scene = new OfficeScene($("#office"));
const now = () => Date.now() - clockOffset;

function currentSession() {
  if (selected !== "auto") return selected;
  return listSessions(events)[0]?.id ?? null;
}

function rebuild() {
  const sid = currentSession();
  officeSession = sid;
  office = createOffice(sid);
  for (const e of events) if (e.session === sid) apply(office, e);
  scene.setOffice(office, { instant: true });
  renderLog(true);
  renderPanels();
}

function onEvent(ev) {
  events.push(ev);
  if (events.length > 5000) events.splice(0, events.length - 5000);
  const sid = currentSession();
  if (sid !== officeSession) return rebuild();
  if (ev.session === sid) {
    apply(office, ev);
    appendLog(ev);
  }
  renderSessions();
}

// ------------------------------------------------------------------ data sources
function connectRoom() {
  const conn = $("#conn");
  const set = (cls, text) => {
    conn.className = `conn ${cls}`;
    conn.querySelector("span").textContent = text;
  };
  const es = new EventSource(`/api/r/${roomKey}/stream`);
  es.addEventListener("snapshot", (m) => {
    const data = JSON.parse(m.data);
    events = data.events || [];
    if (data.now) clockOffset = Date.now() - data.now;
    set("on", "실시간 연결됨");
    rebuild();
    $("#empty").hidden = events.length > 0;
  });
  es.addEventListener("ev", (m) => {
    const ev = JSON.parse(m.data);
    if (ev.kind === "_clear") {
      events = [];
      rebuild();
      $("#empty").hidden = false;
      return;
    }
    // server stamps events on receipt, so a live event tells us the clock skew
    clockOffset = Date.now() - ev.ts;
    $("#empty").hidden = true;
    onEvent(ev);
  });
  es.onerror = () => set("off", "재연결 중…");
}

function runDemo() {
  stopDemo?.();
  events = [];
  clockOffset = 0;
  rebuild();
  stopDemo = startDemo((raw) => {
    const ev = normalize(raw, Date.now());
    if (!ev) return;
    ev.id = ++seq;
    onEvent(ev);
  });
}

// ------------------------------------------------------------------ panels
const avatars = {};
function avatar(key) {
  if (!avatars[key]) {
    const c = document.createElement("canvas");
    c.width = c.height = 40;
    new Character(deskByKey[key].look).bust(40).then((b) => c.getContext("2d").drawImage(b, 0, 0));
    avatars[key] = c;
  }
  return avatars[key];
}

const ago = (ts) => {
  const s = Math.max(0, Math.round((now() - ts) / 1000));
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};
const clock = (ts) => new Date(ts + clockOffset).toLocaleTimeString("en-GB");
const sessionLink = (remote) => (remote ? `https://claude.ai/code/${remote.replace(/^cse_/, "session_")}` : null);

function renderSessions() {
  const list = listSessions(events);
  $("#sessionCount").textContent = list.length ? `${list.length}개` : "";
  const sid = currentSession();
  const auto = `<button class="session ${selected === "auto" ? "sel" : ""}" data-s="auto"><b>⚡ 자동 따라가기</b><p>가장 최근에 활동한 세션을 보여줘요</p></button>`;
  $("#sessions").innerHTML =
    auto +
    list
      .map((s) => {
        const live = now() - s.last < 90_000;
        const link = sessionLink(s.remote);
        return `<button class="session ${selected === s.id || (selected === "auto" && false) ? "sel" : ""}" data-s="${esc(s.id)}">
          <b>${live ? '<i class="live"></i>' : ""}${esc(s.project || "세션")}${s.id === sid && selected === "auto" ? ' <small class="muted">· 표시 중</small>' : ""}</b>
          <p>${esc(s.title || s.id)}</p>
          <div class="meta"><span>${s.count} events · ${ago(s.last)}</span>${link ? `<a href="${link}" target="_blank" rel="noopener" title="claude.ai에서 세션 열기">열기 ↗</a>` : ""}</div>
        </button>`;
      })
      .join("");
}

$("#sessions").addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const b = e.target.closest("[data-s]");
  if (!b) return;
  selected = b.dataset.s;
  rebuild();
});

function renderPanels() {
  renderSessions();
  const t = now();
  // request + todos
  $("#request").textContent = office.request || "요청을 기다리는 중…";
  $("#request").classList.toggle("muted", !office.request);
  $("#todoList").innerHTML = office.todos
    .map((td) => `<div class="todo ${td.status}"><span>${td.status === "completed" ? "✓" : td.status === "in_progress" ? "▶" : "○"}</span><span>${esc(td.text)}</span></div>`)
    .join("");
  // team
  let active = 0;
  const rows = ALL_DESKS.map((d) => {
    const desk = office.desks[d.key];
    const look = deskLook(desk, t, office.ended);
    if (look.tone === "busy") active++;
    const what = look.tone === "off" ? "아직 업무 없음" : desk.tool && look.tone === "busy" && look.anim === "interact" ? `${TOOL_ICON[desk.tool] || "🛠️"} ${desk.target || toolLabel(desk.tool)}` : desk.task || (d.key === "lead" ? office.request : "") || "—";
    return { d, look, desk, what };
  });
  $("#activeCount").textContent = `${active}명 근무 중`;
  const team = $("#team");
  if (!team.children.length) {
    for (const d of ALL_DESKS) {
      const el = document.createElement("div");
      el.className = "member";
      el.dataset.k = d.key;
      el.style.setProperty("--c", d.color);
      el.append(avatar(d.key));
      el.insertAdjacentHTML("beforeend", `<div><div class="who"></div><div class="what"></div></div><span class="pill"></span>`);
      team.append(el);
    }
  }
  for (const { d, look, desk, what } of rows) {
    const el = team.querySelector(`[data-k="${d.key}"]`);
    el.classList.toggle("off", look.tone === "off");
    el.querySelector(".who").innerHTML = `${esc(d.name)} <small>${esc(d.en)}${desk.toolCount ? ` · 도구 ${desk.toolCount}회` : ""}</small>`;
    el.querySelector(".what").textContent = what;
    el.querySelector(".what").title = what;
    const pill = el.querySelector(".pill");
    pill.className = `pill ${look.tone}`;
    pill.textContent = look.status;
  }
}

function describe(ev) {
  switch (ev.kind) {
    case "session_start":
      return "💼 세션 시작";
    case "prompt":
      return `💬 요청: ${ev.text}`;
    case "tool_start":
      if (ev.delegate) return `📨 ${deskByKey[roleFor(ev.delegate.type)].name}팀에 위임: ${ev.delegate.description}`;
      return `${TOOL_ICON[ev.tool] || "🛠️"} ${toolLabel(ev.tool)} ${ev.target || ""}`;
    case "tool_end":
      return ev.ok === false ? `❌ ${ev.tool} 실패${ev.text ? `: ${ev.text}` : ""}` : null;
    case "subagent_start":
      return `🚪 출근 (${ev.agentType})`;
    case "subagent_stop":
      return `✅ 완료${ev.text ? `: ${ev.text}` : ""}`;
    case "stop":
      return ev.ok === false ? "⚠️ 응답 실패" : "🎉 응답 완료";
    case "notify":
      return `🔔 ${ev.text}`;
    case "compact":
      return "🧹 컨텍스트 정리";
    case "session_end":
      return "👋 세션 종료";
    default:
      return null;
  }
}

function logItem(ev) {
  const text = describe(ev);
  if (!text) return null;
  const d = deskByKey[roleFor(ev.agentType)] || LEAD;
  const li = document.createElement("li");
  li.style.setProperty("--c", d.color);
  li.innerHTML = `<time>${clock(ev.ts)}</time><span><b>${esc(d.name)}</b>${esc(text)}</span>`;
  return li;
}

let logCount = 0;
function renderLog(reset) {
  const log = $("#log");
  if (reset) {
    log.innerHTML = "";
    logCount = 0;
    const evs = events.filter((e) => e.session === officeSession).slice(-200);
    const frag = document.createDocumentFragment();
    for (let i = evs.length - 1; i >= 0; i--) {
      const li = logItem(evs[i]);
      if (li) {
        frag.append(li);
        logCount++;
      }
    }
    log.append(frag);
  }
  $("#eventCount").textContent = logCount ? `${logCount}건` : "";
}

function appendLog(ev) {
  const li = logItem(ev);
  if (!li) return;
  const log = $("#log");
  log.prepend(li);
  logCount++;
  while (log.children.length > 300) log.lastChild.remove();
  $("#eventCount").textContent = `${logCount}건`;
}

// ------------------------------------------------------------------ setup guide
function newRoomKey() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}

function codeBlock(text) {
  return `<div class="code"><button class="btn sm" data-copy="${esc(text)}">복사</button>${esc(text)}</div>`;
}

function setupHtml(tab) {
  const url = roomUrl || `${ORIGIN}/r/<내-사무실-키>`;
  const host = location.host;
  const install = `curl -fsSL ${ORIGIN}/install.sh | bash`;
  const common = `
    <li><div><h3>프로젝트 저장소에 훅 설치</h3>
      <p>저장소 루트에서 실행하세요. <code>.claude/hooks/pixel-office.sh</code>, <code>.claude/settings.json</code> 훅, 6명의 팀원(서브에이전트)이 추가돼요.</p>
      ${codeBlock(install)}
      <p style="margin-top:6px">팀원에게 일을 나눠 맡기도록 CLAUDE.md에 안내까지 넣으려면:</p>
      ${codeBlock(`${install} -s -- --team-guide`)}
    </div></li>`;
  if (tab === "local")
    return `<ol class="steps">${common}
      <li><div><h3>사무실 주소를 환경 변수로</h3><p>셸 설정(~/.zshrc 등)에 추가하고 터미널을 다시 여세요.</p>${codeBlock(`export PIXEL_OFFICE_URL="${url}"`)}</div></li>
      <li><div><h3>Claude Code 실행</h3><p>평소처럼 <code>claude</code>를 실행하면 이 화면에 바로 나타나요.</p></div></li>
    </ol>`;
  return `<ol class="steps">${common}
    <li><div><h3>설치한 파일을 커밋 & 푸시</h3><p>클라우드 세션은 저장소를 새로 받아 시작하므로 <code>.claude/</code> 변경사항이 저장소에 있어야 해요.</p>${codeBlock(`git add .claude CLAUDE.md 2>/dev/null; git commit -m "chore: add Pixel Office hooks" && git push`)}</div></li>
    <li><div><h3>클라우드 환경에 주소 등록</h3>
      <p>claude.ai/code → 세션 상단의 환경 메뉴 → <b>Edit</b> → <b>Environment variables</b>에 추가:</p>
      ${codeBlock(`PIXEL_OFFICE_URL=${url}`)}
      <p style="margin-top:8px">같은 화면의 <b>Network access</b>에서 이 서버 도메인을 허용하세요 (Limited/Custom → Allowed domains):</p>
      ${codeBlock(host)}
      <div class="note">주소에 사무실 키가 들어 있어요. 키를 아는 사람은 누구나 이 사무실을 볼 수 있으니 공개 저장소에는 커밋하지 마세요 — 환경 변수로만 넣으면 안전해요.</div>
    </div></li>
    <li><div><h3>새 세션 시작</h3><p>그 환경으로 새 세션을 열고 일을 시키면, 팀원들이 출근해서 일하는 모습이 실시간으로 보여요.</p></div></li>
  </ol>`;
}

function openSetup(tab = "cloud") {
  const body = $("#setupBody");
  const urlLine = roomUrl
    ? `<p class="muted" style="margin-top:0">이 사무실 주소: <code>${esc(roomUrl)}</code></p>`
    : `<p class="muted" style="margin-top:0">먼저 <b>내 사무실 만들기</b>로 개인 주소를 받으세요. 아래 &lt;내-사무실-키&gt; 자리에 들어가요.</p>`;
  body.innerHTML = `${urlLine}
    <div class="tabs"><button data-tab="cloud" class="${tab === "cloud" ? "on" : ""}">☁️ 클라우드 세션 (claude.ai/code)</button><button data-tab="local" class="${tab === "local" ? "on" : ""}">💻 내 컴퓨터</button></div>
    ${setupHtml(tab)}`;
  if (!$("#setup").open) $("#setup").showModal();
}

$("#setupBody").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) return openSetup(tab.dataset.tab);
  const c = e.target.closest("[data-copy]");
  if (c) copy(c.dataset.copy);
});

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 1800);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("복사했어요");
  } catch {
    toast("복사 실패 — 직접 선택해서 복사하세요");
  }
}

// ------------------------------------------------------------------ boot
$("#btnSetup").onclick = () => openSetup();
$("#btnEmptySetup").onclick = () => openSetup();
$("#btnCreate").onclick = () => {
  const key = newRoomKey();
  location.href = `/r/${key}?setup=1`;
};
$("#btnHideHero").onclick = () => ($("#hero").hidden = true);
$("#btnDemo").onclick = () => (location.href = "/demo");
$("#btnCopy").onclick = () => copy(roomUrl);

async function boot() {
  await Promise.all([loadMeta(), document.fonts.load("12px Galmuri11"), document.fonts.load("12px 'Galmuri11 Bold'")]).catch(() => {});
  if (roomKey) {
    $("#roomChip").hidden = false;
    $("#roomChip").textContent = `🔑 ${roomKey.slice(0, 6)}…`;
    $("#roomChip").title = roomUrl;
    $("#btnCopy").hidden = false;
    $("#btnDemo").hidden = false;
    connectRoom();
    if (new URLSearchParams(location.search).get("setup")) {
      history.replaceState(null, "", `/r/${roomKey}`);
      openSetup();
    }
  } else {
    $("#conn").className = "conn on";
    $("#conn span").textContent = "데모 모드";
    if (path === "/") $("#hero").hidden = false;
    runDemo();
  }
  const loop = () => {
    scene.render(now());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setInterval(renderPanels, 400);
}
boot();

// debug/testing hook
window.__pixelOffice = { get office() { return office; }, get events() { return events; }, scene, ROLES };
