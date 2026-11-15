import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULTS, type PlanConfig } from "./config.ts";
import { energyPerMetre, walkingPower, walkingSpeed } from "./energy.ts";
import { cellElevations, decodeNav, NavGrid, type NavLayers } from "./grid.ts";
import { Planner, PROFILES, type Route } from "./planner.ts";

const CELL = 6;

/** A flat, firm, fully localizable grid that a test then changes. */
function makeGrid(width: number, height: number, change?: (l: NavLayers, at: (c: number, r: number) => number) => void, cfg: PlanConfig = DEFAULTS) {
  const n = width * height;
  const layers: NavLayers = {
    tilt: new Float32Array(n),
    rough: new Float32Array(n),
    step: new Float32Array(n),
    sand: new Float32Array(n),
    loc: new Float32Array(n).fill(1),
    hematite: new Float32Array(n),
    elev: new Float32Array(n),
  };
  const at = (c: number, r: number) => r * width + c;
  change?.(layers, at);
  return { grid: new NavGrid({ width, height, cell: CELL, west: 0, north: 0 }, layers, cfg), at };
}

const byProfile = (routes: Route[]) => Object.fromEntries(routes.map((r) => [r.profile, r])) as Record<(typeof PROFILES)[number], Route>;

test("walking model: sensible speed and power", () => {
  const flat = walkingSpeed(0, DEFAULTS);
  assert.ok(flat > 0.7 && flat < 1.0, `flat speed ${flat}`);
  assert.ok(walkingSpeed(0.3, DEFAULTS) < flat / 2, "much slower up a steep slope");
  const p = walkingPower(flat, 0, DEFAULTS.etaFirm, DEFAULTS);
  assert.ok(p > 200 && p < 450, `flat power ${p} W`);
  assert.ok(walkingPower(flat, 0, DEFAULTS.etaSand, DEFAULTS) > p, "sand costs more");
  assert.ok(energyPerMetre(0.2, DEFAULTS) > 2 * energyPerMetre(0, DEFAULTS), "climbing costs far more per metre");
});

test("on open flat ground all four routes are nearly straight", () => {
  const { grid, at } = makeGrid(80, 60);
  const p = new Planner(grid, DEFAULTS);
  assert.ok(p.setHome(at(5, 5)));
  const res = p.plan(at(70, 40));
  assert.equal(res.routes.length, 4);
  const straight = CELL * Math.hypot(65, 35);
  for (const r of res.routes) {
    assert.ok(r.stats.distance < straight * 1.03, `${r.profile}: ${r.stats.distance.toFixed(0)} m vs straight ${straight.toFixed(0)} m`);
    assert.ok(r.stats.errorOk && r.stats.o2Ok);
  }
  // 443 m of walking at 3 % drift passes the 10 m photo trigger once on the way, plus the arrival fix
  const r = res.routes[0];
  assert.equal(r.stats.photoCount, 2);
  assert.ok(r.stats.maxError >= DEFAULTS.photoTrigger && r.stats.maxError < DEFAULTS.photoTrigger + 1);
  // going home costs about the same as coming on flat ground
  assert.ok(Math.abs(r.stats.o2Back - r.stats.o2Out) < 0.02);
});

test("routes go through the gap in a wall and never touch a no-go cell", () => {
  const { grid, at } = makeGrid(60, 40, (l, at) => {
    for (let r = 0; r < 40; r++) if (r !== 33) l.tilt[at(30, r)] = 40;
  });
  const p = new Planner(grid, DEFAULTS);
  p.setHome(at(5, 5));
  const res = p.plan(at(55, 5));
  for (const r of res.routes) {
    assert.ok(r.cells.includes(at(30, 33)), `${r.profile} uses the gap`);
    assert.ok(r.cells.every((c) => !grid.blocked[c]));
  }
  assert.ok(res.back.includes(at(30, 33)), "the way home uses the gap too");
});

test("a destination behind a closed wall is reported as cut off; one inside a wall is moved", () => {
  const { grid, at } = makeGrid(60, 40, (l, at) => {
    for (let r = 0; r < 40; r++) l.step[at(30, r)] = 2;
  });
  const p = new Planner(grid, DEFAULTS);
  p.setHome(at(5, 5));
  assert.equal(p.plan(at(55, 5)).problem, "cut-off");
  const res = p.plan(at(30, 5));
  assert.equal(res.moved, true);
  assert.equal(res.dest, at(29, 5));
  assert.equal(p.plan(-1).problem, "outside");
});

test("the least-oxygen route walks around a hill that the shortest route climbs", () => {
  const { grid, at } = makeGrid(90, 70, (l) => {
    for (let r = 0; r < 70; r++) {
      for (let c = 0; c < 90; c++) {
        // a 40 m hill about 150 m wide between start and goal (slopes stay under the no-go limit)
        l.elev[r * 90 + c] = 40 * Math.exp(-((c - 45) ** 2 + (r - 35) ** 2) / (2 * 12 ** 2));
      }
    }
  });
  const p = new Planner(grid, DEFAULTS);
  p.setHome(at(10, 35));
  const r = byProfile(p.plan(at(80, 35)).routes);
  assert.ok(r.short.stats.distance < r.o2.stats.distance, "shortest is shorter");
  assert.ok(r.o2.stats.o2Out < r.short.stats.o2Out * 0.9, `o2 ${r.o2.stats.o2Out} vs short ${r.short.stats.o2Out}`);
  assert.ok(r.o2.stats.ascent < r.short.stats.ascent / 2);
});

test("the easiest-to-locate route avoids ground where photo fixes fail", () => {
  const { grid, at } = makeGrid(90, 70, (l) => {
    for (let r = 15; r < 55; r++) for (let c = 30; c < 60; c++) l.loc[r * 90 + c] = 0.1;
  });
  const p = new Planner(grid, DEFAULTS);
  p.setHome(at(10, 35));
  const r = byProfile(p.plan(at(80, 35)).routes);
  assert.ok(r.short.stats.blindDistance > 150, "the straight line crosses the featureless patch");
  assert.equal(r.found.stats.blindDistance, 0);
  assert.equal(r.found.stats.longestBlind, 0);
  assert.ok(r.mix.stats.blindDistance <= r.short.stats.blindDistance);
  // the shortest route takes a photo fix just before it walks in
  const s = r.short;
  const firstBlind = s.cells.findIndex((c) => !grid.fixable[c]);
  assert.ok(s.photos.includes(firstBlind - 1), "photo fix on the last good cell before the patch");
  assert.ok(s.stats.errorOk);
});

test("a featureless band too wide to cross blind is walked around, or flagged if it cannot be", () => {
  // 3 % drift and a 20 m limit allow 600 m without a fix: the band is 720 m wide
  const band = (gap: boolean) =>
    makeGrid(200, 30, (l) => {
      for (let r = 0; r < 30; r++) for (let c = 40; c < 160; c++) if (!(gap && r >= 26)) l.loc[r * 200 + c] = 0;
    });
  const open = band(true);
  let p = new Planner(open.grid, DEFAULTS);
  p.setHome(open.at(10, 5));
  for (const r of p.plan(open.at(190, 5)).routes) {
    assert.ok(r.stats.errorOk, `${r.profile} keeps the error under the limit`);
    assert.ok(r.stats.longestBlind <= p.blindLimit);
  }
  const closed = band(false);
  p = new Planner(closed.grid, DEFAULTS);
  p.setHome(closed.at(10, 5));
  const res = p.plan(closed.at(190, 5));
  assert.equal(res.routes.length, 4);
  for (const r of res.routes) assert.equal(r.stats.errorOk, false);
});

test("oxygen: the walk-back limit shrinks with the tank and far targets fail the reserve rule", () => {
  const { grid, at } = makeGrid(120, 120);
  const p = new Planner(grid, DEFAULTS);
  p.setHome(at(60, 60));
  const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
  const full = count(p.withinLimit(1));
  const low = count(p.withinLimit(0.3));
  assert.equal(full, grid.size);
  assert.ok(low > 0 && low < full, `${low} of ${full} cells within the limit at 30 %`);
  const far = p.plan(at(115, 115), 0.3).routes[0];
  assert.equal(far.stats.o2Ok, false);
  const near = p.plan(at(70, 60), 0.3).routes[0];
  assert.equal(near.stats.o2Ok, true);
  assert.ok(Math.abs(near.stats.o2Left - (0.3 - near.stats.o2Out - near.stats.o2Work - near.stats.o2Back)) < 1e-6);
});

test("real Gale Crater data: the science stops can be reached from Base Camp", () => {
  const dir = new URL("../../public/data/buttes/", import.meta.url);
  const meta = JSON.parse(readFileSync(new URL("meta.json", dir), "utf8"));
  const nav = meta.nav.grid;
  const bytes = new Uint8Array(readFileSync(new URL(nav.file, dir)));
  const playBuf = readFileSync(new URL(meta.grids.play.file, dir));
  const play = new Uint16Array(playBuf.buffer, playBuf.byteOffset, playBuf.byteLength / 2);
  const grid = new NavGrid(nav, { ...decodeNav(nav, bytes), elev: cellElevations(meta.grids.play, play, nav) }, DEFAULTS);
  const share = (a: Uint8Array) => (a.reduce((s, v) => s + v, 0) / a.length) * 100;
  console.log(`  no-go ${share(grid.blocked).toFixed(1)} % of cells, photo fix expected to work on ${share(grid.fixable).toFixed(1)} %`);
  assert.ok(share(grid.blocked) < 15);

  const places = JSON.parse(readFileSync(new URL("positions.json", dir), "utf8")).places;
  const cellOf = (id: string) => {
    const p = places.find((p: { id: string }) => p.id === id);
    return grid.index(p.easting, p.northing);
  };
  const planner = new Planner(grid, DEFAULTS);
  let t0 = performance.now();
  assert.ok(planner.setHome(grid.nearestOpen(cellOf("base"))));
  console.log(`  walk-home maps: ${(performance.now() - t0).toFixed(0)} ms`);
  let reach = 0;
  for (let i = 0; i < grid.size; i++) if (planner.fromHome[i] < Infinity) reach++;
  console.log(`  reachable from Base Camp: ${((reach / grid.size) * 100).toFixed(1)} % of cells`);
  for (const id of ["stop_murray_buttes", "stop_bagnold_dunes", "stop_vera_rubin_ridge"]) {
    t0 = performance.now();
    const res = planner.plan(cellOf(id));
    const ms = performance.now() - t0;
    assert.equal(res.problem, undefined, id);
    assert.equal(res.routes.length, 4);
    console.log(`  ${id} (${ms.toFixed(0)} ms)`);
    for (const r of res.routes) {
      const s = r.stats;
      assert.ok(r.cells.every((c) => !grid.blocked[c]));
      assert.ok(s.errorOk && s.o2Ok, `${id} ${r.profile}`);
      console.log(
        `    ${r.profile.padEnd(5)} ${s.distance.toFixed(0).padStart(5)} m  ${(s.duration / 60).toFixed(0).padStart(3)} min  ` +
          `O2 out ${(s.o2Out * 100).toFixed(1)} %  left ${(s.o2Left * 100).toFixed(0)} %  climb ${s.ascent.toFixed(0)} m  ` +
          `error max ${s.maxError.toFixed(1)} mean ${s.meanError.toFixed(1)} m  photos ${s.photoCount}  ` +
          `blind ${s.blindDistance.toFixed(0)} m (longest ${s.longestBlind.toFixed(0)})  sand ${s.sandDistance.toFixed(0)} m`,
      );
    }
  }
});
