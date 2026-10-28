/** World coordinates shared by the scene, the cats and the HTML overlay (1 unit = 1 art pixel). */
import { deskGeom } from "./art.js";

export const W = 880;
export const H = 600;
export const WALL = 168;
export const DOOR = { x: 44, y: 190 };
export const WALK_SPEED = 0.11; // world px per ms
export const ORDER = ["lead", "plan", "dev", "test", "mkt", "design", "review"];
export const coffeeSpot = (key) => ({ x: 100 + ORDER.indexOf(key) * 22, y: 188 });
export const BOARD = { x: 446, y: 16, w: 180, h: 98 };
export const TV = { x: 724, y: 30, w: 140, h: 78 };

/** desk positions: two rows of three + the lead's glass office */
export const LAYOUT = {
  plan: deskGeom(162, 290),
  dev: deskGeom(342, 290),
  test: deskGeom(522, 290),
  mkt: deskGeom(162, 496),
  design: deskGeom(342, 496),
  review: deskGeom(522, 496),
  lead: deskGeom(762, 340, 172),
};

