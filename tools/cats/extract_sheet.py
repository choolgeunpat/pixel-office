#!/usr/bin/env python3 -I
"""
Office cat sprite sheets from docs/design/cats/reference-cats.webp.

The sheet's small frames are blurry, so every animation is built from the crisp portrait sprite
(`portraits.crisp`, ~41×46 hard pixels): tail wag and blinking by moving a few pixels, a real
step cycle (one side's paws lifted at a time, body bobbing and leaning), stretch / hop by inserting or
removing whole rows, and sleeping by dropping the head onto the body. Nothing is ever resampled, so
every pixel stays a hard pixel.

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


TAIL = (9, 18)   # x < 9 and y >= 18: the tail
HEAD_ROWS = 26   # head and body meet here
SPLIT = 21       # centre column between the two sides
CUT0, CUT = 40, 41  # rows below CUT0 are the legs; `CUT` is where a shin row is removed to lift a paw


def dup_rows(a, at, n):
    """n extra copies of row `at`: the sprite grows taller, every pixel stays a hard pixel"""
    if n <= 0: return a
    return np.concatenate([a[: at + 1], np.repeat(a[at: at + 1], n, axis=0), a[at + 1:]])


def del_rows(a, at, n):
    return np.concatenate([a[:at], a[at + n:]]) if n > 0 else a


def step(a, lift_l, lift_r, bob, lean):
    """one frame of the walk: a paw on one side lifted, the body up by `bob` and leaning by `lean`"""
    h, w = a.shape[:2]
    out = np.zeros_like(a)
    for cols, lift in ((slice(0, SPLIT), lift_l), (slice(SPLIT, w), lift_r)):
        rows = [y for y in range(CUT0, h) if not (CUT <= y < CUT + lift)]
        for k, y in enumerate(rows):
            out[CUT0 + k, cols] = a[y, cols]
    for y in range(CUT0):
        s = int(round(lean * (1 - y / CUT0)))
        ny = y - bob
        if ny < 0:
            continue
        xs = np.arange(w) + s
        ok = (xs >= 0) & (xs < w)
        m = a[y, ok, 3] > 0
        out[ny, xs[ok][m]] = a[y, ok][m]
    # the rows the body left behind are filled with its last row so the legs stay joined to it
    for k in range(bob):
        m = a[CUT0 - 1, :, 3] > 0
        out[CUT0 - 1 - k, m] = a[CUT0 - 1, m]
    return out


def shift_rows(dst, src, dy):
    h = src.shape[0]
    for y in range(h):
        ny = y + dy
        if 0 <= ny < h:
            m = src[y, :, 3] > 0
            dst[ny, m] = src[y, m]
    return dst


def drop_head(a, closed, drop, breathe=0):
    """sleeping: the head sinks `drop` rows onto the body (pure translation), eyes closed"""
    h, w = a.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    solid = a[..., 3] > 0
    tail = (xs < TAIL[0]) & (ys >= TAIL[1])
    head_m = (ys < HEAD_ROWS) & ~tail & solid
    body = np.zeros_like(a)
    body[solid & ~head_m] = a[solid & ~head_m]
    head = np.zeros_like(a)
    head[head_m] = closed[head_m]
    return shift_rows(body, head, drop + breathe)


def quiet_row(a, lo=27, hi=38):
    """the row that looks most like its neighbour: duplicating or deleting it is invisible"""
    best, bd = lo, 1e18
    for y in range(lo, hi):
        both = (a[y, :, 3] > 0) & (a[y + 1, :, 3] > 0)
        d = np.abs(a[y, both, :3].astype(int) - a[y + 1, both, :3].astype(int)).sum() / max(1, both.sum())
        if (a[y, :, 3] > 0).sum() == (a[y + 1, :, 3] > 0).sum() and d < bd:
            best, bd = y, d
    return best


def anims(base, key):
    closed = close_eyes(base, key)
    t0, t1, t2 = base, wag(base, -1), wag(base, -2)
    row = quiet_row(base)
    tall = lambda n: dup_rows(base, row, n)
    hop_down = del_rows(base, row, 3)
    return {
        # name: (frames, fps, loop)
        "sit": ([t0, t0, t0, t1, t2, t1, t0, t0, closed, t0, t1, t0], 4, True),
        "wash": ([base, head_tilt(closed, 2), head_tilt(closed, 3), head_tilt(closed, 2)], 4, True),
        "sleep": ([drop_head(base, closed, 14), drop_head(base, closed, 14, 1)], 1.2, True),
        "stretch": ([base, tall(2), tall(4), tall(4), tall(2)], 3, False),
        "jump": ([hop_down, tall(5)], 2, False),
        # two steps per cycle: left paw up, passing, right paw up, passing
        "walk": ([wag(step(base, 4, 0, 0, 2), -1), wag(step(base, 0, 0, 2, 0), 0), wag(step(base, 0, 4, 0, -2), -2), wag(step(base, 0, 0, 2, 0), 0)], 10, True),
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
