import assert from "node:assert/strict";
import { test } from "node:test";
import { guide, sector } from "./guidance.ts";
import { DEG, bearing, wrap } from "./rng.ts";
import { SensorSim } from "./sensors.ts";
import { sunPosition } from "./sun.ts";
import { horizonDistance, lineOfSight } from "./visibility.ts";
import { Wayfinder, type Landmark } from "./wayfinder.ts";

const E0 = 8142224;
const N0 = -279718;
const UTC0 = Date.UTC(2041, 5, 1, 12, 0, 0);
const PACE = 1.15; // m/s
const DT = 0.5; // s of mission time per tick

const LANDMARKS: Landmark[] = [
  { id: "a", name: "Butte A", e: E0 + 500, n: N0 + 300, elev: 0 },
  { id: "b", name: "Butte B", e: E0 - 200, n: N0 - 600, elev: 0 },
];

interface Options {
  seed: number;
  sun?: boolean;
  landmarksAfter?: number; // start landmark sightings after this many metres
  veer?: number; // hidden turn rate, rad/s
  distance?: number;
}

/** Walk a wandering path and return how well Wayfinder kept up. */
function run(o: Options) {
  let e = E0;
  let n = N0;
  let yaw = 120 * DEG;
  const sensors = new SensorSim(o.seed, yaw);
  const wf = new Wayfinder(e, n, sensors.gyroHeading, { seed: o.seed * 31 + 1 });
  let walked = 0;
  let t = 0;
  let inside = 0;
  let ticks = 0;
  let nextSun = 0;
  let nextLm = 0;
  const total = o.distance ?? 900;
  while (walked < total) {
    // gentle turns, as when picking a way over terrain
    yaw += (Math.sin(walked / 70) * 0.6 * DEG + (o.veer ?? 0)) * DT;
    const d = PACE * DT;
    e += d * Math.sin(yaw);
    n += d * Math.cos(yaw);
    walked += d;
    t += DT;
    const m = sensors.motion(d, yaw, DT);
    wf.predict(m.dist, m.gyroHeading, 0, DT);
    if (o.sun && t >= nextSun) {
      nextSun = t + 8;
      const sun = sunPosition(UTC0 + t * 1000, (n / 3396190) / DEG, (e / 3396190) / DEG);
      const sigma = sensors.sunSigma(sun.elevation, 0);
      if (sigma !== null) wf.sunSighting(sensors.sunBearing(yaw, sun.azimuth, sigma), sigma, UTC0 + t * 1000, t);
    }
    if (o.landmarksAfter !== undefined && walked >= o.landmarksAfter && t >= nextLm) {
      nextLm = t + 8;
      wf.landmarkSightings(
        LANDMARKS.map((lm) => ({ lm, relBearing: sensors.landmarkBearing(yaw, bearing(e, n, lm.e, lm.n)) })),
        sensors.cfg.landmarkSigma,
        t,
      );
    }
    const est = wf.estimate;
    if (Math.hypot(est.e - e, est.n - n) <= est.r95) inside++;
    ticks++;
  }
  const est = wf.estimate;
  return {
    error: Math.hypot(est.e - e, est.n - n),
    r95: est.r95,
    headingError: Math.abs(wrap(est.heading - yaw)) / DEG,
    coverage: inside / ticks,
    walked,
    wf,
    truth: { e, n, yaw },
  };
}

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

test("dead reckoning alone drifts by a few percent of the distance walked, and says so", () => {
  const r = SEEDS.map((seed) => run({ seed }));
  const pct = mean(r.map((x) => (x.error / x.walked) * 100));
  console.log(`  dead reckoning: mean error ${pct.toFixed(1)}% of distance, mean r95 ${mean(r.map((x) => x.r95)).toFixed(0)} m`);
  assert.ok(pct > 0.8, `drift is unrealistically small (${pct.toFixed(2)}%)`);
  assert.ok(pct < 8, `drift is too large (${pct.toFixed(2)}%)`);
  // honesty: the true position is inside the uncertainty circle most of the time
  const cov = mean(r.map((x) => x.coverage));
  console.log(`  truth inside the 95% circle ${(cov * 100).toFixed(0)}% of the time`);
  assert.ok(cov > 0.85, `uncertainty circle is over-confident (coverage ${cov.toFixed(2)})`);
  // and the circle grows with distance
  const short = mean(SEEDS.map((seed) => run({ seed, distance: 200 }).r95));
  assert.ok(mean(r.map((x) => x.r95)) > short * 2, "uncertainty should grow as drift builds up");
});

test("the sun compass holds the heading and cuts the drift", () => {
  const dr = SEEDS.map((seed) => run({ seed }));
  const sun = SEEDS.map((seed) => run({ seed, sun: true }));
  const hDr = mean(dr.map((x) => x.headingError));
  const hSun = mean(sun.map((x) => x.headingError));
  console.log(`  heading error: ${hDr.toFixed(1)} deg without sun, ${hSun.toFixed(1)} deg with sun`);
  console.log(`  position error: ${mean(dr.map((x) => x.error)).toFixed(0)} m without sun, ${mean(sun.map((x) => x.error)).toFixed(0)} m with sun`);
  assert.ok(hSun < 1.5, `sun compass should hold heading to about a degree, got ${hSun.toFixed(2)}`);
  assert.ok(mean(sun.map((x) => x.error)) < mean(dr.map((x) => x.error)), "sun compass should reduce drift");
  assert.ok(mean(sun.map((x) => x.coverage)) > 0.85, "still honest with the sun compass");
});

test("bearings to two landmarks reset the drift", () => {
  const before = SEEDS.map((seed) => run({ seed, sun: true, distance: 800 }));
  const after = SEEDS.map((seed) => run({ seed, sun: true, landmarksAfter: 800, distance: 900 }));
  const eB = mean(before.map((x) => x.error));
  const eA = mean(after.map((x) => x.error));
  console.log(`  error ${eB.toFixed(0)} m before, ${eA.toFixed(0)} m after landmark fixes; circle ${mean(before.map((x) => x.r95)).toFixed(0)} m -> ${mean(after.map((x) => x.r95)).toFixed(0)} m`);
  assert.ok(eA < eB * 0.6, "landmark fixes should cut the error");
  assert.ok(mean(after.map((x) => x.r95)) < mean(before.map((x) => x.r95)) * 0.6, "the circle should shrink after a fix");
  assert.ok(mean(after.map((x) => x.coverage)) > 0.85, "still honest after fixes");
});

test("a hidden veer (walking in a curve without noticing) is caught by the gyro", () => {
  const r = SEEDS.map((seed) => run({ seed, veer: 0.15 * DEG, distance: 500 }));
  const h = mean(r.map((x) => x.headingError));
  console.log(`  heading error while veering: ${h.toFixed(1)} deg; position error ${mean(r.map((x) => x.error)).toFixed(0)} m`);
  assert.ok(h < 4, `Wayfinder should track the true heading through a veer, got ${h.toFixed(1)} deg`);
});

test("the breadcrumb trail leads back toward the start", () => {
  const r = run({ seed: 3, sun: true, distance: 600 });
  const wf = r.wf;
  assert.ok(wf.breadcrumbs.length > 60, "trail recorded");
  const home = wf.homeward(35);
  const est = wf.estimate;
  assert.ok(home.remaining > 500 && home.remaining < 700, `trail distance home ${home.remaining}`);
  // the next target is behind us on the trail, about the look-ahead distance away
  const d = Math.hypot(home.e - est.e, home.n - est.n);
  assert.ok(d > 20 && d < 60, `look-ahead target ${d} m away`);
  const g = guide(est, { e: home.e, n: home.n, name: "trail" }, []);
  assert.ok(Math.abs(g.turn) > 120 * DEG, "we walked away from home, so home is behind us");
  assert.equal(g.headline, "Turn around");
});

test("guidance speaks in directions, not coordinates", () => {
  const g = guide({ e: 0, n: 0, heading: 0 }, { e: 100, n: 100, name: "rover" }, [
    { name: "The sun", bearing: 135 * DEG },
    { name: "Butte A", bearing: -40 * DEG },
  ]);
  assert.equal(g.headline, "Turn right 45°");
  assert.equal(g.cues, "The sun on your right · Butte A on your left");
  assert.equal(sector(170 * DEG), "behind you");
  assert.equal(sector(-30 * DEG), "ahead on your left");
});

test("line of sight respects terrain and the curvature of Mars", () => {
  const flat = () => 0;
  assert.ok(lineOfSight(flat, 0, 0, 1.7, 3000, 0, 0), "3 km over flat ground is inside the horizon");
  assert.ok(!lineOfSight(flat, 0, 0, 1.7, 6000, 0, 0), "6 km is beyond the 3.4 km horizon");
  assert.ok(lineOfSight(flat, 0, 0, 1.7, 30000, 0, 4000), "a 4 km mountain is visible from 30 km");
  const ridge = (e: number) => (Math.abs(e - 500) < 20 ? 15 : 0);
  assert.ok(!lineOfSight(ridge, 0, 0, 1.7, 1000, 0, 1), "a 15 m ridge hides what is behind it");
  assert.ok(Math.abs(horizonDistance(1.7) - 3400) < 50, "horizon about 3.4 km for a standing person");
});
