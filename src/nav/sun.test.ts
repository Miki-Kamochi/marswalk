import assert from "node:assert/strict";
import { test } from "node:test";
import { marsTime, nextLocalTime, sunPosition } from "./sun.ts";

const near = (a: number, b: number, tol: number, what: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: got ${a}, expected ${b} ± ${tol}`);

test("matches the worked example published with Mars24 (2000-01-06 00:00 UTC)", () => {
  const t = marsTime(Date.UTC(2000, 0, 6, 0, 0, 0));
  near(t.msd, 44795.99976, 0.00001, "Mars Sol Date");
  near(t.ls, 277.18758, 0.001, "Ls");
  near(t.eotDeg, -5.18774, 0.001, "equation of time");
  near(t.mtc, 23 + 59 / 60 + 39 / 3600, 0.001, "MTC");
});

test("Curiosity landing: mid-afternoon at Gale, southern winter", () => {
  // touchdown 2012-08-06 05:17:57 UTC, about 15:00 local mean solar time at Gale, Ls ~151
  const s = sunPosition(Date.UTC(2012, 7, 6, 5, 17, 57), -4.59, 137.44);
  near(s.ls, 150.7, 1.0, "Ls");
  near(s.ltst, 15.0, 0.75, "local solar time");
  assert.ok(s.elevation > 30 && s.elevation < 55, `sun elevation ${s.elevation}`);
  assert.ok(s.azimuth > 270 || s.azimuth < 30, `sun should be in the north-west, got ${s.azimuth}`);
});

test("sun is highest at local noon and on the horizon near 06:00 / 18:00", () => {
  const noon = nextLocalTime(Date.UTC(2040, 0, 1), 137.36, 12);
  const s = sunPosition(noon, -4.71, 137.36);
  near(s.ltst, 12, 0.01, "ltst at noon");
  assert.ok(s.elevation > 60, `noon elevation ${s.elevation}`);
  const six = sunPosition(nextLocalTime(noon, 137.36, 18), -4.71, 137.36);
  near(six.elevation, 0, 3, "elevation at 18:00");
  assert.ok(six.azimuth > 240 && six.azimuth < 300, `sunset azimuth ${six.azimuth}`);
});
