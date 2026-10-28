# Walk cycles

The pixel-distric walk sheets are almost static (front and back walks are the idle pose, the side walk repeats
one stride pose), so the office builds its own from the same art with `tools/characters/walk_cycles.py`
(sources in `tools/characters/source/`):

- **front / back**: one leg shortened at a time (rows removed from the shin, so the foot rises), the body
  bobbing and swaying onto the planted leg.
- **side**: the cleanest side frame, its legs cut off as two clusters and walked through an 8-frame cycle
  (opening and closing, the swinging leg lifts, the body bobs when they pass); cloth speckle is tidied.

Everything moves by whole pixels (no resampling). The walking speed (`WALK_SPEED` in `public/office/layout.js`)
matches the stride, and characters walk axis-aligned routes: along a lane above the monitors, then straight down to
the seat, using the front/back/side sheet that matches the direction.
