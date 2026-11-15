import assert from "node:assert/strict";
import { test } from "node:test";
import { matchHorizon, rotateSkyline, skyline } from "./horizon.ts";

const DEG = Math.PI / 180;

/** Synthetic landscape: a few hills at different distances and one big mountain far away. */
const hills: [number, number, number, number][] = [
  // e, n, height, width
  [400, 300, 25, 60],
  [-600, 150, 18, 80],
  [200, -700, 30, 120],
  [-300, -400, 12, 50],
  [1500, 900, 60, 300],
  [-1800, -1200, 45, 250],
  [16000, -14000, 4500, 9000],
];
const elev = (e: number, n: number) => {
  let z = 0;
  for (const [he, hn, h, w] of hills) z += h * Math.exp(-((e - he) ** 2 + (n - hn) ** 2) / (2 * w * w));
  return z;
};

test("the skyline shows the hills in the right directions", () => {
  const sky = skyline(elev, 0, 0, 30000);
  const at = (deg: number) => sky[Math.round((deg / 360) * sky.length) % sky.length];
  // the hill to the north-east at (400, 300) stands higher than the open ground to the north-west
  assert.ok(at(53) > at(315) + 1 && at(53) > 0.5, `NE hill ${at(53)} vs NW ${at(315)}`);
  // the far mountain to the south-east stands up clearly
  assert.ok(at(131) > 5, `mountain ${at(131)}`);
});

test("matching finds the true position from a wrong guess", () => {
  for (const [te, tn] of [
    [40, -30],
    [-25, 55],
    [80, 60],
  ]) {
    const observed = skyline(elev, te, tn, 30000);
    const fix = matchHorizon(elev, observed, 0, 0, 30000, { radius: 120, angleSigma: 0.1, maxShift: 4 });
    const err = Math.hypot(fix.e - te, fix.n - tn);
    assert.ok(fix.ok, `fix failed: ${fix.reason}`);
    assert.ok(err < 10, `true (${te}, ${tn}) found (${fix.e.toFixed(1)}, ${fix.n.toFixed(1)}), error ${err.toFixed(1)} m`);
    assert.ok(err < 3 * fix.sigma + 3, `reported sigma ${fix.sigma.toFixed(1)} m is honest for error ${err.toFixed(1)} m`);
  }
});

test("matching also corrects a wrong heading", () => {
  const trueSky = skyline(elev, 30, 20, 30000);
  // Wayfinder believes north is 6 degrees off: the camera's skyline arrives rotated
  const observed = rotateSkyline(trueSky, 6 * DEG);
  const fix = matchHorizon(elev, observed, 0, 0, 30000, { radius: 100, angleSigma: 0.1, maxShift: 4 });
  assert.ok(fix.ok);
  assert.ok(Math.abs(fix.headingCorrection / DEG + 6) <= 3, `heading correction ${(fix.headingCorrection / DEG).toFixed(1)} deg`);
  assert.ok(Math.hypot(fix.e - 30, fix.n - 20) < 15);
});

test("in thick dust there is no horizon to match", () => {
  const observed = skyline(elev, 0, 0, 50);
  const fix = matchHorizon(elev, observed, 0, 0, 50, { radius: 100, angleSigma: 0.1, maxShift: 4 });
  assert.equal(fix.ok, false);
  assert.equal(fix.reason, "no horizon visible");
});
