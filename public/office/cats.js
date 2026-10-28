/**
 * The office cats: five pixel cats (sheets made by tools/cats/make_cats.py) that live their own
 * life — walking the aisles, sitting, washing, stretching, napping on beds, the sofa, under
 * desks and next to the monitors. They are scenery: nothing they do claims real work.
 *
 * Frames are 40×32, facing right (flipped for left), feet at (20,30). Rows come from metadata.json.
 */
import { LAYOUT } from "./layout.js";

const BASE = new URL("../assets/cats/", import.meta.url);
const SPEED = 0.042; // world px per ms
const HOP_MS = 520;

export let CAT_META = null;
const sheets = {};

export async function loadCats() {
  CAT_META = await (await fetch(new URL("metadata.json", BASE))).json();
  await Promise.all(
    Object.entries(CAT_META.cats).map(
      ([id, c]) =>
        new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => {
            sheets[id] = im;
            resolve();
          };
          im.onerror = () => reject(new Error(`cat sheet missing: ${c.file}`));
          im.src = new URL(c.file, BASE).href;
        }),
    ),
  );
  return CAT_META;
}

// ------------------------------------------------------------------ where cats can go
const N = {
  L1: [44, 205], t1: [120, 205], t2: [252, 205], t3: [432, 205], t4: [604, 205],
  m0: [44, 352], m1: [120, 352], m2: [252, 352], m3: [432, 352], m4: [604, 352], m5: [648, 352],
  v2: [252, 470], v3: [432, 470], v4: [604, 470],
  b0: [44, 578], b1: [130, 578], b2: [252, 578], b3: [432, 578], b4: [604, 578], b5: [680, 584],
  j1: [650, 470], j2: [790, 586], j3: [840, 580],
};
const EDGES = [
  ["L1", "t1"], ["t1", "t2"], ["t2", "t3"], ["t3", "t4"],
  ["m0", "m1"], ["m1", "m2"], ["m2", "m3"], ["m3", "m4"], ["m4", "m5"],
  ["b0", "b1"], ["b1", "b2"], ["b2", "b3"], ["b3", "b4"], ["b4", "b5"], ["b5", "j2"], ["j2", "j3"],
  ["L1", "m0"], ["m0", "b0"],
  ["t2", "m2"], ["m2", "v2"], ["v2", "b2"],
  ["t3", "m3"], ["m3", "v3"], ["v3", "b3"],
  ["t4", "m4"], ["m4", "v4"], ["v4", "b4"],
  ["m5", "j1"], ["j1", "b5"],
];
const ADJ = {};
for (const [a, b] of EDGES) {
  (ADJ[a] ||= []).push(b);
  (ADJ[b] ||= []).push(a);
}

function nearestNode(x, y, only = null) {
  let best = null;
  let bd = 1e9;
  for (const [id, [nx, ny]] of Object.entries(N)) {
    if (only && !only.includes(id)) continue;
    const d = Math.hypot(nx - x, (ny - y) * 0.7);
    if (d < bd) [best, bd] = [id, d];
  }
  return best;
}

function route(from, to) {
  if (from === to) return [to];
  const prev = { [from]: null };
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) break;
    for (const nx of ADJ[cur] || []) if (!(nx in prev)) (prev[nx] = cur), q.push(nx);
  }
  const out = [];
  for (let c = to; c; c = prev[c]) out.unshift(c);
  return out;
}

/** places a cat can settle. `y` is where the feet are; `sort` how it is layered against furniture */
function buildSpots() {
  const spots = [];
  for (const id of Object.keys(N)) if (!["m5", "j1"].includes(id)) spots.push({ id: `n-${id}`, kind: "floor", node: id, x: N[id][0], y: N[id][1] });
  spots.push({ id: "bedA", kind: "bed", node: "b1", x: 130, y: 574 }, { id: "bedB", kind: "bed", node: "b4", x: 612, y: 576 }, { id: "bedC", kind: "bed", node: "j3", x: 840, y: 574 });
  spots.push({ id: "sofaL", kind: "sofa", node: "j2", x: 736, y: 548, sort: 566 }, { id: "sofaR", kind: "sofa", node: "j2", x: 808, y: 548, sort: 566 });
  for (const [key, g] of Object.entries(LAYOUT)) {
    if (key === "lead") continue;
    const lane = g.gy < 400 ? ["m1", "m2", "m3", "m4"] : ["b1", "b2", "b3", "b4"];
    spots.push({ id: `under-${key}`, kind: "under", node: nearestNode(g.cx, g.gy + 50, lane), x: g.cx - 40, y: g.gy - 3, sort: g.gy - 1, hop: true });
    spots.push({ id: `desk-${key}`, kind: "desk", node: nearestNode(g.cx, g.gy + 50, lane), x: g.cx + 54, y: g.top + 17, sort: g.gy + 1, hop: true });
  }
  return spots;
}

// ------------------------------------------------------------------ behaviour
const rngFrom = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = (rng, weights) => {
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of weights) if ((r -= w) <= 0) return v;
  return weights[0][0];
};

const ACTS = {
  floor: [["sit", 34], ["wash", 22], ["stretch", 14], ["sleep", 10]],
  bed: [["sleep", 80], ["stretch", 8], ["sit", 8]],
  sofa: [["sleep", 80], ["wash", 10], ["sit", 10]],
  under: [["sleep", 85], ["wash", 15]],
  desk: [["sit", 55], ["wash", 20], ["sleep", 25]],
};
const DUR = { sit: [5000, 11000], wash: [3500, 6500], stretch: [1500, 1500], sleep: [14000, 38000] };

export class Cats {
  constructor({ seed = 7, reduced = false } = {}) {
    this.rng = rngFrom(seed);
    this.reduced = reduced;
    this.spots = buildSpots();
    this.cats = Object.keys(CAT_META.cats).map((id, i) => ({
      id,
      i,
      state: "act",
      act: "sit",
      actStart: 0,
      actEnd: 0,
      x: 0,
      y: 0,
      dir: 1,
      spot: null,
      path: [],
      hop: null,
      sort: 0,
      phase: this.rng() * 5000,
    }));
    this.lastNow = 0;
    for (const c of this.cats) {
      const free = this.freeSpots(c);
      const s = free[Math.floor(this.rng() * free.length)];
      this.settle(c, s, 0);
    }
  }

  freeSpots(c) {
    const taken = new Set();
    for (const o of this.cats) if (o !== c) taken.add((o.state === "act" ? o.spot : o.target)?.id);
    return this.spots.filter((s) => !taken.has(s.id) && (this.reduced ? s.kind !== "floor" : true));
  }

  settle(c, spot, now) {
    c.spot = spot;
    c.target = null;
    c.x = spot.x;
    c.y = spot.y;
    c.arc = 0;
    c.sort = spot.sort ?? spot.y;
    c.state = "act";
    this.startAct(c, now);
  }

  startAct(c, now) {
    const act = pick(this.rng, ACTS[c.spot.kind]);
    c.act = act;
    c.actStart = now;
    const [lo, hi] = DUR[act];
    c.actEnd = now + lo + this.rng() * (hi - lo);
    if (this.rng() < 0.5) c.dir = -c.dir;
  }

  /** time to go somewhere else */
  choose(c, now) {
    if (this.reduced) return this.startAct(c, now);
    const free = this.freeSpots(c).filter((s) => s !== c.spot);
    const far = free.filter((s) => Math.hypot(s.x - c.x, s.y - c.y) > 120); // so they really go somewhere
    const list = far.length ? far : free;
    const target = list[Math.floor(this.rng() * list.length)];
    const from = c.spot.node;
    c.path = route(from, target.node).map((id) => ({ x: N[id][0], y: N[id][1] }));
    c.target = target;
    c.lastStep = now;
    if (c.spot.hop) {
      // hop down from the desk (or out from under it) to the aisle first
      c.state = "hop-out";
      c.hop = { from: { x: c.x, y: c.y }, to: { x: N[from][0], y: N[from][1] }, t0: now };
      c.act = "jump";
    } else {
      c.state = "walk";
      c.act = "walk";
      c.actStart = now;
      c.sort = c.y;
    }
  }

  update(now) {
    if (!this.started) {
      // first frame: give everyone a head start in what they are doing, staggered
      this.started = true;
      for (const c of this.cats) {
        c.actStart = now - this.rng() * 4000;
        c.actEnd = now + 3000 + this.rng() * 14000;
        this.lastNow = now;
      }
    }
    if (Math.abs(now - this.lastNow) > 5000) for (const c of this.cats) c.actEnd = Math.max(c.actEnd, now + 1000);
    this.lastNow = now;
    for (const c of this.cats) {
      if (c.state === "act") {
        if (now >= c.actEnd) this.choose(c, now);
      } else if (c.state === "walk") {
        const nx = c.path[0];
        if (!nx) {
          const s = c.target;
          if (s.hop) {
            c.state = "hop";
            c.hop = { from: { x: c.x, y: c.y }, to: { x: s.x, y: s.y }, t0: now };
            c.act = "jump";
          } else this.settle(c, s, now);
          continue;
        }
        const dx = nx.x - c.x;
        const dy = nx.y - c.y;
        const d = Math.hypot(dx, dy);
        const step = SPEED * Math.min(100, now - c.lastStep);
        c.lastStep = now;
        if (d <= step) {
          c.x = nx.x;
          c.y = nx.y;
          c.path.shift();
        } else {
          c.x += (dx / d) * step;
          c.y += (dy / d) * step;
          if (Math.abs(dx) > 0.5) c.dir = dx > 0 ? 1 : -1;
        }
        c.sort = c.y;
      } else {
        // hop (up onto a desk) or hop-out (down to the aisle)
        const k = Math.min(1, (now - c.hop.t0) / HOP_MS);
        c.x = c.hop.from.x + (c.hop.to.x - c.hop.from.x) * k;
        c.y = c.hop.from.y + (c.hop.to.y - c.hop.from.y) * k;
        c.arc = Math.sin(k * Math.PI) * 18;
        if (Math.abs(c.hop.to.x - c.hop.from.x) > 1) c.dir = c.hop.to.x >= c.hop.from.x ? 1 : -1;
        c.sort = Math.max(c.y, c.state === "hop" ? c.target.sort ?? c.y : c.y);
        if (k >= 1) {
          c.arc = 0;
          if (c.state === "hop") this.settle(c, c.target, now);
          else {
            c.state = "walk";
            c.act = "walk";
            c.actStart = now;
            c.lastStep = now;
          }
        }
      }
    }
  }

  /** @returns {{y:number, draw:Function}[]} drawables; `k` = device px per cat pixel (integer) */
  items(ctx, now, S) {
    const k = Math.max(1, Math.round(1.4 * S));
    const sc = k / S;
    return this.cats.map((c) => ({
      y: c.sort,
      draw: () => {
        const meta = CAT_META.animations[c.state === "act" ? c.act : c.state === "walk" ? "walk" : "jump"];
        const t = now - c.actStart + c.phase;
        let f = Math.floor((t / 1000) * meta.fps);
        f = meta.loop ? f % meta.frames : Math.min(meta.frames - 1, f);
        if (c.state === "hop" || c.state === "hop-out") f = (c.arc || 0) > 9 ? 1 : 0;
        const fw = CAT_META.frameWidth;
        const fh = CAT_META.frameHeight;
        const ax = CAT_META.anchor.x;
        const ay = CAT_META.anchor.y;
        const lift = c.arc || 0;
        // soft shadow on the ground
        ctx.fillStyle = "rgba(60,40,20,0.16)";
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 9 * sc, 2.2 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(Math.round(c.x * S) / S, Math.round((c.y - lift) * S) / S);
        if (c.dir < 0) ctx.scale(-1, 1);
        ctx.drawImage(sheets[c.id], f * fw, meta.row * fh, fw, fh, -ax * sc, -ay * sc, fw * sc, fh * sc);
        ctx.restore();
      },
    }));
  }
}
