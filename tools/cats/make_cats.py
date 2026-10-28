#!/usr/bin/env python3 -I
"""
Pixel cat sprite sheets for Pixel Office (reproducible: `python3 -I tools/cats/make_cats.py`).

Each cat is painted from parts (body, head, legs, tail, ears …) onto a 40×32 grid, then
coloured per breed (patterns follow the part's own coordinates, so stripes and patches stay put
between frames), shaded (light top edge, darker underside) and outlined automatically.

Output: public/assets/cats/<id>.png  — one row per animation, 40×32 frames, facing right
        public/assets/cats/metadata.json — rows, frame counts, fps, anchor (feet)
        tools/cats/preview.png — 6× contact sheet for checking
"""
import json, math, os
from PIL import Image

FW, FH = 40, 32
GROUND = 29
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "cats")

# ----------------------------------------------------------------- breeds
BREEDS = {
    # 1 grey & white
    "mochi": dict(name="모찌", bodyRx=8, bodyRy=4.6, legLen=5, legW=2, headR=4.6, tailW=2, ear=4, fluff=0,
                  base="#a3acbb", alt="#7f8999", belly="#f6f6f8", outline="#3d4558", eye="dark", nose="#e8a1ab", inner="#f1b8bf"),
    # 2 black, bright green eyes
    "midnight": dict(name="까망", bodyRx=8, bodyRy=4.5, legLen=5, legW=2, headR=4.6, tailW=2, ear=4, fluff=0,
                     base="#3a3c52", alt="#2b2c3f", belly="#3a3c52", outline="#11121b", eye="green", nose="#7a5a6a", inner="#6a4a5c"),
    # 3 white & grey tabby
    "cloud": dict(name="구름", bodyRx=8.2, bodyRy=4.8, legLen=5, legW=2, headR=4.7, tailW=2, ear=4, fluff=0,
                  base="#f3f1ee", alt="#8c93a1", belly="#fbfaf8", outline="#4a4f5e", eye="dark", nose="#e8a1ab", inner="#f1b8bf"),
    # 4 cream, short legs and a round body
    "munchkin": dict(name="크림", bodyRx=8.5, bodyRy=5.5, legLen=2, legW=3, headR=4.9, tailW=2, ear=3, fluff=0,
                     base="#f4dfbf", alt="#dba974", belly="#fff3df", outline="#6b4a3a", eye="dark", nose="#e58f8f", inner="#f2a7a0"),
    # 5 calico (white with orange and brown patches)
    "calico": dict(name="미미", bodyRx=8.2, bodyRy=4.9, legLen=5, legW=2, headR=4.7, tailW=2, ear=4, fluff=0,
                   base="#f7f3ee", alt="#e89a4c", belly="#fbf8f4", outline="#5a3d33", eye="dark", nose="#e58f8f", inner="#f2a7a0"),
}

# ----------------------------------------------------------------- painting helpers
def ell(P, cx, cy, rx, ry, part, ref=None):
    ref = ref or (cx, cy)
    for y in range(int(cy - ry) - 2, int(cy + ry) + 3):
        for x in range(int(cx - rx) - 2, int(cx + rx) + 3):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                P[(x, y)] = (part, x - ref[0], y - ref[1], 0)

def stamp(P, x, y, w, part, ref, idx=0):
    o = w // 2
    for yy in range(w):
        for xx in range(w):
            P[(int(round(x)) - o + xx, int(round(y)) - o + yy)] = (part, int(round(x)) - ref[0], int(round(y)) - ref[1], idx)

def line(P, pts, w, part, ref=(0, 0), tag_index=False):
    """thick polyline; with tag_index every stamped pixel remembers how far along the line it is"""
    total = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) or 1
    run = 0
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(1, int(math.dist(pts[i], pts[i + 1]) * 2))
        for k in range(n + 1):
            t = k / n
            along = (run + t * math.dist(pts[i], pts[i + 1])) / total
            stamp(P, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w, part, ref, int(along * 100) if tag_index else 0)
        run += math.dist(pts[i], pts[i + 1])

def tri(P, a, b, c, part, ref):
    xs, ys = [a[0], b[0], c[0]], [a[1], b[1], c[1]]
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            p = (x + 0.5, y + 0.5)
            d1, d2, d3 = sign(p, a, b), sign(p, b, c), sign(p, c, a)
            neg = d1 < 0 or d2 < 0 or d3 < 0
            pos = d1 > 0 or d2 > 0 or d3 > 0
            if not (neg and pos):
                P[(x, y)] = (part, x - ref[0], y - ref[1], 0)

def head(P, B, hx, hy, tilt=0, open_mouth=False, closed=False, dir=1):
    R = B["headR"]
    ref = (hx, hy)
    # far ear first, then head, then near ear
    e = B["ear"]
    for k, part in ((-1, "earfar"), (1, "ear")):
        ex = hx + k * (R * 0.55) + tilt
        base_y = hy - R * 0.75
        tri(P, (ex - 2.2, base_y + 1.5), (ex + 2.2, base_y + 1.5), (ex + k * 0.6, base_y - e), part, ref)
        if B["fluff"]:  # ear tuft
            P[(int(ex + k * 0.6), int(base_y - e) - 1)] = (part, 0, 0, 1)
    ell(P, hx, hy, R, R * 0.88, "head", ref)
    if B["fluff"]:  # cheek ruff
        ell(P, hx - 1, hy + R * 0.6, R * 0.9, R * 0.45, "head", ref)

def face(P, B, hx, hy, closed=False, open_mouth=False):
    R = B["headR"]
    ex, ey = int(round(hx + R * 0.45)), int(round(hy - 0.6))
    if closed:
        P[(ex, ey + 1)] = ("eye", 0, 0, 0); P[(ex + 1, ey + 1)] = ("eye", 0, 0, 0); P[(ex - 1, ey + 1)] = ("eye", 0, 0, 0)
    elif B["eye"] == "dark":
        P[(ex, ey)] = ("eye", 0, 0, 0); P[(ex, ey + 1)] = ("eye", 0, 0, 0)
    else:
        P[(ex - 1, ey)] = ("eyeA", 0, 0, 0); P[(ex, ey)] = ("eyeA", 0, 0, 0)
        P[(ex - 1, ey + 1)] = ("eyeA", 0, 0, 0); P[(ex, ey + 1)] = ("pupil", 0, 0, 0)
    nx, ny = int(round(hx + R - 0.5)), int(round(hy + 1))
    P[(nx, ny)] = ("nose", 0, 0, 0)
    if open_mouth:
        P[(nx - 1, ny + 1)] = ("mouth", 0, 0, 0); P[(nx, ny + 1)] = ("mouth", 0, 0, 0)

def leg(P, hip, foot, w, part, ref):
    line(P, [hip, foot], w, part, ref)

# ----------------------------------------------------------------- poses (facing right)
def pose_walk(B, i):
    P = {}
    bob = [0, -1, 0, -1][i]
    rx, ry, L = B["bodyRx"], B["bodyRy"], B["legLen"]
    cx, cy = 17, GROUND - L - ry + 1 + bob
    ref = (cx, cy)
    sway = [0, 1, 0, -1][i]
    tb = (cx - rx + 1, cy - 1)
    tl = 8 + (3 if B["fluff"] else 0)
    line(P, [tb, (tb[0] - 3, tb[1] - 2), (tb[0] - 4 + sway, tb[1] - 5), (tb[0] - 4 + sway, tb[1] - tl)], B["tailW"], "tail", ref, True)
    ph = i / 4
    def swing(k):
        a = math.sin(2 * math.pi * (ph + k))
        return round(a * 2.2), (1 if a > 0.4 else 0)
    legs = [("legfar", cx + rx - 5, 0.5), ("legfar", cx - rx + 3, 0.0), ("leg", cx + rx - 3, 0.0), ("leg", cx - rx + 1, 0.5)]
    for part, hx, k in legs[:2]:
        dx, lift = swing(k)
        leg(P, (hx, cy + ry - 1), (hx + dx, GROUND - lift), B["legW"], part, ref)
    ell(P, cx, cy, rx, ry, "body", ref)
    if B["fluff"]:
        ell(P, cx + rx - 3, cy + 2, 3.2, 3.4, "tuft", ref)
    for part, hx, k in legs[2:]:
        dx, lift = swing(k)
        leg(P, (hx, cy + ry - 1), (hx + dx, GROUND - lift), B["legW"], part, ref)
    hx, hy = cx + rx + B["headR"] - 3.5, cy - ry * 0.6 - 1
    head(P, B, hx, hy)
    return P, (hx, hy), {}

def tail_path(frame, fluff):
    tips = [(3, 22), (2, 20), (3, 22), (4, 24)]
    tx, ty = tips[frame % 4]
    return [(8, 27), (5, 28), (3, 26), (tx, ty)] if not fluff else [(8, 27), (4, 28), (2, 25), (tx - 1, ty - 1)]

def pose_sit(B, i, wash=False):
    P = {}
    fl = B["fluff"]
    short = B["legLen"] < 3  # munchkin: even rounder
    ref = (16, 23)
    line(P, tail_path(i, fl), B["tailW"], "tail", ref, True)
    ell(P, 13.5, 25.2, B["bodyRx"] * 0.78, 4.2, "body", ref)                              # haunch
    ell(P, 18.5, 22, 4.6 + fl * 0.6 + short * 0.6, 5.0 + (0 if short else 0.6), "body", ref)  # round torso
    if fl:
        ell(P, 21, 23, 3, 3.6, "tuft", ref)
    hx, hy = 21.5, 14.6 + (1 if wash else 0)
    if wash:
        paw = [(25, 16), (24.5, 14.5), (25, 16), (24.5, 14.5)][i % 4]
        leg(P, (22, 21), (22, GROUND), B["legW"], "legfar", ref)
        leg(P, (20, 22), paw, B["legW"], "leg", ref)
    else:
        leg(P, (22, 22), (22, GROUND), B["legW"], "legfar", ref)
        leg(P, (20, 22), (20, GROUND), B["legW"], "leg", ref)
    head(P, B, hx, hy, tilt=1 if wash else 0)
    return P, (hx, hy), dict(closed=wash and i % 2 == 0)

def pose_sleep(B, i):
    P = {}
    ref = (17, 25)
    ry = B["bodyRy"] + (0.6 if i % 2 else 0)
    ell(P, 17, GROUND - ry + 0.5, B["bodyRx"] + 1.5, ry, "body", ref)
    line(P, [(7, 26), (8, 29), (13, 30), (22, 30), (28, 29)], B["tailW"], "tail", ref, True)
    ell(P, 24.5, 27.5, 2.6, 2, "leg", ref)
    hx, hy = 27, 25.5
    head(P, B, hx, hy)
    return P, (hx, hy), dict(closed=True)

def pose_stretch(B, i):
    P = {}
    f = [0, 1, 1, 0][i]
    if f == 0:
        return pose_sit(B, 0)
    L = B["legLen"]
    ref = (14, 22)
    line(P, [(7, 21), (4, 19), (3, 16)], B["tailW"], "tail", ref, True)
    leg(P, (9, 24), (8, GROUND), B["legW"], "legfar", ref)
    leg(P, (21, 25), (31, 28), B["legW"], "legfar", ref)
    ell(P, 11, 22, 5.2, 4.5, "body", ref)
    line(P, [(11, 23), (19, 25.5)], 6, "body", ref)
    leg(P, (11, 25), (11, GROUND), B["legW"], "leg", ref)
    leg(P, (20, 26), (30, 29), B["legW"], "leg", ref)
    hx, hy = 28 if i == 1 else 28, 26
    head(P, B, hx, hy)
    return P, (hx, hy), dict(open_mouth=(i == 2))

def pose_jump(B, i):
    P = {}
    ref = (18, 20)
    if i == 0:  # crouch
        return pose_sit(B, 1)
    line(P, [(10, 17), (3, 15), (1, 13)], B["tailW"], "tail", ref, True)
    leg(P, (12, 20), (5, 23), B["legW"], "legfar", ref)
    leg(P, (24, 20), (31, 22), B["legW"], "legfar", ref)
    ell(P, 18, 18, B["bodyRx"], B["bodyRy"] - 0.6, "body", ref)
    leg(P, (13, 21), (7, 25), B["legW"], "leg", ref)
    leg(P, (23, 21), (30, 24), B["legW"], "leg", ref)
    hx, hy = 28, 15
    head(P, B, hx, hy)
    return P, (hx, hy), dict(open_mouth=True)

ANIMS = {
    "walk":    (pose_walk, 4, 8, True),
    "sit":     (pose_sit, 4, 3, True),
    "wash":    (lambda B, i: pose_sit(B, i, True), 4, 4, True),
    "sleep":   (pose_sleep, 2, 1.2, True),
    "stretch": (pose_stretch, 4, 3, False),
    "jump":    (pose_jump, 2, 2, False),
}

# ----------------------------------------------------------------- colouring
def hex2(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def mul(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def colour(key, B, part, lx, ly, idx, bounds):
    base, alt, belly = hex2(B["base"]), hex2(B["alt"]), hex2(B["belly"])
    n = key
    c = base
    if part in ("legfar", "earfar"):
        c = mul(base, 0.86)
    if n == "munchkin":
        if part == "body" and ly < -B["bodyRy"] * 0.1 and -3 < lx < 4: c = alt
        if part in ("ear", "earfar"): c = alt
        if part == "tail": c = alt if idx > 55 else base
        if part == "head" and ly < -2.5 and abs(lx) < 3: c = mix(base, alt, 0.6)
        if part in ("body", "leg", "legfar") and ly > B["bodyRy"] * 0.45: c = belly
    elif n == "midnight":
        if part == "head" and ly < -3: c = hex2("#454761")
    elif n == "mochi":
        if part == "body" and ly > -0.4: c = belly
        if part in ("leg", "legfar") and bounds["leg"]: c = belly if ly > 0 or True else base
        if part == "head" and lx > 0.5 and ly > -0.5: c = belly
        if part == "head" and ly < -3.6 and abs(lx) < 1.2: c = belly
        if part == "tail" and idx > 82: c = belly
        if part == "tuft": c = belly
    elif n == "cloud":
        stripe = (lx + 40) % 3 == 0
        if part == "body" and ly < B["bodyRy"] * 0.35 and stripe: c = alt
        if part == "tail" and (idx // 14) % 2 == 1: c = alt
        if part == "head" and ly < -2 and lx % 2 == 0 and abs(lx) < 3: c = alt
        if part in ("ear", "earfar"): c = mix(base, alt, 0.5)
    elif n == "calico":
        v = (math.sin(lx * 0.7 + 1.3) + math.cos(ly * 0.9 + 0.4) + math.sin((lx + ly) * 0.5)) / 3
        orange, brown = alt, hex2("#6b4a3a")
        if part in ("body", "tuft"):
            if v > 0.3: c = orange
            elif v < -0.5: c = brown
        if part == "head" and lx < 1 and ly < 0.5: c = orange
        if part in ("ear", "earfar"): c = brown if part == "earfar" else orange
        if part == "tail": c = orange if idx < 60 else brown
        if part in ("leg", "legfar") and ly < 0 and False: c = orange
    elif n == "cheese":
        stripe = (lx + 40) % 4 == 0
        if part == "body" and ly < B["bodyRy"] * 0.5 and stripe: c = alt
        if part == "body" and ly > B["bodyRy"] * 0.5: c = belly
        if part == "tail" and (idx // 12) % 2 == 1: c = alt
        if part == "head" and ly < -2 and lx % 2 == 0 and abs(lx) < 3: c = alt
        if part in ("leg", "legfar") and ly > 2 and False: c = belly
    elif n == "fluffy":
        stripe = (lx + 40) % 3 == 0
        if part == "body" and ly < B["bodyRy"] * 0.4 and stripe: c = alt
        if part == "body" and ly > B["bodyRy"] * 0.55: c = mix(base, belly, 0.5)
        if part == "tuft": c = belly
        if part == "tail" and (idx // 14) % 2 == 1: c = alt
        if part == "head" and ly < -2 and lx % 2 == 0 and abs(lx) < 3: c = alt
        if part in ("ear", "earfar") and idx == 1: c = belly
    if part == "nose": return hex2(B["nose"])
    if part == "mouth": return hex2("#7a3b3b")
    if part == "eye": return hex2("#1c1f33")
    if part == "eyeA": return hex2("#8ae36b" if B["eye"] == "green" else "#f2c04a")
    if part == "pupil": return hex2("#15321a" if B["eye"] == "green" else "#5a3a10")
    return c

def render(key, B, P, headpos, fx):
    face(P, B, headpos[0], headpos[1], closed=fx.get("closed", False), open_mouth=fx.get("open_mouth", False))
    # inner ear pixels
    img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    px = img.load()
    # leg group bounds flag (grey-white socks)
    bounds = {"leg": True}
    cells = {}
    for (x, y), (part, lx, ly, idx) in P.items():
        if 0 <= x < FW and 0 <= y < FH:
            cells[(x, y)] = colour(key, B, part, lx, ly, idx, bounds)
    # fur shading: light on top edge, darker underneath (not on the face details)
    detail = {"eye", "eyeA", "pupil", "nose", "mouth"}
    shaded = {}
    for (x, y), c in cells.items():
        part = P[(x, y)][0]
        if part in detail:
            shaded[(x, y)] = c
            continue
        up, down = (x, y - 1) in cells, (x, y + 1) in cells
        if not up:
            c = mix(c, (255, 255, 255), 0.16)
        elif not down:
            c = mul(c, 0.82)
        shaded[(x, y)] = c
    # inner ears
    for (x, y), (part, lx, ly, idx) in P.items():
        if part == "ear" and (x, y + 1) in cells and (x, y + 2) in cells and P.get((x, y - 1), ("",))[0] != "ear" and False:
            pass
    outline = hex2(B["outline"])
    sil = set(shaded)
    for (x, y), c in shaded.items():
        px[x, y] = (*c, 255)
    for (x, y) in list(sil):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in sil and 0 <= q[0] < FW and 0 <= q[1] < FH:
                px[q[0], q[1]] = (*outline, 255)
    # pink ear insides on top of the outline pass
    hx, hy = headpos
    for k in (1,):
        ex = int(round(hx + B["headR"] * 0.55 * k))
        ey = int(round(hy - B["headR"] * 0.75 - B["ear"] * 0.35))
        if px[ex, ey][3]:
            px[ex, ey] = (*hex2(B["inner"]), 255)
    return img

def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {"frameWidth": FW, "frameHeight": FH, "anchor": {"x": 20, "y": GROUND + 1}, "facing": "right", "animations": {}, "cats": {}}
    rows = list(ANIMS)
    for r, name in enumerate(rows):
        _, n, fps, loop = ANIMS[name]
        meta["animations"][name] = {"row": r, "frames": n, "fps": fps, "loop": loop}
    preview = Image.new("RGBA", (FW * 6 * 6, FH * 6 * len(BREEDS) * 1 + 0), (255, 255, 255, 255))
    prev_rows = []
    for key, B in BREEDS.items():
        sheet = Image.new("RGBA", (FW * 4, FH * len(rows)), (0, 0, 0, 0))
        for r, name in enumerate(rows):
            fn, n, _, _ = ANIMS[name]
            for i in range(n):
                P, hp, fx = fn(B, i)
                sheet.paste(render(key, B, P, hp, fx), (i * FW, r * FH))
        sheet.save(os.path.join(OUT, f"{key}.png"))
        meta["cats"][key] = {"name": B["name"], "file": f"{key}.png"}
        prev_rows.append(sheet)
    json.dump(meta, open(os.path.join(OUT, "metadata.json"), "w"), ensure_ascii=False, indent=2)
    # contact sheet: every breed, every row, 5× on a cream floor
    S = 5
    W = FW * 4 * S
    H = FH * len(rows) * S
    sheet_all = Image.new("RGBA", (W * len(prev_rows), H), (247, 240, 228, 255))
    for k, sh in enumerate(prev_rows):
        up = sh.resize((sh.width * S, sh.height * S), Image.NEAREST)
        sheet_all.alpha_composite(up, (k * W, 0))
    sheet_all.convert("RGB").save(os.path.join(ROOT, "tools", "cats", "preview.png"))
    print("wrote", len(BREEDS), "cats ->", OUT)

if __name__ == "__main__":
    main()
