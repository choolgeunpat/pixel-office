/**
 * Procedural pixel art for the office, drawn at the characters' density
 * (1 art px = 1 canvas px, characters are 90 px tall).
 *
 * Palette taken from the pixel-distric characters: deep navy outlines (#152436),
 * navy + cool white clothes, peach skin — so furniture is outlined in navy,
 * metal is navy-grey, and accents are soft mint, peach and gold, like the
 * Pixel District town (lots of trees, cosy and bright).
 */

export const PAL = {
  ink: "#1f2b40",
  wall: "#f7f4ee",
  wallShade: "#ece6db",
  slat: "#d7b48a",
  slatDark: "#b99068",
  slatLight: "#e8cba5",
  sage: "#a9cdb3",
  sageDark: "#86b394",
  sageLight: "#c8e3cf",
  oak: "#ddb88c",
  oakDark: "#bf966b",
  oakLight: "#ecd0aa",
  floor: "#e6cfab",
  floorAlt: "#dec5a0",
  floorSeam: "#c9ab85",
  white: "#fbfaf7",
  offwhite: "#e9e6e1",
  metal: "#2f3d55",
  metalLight: "#4c5c79",
  terracotta: "#ef9a7a",
  terracottaDark: "#c9735a",
  gold: "#f2c14e",
  goldDark: "#c9952a",
  leaf: "#4fa65f",
  leafDark: "#2f7a45",
  leafLight: "#7cc77a",
  glass: "rgba(190,225,240,0.25)",
  glassEdge: "rgba(255,255,255,0.6)",
  screen: "#172235",
  navy: "#213a50",
  shadow: "rgba(31,43,64,0.13)",
};

export function R(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** rect with 1px outline and a 1px rounded corner cut */
export function box(ctx, x, y, w, h, fill, line = PAL.ink, round = 1) {
  R(ctx, x + round, y, w - 2 * round, h, line);
  R(ctx, x, y + round, w, h - 2 * round, line);
  R(ctx, x + 1 + round - 1, y + 1, w - 2 - 2 * (round - 1), h - 2, fill);
  R(ctx, x + 1, y + 1 + round - 1, w - 2, h - 2 - 2 * (round - 1), fill);
}

export function disc(ctx, cx, cy, r, c) {
  ctx.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y + r * 0.6));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1);
  }
}

export function ellipse(ctx, cx, cy, rx, ry, c) {
  ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry + 0.01)));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1);
  }
}

/** deterministic noise so the background is the same on every load */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ------------------------------------------------------------------ plants

export function pot(ctx, cx, by, w, h, color = PAL.white, dark = PAL.offwhite) {
  box(ctx, cx - w / 2, by - h, w, h, color);
  R(ctx, cx - w / 2 + 1, by - h + 1, w - 2, 2, dark);
  R(ctx, cx + w / 2 - 4, by - h + 3, 2, h - 4, dark);
}

function leaf(ctx, x, y, dx, dy, len, c, cd) {
  for (let i = 0; i < len; i++) {
    const w = Math.max(1, Math.round(Math.sin((i / len) * Math.PI) * 4));
    const px = x + dx * i;
    const py = y + dy * i;
    R(ctx, px - w / 2, py - w / 2, w, w, c);
  }
  R(ctx, x, y, 1, 1, cd);
}

export function monstera(ctx, cx, by, scale = 1, t = 0) {
  const sway = Math.sin(t / 1400) * 0.6;
  pot(ctx, cx, by, 26 * scale, 22 * scale, PAL.terracotta, PAL.terracottaDark);
  const r = rng(7);
  const n = Math.round(9 * scale);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.4 + (r() - 0.5) * 0.3;
    const len = (18 + r() * 14) * scale;
    const x0 = cx + (r() - 0.5) * 4;
    const y0 = by - 22 * scale;
    const ex = x0 + Math.cos(a) * len + sway;
    const ey = y0 + Math.sin(a) * len;
    ctx.strokeStyle = PAL.leafDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, y0 + 0.5);
    ctx.lineTo(ex + 0.5, ey + 0.5);
    ctx.stroke();
    const s = (7 + r() * 3) * scale;
    ellipse(ctx, ex, ey, s, s * 0.75, i % 3 ? PAL.leaf : PAL.leafLight);
    R(ctx, ex - s * 0.6, ey, s * 1.2, 1, PAL.leafDark);
    R(ctx, ex - 2, ey - 2, 1, 2, PAL.leafDark);
    R(ctx, ex + 2, ey + 1, 1, 2, PAL.leafDark);
  }
}

export function snakePlant(ctx, cx, by, h = 46, color = PAL.white) {
  pot(ctx, cx, by, 20, 18, color, PAL.offwhite);
  const blades = [-7, -3, 1, 5, 8];
  blades.forEach((dx, i) => {
    const bh = h - 18 - (i % 2) * 8 - Math.abs(dx);
    for (let y = 0; y < bh; y++) {
      const w = y > bh - 4 ? 1 : 3;
      R(ctx, cx + dx - 1 + (y > bh - 4 ? 1 : 0), by - 18 - y, w, 1, y % 6 < 2 ? PAL.leafLight : i % 2 ? PAL.leaf : PAL.leafDark);
    }
    R(ctx, cx + dx - 1, by - 18 - bh + 4, 1, bh - 4, "#c8d36a");
  });
}

export function pothos(ctx, x, y, len, t = 0) {
  // hanging plant from a ceiling hook
  R(ctx, x, 0, 1, y - 10, PAL.metal);
  box(ctx, x - 9, y - 10, 19, 12, PAL.white);
  for (let k = -1; k <= 1; k++) {
    const sway = Math.sin(t / 1600 + k) * 1.5;
    for (let i = 0; i < len - Math.abs(k) * 10; i += 5) {
      const px = x + k * 6 + Math.sin(i / 7) * 2 + (sway * i) / len;
      ellipse(ctx, px, y + i, 3, 2, i % 10 ? PAL.leaf : PAL.leafLight);
    }
  }
}

// ------------------------------------------------------------------ desk

/** Layout of a desk at (cx, gy): gy = floor line under the front legs. */
export function deskGeom(cx, gy, w = 156) {
  return {
    cx,
    gy,
    w,
    top: gy - 84, // top surface (seen from above)
    front: gy - 64, // front edge / modesty panel top
    seatY: gy - 52, // character ground anchor (behind the desk)
    seatX: cx + 6,
  };
}

export function chair(ctx, cx, gy, color = PAL.metal, empty = false) {
  const g = deskGeom(cx, gy);
  const x = g.seatX;
  const y = g.top - (empty ? 26 : 30);
  // backrest: rounded mesh shell, peeks over the desk when nobody sits there
  box(ctx, x - 17, y, 34, 30, "#4a4955", PAL.ink, 2);
  R(ctx, x - 14, y + 3, 28, 2, "#5d5c6a");
  for (let i = 0; i < 4; i++) R(ctx, x - 13, y + 8 + i * 5, 26, 1, "#565563");
  R(ctx, x - 17, y + 12, 2, 8, color);
  R(ctx, x + 15, y + 12, 2, 8, color);
}

export function monitor(ctx, x, y, w, h, screen) {
  // stand
  R(ctx, x + w / 2 - 2, y + h, 4, 8, PAL.metal);
  R(ctx, x + w / 2 - 9, y + h + 7, 18, 3, PAL.metal);
  R(ctx, x + w / 2 - 8, y + h + 7, 16, 1, PAL.metalLight);
  // body
  box(ctx, x, y, w, h, PAL.metal);
  R(ctx, x + 2, y + 2, w - 4, h - 4, PAL.screen);
  if (screen) screen(x + 2, y + 2, w - 4, h - 4);
  R(ctx, x + 1, y + h - 1, w - 2, 1, PAL.metalLight);
}

export function laptop(ctx, x, y) {
  R(ctx, x, y, 22, 3, "#b9bcc6");
  R(ctx, x - 2, y + 3, 26, 2, "#8d909c");
}

export function mug(ctx, x, y, c = PAL.white, t = 0, steam = false) {
  box(ctx, x, y, 7, 8, c);
  R(ctx, x + 7, y + 2, 2, 1, PAL.ink);
  R(ctx, x + 8, y + 3, 1, 3, PAL.ink);
  R(ctx, x + 7, y + 6, 2, 1, PAL.ink);
  if (steam) {
    for (let i = 0; i < 3; i++) {
      const k = ((t / 90 + i * 7) % 20) / 20;
      const sx = x + 3 + Math.round(Math.sin(k * 6 + i) * 1.5);
      ctx.globalAlpha = 0.5 * (1 - k);
      R(ctx, sx, y - 2 - k * 12, 1, 2, "#ffffff");
      ctx.globalAlpha = 1;
    }
  }
}

/** The desk itself (top, panel, legs, gadgets). Drawn in front of the character. */
export function desk(ctx, g, opts) {
  const { cx, gy, w } = g;
  const { color, label, screen, t = 0, wide = false, accessories = 0 } = opts;
  const half = w / 2;
  // floor shadow
  ctx.fillStyle = PAL.shadow;
  ctx.fillRect(cx - half - 2, gy - 4, w + 4, 6);
  // legs (black sled frame)
  R(ctx, cx - half + 6, g.front, 4, gy - g.front, PAL.metal);
  R(ctx, cx + half - 10, g.front, 4, gy - g.front, PAL.metal);
  R(ctx, cx - half + 2, gy - 3, 14, 3, PAL.metal);
  R(ctx, cx + half - 16, gy - 3, 14, 3, PAL.metal);
  // modesty panel (white, with role accent)
  box(ctx, cx - half + 10, g.front, w - 20, 40, PAL.white);
  R(ctx, cx - half + 11, g.front + 1, w - 22, 3, PAL.offwhite);
  R(ctx, cx - half + 11, g.front + 36, w - 22, 3, PAL.offwhite);
  // top: oak slab
  box(ctx, cx - half, g.top, w, g.front - g.top + 4, PAL.oak, PAL.ink);
  R(ctx, cx - half + 1, g.front, w - 2, 3, PAL.oakDark);
  R(ctx, cx - half + 1, g.top + 1, w - 2, 1, PAL.oakLight);
  for (let i = 0; i < 4; i++) R(ctx, cx - half + 14 + i * 37, g.top + 6 + (i % 2) * 7, 18, 1, "#cfa274");
  // accent desk mat in role color
  ctx.globalAlpha = 0.55;
  R(ctx, cx - 24, g.top + 6, 50, 12, color);
  ctx.globalAlpha = 1;
  // keyboard + mouse
  box(ctx, cx - 20, g.top + 8, 34, 8, "#eceef2", "#6b6e7a");
  for (let i = 0; i < 3; i++) R(ctx, cx - 18, g.top + 10 + i * 2, 30, 1, "#c9ccd4");
  box(ctx, cx + 17, g.top + 9, 5, 7, "#eceef2", "#6b6e7a");
  // monitor(s): left side, screen faces the viewer (artistic licence)
  const mw = 44;
  const mh = 30;
  monitor(ctx, cx - half + 6, g.top - mh - 2, mw, mh, screen);
  if (wide) monitor(ctx, cx + half - mw - 6, g.top - mh - 2, mw, mh, screen);
  // right side gadgets
  if (wide) {
    mug(ctx, cx + 30, g.top + 6, PAL.terracotta, t, true);
    snakePlantMini(ctx, cx - 36, g.top + 16);
  } else if (accessories % 3 === 0) {
    mug(ctx, cx + half - 34, g.top + 4, PAL.white, t, opts.busy);
    succulent(ctx, cx + half - 14, g.top + 14);
  } else if (accessories % 3 === 1) {
    lamp(ctx, cx + half - 22, g.top + 14, opts.busy);
    mug(ctx, cx + half - 42, g.top + 6, PAL.sage, t, opts.busy);
  } else {
    books(ctx, cx + half - 30, g.top + 14);
    succulent(ctx, cx + half - 10, g.top + 14);
  }
  // name plate
  if (label) label(cx, g.front + 13);
}

function succulent(ctx, cx, by) {
  pot(ctx, cx, by, 10, 7, PAL.white);
  ellipse(ctx, cx, by - 10, 6, 4, PAL.leaf);
  R(ctx, cx - 3, by - 13, 2, 2, PAL.leafLight);
  R(ctx, cx + 2, by - 11, 2, 2, PAL.leafLight);
}

function snakePlantMini(ctx, cx, by) {
  pot(ctx, cx, by, 10, 8, PAL.metal, PAL.metalLight);
  for (const dx of [-3, 0, 3]) R(ctx, cx + dx - 1, by - 22 + Math.abs(dx) * 2, 2, 14 - Math.abs(dx) * 2, dx ? PAL.leaf : PAL.leafDark);
}

function lamp(ctx, cx, by, on) {
  R(ctx, cx - 5, by - 2, 10, 2, PAL.metal);
  R(ctx, cx, by - 20, 1, 18, PAL.metal);
  R(ctx, cx - 6, by - 22, 9, 4, PAL.metal);
  if (on) {
    ctx.fillStyle = "rgba(255,226,150,0.28)";
    ctx.beginPath();
    ctx.moveTo(cx - 6, by - 18);
    ctx.lineTo(cx + 3, by - 18);
    ctx.lineTo(cx + 8, by);
    ctx.lineTo(cx - 14, by);
    ctx.fill();
  }
}

function books(ctx, x, by) {
  const cs = [PAL.terracotta, PAL.sage, "#5b6b9a", "#e3c26a"];
  cs.forEach((c, i) => R(ctx, x + i * 4, by - 12 - (i % 2) * 2, 4, 12 + (i % 2) * 2, c));
  R(ctx, x, by - 1, 16, 1, PAL.ink);
}

// ------------------------------------------------------------------ screens

/** monitor content for a desk state; returns a fn(x, y, w, h) */
export function screenFor(ctx, look, tool, color, t, seed) {
  if (!look || look.tone === "off") {
    return (x, y, w, h) => {
      R(ctx, x, y, w, h, "#232836");
      R(ctx, x + w - 12, y + 2, 2, h - 6, "rgba(255,255,255,0.06)");
      R(ctx, x + w - 8, y + 2, 1, h - 10, "rgba(255,255,255,0.06)");
    };
  }
  if (look.anim === "sleep") {
    return (x, y, w, h) => {
      R(ctx, x, y, w, h, "#0f1320");
      const bx = x + 4 + ((Math.floor(t / 60) + seed * 13) % (w - 14));
      const by = y + 3 + Math.abs(((Math.floor(t / 80) + seed * 5) % ((h - 10) * 2)) - (h - 10));
      R(ctx, bx, by, 6, 4, color);
    };
  }
  const term = tool === "Bash";
  const web = tool === "WebFetch" || tool === "WebSearch";
  const doc = tool === "Read" || tool === "Write" || tool === "TodoWrite";
  return (x, y, w, h) => {
    if (web) {
      R(ctx, x, y, w, h, "#f4f6fb");
      R(ctx, x, y, w, 4, "#d8dce6");
      R(ctx, x + 6, y + 1, w - 20, 2, "#ffffff");
      R(ctx, x + 3, y + 7, w - 6, 8, color);
      for (let i = 0; i < 3; i++) R(ctx, x + 3, y + 18 + i * 3, ((seed * 7 + i * 13 + Math.floor(t / 400)) % (w - 12)) + 6, 1, "#9aa3b5");
      return;
    }
    if (doc) {
      R(ctx, x, y, w, h, "#fafafa");
      const off = Math.floor(t / 180) % 4;
      for (let i = 0; i < 7; i++) R(ctx, x + 4, y + 3 + i * 4 - off + 4, ((seed * 11 + i * 17) % (w - 14)) + 8, 1, i % 3 ? "#9aa0ad" : color);
      R(ctx, x, y, w, 2, "#fafafa");
      return;
    }
    R(ctx, x, y, w, h, term ? "#0b0f14" : PAL.screen);
    const off = Math.floor(t / (term ? 120 : 220));
    const cols = term ? ["#5ee08a", "#5ee08a", "#cfd6e4"] : [color, "#8fb4ff", "#f7c873", "#cfd6e4", "#ff8fb1"];
    for (let i = 0; i < 7; i++) {
      const k = i + off;
      const len = ((seed * 7 + k * 13) % (w - 14)) + 5;
      const ind = term ? 0 : ((k * 5 + seed) % 3) * 3;
      R(ctx, x + 3 + ind, y + 2 + i * 4, len - ind, 2, cols[(k + seed) % cols.length]);
    }
    if (Math.floor(t / 400) % 2) R(ctx, x + 3, y + h - 4, 3, 2, "#ffffff");
  };
}
