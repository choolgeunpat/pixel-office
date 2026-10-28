/**
 * The office scene: static background (cached), then every frame the desks,
 * characters, walkers, wall displays and speech bubbles, depth-sorted by y.
 */
import { ROLES, LEAD, deskByKey } from "../lib/roles.js";
import { deskLook, toolLabel } from "../lib/state.js";
import { Character } from "./sprites.js";
import { PAL, R, box, disc, ellipse, rng, monstera, snakePlant, pothos, pot, deskGeom, chair, desk, screenFor, mug } from "./art.js";

export const W = 880;
export const H = 560;
const WALL = 168;
const FONT = "12px Galmuri11, monospace";
const FONT_B = "12px 'Galmuri11 Bold', Galmuri11, monospace";
const DOOR = { x: 44, y: 190 };
const WALK_SPEED = 0.11; // px per ms

/** desk positions: two rows of three + the lead's glass office */
export const LAYOUT = {
  plan: deskGeom(162, 304),
  dev: deskGeom(342, 304),
  test: deskGeom(522, 304),
  mkt: deskGeom(162, 458),
  design: deskGeom(342, 458),
  review: deskGeom(522, 458),
  lead: deskGeom(762, 326, 172),
};

function skyMode(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 17) return "day";
  if ((h >= 17 && h < 19.5) || (h >= 5 && h < 7)) return "sunset";
  return "night";
}

const SKY = {
  day: { top: "#8ecdf2", bottom: "#d8f0fb", b1: "#9fb5c9", b2: "#7f97ae", win: "#d9ecf7", lit: 0.05 },
  sunset: { top: "#f59a7a", bottom: "#ffd6a1", b1: "#8f7d98", b2: "#6c5f7d", win: "#ffe3a6", lit: 0.35 },
  night: { top: "#141b38", bottom: "#33335e", b1: "#2a2f4c", b2: "#1d2139", win: "#ffd77a", lit: 0.55 },
};

function drawBackground(ctx, mode) {
  const sky = SKY[mode];
  // wall
  R(ctx, 0, 0, W, WALL, PAL.wall);
  R(ctx, 0, 0, W, 8, PAL.ink);
  R(ctx, 0, 8, W, 3, "#d8cfc0");
  // oak slat wainscot
  R(ctx, 0, 122, W, 46, PAL.slat);
  for (let x = 0; x < W; x += 6) {
    R(ctx, x, 122, 1, 46, PAL.slatDark);
    R(ctx, x + 1, 122, 1, 46, PAL.slatLight);
  }
  R(ctx, 0, 120, W, 3, PAL.oakDark);
  R(ctx, 0, 164, W, 6, PAL.ink);

  // floor: light oak planks
  const r = rng(42);
  for (let y = WALL; y < H; y += 12) {
    const shift = Math.floor(r() * 80);
    R(ctx, 0, y, W, 12, (y / 12) % 2 ? PAL.floor : PAL.floorAlt);
    R(ctx, 0, y, W, 1, PAL.floorSeam);
    for (let x = -shift; x < W; x += 96 + Math.floor(r() * 40)) R(ctx, x, y, 1, 12, PAL.floorSeam);
    for (let k = 0; k < 6; k++) R(ctx, Math.floor(r() * W), y + 3 + Math.floor(r() * 6), 6 + Math.floor(r() * 10), 1, "#cfb089");
  }
  // wall shadow on floor
  for (let i = 0; i < 8; i++) R(ctx, 0, WALL + i, W, 1, `rgba(60,40,20,${0.12 - i * 0.015})`);

  // sage rug under the team area
  const rx = 66;
  const ry = 200;
  const rw = 552;
  const rh = 296;
  R(ctx, rx + 4, ry + 4, rw, rh, "rgba(60,40,20,0.1)");
  box(ctx, rx, ry, rw, rh, PAL.sage, PAL.sageDark, 2);
  R(ctx, rx + 8, ry + 8, rw - 16, 2, PAL.sageLight);
  R(ctx, rx + 8, ry + rh - 10, rw - 16, 2, PAL.sageLight);
  R(ctx, rx + 8, ry + 8, 2, rh - 16, PAL.sageLight);
  R(ctx, rx + rw - 10, ry + 8, 2, rh - 16, PAL.sageLight);
  for (let x = rx + 16; x < rx + rw - 16; x += 12) R(ctx, x, ry + 4, 4, 1, PAL.sageLight);

  // ---------------- entrance (glass door)
  box(ctx, 12, 52, 64, 116, PAL.metal);
  R(ctx, 15, 55, 58, 113, "#cfe3ea");
  R(ctx, 43, 55, 2, 113, PAL.metal);
  for (let i = 0; i < 4; i++) R(ctx, 19 + i * 6, 60 + i * 9, 13, 1, "rgba(255,255,255,0.7)");
  R(ctx, 38, 104, 2, 16, "#c0c4cc");
  R(ctx, 48, 104, 2, 16, "#c0c4cc");
  box(ctx, 26, 38, 36, 11, "#1f8a5a");
  ctx.fillStyle = "#e9fff4";
  ctx.font = "9px Galmuri11, monospace";
  ctx.textBaseline = "top";
  ctx.fillText("EXIT", 33, 39);

  // ---------------- coffee bar
  // shelf + neon
  R(ctx, 90, 74, 112, 4, PAL.oakDark);
  R(ctx, 90, 74, 112, 1, PAL.oakLight);
  [
    [100, PAL.white],
    [114, PAL.sage],
    [128, PAL.terracotta],
  ].forEach(([x, c]) => box(ctx, x, 64, 10, 10, c));
  pot(ctx, 168, 74, 14, 10, PAL.white);
  for (let i = 0; i < 5; i++) ellipse(ctx, 162 + i * 3, 60 - (i % 2) * 3, 3, 2, i % 2 ? PAL.leaf : PAL.leafLight);
  R(ctx, 186, 50, 8, 24, "#6b4e3a");
  R(ctx, 187, 46, 6, 4, "#3a2a20");
  // counter
  box(ctx, 86, 112, 120, 56, PAL.white);
  R(ctx, 84, 108, 124, 6, PAL.ink);
  R(ctx, 85, 109, 122, 4, "#f7f3ec");
  for (let x = 92; x < 204; x += 28) R(ctx, x, 120, 1, 44, PAL.offwhite);
  R(ctx, 88, 162, 116, 4, PAL.offwhite);

  // ---------------- windows with skyline
  const wx = 224;
  const wy = 26;
  const ww = 204;
  const wh = 92;
  for (let y = 0; y < wh; y++) {
    const k = y / wh;
    ctx.fillStyle = mix(sky.top, sky.bottom, k);
    ctx.fillRect(wx, wy + y, ww, 1);
  }
  if (mode === "night") {
    const sr = rng(5);
    for (let i = 0; i < 26; i++) R(ctx, wx + sr() * ww, wy + sr() * 40, 1, 1, "#ffffff");
    disc(ctx, wx + 170, wy + 18, 7, "#f4f0d6");
    disc(ctx, wx + 174, wy + 16, 6, sky.top);
  } else if (mode === "day") {
    disc(ctx, wx + 168, wy + 20, 9, "#fff2b8");
    cloud(ctx, wx + 40, wy + 18);
    cloud(ctx, wx + 120, wy + 30);
  } else {
    disc(ctx, wx + 120, wy + 70, 14, "#ffcf7a");
  }
  const br = rng(11);
  for (let layer = 0; layer < 2; layer++) {
    let x = wx - 6;
    while (x < wx + ww) {
      const bw = 14 + Math.floor(br() * 22);
      const bh = (layer ? 26 : 40) + Math.floor(br() * (layer ? 26 : 34));
      const c = layer ? sky.b2 : sky.b1;
      const top = wy + wh - bh;
      R(ctx, Math.max(wx, x), top, Math.min(bw, wx + ww - Math.max(wx, x)), bh, c);
      for (let yy = top + 4; yy < wy + wh - 4; yy += 6)
        for (let xx = x + 3; xx < x + bw - 3; xx += 5) if (xx > wx && xx < wx + ww - 2 && br() < (layer ? sky.lit : sky.lit * 0.6) + 0.04) R(ctx, xx, yy, 2, 3, sky.win);
      x += bw + (layer ? 2 : 6);
    }
  }
  // frame + mullions
  ctx.strokeStyle = PAL.metal;
  R(ctx, wx - 4, wy - 4, ww + 8, 4, PAL.metal);
  R(ctx, wx - 4, wy + wh, ww + 8, 4, PAL.metal);
  R(ctx, wx - 4, wy, 4, wh, PAL.metal);
  R(ctx, wx + ww, wy, 4, wh, PAL.metal);
  for (const k of [1, 2]) R(ctx, wx + (ww / 3) * k - 1, wy, 3, wh, PAL.metal);
  for (let i = 0; i < 3; i++) R(ctx, wx + 10 + i * 68, wy + 8, 1, 30, "rgba(255,255,255,0.35)");
  // sill plants
  R(ctx, wx - 8, wy + wh + 4, ww + 16, 4, PAL.oakDark);
  snakePlant(ctx, wx + 20, wy + wh + 4, 34, PAL.white);
  pot(ctx, wx + ww - 24, wy + wh + 4, 14, 10, PAL.terracotta, PAL.terracottaDark);
  for (let i = 0; i < 4; i++) ellipse(ctx, wx + ww - 28 + i * 3, wy + wh - 10 - (i % 2) * 3, 3, 2, PAL.leafLight);

  // ---------------- glass office (team lead) back wall
  R(ctx, 636, 11, W - 636, 109, "#ebe3d6");
  R(ctx, 634, 11, 2, 157, "#d6ccbc");
  // bookshelf
  box(ctx, 646, 34, 56, 86, PAL.oak, PAL.oakDark);
  for (let s = 0; s < 3; s++) {
    R(ctx, 648, 60 + s * 26, 52, 3, PAL.oakDark);
    const cols = [PAL.terracotta, PAL.sage, "#5b6b9a", "#e3c26a", PAL.white, "#8a6fb3"];
    for (let i = 0; i < 8; i++) if ((i + s) % 4) R(ctx, 651 + i * 6, 41 + s * 26, 5, 19 - ((i * 3 + s) % 5), cols[(i + s * 2) % cols.length]);
  }
  // hanging plants
  pothos(ctx, 212, 34, 30);
  pothos(ctx, 620, 30, 36);

  // ---------------- lounge (bottom right)
  ellipse(ctx, 764, 490, 104, 46, "#e7cdb4");
  ellipse(ctx, 764, 490, 96, 41, "#f0dcc6");
  for (let i = 0; i < 3; i++) ellipse(ctx, 764, 490, 84 - i * 24, 34 - i * 10, i % 2 ? "#f0dcc6" : "#e9d1b9");
}

function cloud(ctx, x, y) {
  ellipse(ctx, x, y, 14, 5, "#ffffff");
  ellipse(ctx, x + 10, y - 3, 9, 5, "#ffffff");
  ellipse(ctx, x - 8, y + 1, 8, 4, "#ffffff");
}

function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

// ------------------------------------------------------------------ text helpers

function wrap(ctx, text, maxW, maxLines) {
  const out = [];
  let line = "";
  for (const ch of [...text]) {
    if (ctx.measureText(line + ch).width > maxW) {
      out.push(line);
      line = ch.trim() ? ch : "";
      if (out.length === maxLines) break;
    } else line += ch;
  }
  if (out.length < maxLines && line) out.push(line);
  if (out.length === maxLines && [...out.join("")].length < [...text].length) {
    let l = out[maxLines - 1];
    while (l && ctx.measureText(l + "…").width > maxW) l = l.slice(0, -1);
    out[maxLines - 1] = l + "…";
  }
  return out;
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// ------------------------------------------------------------------ scene

export class OfficeScene {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.bg = document.createElement("canvas");
    this.bg.width = W;
    this.bg.height = H;
    this.mode = null;
    this.chars = {};
    for (const d of [LEAD, ...ROLES]) this.chars[d.key] = new Character(d.look);
    this.actors = {}; // desk key → { state: away|walking|seated, path, t0, dur }
    this.planes = [];
    this.seenTasks = new Map();
    this.office = null;
    this.hover = null;
  }

  setOffice(office, { instant = false } = {}) {
    if (office !== this.office) {
      this.office = office;
      this.actors = {};
      this.seenTasks = new Map();
      this.instant = true;
    }
    if (instant) this.instant = true;
  }

  ensureBackground(now) {
    const mode = skyMode(new Date(now));
    if (mode === this.mode) return;
    this.mode = mode;
    const b = this.bg.getContext("2d");
    b.imageSmoothingEnabled = false;
    drawBackground(b, mode);
  }

  /** where each desk's character is right now (handles walking in and out) */
  actor(key, look, now) {
    const g = LAYOUT[key];
    const seat = { x: g.seatX, y: g.seatY };
    let a = this.actors[key];
    const want = look.present;
    if (!a) {
      a = this.actors[key] = { state: want ? "seated" : "away" };
      if (want && !this.instant) this.startWalk(a, key, true, now);
    } else if (want && (a.state === "away" || (a.state === "walking" && !a.inbound))) {
      this.startWalk(a, key, true, now, a.state === "walking" ? this.posOf(a, now) : null);
    } else if (!want && (a.state === "seated" || (a.state === "walking" && a.inbound))) {
      this.startWalk(a, key, false, now, a.state === "walking" ? this.posOf(a, now) : null);
    }
    if (a.state === "walking") {
      const p = this.posOf(a, now);
      if (p.done) {
        a.state = a.inbound ? "seated" : "away";
      } else return { x: p.x, y: p.y, walking: true, dir: p.dir };
    }
    return a.state === "seated" ? { ...seat, walking: false } : null;
  }

  startWalk(a, key, inbound, now, from = null) {
    const g = LAYOUT[key];
    const seat = { x: g.seatX, y: g.seatY };
    // path: door → down the left aisle → along the row (behind the desks) → seat
    const pts = inbound ? [from || DOOR, { x: DOOR.x, y: seat.y }, seat] : [from || seat, { x: DOOR.x, y: seat.y }, DOOR];
    if (from) pts.splice(1, 1, inbound ? { x: from.x, y: seat.y } : { x: DOOR.x, y: from.y });
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    Object.assign(a, { state: "walking", inbound, pts, t0: now, dur: Math.max(1, len / WALK_SPEED), len });
  }

  posOf(a, now) {
    const k = Math.min(1, (now - a.t0) / a.dur);
    let d = k * a.len;
    for (let i = 1; i < a.pts.length; i++) {
      const p = a.pts[i - 1];
      const q = a.pts[i];
      const seg = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      if (d <= seg || i === a.pts.length - 1) {
        const u = seg ? Math.min(1, d / seg) : 1;
        const dir = q.x > p.x ? "right" : q.x < p.x ? "left" : q.y > p.y ? "front" : "back";
        return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, dir, done: k >= 1 };
      }
      d -= seg;
    }
    return { ...a.pts[a.pts.length - 1], dir: "front", done: true };
  }

  render(now) {
    const ctx = this.ctx;
    this.ensureBackground(now);
    ctx.drawImage(this.bg, 0, 0);
    const o = this.office;
    const t = now;
    this.drawWall(ctx, o, now);

    const items = [];
    const looks = {};
    for (const d of [LEAD, ...ROLES]) {
      const desk_ = o ? o.desks[d.key] : null;
      const look = desk_ ? deskLook(desk_, now, o.ended) : { anim: null, tone: "off", present: false, status: "출근 전" };
      looks[d.key] = look;
      const g = LAYOUT[d.key];
      const pos = this.actor(d.key, look, now);
      const seated = pos && !pos.walking;
      items.push({ y: g.seatY - 1, draw: () => chair(ctx, g.cx, g.gy, d.color, !seated) });
      if (pos) {
        const ch = this.chars[d.key];
        if (pos.walking) items.push({ y: pos.y, draw: () => ch.draw(ctx, "walk", pos.dir, pos.x, pos.y, t) });
        else {
          // the sit/sleep frames sit lower in the frame; lift them so the shoulders clear the desk
          const anim = look.anim || "sit";
          const lift = anim === "sit" || anim === "sleep" ? 8 : 0;
          items.push({ y: g.seatY, draw: () => ch.draw(ctx, anim, "front", pos.x, pos.y - lift, t + d.key.length * 333) });
        }
      }
      const busy = look.tone === "busy";
      items.push({
        y: g.gy,
        draw: () => {
          desk(ctx, g, {
            color: d.color,
            t,
            busy,
            wide: d.key === "lead",
            accessories: ROLES.indexOf(d),
            screen: screenFor(ctx, seated ? look : null, desk_?.tool, d.color, t, d.key.charCodeAt(0) + d.key.length),
            label: (x, y) => this.namePlate(ctx, d, x, y),
          });
          this.statusPill(ctx, d, look, g);
        },
      });
    }
    this.lounge(items, t);
    this.glassWall(items);
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    this.delegations(ctx, o, now);
    // bubbles on top of everything
    if (o)
      for (const d of [LEAD, ...ROLES]) {
        const a = this.actors[d.key];
        if (!a || a.state !== "seated") continue;
        this.bubble(ctx, d, o.desks[d.key], looks[d.key], now);
      }
    this.instant = false;
  }

  drawWall(ctx, o, now) {
    // neon sign over the coffee bar
    const flick = Math.floor(now / 80) % 97 === 0 ? 0.4 : 1;
    ctx.font = FONT_B;
    ctx.textBaseline = "top";
    ctx.save();
    ctx.globalAlpha = flick;
    ctx.shadowColor = PAL.neon;
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ffd1e6";
    ctx.fillText("CLAUDE & CO.", 104, 26);
    ctx.restore();
    ctx.fillStyle = PAL.neon;
    ctx.globalAlpha = 0.9 * flick;
    ctx.fillText("CLAUDE & CO.", 104, 26);
    ctx.globalAlpha = 1;

    // espresso machine on the counter
    box(ctx, 96, 84, 34, 24, "#c9ccd2", PAL.ink);
    R(ctx, 99, 87, 28, 6, "#a7abb4");
    R(ctx, 102, 95, 3, 3, PAL.terracotta);
    R(ctx, 110, 98, 8, 4, PAL.metal);
    mug(ctx, 110, 100, PAL.white, now, true);
    mug(ctx, 146, 100, PAL.sage, now, false);
    mug(ctx, 160, 100, PAL.terracotta, now, false);
    box(ctx, 176, 92, 20, 16, "#f4e7d1", PAL.oakDark);
    R(ctx, 179, 96, 14, 2, PAL.oakDark);

    // clock
    disc(ctx, 534, 58, 17, PAL.ink);
    disc(ctx, 534, 58, 15, PAL.white);
    const d = new Date(now);
    const hand = (ang, len, w, c) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(534.5, 58.5);
      ctx.lineTo(534.5 + Math.sin(ang) * len, 58.5 - Math.cos(ang) * len);
      ctx.stroke();
    };
    for (let i = 0; i < 12; i++) R(ctx, 534 + Math.round(Math.sin((i / 6) * Math.PI) * 12), 58 - Math.round(Math.cos((i / 6) * Math.PI) * 12), 1, 1, PAL.ink);
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 7, 2, PAL.ink);
    hand(d.getMinutes() * (Math.PI / 30), 11, 1, PAL.ink);
    hand(d.getSeconds() * (Math.PI / 30), 12, 1, PAL.terracotta);

    this.whiteboard(ctx, o);
    this.tv(ctx, o, now);
  }

  whiteboard(ctx, o) {
    const x = 470;
    const y = 22;
    const w = 156;
    const h = 96;
    box(ctx, x, y, w, h, PAL.white, "#9aa0ab");
    R(ctx, x + 2, y + h - 2, w - 4, 4, "#c6cbd3");
    R(ctx, x + 20, y + h + 1, 10, 3, PAL.terracotta);
    R(ctx, x + 34, y + h + 1, 10, 3, "#5b8def");
    R(ctx, x + 48, y + h + 1, 10, 3, "#3fae6a");
    ctx.font = FONT_B;
    ctx.textBaseline = "top";
    ctx.fillStyle = PAL.ink;
    ctx.fillText("📋 TO-DO", x + 7, y + 5);
    R(ctx, x + 6, y + 19, w - 12, 1, "#d7dbe2");
    ctx.font = FONT;
    const todos = o?.todos || [];
    if (!todos.length) {
      ctx.fillStyle = "#7b8190";
      const lines = wrap(ctx, o?.request ? `요청: ${o.request}` : "요청을 기다리는 중…", w - 16, 5);
      lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 24 + i * 14));
      return;
    }
    const done = todos.filter((t) => t.status === "completed").length;
    ctx.fillStyle = "#7b8190";
    const prog = `${done}/${todos.length}`;
    ctx.fillText(prog, x + w - 8 - ctx.measureText(prog).width, y + 5);
    // keep the current item visible
    const cur = Math.max(0, todos.findIndex((t) => t.status !== "completed"));
    const start = Math.min(Math.max(0, cur - 1), Math.max(0, todos.length - 5));
    todos.slice(start, start + 5).forEach((td, i) => {
      const yy = y + 24 + i * 14;
      if (td.status === "completed") {
        ctx.fillStyle = "#3fae6a";
        ctx.fillText("✓", x + 8, yy);
        ctx.fillStyle = "#a4aab5";
      } else if (td.status === "in_progress") {
        R(ctx, x + 4, yy - 1, w - 8, 13, "#e6efff");
        ctx.fillStyle = "#3b6fe0";
        ctx.fillText("▶", x + 8, yy);
      } else {
        ctx.fillStyle = "#9aa0ab";
        ctx.fillText("○", x + 8, yy);
        ctx.fillStyle = PAL.ink;
      }
      if (td.status === "in_progress") ctx.fillStyle = "#1e3a8a";
      const txt = fit(ctx, td.text, w - 30);
      ctx.fillText(txt, x + 21, yy);
      if (td.status === "completed") R(ctx, x + 21, yy + 6, ctx.measureText(txt).width, 1, "#a4aab5");
    });
  }

  tv(ctx, o, now) {
    const x = 724;
    const y = 30;
    const w = 140;
    const h = 78;
    box(ctx, x - 3, y - 3, w + 6, h + 6, PAL.metal);
    R(ctx, x, y, w, h, "#10162a");
    ctx.font = FONT;
    ctx.textBaseline = "top";
    const active = o ? [LEAD, ...ROLES].filter((d) => deskLook(o.desks[d.key], now, o.ended).tone === "busy").length : 0;
    const mins = o && o.stats.startTs ? Math.floor((o.stats.lastTs - o.stats.startTs) / 60000) : 0;
    ctx.fillStyle = "#7f8bb0";
    ctx.fillText("TEAM LIVE", x + 6, y + 5);
    const live = o && now - o.stats.lastTs < 60_000;
    disc(ctx, x + w - 10, y + 10, 3, live ? (Math.floor(now / 500) % 2 ? "#ff5d5d" : "#ff9a9a") : "#4b536d");
    ctx.font = FONT_B;
    const stat = (label, value, yy, c) => {
      ctx.fillStyle = "#9aa6c8";
      ctx.font = FONT;
      ctx.fillText(label, x + 6, yy);
      ctx.fillStyle = c;
      ctx.font = FONT_B;
      const v = String(value);
      ctx.fillText(v, x + w - 8 - ctx.measureText(v).width, yy);
    };
    stat("근무 중", `${active}/7`, y + 22, "#7ef0b0");
    stat("도구 사용", o?.stats.tools ?? 0, y + 36, "#8fb4ff");
    stat("업무 위임", o?.stats.delegations ?? 0, y + 50, "#f7c873");
    stat("경과", `${mins}분`, y + 64, "#ff9fc4");
  }

  namePlate(ctx, d, x, y) {
    ctx.font = FONT_B;
    ctx.textBaseline = "top";
    const label = d.key === "lead" ? `${d.en} · ${d.name}` : `${d.name} · ${d.en}`;
    const w = Math.ceil(ctx.measureText(label).width) + 14;
    box(ctx, x - w / 2, y - 1, w, 16, d.color, PAL.ink);
    R(ctx, x - w / 2 + 1, y + 13, w - 2, 1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = "#1b1a22";
    ctx.fillText(label, Math.round(x - w / 2 + 7), y + 1);
  }

  statusPill(ctx, d, look, g) {
    const tone = { busy: "#3b82f6", done: "#22c55e", error: "#ef4444", wait: "#f59e0b", idle: "#94a3b8", off: "#b8b0a3" }[look.tone];
    ctx.font = FONT;
    ctx.textBaseline = "top";
    const text = look.status;
    const w = Math.ceil(ctx.measureText(text).width) + 20;
    const x = Math.round(g.cx - w / 2);
    const y = g.gy + 4;
    box(ctx, x, y, w, 15, "rgba(255,255,255,0.92)", "rgba(35,32,42,0.35)");
    disc(ctx, x + 7, y + 7, 2, tone);
    ctx.fillStyle = "#3a3744";
    ctx.fillText(text, x + 13, y + 1);
  }

  bubble(ctx, d, desk_, look, now) {
    const b = desk_.bubble;
    if (!b) return;
    const age = now - b.ts;
    const sticky = look.tone === "busy" && (b.kind === "tool" || b.kind === "task" || b.kind === "prompt" || b.kind === "delegate");
    const life = sticky ? 60_000 : b.kind === "notify" ? 30_000 : 9000;
    if (age > life || look.anim === "sleep") return;
    const g = LAYOUT[d.key];
    ctx.font = FONT;
    ctx.textBaseline = "top";
    const maxW = d.key === "lead" ? 210 : 176;
    const lines = b.kind === "tool" ? [fit(ctx, b.text, maxW - 14)] : wrap(ctx, b.text, maxW - 14, 2);
    const w = Math.min(maxW, Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 14);
    const h = lines.length * 14 + 8;
    let x = Math.round(g.cx - w / 2 + 6);
    x = Math.max(4, Math.min(W - w - 4, x));
    const y = g.seatY - 104 - h;
    const pop = Math.min(1, age / 140);
    ctx.globalAlpha = age > life - 600 ? Math.max(0, (life - age) / 600) : 1;
    const border = b.kind === "error" ? "#ef4444" : b.kind === "notify" ? "#f59e0b" : b.kind === "done" ? "#22c55e" : PAL.ink;
    const yy = y + Math.round((1 - pop) * 4);
    R(ctx, x + 2, yy + 2, w, h, "rgba(35,32,42,0.18)");
    box(ctx, x, yy, w, h, "#ffffff", border);
    R(ctx, x + 1, yy + 1, 3, h - 2, d.color);
    // tail
    const tx = Math.max(x + 8, Math.min(x + w - 12, g.cx + 4));
    R(ctx, tx, yy + h - 1, 6, 2, "#ffffff");
    R(ctx, tx + 1, yy + h + 1, 4, 2, "#ffffff");
    R(ctx, tx + 2, yy + h + 3, 2, 2, "#ffffff");
    R(ctx, tx - 1, yy + h, 1, 2, border);
    R(ctx, tx + 6, yy + h, 1, 2, border);
    R(ctx, tx, yy + h + 2, 1, 2, border);
    R(ctx, tx + 5, yy + h + 2, 1, 2, border);
    R(ctx, tx + 1, yy + h + 4, 1, 2, border);
    R(ctx, tx + 4, yy + h + 4, 1, 2, border);
    R(ctx, tx + 2, yy + h + 5, 2, 1, border);
    ctx.fillStyle = "#24212b";
    lines.forEach((l, i) => ctx.fillText(l, x + 8, yy + 4 + i * 14));
    ctx.globalAlpha = 1;
  }

  /** paper planes from the lead to a desk when work is handed over */
  delegations(ctx, o, now) {
    if (!o) return;
    for (const d of ROLES) {
      const b = o.desks[d.key].bubble;
      if (!b || b.kind !== "task") continue;
      if (this.seenTasks.get(d.key) === b.ts) continue;
      this.seenTasks.set(d.key, b.ts);
      if (now - b.ts < 1500 && !this.instant) this.planes.push({ to: d.key, t0: now });
    }
    const from = LAYOUT.lead;
    this.planes = this.planes.filter((p) => now - p.t0 < 1100);
    for (const p of this.planes) {
      const g = LAYOUT[p.to];
      const k = (now - p.t0) / 1100;
      const x = from.cx - 40 + (g.cx - from.cx + 40) * k;
      const y = from.seatY - 70 + (g.seatY - 70 - from.seatY + 70) * k - Math.sin(k * Math.PI) * 60;
      const dir = g.cx < from.cx ? -1 : 1;
      R(ctx, x - 5 * dir, y, 10, 1, "#ffffff");
      R(ctx, x - 3 * dir, y - 2, 6, 2, "#ffffff");
      R(ctx, x - 4 * dir, y + 1, 5, 2, "#d9dee8");
      R(ctx, x - 6 * dir, y - 1, 2, 1, PAL.ink);
    }
  }

  lounge(items, t) {
    const ctx = this.ctx;
    // sofa (seen from the front)
    items.push({
      y: 530,
      draw: () => {
        const x = 692;
        const y = 478;
        box(ctx, x, y, 148, 30, "#4f7f7a", PAL.ink, 2); // back
        for (let i = 0; i < 3; i++) box(ctx, x + 8 + i * 44, y + 6, 44, 20, "#5f948e", "#3d6460");
        box(ctx, x - 6, y + 22, 160, 30, "#5f948e", PAL.ink, 2); // seat
        R(ctx, x - 5, y + 23, 158, 3, "#78aea7");
        box(ctx, x - 12, y + 14, 14, 38, "#4f7f7a", PAL.ink); // arms
        box(ctx, x + 146, y + 14, 14, 38, "#4f7f7a", PAL.ink);
        R(ctx, x, y + 52, 4, 4, PAL.metal);
        R(ctx, x + 144, y + 52, 4, 4, PAL.metal);
        box(ctx, x + 16, y + 12, 22, 16, PAL.terracotta, PAL.terracottaDark); // cushions
        box(ctx, x + 110, y + 12, 22, 16, "#e9d7b8", PAL.oakDark);
      },
    });
    // coffee table + laptop
    items.push({
      y: 462,
      draw: () => {
        ellipse(ctx, 764, 460, 30, 9, "rgba(60,40,20,0.15)");
        ellipse(ctx, 764, 446, 30, 10, PAL.ink);
        ellipse(ctx, 764, 445, 28, 8, PAL.oak);
        R(ctx, 762, 450, 4, 10, PAL.metal);
        mug(ctx, 772, 436, PAL.white, t, false);
        box(ctx, 744, 438, 18, 6, "#e3c26a", PAL.oakDark);
      },
    });
    items.push({ y: 412, draw: () => monstera(ctx, 858, 412, 1.1, t) });
    items.push({ y: 552, draw: () => monstera(ctx, 30, 552, 1.25, t) });
    items.push({ y: 548, draw: () => snakePlant(ctx, 642, 548, 54, PAL.metal) });
    items.push({ y: 290, draw: () => snakePlant(ctx, 22, 290, 50, PAL.terracotta) });
    // floor lamp
    items.push({
      y: 520,
      draw: () => {
        R(ctx, 666, 400, 2, 120, PAL.metal);
        R(ctx, 658, 518, 18, 3, PAL.metal);
        ellipse(ctx, 667, 398, 12, 6, "#f3e2c0");
        R(ctx, 655, 398, 24, 2, "#d7c39b");
      },
    });
  }

  glassWall(items) {
    const ctx = this.ctx;
    // glass partition of the lead office, with an opening the lead walks through
    const gx = 628;
    const pane = (y0, y1) => {
      ctx.fillStyle = PAL.glass;
      ctx.fillRect(gx + 2, y0, 8, y1 - y0);
      R(ctx, gx, y0, 2, y1 - y0, PAL.metal);
      R(ctx, gx + 10, y0, 2, y1 - y0, PAL.metal);
      R(ctx, gx, y0, 12, 2, PAL.metal);
      R(ctx, gx + 3, y0 + 6, 1, 18, PAL.glassEdge);
    };
    items.push({ y: 230, draw: () => pane(168, 236) });
    items.push({
      y: 380,
      draw: () => {
        pane(296, 380);
        ctx.fillStyle = "rgba(190,225,240,0.16)";
        ctx.fillRect(gx + 12, 362, W - gx - 12, 16);
        R(ctx, gx, 378, W - gx, 3, PAL.metal);
        R(ctx, gx + 12, 362, W - gx - 12, 1, PAL.glassEdge);
        for (let x = gx + 30; x < W; x += 56) R(ctx, x, 364, 14, 1, "rgba(255,255,255,0.6)");
      },
    });
  }

  /** desk under a canvas point (for hover / click) */
  hit(x, y) {
    for (const [key, g] of Object.entries(LAYOUT)) if (x > g.cx - g.w / 2 && x < g.cx + g.w / 2 && y > g.seatY - 100 && y < g.gy + 20) return key;
    return null;
  }
}

export { deskByKey, toolLabel };
