#!/usr/bin/env python3 -I
"""
Office cat sprite sheets from docs/design/cats/reference-cats.webp.

The sheet's small frames are blurry, so every animation is built from the crisp portrait sprite
(`portraits.crisp`, ~41×46 hard pixels): tail wag and blinking by moving a few pixels, a waddle
walk by shearing/bobbing whole rows (no resampling, so edges stay sharp), and squash/stretch poses
by area-averaging and then snapping back to the cat's own palette with a fresh 1 px outline.

Run from the repo root:  python3 -I tools/cats/extract_sheet.py
Output: public/assets/cats/<breed>.png + metadata.json, tools/cats/preview.png
"""
import json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import portraits  # noqa: E402

ROOT = portraits.ROOT
OUT = os.path.join(ROOT, "public", "assets", "cats")
FW, FH = 56, 56
ANCHOR = (28, 54)  # feet
NAMES = {"mochi": "모찌", "midnight": "까망", "cloud": "구름", "cream": "크림", "calico": "미미"}


def palette_of(a):
    px = a[a[..., 3] > 0][:, :3]
    return np.unique(px, axis=0)


def snap_outline(rgb, solid, pal):
    """snap colours to `pal` and give edge pixels the darkest colour around them"""
    h, w = solid.shape
    flat = rgb.reshape(-1, 3).astype(float)
    d = ((flat[:, None, :] - pal[None, :, :].astype(float)) ** 2).sum(axis=2)
    out = pal[d.argmin(axis=1)].reshape(h, w, 3).copy()
    lum = out.astype(float) @ np.array([0.3, 0.59, 0.11])
    res = out.copy()
    for y in range(h):
        for x in range(w):
            if not solid[y, x]: continue
            if any(not (0 <= y + dy < h and 0 <= x + dx < w and solid[y + dy, x + dx]) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                best, bl = out[y, x], 1e9
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < h and 0 <= xx < w and solid[yy, xx] and lum[yy, xx] < bl:
                            best, bl = out[yy, xx], lum[yy, xx]
                res[y, x] = best
    return np.dstack([res, (solid * 255).astype(np.uint8)])


def resample(a, w2, h2, pal):
    """area-average to a new size, then back to the cat's palette (stays hard-edged)"""
    h, w = a.shape[:2]
    pm = Image.fromarray(np.dstack([a[..., :3] * (a[..., 3:] > 0), a[..., 3]]).astype(np.uint8), "RGBA").resize((w2, h2), Image.BOX)
    p = np.asarray(pm).astype(float)
    alpha = p[..., 3] / 255
    rgb = np.where(alpha[..., None] > 0, p[..., :3] / np.maximum(alpha[..., None], 1e-6), 0)
    return snap_outline(rgb, alpha >= 0.5, pal)


def shear_bob(a, shear, bob):
    """lean the top of the sprite sideways row by row and lift it: a waddle step, no resampling"""
    h, w = a.shape[:2]
    out = np.zeros((h + 4, w + 4, 4), np.uint8)
    for y in range(h):
        s = int(round(shear * (1 - y / h)))
        ny = y + 4 - bob
        if 0 <= ny < out.shape[0]:
            xs = np.arange(w) + 2 + s
            ok = (xs >= 0) & (xs < out.shape[1])
            out[ny, xs[ok]] = a[y, ok]
    return out


def wag(a, dy):
    """move the tail (lower left) up or down by dy pixels"""
    h, w = a.shape[:2]
    out = a.copy()
    region = (slice(int(h * 0.42), h), slice(0, int(w * 0.2)))
    tail = a[region].copy()
    out[region] = 0
    ys0 = int(h * 0.42) + dy
    for y in range(tail.shape[0]):
        yy = ys0 + y
        if 0 <= yy < h:
            m = tail[y, :, 3] > 0
            out[yy, 0:tail.shape[1]][m] = tail[y][m]
    return out


# eye boxes (x0, x1, y0, y1; end exclusive) of the two eyes in each breed's crisp 41×46 sprite
EYE_BOXES = {
    "mochi": [(20, 24, 13, 18), (31, 35, 13, 18)],
    "midnight": [(18, 24, 14, 19), (30, 36, 14, 19)],
    "cloud": [(19, 24, 14, 19), (30, 35, 14, 19)],
    "cream": [(18, 23, 14, 19), (30, 35, 14, 19)],
    "calico": [(19, 24, 14, 19), (31, 36, 14, 19)],
}


def close_eyes(a, key):
    """paint the eyes over with the fur around them and draw a short dark line: a blink / sleeping eyes"""
    out = a.copy()
    alpha = a[..., 3] > 0
    lum = a[..., :3].astype(float) @ np.array([0.3, 0.59, 0.11])
    line = np.array([46, 38, 52, 255], np.uint8)
    for (x0, x1, y0, y1) in EYE_BOXES[key]:
        ex = (slice(max(0, y0 - 1), y1 + 1), slice(max(0, x0 - 1), x1 + 1))
        px = a[ex][..., :3].reshape(-1, 3)
        l = lum[ex].reshape(-1)
        light = px[l >= np.percentile(l, 55)]
        col = np.median(light, axis=0).astype(np.uint8)
        for y in range(y0, y1):
            for x in range(x0, x1):
                if alpha[y, x]: out[y, x, :3] = col
        ly = y0 + (y1 - y0) // 2 + 1
        for x in range(x0, x1 - 1):
            out[ly, x] = line
    return out


def head_tilt(a, k):
    """lean the head (upper rows) sideways: nuzzling / grooming"""
    h, w = a.shape[:2]
    out = np.zeros_like(a)
    cut = int(h * 0.6)
    for y in range(h):
        s = int(round(k * max(0, (cut - y)) / cut)) if y < cut else 0
        if s >= 0:
            out[y, s:] = a[y, : w - s] if s else a[y]
        else:
            out[y, :s] = a[y, -s:]
    return out


def cell(a):
    """place a sprite on the shared canvas: bbox centre on the anchor column, bottom on the feet line"""
    ys, xs = np.where(a[..., 3] > 0)
    box = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    c = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    x = int(round(ANCHOR[0] - box.shape[1] / 2))
    y = ANCHOR[1] - box.shape[0]
    c.alpha_composite(Image.fromarray(box, "RGBA"), (max(0, x), max(0, y)))
    return c


def anims(base, key):
    h, w = base.shape[:2]
    pal = palette_of(base)
    closed = close_eyes(base, key)
    t0, t1, t2 = base, wag(base, -1), wag(base, -2)
    c_t0 = closed
    rs = lambda sx, sy, src=base: resample(src, max(1, round(w * sx)), max(1, round(h * sy)), pal)
    return {
        # name: (frames, fps, loop)
        "sit": ([t0, t0, t0, t1, t2, t1, t0, t0, c_t0, t0, t1, t0], 4, True),
        "wash": ([base, head_tilt(closed, 2), head_tilt(closed, 3), head_tilt(closed, 2)], 4, True),
        "sleep": ([rs(1.14, 0.66, closed), rs(1.14, 0.69, closed)], 1.2, True),
        "stretch": ([base, rs(0.96, 1.08), rs(0.93, 1.14), rs(0.93, 1.14), rs(0.96, 1.08)], 3, False),
        "jump": ([rs(1.08, 0.88), rs(0.94, 1.12)], 2, False),
        "walk": ([shear_bob(base, 1, 0), shear_bob(base, 0, 2), shear_bob(base, -1, 0), shear_bob(base, 0, 2)], 7, True),
    }


def main():
    img = Image.open(portraits.SRC).convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    maxf = 12
    meta = {"frameWidth": FW, "frameHeight": FH, "anchor": {"x": ANCHOR[0], "y": ANCHOR[1]}, "facing": "front", "animations": {}, "cats": {}, "source": "docs/design/cats/reference-cats.webp"}
    sheets = []
    for key in portraits.BOXES:
        base = portraits.crisp(img, key)
        an = anims(base, key)
        sheet = Image.new("RGBA", (FW * maxf, FH * len(an)), (0, 0, 0, 0))
        for r, (name, (frames, fps, loop)) in enumerate(an.items()):
            for i, f in enumerate(frames):
                sheet.alpha_composite(cell(f), (i * FW, r * FH))
            meta["animations"].setdefault(name, {"row": r, "frames": len(frames), "fps": fps, "loop": loop})
        meta["animations"]["walkfront"] = dict(meta["animations"]["walk"])
        sheet.save(os.path.join(OUT, f"{key}.png"))
        meta["cats"][key] = {"name": NAMES[key], "file": f"{key}.png"}
        sheets.append(sheet)
    json.dump(meta, open(os.path.join(OUT, "metadata.json"), "w"), ensure_ascii=False, indent=2)
    S = 3
    W = FW * maxf * S
    prev = Image.new("RGB", (W, FH * 6 * S * len(sheets)), (247, 240, 228))
    for k, sh in enumerate(sheets):
        up = sh.resize((sh.width * S, sh.height * S), Image.NEAREST)
        prev.paste(up, (0, k * FH * 6 * S), up)
    prev.save(os.path.join(ROOT, "tools", "cats", "preview.png"))
    print("wrote", len(sheets), "cats ->", OUT, list(meta["animations"]))


if __name__ == "__main__":
    main()
