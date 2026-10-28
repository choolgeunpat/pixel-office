#!/usr/bin/env python3 -I
"""
Cut the office cats out of the reference sheet (docs/design/cats/reference-cats.webp).

The sheet shows five cats (Grey & White, Black, White & Grey Tabby, Cream, Calico), each with
rows idle / walk (front) / run (side) / sit / jump / fishing…. We use the first five rows:
  1. the panel colour is keyed out by a flood fill from the border (the dark pixel outline
     keeps the white fur safe), frames are found as connected blobs in each row band,
  2. every frame is placed on a shared 48×40 canvas, feet on the same line,
  3. colours are snapped to a small palette per cat, so the soft source gets a crisp pixel look.
Extra poses the sheet lacks (sleep, stretch, wash) are derived from these frames.

Run from the repo root:  python3 -I tools/cats/extract_sheet.py
"""
import json, os
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "docs", "design", "cats", "reference-cats.webp")
OUT = os.path.join(ROOT, "public", "assets", "cats")
FW, FH = 48, 40
ANCHOR = (24, 38)  # feet

# column panels of the sheet (x0, x1) and the cat each one shows
COLUMNS = [
    ("mochi", "모찌", 12, 306),
    ("midnight", "까망", 320, 613),
    ("cloud", "구름", 628, 911),
    ("cream", "크림", 925, 1218),
    ("calico", "미미", 1232, 1525),
]
ROWS = ["idle", "walk", "run", "sit", "jump"]  # the first five bands under the portrait
LABEL_W = 95                                    # the row labels take the left part of each panel


def border_colour(a):
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    return np.median(edge, axis=0)


def outside_mask(a, bg, tol=34):
    """flood fill from the border through pixels that look like the panel (or white halo)"""
    h, w, _ = a.shape
    d = np.sqrt(((a.astype(float) - bg) ** 2).sum(axis=2))
    bright = a.min(axis=2)
    likely = (d < tol) | ((bright > 226) & (d < 60))
    out = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if likely[y, x] and not out[y, x]:
                out[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if likely[y, x] and not out[y, x]:
                out[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and likely[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; q.append((ny, nx))
    return out


def runs(profile, min_len, gap):
    """[(start, end)] of consecutive True entries, merging gaps shorter than `gap`"""
    res, start, last = [], None, None
    for i, v in enumerate(profile):
        if v:
            if start is None: start = i
            last = i
        elif start is not None and i - last > gap:
            if last - start + 1 >= min_len: res.append((start, last + 1))
            start = None
    if start is not None and last - start + 1 >= min_len: res.append((start, last + 1))
    return res


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    comps = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True; pts = []
                while q:
                    cy, cx = q.popleft(); pts.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; q.append((ny, nx))
                comps.append(pts)
    return comps


def cut_column(img, name, x0, x1, y0=268, y1=735):
    a = np.asarray(img.crop((x0 + LABEL_W, y0, x1, y1)).convert("RGB"))
    bg = border_colour(a)
    out = outside_mask(a, bg)
    fg = ~out
    # drop thin debris (anti-aliasing specks)
    rows = runs(fg.sum(axis=1) > 2, 14, 3)[: len(ROWS)]
    frames = {}
    for rname, (ra, rb) in zip(ROWS, rows):
        band = fg[ra:rb]
        cols = runs(band.sum(axis=0) > 0, 8, 2)
        lst = []
        for ca, cb in cols:
            sub = band[:, ca:cb]
            # keep the biggest blob in this column span (a stray speck is not a frame)
            comps = components(sub)
            if not comps: continue
            big = max(comps, key=len)
            if len(big) < 120: continue
            m = np.zeros_like(sub)
            for (yy, xx) in big: m[yy, xx] = True
            # fill holes: anything not reachable from the border inside the blob's box
            ys, xs = np.where(m)
            ya, yb, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            box = m[ya:yb, xa:xb]
            rgb = a[ra:rb, ca:cb][ya:yb, xa:xb]
            lst.append((rgb.copy(), box.copy()))
        frames[rname] = lst
    return frames


def split_wide(frames, limit=60):
    """a blob that is two frames stuck together (the black cat's jump row) is cut at its thinnest column"""
    out = []
    for rgb, m in frames:
        if m.shape[1] <= limit:
            out.append((rgb, m)); continue
        w = m.shape[1]
        lo, hi = int(w * 0.35), int(w * 0.65)
        cut = lo + int(np.argmin(m[:, lo:hi].sum(axis=0)))
        for a, b in ((0, cut), (cut, w)):
            mm = m[:, a:b]
            ys, xs = np.where(mm)
            if len(ys) < 120: continue
            out.append((rgb[ys.min():ys.max() + 1, a + xs.min():a + xs.max() + 1], mm[ys.min():ys.max() + 1, xs.min():xs.max() + 1]))
    return out


def to_rgba(rgb, m):
    img = np.dstack([rgb, (m * 255).astype(np.uint8)])
    return Image.fromarray(img, "RGBA")


def centroid_x(im):
    a = np.asarray(im)[..., 3] > 0
    xs = np.where(a)[1]
    return float(xs.mean())


def place(im, canvas, ox=0):
    """feet on the anchor line, body centre on the anchor column"""
    cx = centroid_x(im)
    x = int(round(ANCHOR[0] - cx))
    y = ANCHOR[1] - im.height
    canvas.alpha_composite(im, (ox + max(0, x), max(0, y)))


def eyes_closed(im):
    """paint over the eyes with the fur around them and draw a short dark line: for the sleeping pose"""
    a = np.array(im)
    h, w = a.shape[:2]
    alpha = a[..., 3] > 0
    ys, xs = np.where(alpha)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    H, Wd = y1 - y0, x1 - x0
    lum = a[..., :3].astype(float) @ np.array([0.3, 0.59, 0.11])
    region = np.zeros_like(alpha)
    region[y0 + int(H * 0.28): y0 + int(H * 0.62), x0 + int(Wd * 0.22): x0 + int(Wd * 0.78)] = True
    region &= alpha
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    green = (g > r + 22) & (g > b + 22)
    fur = np.median(lum[region])
    eye = region & (green | (lum < fur - 55))
    # eye blobs: the two biggest components on the left and right of the head's middle
    comps = [c for c in components(eye) if len(c) >= 2]
    comps.sort(key=len, reverse=True)
    mid = x0 + Wd / 2
    picks = []
    for side in (-1, 1):
        cand = [c for c in comps if (np.mean([p[1] for p in c]) - mid) * side > 1]
        if cand: picks.append(cand[0])
    line_col = np.array([40, 34, 48, 255], np.uint8)
    for c in picks:
        py = [p[0] for p in c]; px = [p[1] for p in c]
        top, bot, left, right = min(py), max(py), min(px), max(px)
        # fur colour above the eye
        samp = [a[yy, xx, :3] for yy in range(max(0, top - 3), top) for xx in range(left, right + 1) if alpha[yy, xx] and not eye[yy, xx]]
        col = np.median(samp, axis=0) if samp else np.array([200, 190, 180])
        for (yy, xx) in c:
            a[yy, xx, :3] = col
        for xx in range(left - 1, right + 2):
            if 0 <= xx < w and alpha[bot, xx]: a[bot, xx] = line_col
    return Image.fromarray(a, "RGBA")


def squash(im, sx, sy):
    w, h = im.size
    return im.resize((max(1, round(w * sx)), max(1, round(h * sy))), Image.NEAREST)


def build_breed(frames):
    sit = [to_rgba(*f) for f in frames["sit"][:3]]
    run = [to_rgba(*f) for f in split_wide(frames["run"])[:4]]
    walkf = [to_rgba(*f) for f in frames["walk"][:2]]
    jump = [to_rgba(*f) for f in split_wide(frames["jump"])[:2]]
    sleep0 = squash(eyes_closed(sit[0]), 1.12, 0.64)
    sleep1 = squash(eyes_closed(sit[0]), 1.12, 0.68)
    anims = {  # name: (frames, fps, loop)
        # the third sit frame of some cats is a differently coloured variant in the sheet: not used
        "sit": ([sit[0], sit[1], sit[0], sit[1]], 2.5, True),
        "wash": ([sit[0], sit[1]], 1.5, True),
        "sleep": ([sleep0, sleep1], 1.2, True),
        "stretch": ([sit[0], jump[0], jump[1], jump[1], jump[0]], 4, False),
        "jump": (jump, 2, False),
        "walk": (run, 9, True),
        "walkfront": (walkf, 6, True),
    }
    return anims


def main():
    img = Image.open(SRC).convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    meta = {"frameWidth": FW, "frameHeight": FH, "anchor": {"x": ANCHOR[0], "y": ANCHOR[1]}, "facing": "right", "animations": {}, "cats": {}, "source": "docs/design/cats/reference-cats.webp"}
    sheets = []
    for name, ko, x0, x1 in COLUMNS:
        anims = build_breed(cut_column(img, name, x0, x1))
        sheet = Image.new("RGBA", (FW * 5, FH * len(anims)), (0, 0, 0, 0))
        for r, (an, (fr, fps, loop)) in enumerate(anims.items()):
            for i, f in enumerate(fr):
                cell = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
                place(f, cell)
                sheet.alpha_composite(cell, (i * FW, r * FH))
            meta["animations"].setdefault(an, {"row": r, "frames": len(fr), "fps": fps, "loop": loop})
        sheet.save(os.path.join(OUT, f"{name}.png"))
        meta["cats"][name] = {"name": ko, "file": f"{name}.png"}
        sheets.append(sheet)
    json.dump(meta, open(os.path.join(OUT, "metadata.json"), "w"), ensure_ascii=False, indent=2)
    S = 4
    W = FW * 5 * S
    prev = Image.new("RGB", (W * len(sheets), FH * len(meta["animations"]) * S), (247, 240, 228))
    for k, sh in enumerate(sheets):
        up = sh.resize((sh.width * S, sh.height * S), Image.NEAREST)
        prev.paste(up, (k * W, 0), up)
    prev.save(os.path.join(ROOT, "tools", "cats", "preview.png"))
    print("wrote", len(sheets), "cats ->", OUT, list(meta["animations"]))

if __name__ == "__main__":
    main()
