import { normalize } from "./lib/normalize.js";
import { ALL_DESKS, deskByKey } from "./lib/roles.js";
import { apply, createOffice, deskDetail, deskLook, headline, teamName } from "./lib/state.js";
import { Economy } from "./lib/economy.js";
import { ago, took } from "./lib/plain.js";
import { startDemo } from "./lib/sim.js";
import { loadMeta, Character } from "./office/sprites.js";
import { OfficeScene, W, H, LAYOUT } from "./office/scene.js";
import { Cats, loadCats } from "./office/cats.js";
import { Overlay } from "./office/overlay.js";
import { roleIcon } from "./office/icons.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// ------------------------------------------------------------------ route
const path = location.pathname;
const roomKey = (path.match(/^\/r\/([A-Za-z0-9_-]{12,64})\/?$/) || [])[1] || null;
const ORIGIN = location.origin;
const roomUrl = roomKey ? `${ORIGIN}/r/${roomKey}` : null;
// the office started by `npx github:choolgeunpat/pixel-office` on this PC
const isLocal = roomKey === "my-local-office";
const LOCAL_CMD = "npx -y github:choolgeunpat/pixel-office";

// ------------------------------------------------------------------ state
const offices = new Map(); // session id → office (every session is kept up to date, the picker only switches the view)
const metas = new Map(); // session id → { id, last, count, project, title, remote }
const economy = new Economy(roomKey ? `po.company.${roomKey}` : null);
const emptyOffice = createOffice();
let selected = "auto"; // a session id, or "auto" = follow the latest one
let latestSid = null;
let clockOffset = 0; // browser clock − server clock
let stopDemo = null;
let replaying = false;
let seq = 0;

const scene = new OfficeScene($("#office"));
scene.setLevel(economy.level.lv);
const overlay = new Overlay($("#overlay"), { onFocus: (k) => focusDesk(k) });
const now = () => Date.now() - clockOffset;

const currentSid = () => (selected !== "auto" && offices.has(selected) ? selected : latestSid);
const currentOffice = () => offices.get(currentSid()) || emptyOffice;

function ingest(ev) {
  let o = offices.get(ev.session);
  if (!o) {
    o = createOffice(ev.session);
    o.seenRewards = 0;
    offices.set(ev.session, o);
  }
  apply(o, ev);
  let m = metas.get(ev.session);
  if (!m) metas.set(ev.session, (m = { id: ev.session, last: ev.ts, count: 0, project: "", title: "", remote: null }));
  m.last = Math.max(m.last, ev.ts);
  m.count++;
  if (ev.project) m.project = ev.project;
  if (ev.remote) m.remote = ev.remote;
  if (ev.kind === "prompt" && !m.title) m.title = ev.text;
  if (!latestSid || m.last >= (metas.get(latestSid)?.last ?? 0)) latestSid = ev.session;

  while (o.seenRewards < o.rewards.length) {
    const r = o.rewards[o.seenRewards++];
    const res = economy.add(r.amount, r.ts);
    if (!res.counted) continue;
    if (res.levelUp) scene.setLevel(economy.level.lv);
    if (!replaying) celebrate(r, o, res.levelUp);
  }
}

function celebrate(r, o, levelUp) {
  if (o === currentOffice()) {
    const g = LAYOUT[r.desk] || LAYOUT.lead;
    const pop = document.createElement("div");
    pop.className = "pop";
    pop.textContent = `+${r.amount} 🪙`;
    pop.style.left = `${(g.seatX / W) * 100}%`;
    pop.style.top = `${((g.seatY - 100) / H) * 100}%`;
    $("#overlay").append(pop);
    pop.addEventListener("animationend", () => pop.remove());
    scene.burst(g.seatX, g.seatY - 70, r.why === "ticket" ? 40 : r.why === "teammate" ? 16 : 6);
  }
  if (levelUp) showBanner(`🎉 레벨 업! ${economy.name}이(가) '${levelUp.name}'이 되었어요`, levelUp.unlock);
}

let bannerTimer = 0;
function showBanner(title, sub) {
  const b = $("#banner");
  b.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`;
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (b.hidden = true), 7000);
  scene.burst(W / 2, 120, 60);
}

function resetAll() {
  offices.clear();
  metas.clear();
  latestSid = null;
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
    if (data.now) clockOffset = Date.now() - data.now;
    set("on", "실시간 연결됨");
    resetAll();
    replaying = true;
    for (const ev of data.events || []) ingest(ev);
    replaying = false;
    scene.setLevel(economy.level.lv);
  });
  es.addEventListener("ev", (m) => {
    const ev = JSON.parse(m.data);
    if (ev.kind === "_clear") return resetAll();
    clockOffset = Date.now() - ev.ts; // the server stamps events on receipt
    ingest(ev);
  });
  es.onerror = () => set("off", "재연결 중…");
}

function runDemo() {
  stopDemo?.();
  resetAll();
  clockOffset = 0;
  stopDemo = startDemo((raw) => {
    const ev = normalize(raw, Date.now());
    if (ev) {
      ev.id = ++seq;
      ingest(ev);
    }
  });
}

// ------------------------------------------------------------------ fit / zoom / focus
const stage = $("#stage");
const world = $("#world");
const view = { z: 1, x: 0, y: 0 };
const geo = { base: 1, left: 0, top: 0, w: 0, h: 0 };

function layout() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  const dock = matchMedia("(max-width: 900px)").matches ? 0 : 56; // the bottom dock never covers the office
  const availH = r.height - dock;
  // the canvas is exactly as many device pixels as it is shown at: no browser resampling, hard pixels
  const fit = Math.min(r.width / W, availH / H);
  const cw = Math.round(W * Math.min(4, fit * dpr));
  const ch = Math.round(H * (cw / W));
  const cssW = cw / dpr;
  const cssH = ch / dpr;
  const base = cssW / W;
  const snap = (v) => Math.round(v * dpr) / dpr;
  Object.assign(geo, { base, w: r.width, h: availH, left: snap((r.width - cssW) / 2), top: snap((availH - cssH) / 2), cssH });
  world.style.width = `${cssW}px`;
  world.style.height = `${cssH}px`;
  world.style.left = `${geo.left}px`;
  world.style.top = `${geo.top}px`;
  world.style.setProperty("--u", `${base}px`);
  document.documentElement.style.setProperty("--u", `${base}px`);
  syncResolution();
  applyView();
}

/** keep the canvas pixel-exact for the current zoom (re-rendered at higher resolution when zoomed in) */
function syncResolution() {
  const want = Math.min(4, geo.base * view.z * (window.devicePixelRatio || 1));
  if (Math.abs(want - scene.S) > 0.004 * want) scene.resize(want);
}

const clampAxis = (off, left, size, stageSize) => (size <= stageSize ? (stageSize - size) / 2 - left : Math.min(-left, Math.max(stageSize - left - size, off)));

function applyView(animate = false) {
  view.z = Math.max(1, Math.min(3.5, view.z));
  view.x = clampAxis(view.x, geo.left, W * geo.base * view.z, geo.w);
  view.y = clampAxis(view.y, geo.top, H * geo.base * view.z, geo.h);
  if (view.z === 1) view.x = view.y = 0;
  resyncSoon = true;
  world.style.transition = animate ? "transform 0.5s cubic-bezier(.2,.8,.2,1)" : "none";
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
}

/** zoom by factor k around a stage point */
function zoomAt(k, cx = geo.w / 2, cy = geo.h / 2, animate = false) {
  const z2 = Math.max(1, Math.min(3.5, view.z * k));
  const wx = (cx - geo.left - view.x) / view.z;
  const wy = (cy - geo.top - view.y) / view.z;
  view.z = z2;
  view.x = cx - geo.left - wx * z2;
  view.y = cy - geo.top - wy * z2;
  applyView(animate);
}

function focusDesk(key) {
  const g = LAYOUT[key];
  if (!g) return;
  view.z = 2.3;
  const px = (g.cx * geo.base) * view.z;
  const py = ((g.seatY + 20) * geo.base) * view.z;
  view.x = geo.w / 2 - geo.left - px;
  view.y = geo.h / 2 - geo.top - py;
  applyView(true);
}

$("#zin").onclick = () => zoomAt(1.4, undefined, undefined, true);
$("#zout").onclick = () => zoomAt(1 / 1.4, undefined, undefined, true);
$("#zfit").onclick = () => {
  view.z = 1;
  applyView(true);
};
stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY / 400), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
let drag = null;
let dragged = false;
stage.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button, a, .dock, .cover, .banner")) return;
  drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  dragged = false;
});
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!dragged && Math.hypot(dx, dy) < 5) return;
  dragged = true;
  view.x = drag.vx + dx;
  view.y = drag.vy + dy;
  applyView();
});
window.addEventListener("pointerup", () => (drag = null));
// a drag must not count as a click on a desk card
stage.addEventListener("click", (e) => dragged && (e.stopPropagation(), (dragged = false)), true);
stage.addEventListener("dblclick", (e) => {
  if (e.target.closest("button, a, .dock, .cover, .plate, .card")) return;
  const r = stage.getBoundingClientRect();
  zoomAt(view.z > 1.2 ? 1 / view.z : 2, e.clientX - r.left, e.clientY - r.top, true);
});
new ResizeObserver(layout).observe(stage);

// ------------------------------------------------------------------ panel
const keyed = new WeakMap();
const setHtml = (el, html) => {
  if (keyed.get(el) !== html) {
    keyed.set(el, html);
    el.innerHTML = html;
  }
};

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

const clock = (ts) => new Date(ts + clockOffset).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
const sessionLink = (remote) => (remote ? `https://claude.ai/code/${remote.replace(/^cse_/, "session_")}` : null);

let pickSig = "";
function renderPicker() {
  const list = [...metas.values()].sort((a, b) => b.last - a.last);
  $("#pickWrap").hidden = list.length < 2 && selected === "auto";
  const sig = JSON.stringify([selected, list.map((s) => [s.id, s.title, s.project])]);
  if (sig !== pickSig) {
    pickSig = sig;
    const sel = $("#sessionSelect");
    sel.innerHTML =
      `<option value="auto">자동 · 가장 최근 세션 보기</option>` +
      list.map((s) => `<option value="${esc(s.id)}">${esc(s.project || "세션")} · ${esc(clip(s.title || "새 세션", 26))}</option>`).join("");
    sel.value = selected;
  }
  const m = metas.get(currentSid());
  const link = m && sessionLink(m.remote);
  $("#btnOpenSession").hidden = !link;
  if (link) $("#btnOpenSession").href = link;
}
$("#sessionSelect").addEventListener("change", (e) => {
  selected = e.target.value;
  tick();
});

function renderCompany() {
  const lv = economy.level;
  const next = economy.next;
  setHtml(
    $("#company"),
    `<div class="top1"><span class="nm">🏢 ${esc(economy.name)}</span><button class="edit" id="coEdit" title="회사 이름 바꾸기">✎</button></div>
     <div class="lv"><b>Lv.${lv.lv}</b>${esc(lv.name)}</div>
     <div class="bar"><i style="width:${Math.round(economy.progress * 100)}%"></i></div>
     <div class="sub">🪙 ${economy.coins.toLocaleString("ko-KR")}${next ? ` · 다음 단계까지 🪙 ${next.at - economy.coins}` : " · 최고 단계예요!"}</div>`,
  );
}
$("#company").addEventListener("click", (e) => {
  if (!e.target.closest("#coEdit")) return;
  const name = prompt("회사 이름을 정해 주세요 (14자까지)", economy.name);
  if (name !== null) {
    economy.rename(name);
    renderCompany();
  }
});

function renderPanel(o, looks, t) {
  // the request in progress (or the latest one), then finished ones
  const latest = o.tickets[o.tickets.length - 1];
  const teamsOf = (k) => {
    const names = [...k.teams].filter((x) => x !== "lead").map((x) => deskByKey[x].name);
    return names.length ? `${names.join("·")}팀이 함께 했어요` : "팀장이 직접 처리";
  };
  const chipOf = (k) => (k.status === "doing" ? "진행 중" : k.status === "failed" ? "문제 있음" : "완료");
  setHtml(
    $("#current"),
    latest
      ? `<div class="tk big ${latest.status}"><span class="chip">${chipOf(latest)}</span><p title="${esc(latest.title)}">${esc(latest.title)}</p><small>${latest.status === "doing" ? `${took(t - latest.startTs)} 째 진행 중` : `${took(latest.endTs - latest.startTs)} 걸렸어요`} · ${esc(teamsOf(latest))}</small></div>`
      : `<p class="hint">아직 들어온 의뢰가 없어요. Claude에게 무언가 물어보거나 시켜 보세요.</p>`,
  );
  const past = o.tickets.slice(0, -1).slice(-3).reverse();
  setHtml(
    $("#tickets"),
    past.length
      ? past.map((k) => `<li class="tk ${k.status}"><span class="chip">${chipOf(k)}</span><p title="${esc(k.title)}">${esc(k.title)}</p><small>${took(k.endTs - k.startTs)} · ${esc(teamsOf(k))}</small></li>`).join("")
      : `<li class="hint">끝낸 의뢰가 여기에 쌓여요.</li>`,
  );
  // to-do
  const todos = o.todos;
  const done = todos.filter((x) => x.status === "completed").length;
  $("#todoCount").textContent = todos.length ? `${done}/${todos.length} 완료` : "";
  setHtml($("#ring"), todos.length ? `<span class="ring" style="--p:${Math.round((done / todos.length) * 100)}"><b>${Math.round((done / todos.length) * 100)}%</b></span>` : "");
  setHtml(
    $("#todoList"),
    todos.length
      ? todos
          .map((x) => `<li class="td ${x.status}"><span>${x.status === "completed" ? "✓" : x.status === "in_progress" ? "▶" : "○"}</span><span>${esc(x.status === "in_progress" ? x.active : x.text)}</span></li>`)
          .join("")
      : `<li class="hint">Claude가 계획을 세우면 여기에 할 일이 나타나요.</li>`,
  );
  // team
  const team = $("#team");
  if (!team.children.length) {
    for (const d of ALL_DESKS) {
      const el = document.createElement("div");
      el.className = "member";
      el.dataset.k = d.key;
      el.style.setProperty("--c", d.color);
      el.append(avatar(d.key));
      el.insertAdjacentHTML("beforeend", `<div style="min-width:0"><div class="who"></div><div class="what"></div></div><span class="pill"></span>`);
      el.addEventListener("click", () => focusDesk(d.key));
      team.append(el);
    }
  }
  for (const d of ALL_DESKS) {
    const desk = o.desks[d.key];
    const look = looks[d.key];
    const el = team.querySelector(`[data-k="${d.key}"]`);
    const what = deskDetail(o, desk, look) || (look.tone === "off" ? "아직 일이 없어요" : "");
    el.classList.toggle("off", look.tone === "off");
    setHtml(el.querySelector(".who"), `<img class="ri" src="${roleIcon(d.key, d.color)}" alt="">${esc(d.name)}<small>${esc(d.en)}</small>`);
    setHtml(el.querySelector(".what"), esc(what));
    el.querySelector(".what").title = what;
    const pill = el.querySelector(".pill");
    pill.className = `pill ${look.tone}`;
    pill.textContent = look.status;
  }
  // what just happened
  const feed = o.feed.slice(-8).reverse();
  setHtml(
    $("#feed"),
    feed.length ? feed.map((f) => `<li><time>${clock(f.ts)}</time><span>${f.icon} ${esc(f.text)}</span></li>`).join("") : `<li class="hint" style="grid-template-columns:1fr">아직 아무 일도 없었어요.</li>`,
  );
}

$("#btnPanel").onclick = () => {
  const app = $("#app");
  const open = app.classList.toggle("panel-open");
  $("#btnPanel").setAttribute("aria-pressed", String(open));
  try {
    localStorage.setItem("po.panel", open ? "1" : "0");
  } catch {
    // ignore
  }
};

// ------------------------------------------------------------------ main loop
let looks = {};
function computeLooks(o, t) {
  const out = {};
  for (const d of ALL_DESKS) out[d.key] = deskLook(o.desks[d.key], t, o.ended);
  return out;
}

let resyncSoon = false;
let lastDraw = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  // ~30 fps is plenty for pixel animation, and a hidden tab draws nothing
  if (document.hidden || ts - lastDraw < 30) return;
  lastDraw = ts;
  if (resyncSoon) {
    resyncSoon = false;
    syncResolution();
  }
  const t = now();
  const o = currentOffice();
  scene.setOffice(o);
  looks = computeLooks(o, t);
  scene.render(t, looks);
}

function tick() {
  if (document.hidden) return;
  const t = now();
  const o = currentOffice();
  const lk = computeLooks(o, t);
  overlay.update({ office: o, looks: lk, actors: scene.frame.actors || {}, now: t, company: economy });
  const h = headline(offices.has(currentSid()) ? o : null, t);
  const nowEl = $("#now");
  nowEl.className = `now ${h.tone}`;
  setHtml(nowEl, `<i></i><span>${esc(h.text)}</span>`);
  renderPanel(o, lk, t);
  renderPicker();
  renderCompany();
  $("#clock").textContent = new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  $("#empty").hidden = offices.size > 0 || !roomKey;
}

$("#btnSetup").onclick = () => openSetup();
$("#btnEmptySetup").onclick = () => openSetup();
$("#btnCreate").onclick = () => {
  const key = newRoomKey();
  location.href = `/r/${key}?setup=1`;
};
$("#btnHideHero").onclick = () => ($("#hero").hidden = true);
$("#btnDemo").onclick = () => (location.href = "/demo");
$("#btnCopy").onclick = () => copy(roomUrl);

// ------------------------------------------------------------------ setup guide
function newRoomKey() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}

function codeBlock(text) {
  return `<div class="code"><button class="btn sm" data-copy="${esc(text)}">복사</button>${esc(text)}</div>`;
}

/** what to paste into a Claude Code session to install the office in its repo */
function claudePrompt(installCmd) {
  return `아래 명령을 이 저장소 루트에서 실행해서 Pixel Office를 설치해줘. 설치가 끝나면 바뀐 파일(.claude 폴더, CLAUDE.md)을 커밋하고 푸시해줘.\n\n${installCmd}`;
}

function setupHtml(tab) {
  const install = `curl -fsSL ${roomUrl}/install.sh | bash`;
  const host = location.host;
  if (tab === "local")
    return `<ol class="steps">
      <li><div><h3>프로젝트 폴더에서 터미널 열기</h3><p>Claude Code로 작업하는 프로젝트 폴더에서 터미널을 열고, 아래 한 줄을 붙여넣은 뒤 Enter를 누르세요.</p>${codeBlock(install)}</div></li>
      <li><div><h3>Claude Code 실행</h3><p>평소처럼 <code>claude</code>를 실행하고 일을 시키세요. 이 화면에 팀원들이 출근해요. 끝!</p></div></li>
    </ol>`;
  return `<ol class="steps">
    <li><div><h3>네트워크 허용하기 <small class="muted">(처음 한 번만)</small></h3>
      <p><b>claude.ai/code</b>를 열고 → 화면 위쪽의 <b>환경 이름</b>을 누르고 → <b>Edit(편집)</b> → <b>Network access</b>에서 <b>Limited</b>(또는 Custom)를 고른 다음, <b>Allowed domains</b> 칸에 아래 주소를 붙여넣고 저장하세요.</p>
      ${codeBlock(host)}
      <div class="note">이미 <b>Full</b>(전체 허용)로 되어 있다면 이 단계는 건너뛰어도 돼요.</div>
    </div></li>
    <li><div><h3>Claude에게 아래 문장 그대로 붙여넣기</h3>
      <p>보고 싶은 프로젝트 저장소로 <b>새 세션</b>을 열고, 아래 내용을 통째로 복사해서 보내세요. Claude가 알아서 설치하고 저장소에 올려 줘요.</p>
      ${codeBlock(claudePrompt(install))}
    </div></li>
    <li><div><h3>새 세션을 하나 더 열고 일 시키기</h3>
      <p>설치는 <b>다음 세션부터</b> 적용돼요. 같은 저장소로 새 세션을 열고 평소처럼 일을 시키면 이 화면에 팀원들이 출근해요. 끝!</p>
    </div></li>
  </ol>
  <div class="note" style="margin-top:16px">🔒 공개 저장소라면: 사무실 주소(키)가 저장소에 올라가요. 아무나 보면 안 된다면 2단계 문장 끝에 <code>-s -- --no-save</code>를 붙이고, 환경 설정의 <b>Environment variables</b>에 <code>PIXEL_OFFICE_URL=${esc(roomUrl)}</code>를 넣으세요.</div>`;
}

function openSetup(tab = "cloud") {
  const body = $("#setupBody");
  if (isLocal) {
    body.innerHTML = `<ol class="steps">
      <li><div><h3>✅ 이 PC는 이미 연결돼 있어요</h3><p>평소처럼 Claude Code를 쓰면 팀원들이 출근해요. 이미 켜져 있던 Claude Code는 한 번 껐다 켜 주세요.</p></div></li>
      <li><div><h3>다음에 사무실을 다시 볼 때</h3><p>터미널에 아래 한 줄을 붙여넣고 Enter.</p>${codeBlock(LOCAL_CMD)}</div></li>
      <li><div><h3>다른 사람에게 주기</h3><p>아래 문장을 그대로 보내 주세요.</p>${codeBlock(`Claude가 일하는 모습을 픽셀 사무실로 보는 Pixel Office예요!\n(Node.js가 없다면 nodejs.org 에서 먼저 설치)\n터미널에 아래 한 줄을 붙여넣고 Enter 하면 끝이에요.\n\n${LOCAL_CMD}`)}</div></li>
    </ol>
    <div class="note" style="margin-top:16px">지우고 싶을 때: <code>${LOCAL_CMD} uninstall</code></div>`;
    if (!$("#setup").open) $("#setup").showModal();
    return;
  }
  if (!roomUrl) {
    body.innerHTML = `<ol class="steps"><li><div><h3>먼저 내 사무실을 만드세요</h3><p>버튼을 누르면 나만의 사무실 주소가 생기고, 그 주소가 들어간 설치 안내가 바로 나와요.</p><button class="btn primary big" data-create>내 사무실 만들기 →</button></div></li></ol>`;
  } else {
    body.innerHTML = `<p class="muted" style="margin-top:0">내 사무실 주소 (즐겨찾기 해 두세요): <code>${esc(roomUrl)}</code></p>
    <div class="tabs"><button data-tab="cloud" class="${tab === "cloud" ? "on" : ""}">☁️ claude.ai/code (클라우드)</button><button data-tab="local" class="${tab === "local" ? "on" : ""}">💻 내 컴퓨터 터미널</button></div>
    ${setupHtml(tab)}`;
  }
  if (!$("#setup").open) $("#setup").showModal();
}

$("#setupBody").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) return openSetup(tab.dataset.tab);
  if (e.target.closest("[data-create]")) return $("#btnCreate").click();
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
async function boot() {
  await Promise.all([loadMeta(), loadCats(), document.fonts.load("600 14px Pretendard"), document.fonts.load("800 14px Pretendard"), document.fonts.load("bold 11px 'Galmuri11 Bold'")]).catch(() => {});
  let panel = window.innerWidth >= 1280 || window.innerWidth <= 900; // phones: the list sits under the office
  try {
    const saved = localStorage.getItem("po.panel");
    if (saved !== null) panel = saved === "1";
  } catch {
    // ignore
  }
  $("#app").classList.toggle("panel-open", panel);
  $("#btnPanel").setAttribute("aria-pressed", String(panel));
  if (roomKey) {
    $("#btnCopy").hidden = isLocal;
    if (isLocal) {
      $("#btnSetup").textContent = "📤 다른 사람에게 주기";
      $("#emptyText").textContent = "Claude Code를 켜고 아무 일이나 시켜 보세요. (이미 켜져 있었다면 껐다 켜 주세요)";
      $("#btnEmptySetup").hidden = true;
    }
    $("#btnDemo").hidden = false;
    connectRoom();
    if (new URLSearchParams(location.search).get("setup")) {
      history.replaceState(null, "", `/r/${roomKey}`);
      openSetup();
    }
  } else {
    $("#conn").className = "conn on";
    $("#conn span").textContent = "데모";
    if (path === "/") $("#hero").hidden = false;
    runDemo();
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const applyMotion = () => {
    scene.reduced = reduce.matches;
    scene.setCats(new Cats({ reduced: reduce.matches }));
  };
  applyMotion();
  reduce.addEventListener?.("change", applyMotion);
  layout();
  requestAnimationFrame(frame);
  setInterval(tick, 250);
  tick();
}
boot();

// debug/testing hook
window.__pixelOffice = { now, offices, economy, scene, view, get looks() { return looks; }, focusDesk, ingest };
