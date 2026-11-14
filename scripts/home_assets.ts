/**
 * Precomputes the routes drawn behind the menu, with the real planner, so the home page stays light.
 *
 * Usage:  node scripts/home_assets.ts      (then .venv/Scripts/python scripts/home_images.py)
 *
 * Writes
 *   public/data/home/routes.json   the four routes from Base Camp to Vera Rubin Ridge, with stats
 *   data/interim/safety_6m.bin     per planner cell: 0 = fine, 1 = caution, 2 = no-go
 *   data/interim/fixable_6m.bin    per planner cell: 1 = a position check is expected to work
 *                                  (both read by home_images.py, so the pictures use the planner's rules)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEFAULTS } from "../src/plan/config.ts";
import { cellElevations, decodeNav, NavGrid } from "../src/plan/grid.ts";
import { Planner, PROFILES } from "../src/plan/planner.ts";

const root = new URL("../", import.meta.url);
const data = new URL("public/data/", root);
const read = (rel: string) => readFileSync(new URL(rel, data));

const meta = JSON.parse(read("meta.json").toString());
const nav = meta.nav.grid;
const playBuf = read(meta.grids.play.file);
const play = new Uint16Array(playBuf.buffer, playBuf.byteOffset, playBuf.byteLength / 2);
const grid = new NavGrid(nav, { ...decodeNav(nav, new Uint8Array(read(nav.file))), elev: cellElevations(meta.grids.play, play, nav) }, DEFAULTS);

const safety = new Uint8Array(grid.size);
for (let i = 0; i < grid.size; i++) safety[i] = grid.blocked[i] ? 2 : grid.good[i] < 0.5 ? 1 : 0;
mkdirSync(new URL("data/interim/", root), { recursive: true });
writeFileSync(new URL("data/interim/safety_6m.bin", root), safety);
writeFileSync(new URL("data/interim/fixable_6m.bin", root), grid.fixable);

const places = JSON.parse(read("positions.json").toString()).places as { id: string; easting: number; northing: number }[];
const place = (id: string) => places.find((p) => p.id === id)!;
const base = place("base");
const dest = place("stop_vera_rubin_ridge");

const planner = new Planner(grid, DEFAULTS);
planner.setHome(grid.nearestOpen(grid.index(base.easting, base.northing)));
const res = planner.plan(grid.index(dest.easting, dest.northing));
if (res.problem) throw new Error(res.problem);

const at = (cell: number): [number, number] => [Math.round(grid.east(cell)), Math.round(grid.northOf(cell))];
const routes = PROFILES.map((p) => {
  const r = res.routes.find((r) => r.profile === p)!;
  const s = r.stats;
  return {
    profile: p,
    points: r.cells.map(at),
    photos: r.photos.map((i) => at(r.cells[i])),
    distance: Math.round(s.distance),
    minutes: Math.round(s.duration / 60),
    o2Out: +(s.o2Out * 100).toFixed(1),
    o2Left: Math.round(s.o2Left * 100),
    climb: Math.round(s.ascent),
    blind: Math.round(s.blindDistance),
    sand: Math.round(s.sandDistance),
    photoCount: s.photoCount,
  };
});

// the picture: a box around both ends of the walk, with a margin
const xs = routes.flatMap((r) => r.points.map((p) => p[0]));
const ys = routes.flatMap((r) => r.points.map((p) => p[1]));
const m = 260;
const bounds = { west: Math.min(...xs) - m, east: Math.max(...xs) + m, south: Math.min(...ys) - m, north: Math.max(...ys) + m };

const out = { from: at(planner.home), to: at(res.dest), bounds, routes };
mkdirSync(new URL("home/", data), { recursive: true });
writeFileSync(new URL("home/routes.json", data), JSON.stringify(out));
for (const r of routes) {
  console.log(`${r.profile.padEnd(5)} ${r.distance} m  ${r.minutes} min  O2 ${r.o2Out}%  blind ${r.blind} m  sand ${r.sand} m  photos ${r.photoCount}`);
}
console.log("bounds", bounds);
