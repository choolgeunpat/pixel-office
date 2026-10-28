# Cat sprites

The office cats come from the reference sheet in this folder (`reference-cats.webp`): 1 Grey & White,
2 Black, 3 White & Grey Tabby, 4 Cream, 5 Calico.

The sheet's small frames are blurry, so the sprites are built from its **large portraits**, the
sharpest art in the sheet:

1. `tools/cats/portraits.py` keys the panel colour out, area-averages each portrait down to a clean
   46-pixel-tall grid, snaps the colours to a 24-colour palette and gives it a hard 1 px outline.
2. `tools/cats/extract_sheet.py` makes every animation from that one crisp sprite, without blurring it:

| animation | made by |
|---|---|
| `sit` | tail wag (moving the tail pixels) and a blink |
| `wash` | head tilt with closed eyes |
| `sleep` | closed eyes, squashed into a loaf (re-snapped to the palette) |
| `stretch`, `jump` | squash/stretch (re-snapped to the palette) |
| `walk`, `walkfront` | a waddle: rows sheared and the sprite bobbed (no resampling) |

Run `python3 -I tools/cats/extract_sheet.py` to rebuild `public/assets/cats/`; `tools/cats/preview.png`
and `portraits-preview.png` show the result. The eye positions per cat are in `EYE_BOXES`.

In the browser the canvas is exactly as many device pixels as it is shown at, and a cat pixel is a whole
number of device pixels, so the pixels stay hard-edged at any zoom.
