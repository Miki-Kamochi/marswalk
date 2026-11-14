/** What can actually be seen from where the astronaut stands, worked out from the real terrain. */

const MARS_RADIUS = 3396190;

export type ElevationFn = (e: number, n: number) => number;

/**
 * True if a point `h1` metres above the ground at (e1, n1) can be seen from `h0` metres above
 * the ground at (e0, n0): the straight sight line clears the terrain everywhere in between,
 * allowing for the curvature of Mars.
 */
export function lineOfSight(
  elev: ElevationFn,
  e0: number,
  n0: number,
  h0: number,
  e1: number,
  n1: number,
  h1: number,
): boolean {
  const d = Math.hypot(e1 - e0, n1 - n0);
  if (d < 1) return true;
  const z0 = elev(e0, n0) + h0;
  const z1 = elev(e1, n1) + h1 - (d * d) / (2 * MARS_RADIUS);
  // step finely near the observer (small rises close by hide the most), coarser far away
  let x = 3;
  while (x < d - 12) {
    const t = x / d;
    const ground = elev(e0 + (e1 - e0) * t, n0 + (n1 - n0) * t) - (x * x) / (2 * MARS_RADIUS);
    if (!Number.isNaN(ground) && ground > z0 + (z1 - z0) * t) return false;
    x += x < 400 ? 3 : x < 3000 ? 8 : 60;
  }
  return true;
}

/** Distance to the horizon on a smooth Mars for an eye at the given height (about 3.4 km at 1.7 m). */
export function horizonDistance(eyeHeight: number): number {
  return Math.sqrt(2 * MARS_RADIUS * eyeHeight);
}

/**
 * How far a feature can be recognised through dust, for the game's haze density
 * (three.js exponential-squared fog): the distance at which contrast falls to 15%.
 */
export function visualRange(fogDensity: number): number {
  return Math.sqrt(-Math.log(0.15)) / fogDensity;
}
