/**
 * pixel-distric characters: sprite sheets + palette remap.
 * Ported from pixel-distric apps/web/src/components/pixel/characters/{sheets,runtime}.ts.
 *
 * Assets: /assets/characters/{male,female}/<motion>.png + metadata.json
 * (frames left→right, `padding` px apart, every frame frameWidth×frameHeight with
 * the ground anchor at the same point).
 */

const HAIR_PAIRS = {
  black: ["#121318", "#4a4e5e"],
  brown: ["#2e1c14", "#a87a58"],
  chestnut: ["#3e160c", "#d06e40"],
  blonde: ["#6e5024", "#f8e2a0"],
  pink: ["#5e2240", "#f8b0cc"],
  lavender: ["#36285e", "#cebcf4"],
  silver: ["#464a5c", "#f0f2f8"],
  blue: ["#12265e", "#80aef4"],
  teal: ["#0c3436", "#70d6c6"],
};
const SKIN_PAIRS = {
  light: ["#d0998a", "#fff6f0"],
  tan: ["#8a5232", "#f2c296"],
  deep: ["#46261a", "#b47c52"],
};
const OUTFIT_PAIRS = {
  charcoal: ["#141418", "#9c9caa"],
  red: ["#460c14", "#f6948c"],
  pink: ["#561c38", "#ffd4e4"],
  gold: ["#463008", "#ffe28c"],
  green: ["#0c2c18", "#aae8a2"],
  sky: ["#10304e", "#c8eeff"],
  purple: ["#201248", "#ccb2ff"],
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

export const META = {};
const ASSETS = new URL("../assets/characters/", import.meta.url);

export async function loadMeta() {
  await Promise.all(
    ["male", "female"].map(async (b) => {
      META[b] = await (await fetch(new URL(`${b}/metadata.json`, ASSETS))).json();
    }),
  );
  return META;
}

/** colour lookup 0xRRGGBB → 0xRRGGBB for a look; each group keeps its tones' luminance order */
function remapTable(look) {
  const meta = META[look.base];
  const out = new Map();
  const add = (colors, pair) => {
    if (!pair || !colors?.length) return;
    const cs = colors.map(hex);
    const ls = cs.map(lum);
    const lo = Math.min(...ls);
    const hi = Math.max(...ls);
    const d = hex(pair[0]);
    const l = hex(pair[1]);
    cs.forEach((col, i) => {
      const t = hi > lo ? (ls[i] - lo) / (hi - lo) : 0.5;
      const v = [0, 1, 2].map((k) => Math.round(d[k] + (l[k] - d[k]) * t));
      out.set((col[0] << 16) | (col[1] << 8) | col[2], (v[0] << 16) | (v[1] << 8) | v[2]);
    });
  };
  add(meta.palette.hair, HAIR_PAIRS[look.hair]);
  add(meta.palette.skin, SKIN_PAIRS[look.skin]);
  add(meta.palette.outfit, OUTFIT_PAIRS[look.outfit]);
  return out;
}

const images = new Map();
function loadImage(url) {
  if (!images.has(url))
    images.set(
      url,
      new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error(`sprite not found: ${url}`));
        im.src = url;
      }),
    );
  return images.get(url);
}

/**
 * Motions → sheet name per facing. The reference has no side/back for every motion;
 * missing ones fall back to the front view.
 */
function sheetName(base, motion, dir) {
  const dirs = META[base].directions[motion] || META[base].directions.idle;
  const want = dir === "back" ? ["back", "front"] : dir === "front" ? ["front", "side"] : ["side", "front"];
  const d = want.find((w) => dirs[w]) || Object.keys(dirs)[0];
  return dirs[d];
}

/**
 * A character with a palette look. `draw(ctx, motion, dir, x, y, t)` draws the frame for
 * time t (ms) with its ground anchor at (x, y). Sheets load lazily; nothing is drawn until ready.
 */
export class Character {
  constructor(look) {
    this.look = look;
    this.sheets = new Map(); // sheet name → canvas | "loading"
  }

  sheet(name) {
    const hit = this.sheets.get(name);
    if (hit) return hit === "loading" ? null : hit;
    this.sheets.set(name, "loading");
    const a = META[this.look.base].animations[name];
    loadImage(new URL(`${this.look.base}/${a.file}`, ASSETS).href).then((im) => {
      const cv = document.createElement("canvas");
      cv.width = im.naturalWidth;
      cv.height = im.naturalHeight;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(im, 0, 0);
      const table = remapTable(this.look);
      if (table.size) {
        const img = ctx.getImageData(0, 0, cv.width, cv.height);
        const p = img.data;
        for (let i = 0; i < p.length; i += 4) {
          if (!p[i + 3]) continue;
          const v = table.get((p[i] << 16) | (p[i + 1] << 8) | p[i + 2]);
          if (v !== undefined) {
            p[i] = v >> 16;
            p[i + 1] = (v >> 8) & 255;
            p[i + 2] = v & 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      }
      this.sheets.set(name, cv);
    });
    return null;
  }

  frameIndex(anim, t) {
    const hold = anim.hold?.length === anim.frameCount ? anim.hold : Array(anim.frameCount).fill(1);
    const tick = 1000 / anim.fps;
    const total = hold.reduce((a, b) => a + b, 0) * tick;
    let u = anim.loop ? t % total : Math.min(t, total - 1);
    for (let i = 0; i < hold.length; i++) {
      u -= hold[i] * tick;
      if (u < 0) return i;
    }
    return hold.length - 1;
  }

  /** @param clipBottom  rows hidden from the bottom of the frame (e.g. behind a desk) */
  draw(ctx, motion, dir, x, y, t, { alpha = 1, clipBottom = 0 } = {}) {
    const meta = META[this.look.base];
    if (!meta) return;
    const name = sheetName(this.look.base, motion, dir);
    const sheet = this.sheet(name);
    if (!sheet) return;
    const anim = meta.animations[name];
    const fi = this.frameIndex(anim, t);
    const W = meta.frameWidth;
    const H = meta.frameHeight - clipBottom;
    if (H <= 0) return;
    const sx = fi * (W + meta.padding);
    // snap to device pixels so the sprite's pixels stay hard-edged at any scale
    const k = ctx.getTransform().a || 1;
    const sn = (v) => Math.round(v * k) / k;
    const dx = sn(x - meta.anchor.x);
    const dy = sn(y - meta.anchor.y);
    const dw = Math.round(W * k) / k;
    const dh = Math.round(H * k) / k;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (dir === "left") {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet, sx, 0, W, H, 0, 0, dw, dh);
    } else {
      ctx.drawImage(sheet, sx, 0, W, H, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  /** head-and-shoulders crop for avatars in the side panels */
  async bust(size = 48) {
    const meta = META[this.look.base];
    const name = sheetName(this.look.base, "idle", "front");
    while (!this.sheet(name)) await new Promise((r) => setTimeout(r, 30));
    const sheet = this.sheet(name);
    const out = document.createElement("canvas");
    out.width = out.height = size;
    const o = out.getContext("2d");
    o.imageSmoothingEnabled = false;
    const crop = 56;
    o.drawImage(sheet, meta.anchor.x - crop / 2, meta.anchor.y - 92, crop, crop, 0, 0, size, size);
    return out;
  }
}
