/**
 * The office scene (canvas): static background cached per time of day / company level,
 * then every frame the desks, characters, walkers, coffee breaks and confetti, depth-sorted by y.
 * All TEXT (name plates, status cards, speech bubbles, whiteboard, TV) is HTML — see overlay.js —
 * so it stays sharp and readable at any size.
 */
import { ROLES, LEAD } from "../lib/roles.js";
import { Character } from "./sprites.js";
import { PAL, R, box, disc, ellipse, rng, monstera, snakePlant, pothos, pot, chair, desk, screenFor, screen2For, mug } from "./art.js";

import { W, H, WALL, DOOR, WALK_SPEED, ORDER, coffeeSpot, BOARD, TV, LAYOUT } from "./layout.js";
export { W, H, DOOR, ORDER, coffeeSpot, BOARD, TV, LAYOUT };
const FONT_B = "bold 11px 'Galmuri11 Bold', monospace";

export function skyMode(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 17) return "day";
  if ((h >= 17 && h < 19.5) || (h >= 5 && h < 7)) return "sunset";
  return "night";
}

const SKY = {
  day: { top: "#8fd0f5", bottom: "#e2f4fc", b1: "#a9bfd6", b2: "#8aa3bd", win: "#d9ecf7", lit: 0.05 },
  sunset: { top: "#f59a7a", bottom: "#ffd6a1", b1: "#8f7d98", b2: "#6c5f7d", win: "#ffe3a6", lit: 0.35 },
  night: { top: "#1c2a4f", bottom: "#4a4f86", b1: "#33406a", b2: "#26304f", win: "#ffd77a", lit: 0.55 },
};

function drawBackground(ctx, mode, level) {
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
  const ry = 186;
  const rw = 552;
  const rh = 372;
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
  // Pixel District town: pastel buildings with outlines, then a row of round trees
  const br = rng(11);
  const facades = mode === "night" ? null : ["#f4e3c3", "#f6c9b4", "#c9def0", "#cfe6cf", "#e9d5f0", "#fbf3e4"];
  for (let layer = 0; layer < 2; layer++) {
    let x = wx - 6;
    while (x < wx + ww) {
      const bw = 16 + Math.floor(br() * 20);
      const bh = (layer ? 22 : 40) + Math.floor(br() * (layer ? 22 : 30));
      const top = wy + wh - bh - 8;
      const x0 = Math.max(wx, x);
      const w0 = Math.min(bw, wx + ww - x0);
      const c = facades ? (layer ? facades[Math.floor(br() * facades.length)] : mix(sky.b1, "#ffffff", 0.35)) : layer ? sky.b2 : sky.b1;
      if (w0 > 0) {
        R(ctx, x0, top, w0, bh + 8, facades && layer ? "#5a6b86" : c);
        R(ctx, x0 + 1, top + 1, Math.max(0, w0 - 2), bh + 8, c);
        if (facades && layer) R(ctx, x0, top - 3, w0, 3, ["#d9735b", "#4d7fb3", "#6aa36f"][Math.floor(br() * 3)]);
      }
      for (let yy = top + 4; yy < wy + wh - 10; yy += 6)
        for (let xx = x + 3; xx < x + bw - 3; xx += 5)
          if (xx > wx && xx < wx + ww - 2) {
            if (facades && layer) R(ctx, xx, yy, 2, 3, br() < 0.8 ? "#7fb3dc" : "#ffffff");
            else if (br() < (layer ? sky.lit : sky.lit * 0.6) + 0.04) R(ctx, xx, yy, 2, 3, sky.win);
          }
      x += bw + (layer ? 2 : 6);
    }
  }
  const treeC = mode === "night" ? ["#1f3a3a", "#2a4d47"] : ["#4fa65f", "#7cc77a"];
  for (let x = wx + 4; x < wx + ww; x += 13) {
    const r = 6 + Math.floor(br() * 3);
    ellipse(ctx, x, wy + wh - 6, r, r - 1, treeC[0]);
    ellipse(ctx, x - 1, wy + wh - 8, r - 3, r - 4, treeC[1]);
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
  ellipse(ctx, 764, 524, 104, 46, "#e7cdb4");
  ellipse(ctx, 764, 524, 96, 41, "#f0dcc6");
  for (let i = 0; i < 3; i++) ellipse(ctx, 764, 524, 84 - i * 24, 34 - i * 10, i % 2 ? "#f0dcc6" : "#e9d1b9");

  // ---------------- sunlight through the window, falling across the floor
  if (mode !== "night") {
    const beam = mode === "day" ? "rgba(255,244,205,0.16)" : "rgba(255,196,130,0.2)";
    for (let k = 0; k < 3; k++) {
      const x0 = 236 + k * 62;
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x0, WALL + 6);
      ctx.lineTo(x0 + 34, WALL + 6);
      ctx.lineTo(x0 + 34 + 150, 470);
      ctx.lineTo(x0 + 150, 470);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "rgba(150,170,255,0.07)";
    ctx.beginPath();
    ctx.moveTo(250, WALL + 6);
    ctx.lineTo(410, WALL + 6);
    ctx.lineTo(540, 440);
    ctx.lineTo(380, 440);
    ctx.fill();
  }

  // ---------------- curtains with tie-backs
  const drape = (x, flip) => {
    R(ctx, x, 22, 24, 104, "#f4ece0");
    for (let i = 0; i < 5; i++) R(ctx, x + 2 + i * 5, 24, 2, 100, i % 2 ? "#e6dac9" : "#fbf5ec");
    R(ctx, x, 22, 24, 3, "#c9b79d");
    R(ctx, x + (flip ? -1 : 23), 76, 3, 8, PAL.sage);
    R(ctx, x, 78, 24, 4, PAL.sage);
    R(ctx, x, 78, 24, 1, PAL.sageLight);
  };
  drape(wx - 20, false);
  drape(wx + ww - 4, true);
  R(ctx, wx - 24, 20, ww + 48, 3, PAL.metal); // rod

  // ---------------- pet beds
  for (const [bx, by, c, d] of [[130, 580, "#c9d8f0", "#a7bde0"], [612, 582, "#f5c9c0", "#e2a79c"], [840, 580, "#d9ead3", "#b8d3ae"]]) {
    ellipse(ctx, bx, by + 2, 24, 8, "rgba(60,40,20,0.14)");
    ellipse(ctx, bx, by, 22, 8.5, d);
    ellipse(ctx, bx, by - 1, 19, 6.5, c);
    ellipse(ctx, bx, by - 1, 10, 3.2, mix(c, "#ffffff", 0.35));
  }

  // ---------------- whiteboard + TV frames (their text is HTML, see overlay.js)
  box(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, PAL.white, "#9aa0ab");
  R(ctx, BOARD.x + 2, BOARD.y + BOARD.h - 2, BOARD.w - 4, 4, "#c6cbd3");
  R(ctx, BOARD.x + 20, BOARD.y + BOARD.h + 1, 10, 3, PAL.terracotta);
  R(ctx, BOARD.x + 34, BOARD.y + BOARD.h + 1, 10, 3, "#5b8def");
  R(ctx, BOARD.x + 48, BOARD.y + BOARD.h + 1, 10, 3, "#3fae6a");
  box(ctx, TV.x - 3, TV.y - 3, TV.w + 6, TV.h + 6, PAL.metal);
  R(ctx, TV.x, TV.y, TV.w, TV.h, "#10162a");
  R(ctx, TV.x + 1, TV.y + 1, TV.w - 2, 1, "rgba(255,255,255,0.12)");

  // ---------------- signboard over the coffee bar
  box(ctx, 92, 18, 116, 24, PAL.ink, PAL.ink, 2);
  R(ctx, 100, 30, 3, 6, PAL.white);
  R(ctx, 104, 25, 3, 11, PAL.white);
  R(ctx, 108, 28, 3, 8, PAL.white);
  ctx.font = FONT_B;
  ctx.textBaseline = "top";
  ctx.fillStyle = PAL.white;
  ctx.fillText("PIXEL OFFICE", 116, 24);
  R(ctx, 120, 11, 1, 7, PAL.metal);
  R(ctx, 180, 11, 1, 7, PAL.metal);

  drawDecor(ctx, level);
}

/** The office grows with the company: each level adds something to look at. */
function drawDecor(ctx, level) {
  if (level >= 2) {
    // trophy on the bookshelf
    R(ctx, 664, 24, 12, 3, PAL.goldDark);
    R(ctx, 665, 27, 10, 5, PAL.gold);
    R(ctx, 668, 32, 4, 2, PAL.goldDark);
    R(ctx, 664, 34, 12, 1, PAL.ink);
  }
  if (level >= 3) {
    // framed certificates on the wainscot
    [244, 288, 332].forEach((x, i) => {
      box(ctx, x, 130, 32, 26, PAL.white, PAL.ink);
      R(ctx, x + 4, 134, 24, 3, i === 1 ? PAL.terracotta : PAL.sage);
      for (let k = 0; k < 3; k++) R(ctx, x + 4, 140 + k * 4, 18 + ((k * 5) % 6), 1, "#b8bdc9");
      disc(ctx, x + 25, 149, 2, PAL.gold);
    });
  }
  if (level >= 4) {
    // hanging lamps over the team rug
    [162, 342, 522].forEach((x) => {
      R(ctx, x, 168, 1, 12, PAL.metal);
      ellipse(ctx, x, 184, 12, 5, PAL.gold);
      R(ctx, x - 12, 184, 24, 1, PAL.goldDark);
      ctx.fillStyle = "rgba(255,226,150,0.13)";
      ctx.fillRect(x - 10, 189, 20, 4);
    });
  }
  if (level >= 5) {
    // executive carpet under the lead's desk
    R(ctx, 680, 262, 164, 130, "rgba(60,40,20,0.1)");
    box(ctx, 676, 258, 164, 130, "#b9473f", "#7c2a28", 2);
    R(ctx, 684, 266, 148, 2, "#e07a6e");
    R(ctx, 684, 376, 148, 2, "#e07a6e");
    for (let x = 688; x < 828; x += 14) R(ctx, x, 270, 6, 1, "#e9c27a");
  }
  if (level >= 6) {
    // golden unicorn statue
    R(ctx, 588, 548, 28, 10, PAL.metal);
    R(ctx, 592, 530, 20, 18, PAL.gold);
    R(ctx, 606, 522, 8, 10, PAL.gold);
    R(ctx, 612, 514, 2, 8, "#fff3c4");
    R(ctx, 596, 534, 4, 4, PAL.goldDark);
    R(ctx, 592, 546, 20, 2, PAL.goldDark);
  }
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

// ------------------------------------------------------------------ small pixel emotes above heads
const EMOTES = {
  spark: { c: "#f2b62e", b: ["...#...", "...#...", ".#.#.#.", "#######", ".#.#.#.", "...#...", "...#..."] },
  bang: { c: "#e5484d", b: ["..###..", "..###..", "..###..", "..###..", ".......", "..###..", "..###.."] },
  ask: { c: "#e8960c", b: [".#####.", "#.....#", "......#", "...###.", "...#...", ".......", "...#..."] },
  z: { c: "#7d8fc9", b: ["#####", "...#.", "..#..", ".#...", "#####"] },
};

function drawEmote(ctx, kind, x, y, t) {
  const e = EMOTES[kind];
  if (!e) return;
  const bob = Math.round(Math.sin(t / 260) * 1.2);
  e.b.forEach((row, j) => [...row].forEach((ch, i) => ch === "#" && R(ctx, x + i, y + j + bob, 1, 1, e.c)));
}

function drawDots(ctx, x, y, t) {
  const n = Math.floor(t / 320) % 4;
  for (let i = 0; i < 3; i++) R(ctx, x + i * 4, y + 3, 3, 3, i < n ? "#8b93a8" : "#d3d7e0");
}

/** every character moves a little differently, so nobody breathes in sync */
const PHASE = {
  lead: { off: 0, rate: 1 },
  plan: { off: 713, rate: 0.94 },
  dev: { off: 1291, rate: 1.05 },
  test: { off: 407, rate: 0.97 },
  mkt: { off: 1877, rate: 1.03 },
  design: { off: 959, rate: 0.92 },
  review: { off: 1553, rate: 1.07 },
};

// ------------------------------------------------------------------ walking

/** the points a character passes between two places (hub = the door) */
function pointsFor(loc, key) {
  const g = LAYOUT[key];
  if (loc === "away") return [DOOR];
  // walk along the back of the desks: high enough that legs and shoes are not hidden by the desk top
  if (loc === "seat") return [DOOR, { x: DOOR.x, y: g.seatY - 36 }, { x: g.seatX, y: g.seatY }];
  return [DOOR, coffeeSpot(key)];
}

function route(from, to, key) {
  return pointsFor(from, key).slice().reverse().concat(pointsFor(to, key).slice(1));
}

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function lengthOf(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** the polyline up to distance d from its start */
function prefixTo(pts, d) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (d >= seg) {
      out.push(pts[i]);
      d -= seg;
    } else {
      const u = seg ? d / seg : 0;
      out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u });
      break;
    }
  }
  return out;
}

function posOf(w, now) {
  let d = Math.max(0, Math.min(w.len, (now - w.t0) * WALK_SPEED));
  for (let i = 1; i < w.pts.length; i++) {
    const p = w.pts[i - 1];
    const q = w.pts[i];
    const seg = dist(p, q);
    if (d <= seg || i === w.pts.length - 1) {
      const u = seg ? Math.min(1, d / seg) : 1;
      const dir = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y) ? (q.x >= p.x ? "right" : "left") : q.y > p.y ? "front" : "back";
      return { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, dir, done: now - w.t0 >= w.dur };
    }
    d -= seg;
  }
  const last = w.pts[w.pts.length - 1];
  return { x: last.x, y: last.y, dir: "front", done: true };
}

// ------------------------------------------------------------------ scene

export class OfficeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bg = document.createElement("canvas");
    this.S = 1;
    this.bgKey = null;
    this.level = 1;
    this.chars = {};
    for (const d of [LEAD, ...ROLES]) this.chars[d.key] = new Character(d.look);
    this.actors = {};
    this.planes = [];
    this.parts = [];
    this.seenTasks = new Map();
    this.office = null;
    this.instant = true;
    this.reduced = false; // prefers-reduced-motion: nobody walks, no confetti, cats stay put
    this.cats = null;
    this.frame = { looks: {}, actors: {} };
    this.lastT = 0;
    this.resize(1);
  }

  /** @param scale  device pixels per world pixel (css scale × devicePixelRatio) */
  resize(scale) {
    const S = Math.max(1, Math.min(4, Math.ceil(scale)));
    this.S = S;
    this.canvas.width = this.bg.width = W * S;
    this.canvas.height = this.bg.height = H * S;
    this.bgKey = null;
  }

  setOffice(office) {
    if (office === this.office) return;
    this.office = office;
    this.actors = {};
    this.seenTasks = new Map();
    this.planes = [];
    this.instant = true;
  }

  setLevel(level) {
    this.level = level;
  }

  setCats(cats) {
    this.cats = cats;
  }

  /** confetti from a world point */
  burst(x, y, n = 28) {
    if (this.reduced) return;
    const colors = ["#f2c14e", "#ef9a7a", "#7cc77a", "#7fb0ff", "#ff8fb1", "#ffffff"];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.06 + Math.random() * 0.16;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.12, life: 900 + Math.random() * 700, age: 0, c: colors[i % colors.length] });
    }
  }

  ensureBackground(now) {
    const key = `${skyMode(new Date(now))}|${this.level}`;
    if (key === this.bgKey) return;
    this.bgKey = key;
    const b = this.bg.getContext("2d");
    b.setTransform(this.S, 0, 0, this.S, 0, 0);
    b.imageSmoothingEnabled = false;
    drawBackground(b, skyMode(new Date(now)), this.level);
  }

  /** where each character is right now; walks in, goes for coffee, walks out */
  actor(key, look, now) {
    const desired = !look.present ? "away" : look.coffee ? "coffee" : "seat";
    let a = this.actors[key];
    const inst = this.instant || this.reduced;
    if (!a) a = this.actors[key] = { loc: inst ? desired : "away", walk: null };
    if (a.walk && a.walk.to !== desired) {
      // changed their mind mid-way: turn around and go back the way they came
      const w = a.walk;
      const back = prefixTo(w.pts, Math.min(w.len, (now - w.t0) * WALK_SPEED)).reverse();
      const pts = desired === w.from ? back : back.concat(route(w.from, desired, key).slice(1));
      const len = lengthOf(pts);
      a.walk = { pts, t0: now, len, dur: Math.max(1, len / WALK_SPEED), from: w.from, to: desired };
    } else if (!a.walk && a.loc !== desired) {
      if (inst) a.loc = desired;
      else {
        const pts = route(a.loc, desired, key);
        const len = lengthOf(pts);
        a.walk = { pts, t0: now, len, dur: Math.max(1, len / WALK_SPEED), from: a.loc, to: desired };
      }
    }
    if (a.walk) {
      const p = posOf(a.walk, now);
      if (!p.done) return { loc: "walking", x: p.x, y: p.y, dir: p.dir };
      a.loc = a.walk.to;
      a.walk = null;
    }
    if (a.loc === "away") return null;
    if (a.loc === "coffee") return { loc: "coffee", ...coffeeSpot(key) };
    const g = LAYOUT[key];
    return { loc: "seat", x: g.seatX, y: g.seatY };
  }

  render(now, looks) {
    const ctx = this.ctx;
    const S = this.S;
    this.ensureBackground(now);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bg, 0, 0, W, H);
    const o = this.office;
    const t = now;
    this.drawDynamic(ctx, now);

    const items = [];
    const actors = {};
    for (const d of [LEAD, ...ROLES]) {
      const look = looks[d.key];
      const g = LAYOUT[d.key];
      const pos = this.actor(d.key, look, now);
      actors[d.key] = pos;
      const seated = !!pos && pos.loc === "seat";
      const ch = this.chars[d.key];
      items.push({ y: g.seatY - 1, draw: () => chair(ctx, g.cx, g.gy, d.color, !seated) });
      if (pos && pos.loc === "walking") items.push({ y: pos.y, draw: () => ch.draw(ctx, "walk", pos.dir, pos.x, pos.y, t * PHASE[d.key].rate + PHASE[d.key].off) });
      else if (pos && pos.loc === "coffee")
        items.push({
          y: pos.y,
          draw: () => {
            ch.draw(ctx, "idle", "back", pos.x, pos.y, t * PHASE[d.key].rate + PHASE[d.key].off);
            mug(ctx, pos.x + 9, pos.y - 46, PAL.white, t, true);
          },
        });
      else if (seated) {
        // the sit/sleep frames sit lower in the frame; lift them so the shoulders clear the desk
        const anim = look.anim || "sit";
        const lift = anim === "sit" || anim === "sleep" ? 8 : 0;
        items.push({ y: g.seatY, draw: () => ch.draw(ctx, anim, "front", pos.x, pos.y - lift, t * PHASE[d.key].rate + PHASE[d.key].off) });
      }
      const busy = look.tone === "busy";
      const act = o && o.desks[d.key].act;
      const seatLook = seated ? look : null;
      const seed = d.key.charCodeAt(0) + d.key.length;
      items.push({
        y: g.gy,
        draw: () =>
          desk(ctx, g, {
            color: d.color,
            t,
            busy,
            accessories: ROLES.indexOf(d),
            screen: screenFor(ctx, seatLook, act, d.color, t, seed),
            screen2: screen2For(ctx, seatLook, d.color, t, seed),
          }),
      });
    }
    this.lounge(items, t);
    this.glassWall(items);
    if (this.cats) {
      this.cats.update(t);
      items.push(...this.cats.items(ctx, t, S));
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // emotes follow the real state of each desk
    for (const d of [LEAD, ...ROLES]) {
      const pos = actors[d.key];
      if (!pos || pos.loc !== "seat") continue;
      const look = looks[d.key];
      const g = LAYOUT[d.key];
      const ex = g.seatX + 22;
      const ey = g.seatY - 96;
      if (look.tone === "done") drawEmote(ctx, "spark", ex, ey, t);
      else if (look.tone === "error") drawEmote(ctx, "bang", ex, ey, t);
      else if (look.tone === "wait") drawEmote(ctx, "ask", ex, ey, t);
      else if (look.tone === "busy" && look.anim === "sit") drawDots(ctx, ex - 2, ey + 2, t);
      else if (look.anim === "sleep") {
        const k = Math.floor(t / 700) % 3;
        drawEmote(ctx, "z", ex - 2 + k * 3, ey + 4 - k * 4, 0);
      }
    }

    this.delegations(ctx, o, now);
    this.drawParticles(ctx, now);
    this.frame = { looks, actors };
  }

  drawDynamic(ctx, now) {
    // sign light
    disc(ctx, 203, 23, 2, Math.floor(now / 700) % 2 ? PAL.gold : "#7a6a3a");
    // espresso machine + mugs on the counter
    box(ctx, 96, 84, 34, 24, "#c9ccd2", PAL.ink);
    R(ctx, 99, 87, 28, 6, "#a7abb4");
    R(ctx, 102, 95, 3, 3, PAL.terracotta);
    R(ctx, 110, 98, 8, 4, PAL.metal);
    mug(ctx, 110, 100, PAL.white, now, true);
    mug(ctx, 146, 100, PAL.sage, now, false);
    mug(ctx, 160, 100, PAL.terracotta, now, false);
    box(ctx, 176, 92, 20, 16, "#f4e7d1", PAL.oakDark);
    R(ctx, 179, 96, 14, 2, PAL.oakDark);
    // clock above the door
    const cx = 44;
    const cy = 26;
    disc(ctx, cx, cy, 10, PAL.ink);
    disc(ctx, cx, cy, 8, PAL.white);
    const d = new Date(now);
    const hand = (ang, len, w, c) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx + 0.5, cy + 0.5);
      ctx.lineTo(cx + 0.5 + Math.sin(ang) * len, cy + 0.5 - Math.cos(ang) * len);
      ctx.stroke();
    };
    for (let i = 0; i < 4; i++) R(ctx, cx + Math.round(Math.sin((i / 2) * Math.PI) * 6), cy - Math.round(Math.cos((i / 2) * Math.PI) * 6), 1, 1, PAL.ink);
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 4, 2, PAL.ink);
    hand(d.getMinutes() * (Math.PI / 30), 6, 1, PAL.ink);
    hand(d.getSeconds() * (Math.PI / 30), 7, 1, PAL.terracotta);
  }

  drawParticles(ctx, now) {
    const dt = this.lastT ? Math.min(60, now - this.lastT) : 16;
    this.lastT = now;
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const p of this.parts) {
      p.age += dt;
      p.vy += 0.0004 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      R(ctx, p.x, p.y, 3, 3, p.c);
    }
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
    if (this.planes.length === 0) this.instant = false;
  }

  lounge(items, t) {
    const ctx = this.ctx;
    items.push({
      y: 560,
      draw: () => {
        const x = 692;
        const y = 512;
        box(ctx, x, y, 148, 30, PAL.navy, PAL.ink, 2);
        for (let i = 0; i < 3; i++) box(ctx, x + 8 + i * 44, y + 6, 44, 20, "#3d6283", "#2a4a66");
        box(ctx, x - 6, y + 22, 160, 30, "#3d6283", PAL.ink, 2);
        R(ctx, x - 5, y + 23, 158, 3, "#5a83a6");
        box(ctx, x - 12, y + 14, 14, 38, PAL.navy, PAL.ink);
        box(ctx, x + 146, y + 14, 14, 38, PAL.navy, PAL.ink);
        R(ctx, x, y + 52, 4, 4, PAL.metal);
        R(ctx, x + 144, y + 52, 4, 4, PAL.metal);
        box(ctx, x + 16, y + 12, 22, 16, PAL.terracotta, PAL.terracottaDark);
        box(ctx, x + 110, y + 12, 22, 16, "#e9d7b8", PAL.oakDark);
      },
    });
    items.push({
      y: 494,
      draw: () => {
        ellipse(ctx, 764, 494, 30, 9, "rgba(60,40,20,0.15)");
        ellipse(ctx, 764, 480, 30, 10, PAL.ink);
        ellipse(ctx, 764, 479, 28, 8, PAL.oak);
        R(ctx, 762, 484, 4, 10, PAL.metal);
        mug(ctx, 772, 470, PAL.white, t, false);
        box(ctx, 744, 472, 18, 6, "#e3c26a", PAL.oakDark);
      },
    });
    items.push({ y: 452, draw: () => monstera(ctx, 858, 452, 1.1, t) });
    items.push({ y: 592, draw: () => monstera(ctx, 30, 592, 1.25, t) });
    items.push({ y: 588, draw: () => snakePlant(ctx, 642, 588, 54, PAL.metal) });
    items.push({ y: 340, draw: () => snakePlant(ctx, 22, 340, 50, PAL.terracotta) });
    items.push({
      y: 550,
      draw: () => {
        R(ctx, 666, 430, 2, 120, PAL.metal);
        R(ctx, 658, 548, 18, 3, PAL.metal);
        ellipse(ctx, 667, 428, 12, 6, "#f3e2c0");
        R(ctx, 655, 428, 24, 2, "#d7c39b");
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
    items.push({ y: 230, draw: () => pane(168, 250) });
    items.push({
      y: 412,
      draw: () => {
        pane(316, 412);
        ctx.fillStyle = "rgba(190,225,240,0.16)";
        ctx.fillRect(gx + 12, 394, W - gx - 12, 16);
        R(ctx, gx, 410, W - gx, 3, PAL.metal);
        R(ctx, gx + 12, 394, W - gx - 12, 1, PAL.glassEdge);
        for (let x = gx + 30; x < W; x += 56) R(ctx, x, 396, 14, 1, "rgba(255,255,255,0.6)");
      },
    });
  }
}
