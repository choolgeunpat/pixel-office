/** Small 9×9 pixel icons (one colour each), rendered once to data URLs for the HTML layer. */
const BITMAPS = {
  plan: ["...###...", "..#####..", ".#######.", ".#######.", ".#######.", "..#####..", "...###...", "...###...", "...###..."],
  dev: [".........", "...#..#..", "..#....#.", ".#..##..#", "#...##...", ".#..##..#", "..#....#.", "...#..#..", "........."],
  test: [".........", ".......#.", "......##.", ".#...##..", ".##.##...", "..###....", "...#.....", ".........", "........."],
  mkt: [".........", ".....##..", "..#####..", ".######..", ".######.#", "..#####..", "..##.....", "..##.....", "........."],
  design: ["......##.", ".....###.", "....###..", "...###...", "..###....", ".###.....", "##.#.....", "###......", ".#......."],
  review: ["..####...", ".#....#..", "#......#.", "#......#.", "#......#.", ".#....#..", "..####.#.", "......###", ".......##"],
  lead: [".........", "#...#...#", "##.###.##", "#########", "#########", "#########", ".........", ".........", "........."],
};

const cache = new Map();

/** @returns {string} data URL of the icon in `color` (image-rendering: pixelated at display time) */
export function roleIcon(key, color) {
  const id = `${key}|${color}`;
  if (cache.has(id)) return cache.get(id);
  const bm = BITMAPS[key] || BITMAPS.lead;
  const c = document.createElement("canvas");
  c.width = c.height = 9;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  bm.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && ctx.fillRect(x, y, 1, 1)));
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
