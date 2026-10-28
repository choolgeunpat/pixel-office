/**
 * HTML layer on top of the canvas: name plates, status cards, speech bubbles, the whiteboard
 * and the TV. Text lives here (not in the canvas) so it is sharp at any zoom and can never spill
 * out of its box: every line is clamped with CSS and long text is cut with an ellipsis.
 * Positions are percentages of the world, sizes use --u (screen px per world px).
 */
import { ALL_DESKS } from "../lib/roles.js";
import { deskDetail, teamName } from "../lib/state.js";
import { LAYOUT, W, H, BOARD, TV } from "./scene.js";
import { roleIcon } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (x, y) => `left:${(x / W) * 100}%;top:${(y / H) * 100}%`;
const rect = (r) => `left:${(r.x / W) * 100}%;top:${(r.y / H) * 100}%;width:${(r.w / W) * 100}%;height:${(r.h / H) * 100}%`;

const TAG = { request: "대표님 요청", task: "맡은 일", done: "끝!", error: "문제", notify: "확인 필요", info: "" };
const LIFE = { request: 22_000, task: 9000, done: 9000, error: 7000, notify: 40_000, info: 5000 };

export class Overlay {
  constructor(root, { onFocus } = {}) {
    this.root = root;
    this.els = {};
    this.keys = new WeakMap();
    root.innerHTML = "";
    for (const d of ALL_DESKS) {
      const g = LAYOUT[d.key];
      const mk = (cls, style, extra = "") => {
        const el = document.createElement("div");
        el.className = cls;
        el.style.cssText = style;
        el.dataset.key = d.key;
        el.style.setProperty("--c", d.color);
        if (extra) el.innerHTML = extra;
        root.append(el);
        return el;
      };
      this.els[d.key] = {
        plate: mk("plate", pct(g.cx, g.front + 21), `<img src="${roleIcon(d.key, d.color)}" alt=""><b>${esc(d.name)}</b><small>${esc(d.en)}</small>`),
        card: mk("card", pct(g.cx, g.gy + 6)),
        bubble: mk("bubble", pct(g.seatX, g.seatY - 112)),
      };
      this.els[d.key].bubble.hidden = true;
    }
    this.board = document.createElement("div");
    this.board.className = "board";
    this.board.style.cssText = rect(BOARD);
    root.append(this.board);
    this.tv = document.createElement("div");
    this.tv.className = "tv";
    this.tv.style.cssText = rect(TV);
    root.append(this.tv);
    root.addEventListener("click", (e) => {
      const k = e.target.closest("[data-key]");
      if (k && onFocus) onFocus(k.dataset.key);
    });
  }

  set(el, html) {
    if (this.keys.get(el) !== html) {
      this.keys.set(el, html);
      el.innerHTML = html;
    }
  }

  update({ office, looks, actors, now, company }) {
    // never more than three speech bubbles at once (the lead's always fits): newest news wins
    const shown = new Set();
    ALL_DESKS.map((d) => ({ d, b: office.desks[d.key].bubble }))
      .filter(({ b }) => b && now - b.ts < (LIFE[b.kind] || 5000))
      .sort((a, b) => b.b.ts - a.b.ts)
      .forEach(({ d }) => d.key === "lead" || shown.size < 3 ? shown.add(d.key) : null);
    for (const d of ALL_DESKS) {
      const desk = office.desks[d.key];
      const look = looks[d.key];
      const e = this.els[d.key];
      // card: what they are doing, in words
      const detail = deskDetail(office, desk, look);
      e.card.className = `card ${look.tone}`;
      this.set(e.card, `<div class="st"><i></i><span>${esc(look.status)}</span></div>${detail ? `<div class="dt">${esc(detail)}</div>` : ""}`);
      // bubble: short-lived news
      const b = desk.bubble;
      const seated = actors[d.key] && actors[d.key].loc === "seat";
      const age = b ? now - b.ts : 1e9;
      const show = b && shown.has(d.key) && seated && look.anim !== "sleep" && age < (LIFE[b.kind] || 5000) && !(b.kind === "notify" && look.tone !== "wait");
      e.bubble.hidden = !show;
      if (show) {
        const x = Math.max(96, Math.min(W - 96, LAYOUT[d.key].seatX));
        e.bubble.style.left = `${(x / W) * 100}%`;
        e.bubble.className = `bubble ${b.kind}`;
        e.bubble.classList.toggle("fade", age > (LIFE[b.kind] || 5000) - 700);
        this.set(e.bubble, `${TAG[b.kind] ? `<span class="tag">${TAG[b.kind]}</span>` : ""}<span class="txt">${esc(b.text)}</span>`);
      }
    }
    this.renderBoard(office);
    this.renderTv(office, looks, company);
  }

  renderBoard(o) {
    const todos = o.todos;
    let body;
    let head = "오늘의 할 일";
    if (!todos.length) {
      body = `<div class="empty">${o.request ? `<b>요청</b> ${esc(o.request)}` : "새 의뢰를 기다리는 중이에요"}</div>`;
    } else {
      const done = todos.filter((t) => t.status === "completed").length;
      head += `<em>${done}/${todos.length}</em>`;
      const cur = Math.max(0, todos.findIndex((t) => t.status !== "completed"));
      const room = todos.length > 5 ? 4 : 5;
      const start = Math.min(Math.max(0, cur - 1), Math.max(0, todos.length - room));
      const rows = todos.slice(start, start + room).map((t) => {
        const mark = t.status === "completed" ? "✓" : t.status === "in_progress" ? "▶" : "○";
        return `<div class="it ${t.status}"><span>${mark}</span><span class="tx">${esc(t.status === "in_progress" ? t.active : t.text)}</span></div>`;
      });
      const hidden = todos.length - rows.length;
      body = rows.join("") + (hidden > 0 ? `<div class="more">외 ${hidden}개</div>` : "");
    }
    this.set(this.board, `<div class="hd">${head}</div>${body}`);
  }

  renderTv(o, looks, company) {
    const working = ALL_DESKS.filter((d) => looks[d.key].tone === "busy").length;
    const doneN = o.tickets.filter((t) => t.status === "done").length;
    const lv = company.level;
    this.set(
      this.tv,
      `<div class="nm">${esc(company.name)}</div>
       <div class="lv"><b>Lv.${lv.lv}</b> ${esc(lv.name)}</div>
       <div class="bar"><i style="width:${Math.round(company.progress * 100)}%"></i></div>
      <div class="row"><span>🪙 ${company.coins.toLocaleString("ko-KR")}</span><span>${working}명 근무</span></div>
      <div class="row sm"><span>오늘 끝낸 의뢰 ${doneN}건</span></div>`,
    );
  }
}

export { teamName };
