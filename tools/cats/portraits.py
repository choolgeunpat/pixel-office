#!/usr/bin/env python3 -I
"""
Crisp cat sprites from the sheet's large portraits (the sharpest art in docs/design/cats/reference-cats.webp).

Each portrait is ~140 px tall in the sheet. It is keyed out like the small frames (flood fill from the
border), area-averaged down to a clean `HEIGHT`-pixel grid, snapped to a small palette and given a
1-pixel dark outline, so every sprite pixel is a real, hard-edged pixel.
"""
import os
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "docs", "design", "cats", "reference-cats.webp")
HEIGHT = 46
PALETTE = 24

# portrait boxes in the sheet (x0, y0, x1, y1): the big cat at the top-left of each panel
BOXES = {
    "mochi": (14, 100, 160, 258),
    "midnight": (328, 100, 470, 258),
    "cloud": (636, 100, 782, 258),
    "cream": (944, 100, 1090, 258),
    "calico": (1244, 100, 1392, 258),
}


def outside(a, tol=26):
    h, w, _ = a.shape
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(edge, axis=0)
    d = np.sqrt(((a.astype(float) - bg) ** 2).sum(axis=2))
    likely = (d < tol) | ((a.min(axis=2) > 232) & (d < 55))
    out = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if likely[y, x] and not out[y, x]: out[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if likely[y, x] and not out[y, x]: out[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and likely[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; q.append((ny, nx))
    return out


def biggest(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    best = []
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
                if len(pts) > len(best): best = pts
    m = np.zeros_like(mask)
    for y, x in best: m[y, x] = True
    return m


def crisp(img, key):
    box = BOXES[key]
    a = np.asarray(img.crop(box).convert("RGB"))
    fg = biggest(~outside(a))
    ys, xs = np.where(fg)
    a, fg = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1], fg[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = fg.shape
    tw = max(1, round(w * HEIGHT / h))
    # premultiplied area average
    rgba = np.dstack([a * fg[..., None], fg * 255]).astype(np.uint8)
    pm = Image.fromarray(rgba, "RGBA").resize((tw, HEIGHT), Image.BOX)
    p = np.asarray(pm).astype(float)
    alpha = p[..., 3] / 255
    rgb = np.where(alpha[..., None] > 0, p[..., :3] / np.maximum(alpha[..., None], 1e-6), 0)
    solid = alpha >= 0.5
    # snap colours to a small palette (computed on the solid pixels only)
    tmp = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")
    q = tmp.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT, kmeans=4).convert("RGB")
    out = np.array(q)
    # hard outline: every edge pixel takes the darkest colour around it
    lum = out.astype(float) @ np.array([0.3, 0.59, 0.11])
    res = out.copy()
    for y in range(HEIGHT):
        for x in range(tw):
            if not solid[y, x]: continue
            edge = any(not (0 <= y + dy < HEIGHT and 0 <= x + dx < tw and solid[y + dy, x + dx]) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                best, bl = None, 1e9
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < HEIGHT and 0 <= xx < tw and solid[yy, xx] and lum[yy, xx] < bl:
                            best, bl = out[yy, xx], lum[yy, xx]
                res[y, x] = best
    return np.dstack([res, (solid * 255).astype(np.uint8)])


if __name__ == "__main__":
    img = Image.open(SRC).convert("RGB")
    S = 8
    sheet = Image.new("RGBA", (60 * S * 5, 52 * S), (247, 240, 228, 255))
    for i, k in enumerate(BOXES):
        im = Image.fromarray(crisp(img, k), "RGBA")
        print(k, im.size)
        up = im.resize((im.width * S, im.height * S), Image.NEAREST)
        sheet.alpha_composite(up, (i * 60 * S, 0))
    sheet.convert("RGB").save(os.path.join(ROOT, "tools", "cats", "portraits-preview.png"))
