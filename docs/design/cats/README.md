# Cat sprites

The office cats come from the reference sheet in this folder (`reference-cats.webp`): 1 Grey & White,
2 Black, 3 White & Grey Tabby, 4 Cream, 5 Calico.

`python3 -I tools/cats/extract_sheet.py` rebuilds `public/assets/cats/*.png` + `metadata.json`:
the panel colour is keyed out, frames are placed on a shared 48×40 canvas (feet on one line) and
written as one row per animation. The sheet has idle / walk / run / sit / jump per cat; the rest is derived:

| animation | made from |
|---|---|
| `walk` (sideways) | the run row |
| `walkfront` (up/down the aisle) | first two frames of the walk row |
| `sit`, `wash` | the sit row (its third frame is a differently coloured variant in the sheet, so it is skipped) |
| `jump`, `stretch` | the jump row (+ a sit frame) |
| `sleep` | a sit frame with closed eyes, squashed into a loaf |

`tools/cats/preview.png` shows every cat and animation. To use higher-resolution art later, replace the
sheet file and re-run the script (the column and row positions are at the top of the script).
