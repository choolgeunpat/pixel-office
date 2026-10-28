#!/usr/bin/env python3 -I
"""
Real walk cycles for the office people (the pixel-distric sheets only have near-static walk frames).

  front / back  : the idle sprite with one leg shortened at a time (rows removed from the shin, so the foot
                  rises), the body bobbing and swaying onto the planted leg
  side          : the clean side frame with its legs cut off and moved as two clusters through a walk cycle

Everything is moved by whole pixels (no resampling), so the art stays hard-edged.
Sources are kept in tools/characters/source/; output goes to public/assets/characters/<base>/.
Run from the repo root: python3 -I tools/characters/walk_cycles.py
"""
import json, math, os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "tools", "characters", "source")
OUT = os.path.join(ROOT, "public", "assets", "characters")


def load(base, name):
    m = json.load(open(os.path.join(SRC, base, "metadata.json")))
    FW, FH, P = m["frameWidth"], m["frameHeight"], m["padding"]
    im = Image.open(os.path.join(SRC, base, f"{name}.png")).convert("RGBA")
    n = m["animations"][name]["frameCount"]
    return [np.array(im.crop((i * (FW + P), 0, i * (FW + P) + FW, FH))) for i in range(n)], m


def save_sheet(base, name, frames, meta, fps):
    FW, FH, P = meta["frameWidth"], meta["frameHeight"], meta["padding"]
    W = len(frames) * FW + (len(frames) - 1) * P
    sheet = Image.new("RGBA", (W, FH), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(Image.fromarray(f, "RGBA"), (i * (FW + P), 0))
    sheet.save(os.path.join(OUT, base, f"{name}.png"))
    a = meta["animations"][name]
    a.update({"frameCount": len(frames), "fps": fps, "hold": [1] * len(frames), "frames": [f"{name}_{i}" for i in range(len(frames))], "loop": True,
              "source": "walk_cycles.py"})


def shift(a, dx, dy):
    h, w = a.shape[:2]
    out = np.zeros_like(a)
    ys, xs = np.mgrid[0:h, 0:w]
    ny, nx = ys + dy, xs + dx
    ok = (ny >= 0) & (ny < h) & (nx >= 0) & (nx < w) & (a[..., 3] > 0)
    out[ny[ok], nx[ok]] = a[ok]
    return out


def over(dst, src):
    m = src[..., 3] > 0
    dst[m] = src[m]
    return dst


# ----------------------------------------------------------------------------- front / back
# per sprite: LEG_TOP (first row of the two legs), SPLIT (column between them), CUT (first shin row to remove)
FRONT = {
    ("male", "idle"): dict(top=90, split=59, cut=96),
    ("male", "idle_back"): dict(top=90, split=59, cut=96),
    ("female", "idle"): dict(top=98, split=65, cut=98),
    ("female", "idle_back"): dict(top=92, split=56, cut=96),
}


def stepped(base, cfg, lift_l, lift_r, bob, sway):
    H, W = base.shape[:2]
    top, split, cut = cfg["top"], cfg["split"], cfg["cut"]
    out = np.zeros_like(base)
    # legs stay on the ground (one of them shortened so its foot rises)
    for side, lift in (("l", lift_l), ("r", lift_r)):
        cols = slice(0, split) if side == "l" else slice(split, W)
        rows = [y for y in range(top, H) if not (cut <= y < cut + lift)]
        for k, y in enumerate(rows):
            out[top + k, cols] = base[y, cols]
    # the body above rises by `bob` and leans by `sway`; the rows it leaves behind are filled with its last row
    upper = base.copy()
    upper[top:] = 0
    upper = shift(upper, sway, -bob)
    last = np.zeros_like(base)
    last[top - 1] = base[top - 1]
    for k in range(bob):
        out = over(out, shift(last, sway, -k))
    out = over(out, upper)
    # when the body is lifted the legs beneath it must still meet it: nothing else to do (rows were filled)
    return out


def front_cycle(base, cfg):
    # contact, lift left (rising), lift left (peak), contact, lift right (rising), lift right (peak)
    return [
        stepped(base, cfg, 0, 0, 0, 0),
        stepped(base, cfg, 2, 0, 1, -1),
        stepped(base, cfg, 3, 0, 1, -1),
        stepped(base, cfg, 0, 0, 0, 0),
        stepped(base, cfg, 0, 2, 1, 1),
        stepped(base, cfg, 0, 3, 1, 1),
    ]


# ----------------------------------------------------------------------------- side
# The side sheets show one stride pose over and over. Take the cleanest frame, cut the two legs (shoes included) off
# as clusters and walk them: they open and close like scissors, the swinging leg lifts, the body bobs when they pass.
SIDE = {
    "male": dict(
        frame=3,
        back=lambda x, y: ((y >= 93) & (x < 41)) | ((y >= 98) & (x < 52)),
        front=lambda x, y: ((y >= 98) & (x >= 52)) | ((y >= 95) & (x >= 63)),
        gap0=29,
    ),
    "female": dict(
        frame=3,
        back=lambda x, y: (y >= 93) & (x < 53),
        front=lambda x, y: (y >= 93) & (x >= 53),
        gap0=18,
    ),
}


def side_frame(base, cl_back, cl_front, shift_b, shift_f, lift_b, lift_f, bob):
    H, W = base.shape[:2]
    body = base.copy()
    body[(cl_back[..., 3] > 0) | (cl_front[..., 3] > 0)] = 0
    out = shift(body, 0, -bob)
    # keep the rows under the lifted body filled with its own last rows so nothing floats
    for cl, sx, lift in ((cl_back, shift_b, lift_b), (cl_front, shift_f, lift_f)):
        placed = shift(cl, sx, -lift)
        # grow the leg up until it meets the body (only where body pixels sit above it)
        ys, xs = np.where(placed[..., 3] > 0)
        for x in np.unique(xs):
            col = ys[xs == x]
            top = col.min()
            above = [yy for yy in range(top - 1, max(-1, top - 9), -1) if out[yy, x, 3] > 0]
            if above and above[0] < top - 1:
                for yy in range(above[0] + 1, top):
                    out[yy, x] = placed[top, x]
        out = over(out, placed)
    return out


def tidy(a, y0, y1, passes=1):
    """soften speckle in shaded cloth: a pixel that is alone in its colour takes the colour most of its neighbours have.
    Dark outline pixels are never touched, so the silhouette and the detail lines stay as they are."""
    a = a.copy()
    H, W = a.shape[:2]
    lum = a[..., :3].astype(float) @ np.array([0.3, 0.59, 0.11])
    for _ in range(passes):
        src = a.copy()
        for y in range(max(1, y0), min(H - 1, y1)):
            for x in range(1, W - 1):
                if src[y, x, 3] == 0 or lum[y, x] < 85:
                    continue
                nb = [tuple(src[y + dy, x + dx, :3]) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and src[y + dy, x + dx, 3] > 0 and lum[y + dy, x + dx] >= 85]
                if len(nb) < 5:
                    continue
                me = tuple(src[y, x, :3])
                if nb.count(me) >= 2:
                    continue
                best = max(set(nb), key=nb.count)
                if nb.count(best) >= 3:
                    a[y, x, :3] = best
    return a


def side_cycle(base, cfg):
    base = tidy(base, 64, 92)
    H, W = base.shape[:2]
    y, x = np.mgrid[0:H, 0:W]
    alpha = base[..., 3] > 0
    mb = alpha & cfg["back"](x, y)
    mf = alpha & cfg["front"](x, y) & ~mb
    cl_b = np.zeros_like(base); cl_b[mb] = base[mb]
    cl_f = np.zeros_like(base); cl_f[mf] = base[mf]
    frames = []
    lifts = [(0, 0), (2, 0), (1, 0), (0, 0), (0, 0), (0, 2), (0, 1), (0, 0)]
    for p in range(8):
        gap = 14 + 10 * math.cos(2 * math.pi * p / 4)
        s = int(round((cfg["gap0"] - gap) / 2))
        frames.append(side_frame(base, cl_b, cl_f, s, -s, lifts[p][0], lifts[p][1], 1 if p in (2, 6) else 0))
    return frames


def main():
    for base in ("male", "female"):
        os.makedirs(os.path.join(OUT, base), exist_ok=True)
        meta = json.load(open(os.path.join(SRC, base, "metadata.json")))
        for sheet, idle in (("walk", "idle"), ("walk_back", "idle_back")):
            frames, _ = load(base, idle)
            cyc = front_cycle(frames[0], FRONT[(base, idle)])
            save_sheet(base, sheet, cyc, meta, 10)
        side, _ = load(base, "walk_side")
        cfg = SIDE[base]
        save_sheet(base, "walk_side", side_cycle(side[cfg["frame"]], cfg), meta, 12)
        json.dump(meta, open(os.path.join(OUT, base, "metadata.json"), "w"), indent=2, ensure_ascii=False)
        print(base, "ok")


if __name__ == "__main__":
    main()
