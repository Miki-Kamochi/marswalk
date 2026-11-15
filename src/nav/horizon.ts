/**
 * Horizon matching: find where you are by comparing the skyline you see with skylines
 * computed from an orbital elevation map.
 *
 * The suit's camera turns the skyline into a list of "how high above level is the skyline"
 * angles, one per compass direction. For candidate positions around the current estimate we
 * compute the same list from the elevation map; the candidate whose skyline fits best is where
 * you are. Allowing the whole list to rotate a little also corrects the heading.
 *
 * Only terrain the dust lets you see counts: both the observed and the candidate skylines
 * are cut off at the current visual range, so in thick dust there is nothing to match.
 * (The near foreground is ignored, as real systems do: it is mostly small rocks and bumps.)
 */
export type ElevationFn = (e: number, n: number) => number;

const MARS_RADIUS = 3396190;
const DEG = Math.PI / 180;

export interface SkylineOptions {
  bins: number; // compass directions
  minDist: number; // ignore terrain closer than this, metres
  maxDist: number; // never look further than this, metres
  steps: number; // samples along each direction (spaced further apart with distance)
  eye: number; // camera height above the ground, metres
}

export const SKYLINE: SkylineOptions = { bins: 120, minDist: 60, maxDist: 30000, steps: 64, eye: 1.7 };

/** Skyline elevation angles in degrees, bin i = compass direction i * 360 / bins. NaN = nothing seen. */
export function skyline(elev: ElevationFn, e: number, n: number, range: number, o: SkylineOptions = SKYLINE): Float32Array {
  const out = new Float32Array(o.bins).fill(NaN);
  const dmax = Math.min(range, o.maxDist);
  if (dmax <= o.minDist * 1.5) return out;
  const z0 = elev(e, n) + o.eye;
  if (Number.isNaN(z0)) return out;
  const ratio = Math.pow(dmax / o.minDist, 1 / (o.steps - 1));
  for (let b = 0; b < o.bins; b++) {
    const az = (b / o.bins) * 2 * Math.PI;
    const s = Math.sin(az);
    const c = Math.cos(az);
    let best = -Infinity;
    let d = o.minDist;
    for (let k = 0; k < o.steps; k++) {
      const z = elev(e + s * d, n + c * d);
      if (!Number.isNaN(z)) {
        const slope = (z - (d * d) / (2 * MARS_RADIUS) - z0) / d;
        if (slope > best) best = slope;
      }
      d *= ratio;
    }
    if (best > -Infinity) out[b] = Math.atan(best) / DEG;
  }
  return out;
}

/** RMS difference (degrees) between an observed skyline shifted by `shift` bins and a candidate. */
function rms(obs: Float32Array, cand: Float32Array, shift: number): { rms: number; used: number } {
  const B = obs.length;
  let sum = 0;
  let used = 0;
  for (let i = 0; i < B; i++) {
    const o = obs[(((i + shift) % B) + B) % B];
    const c = cand[i];
    if (Number.isNaN(o) || Number.isNaN(c)) continue;
    sum += (o - c) * (o - c);
    used++;
  }
  return { rms: used ? Math.sqrt(sum / used) : Infinity, used };
}

export interface HorizonFix {
  ok: boolean;
  reason?: string;
  e: number;
  n: number;
  /** 1-sigma position uncertainty of the fix, metres */
  sigma: number;
  /** add this to the believed heading to get the true heading, radians */
  headingCorrection: number;
  rmsDeg: number;
  observed: Float32Array;
  matched: Float32Array;
}

export interface MatchOptions {
  /** search this far around the guess, metres */
  radius: number;
  /** how well skylines are expected to agree at the right spot, degrees */
  angleSigma: number;
  /** search heading errors up to this many bins either way */
  maxShift: number;
}

/**
 * observed: skyline as the camera reports it, with bin 0 at the heading Wayfinder BELIEVES is north.
 * Returns the best-fitting position near (guessE, guessN) and how sure the match is.
 */
export function matchHorizon(
  elev: ElevationFn,
  observed: Float32Array,
  guessE: number,
  guessN: number,
  range: number,
  m: MatchOptions,
  o: SkylineOptions = SKYLINE,
): HorizonFix {
  const fail = (reason: string): HorizonFix => ({
    ok: false,
    reason,
    e: guessE,
    n: guessN,
    sigma: Infinity,
    headingCorrection: 0,
    rmsDeg: Infinity,
    observed,
    matched: new Float32Array(o.bins).fill(NaN),
  });
  let seen = 0;
  for (const v of observed) if (!Number.isNaN(v)) seen++;
  if (seen < o.bins * 0.5) return fail("no horizon visible");

  type Cand = { e: number; n: number; rms: number; shift: number; sky: Float32Array };
  const evaluate = (e: number, n: number): Cand => {
    const sky = skyline(elev, e, n, range, o);
    let best = { rms: Infinity, shift: 0 };
    for (let s = -m.maxShift; s <= m.maxShift; s++) {
      const r = rms(observed, sky, s);
      if (r.used >= o.bins * 0.5 && r.rms < best.rms) best = { rms: r.rms, shift: s };
    }
    return { e, n, rms: best.rms, shift: best.shift, sky };
  };
  const grid = (ce: number, cn: number, half: number, k: number): Cand[] => {
    const out: Cand[] = [];
    const step = (2 * half) / (k - 1);
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) out.push(evaluate(ce - half + i * step, cn - half + j * step));
    return out;
  };
  const weigh = (cs: Cand[]) => {
    const best = cs.reduce((a, b) => (b.rms < a.rms ? b : a));
    let W = 0;
    let me = 0;
    let mn = 0;
    // likelihood of each candidate: every compass direction is a measurement, but neighbouring
    // directions see the same hills, so count them as about NEFF independent ones
    const NEFF = 12;
    const w = cs.map((c) => Math.exp((-NEFF * (c.rms * c.rms - best.rms * best.rms)) / (2 * m.angleSigma * m.angleSigma)));
    cs.forEach((c, i) => {
      W += w[i];
      me += w[i] * c.e;
      mn += w[i] * c.n;
    });
    me /= W;
    mn /= W;
    let v = 0;
    cs.forEach((c, i) => (v += w[i] * ((c.e - me) ** 2 + (c.n - mn) ** 2)));
    return { best, spread: Math.sqrt(v / W / 2) };
  };

  // coarse to fine search
  const k = 13;
  const coarse = grid(guessE, guessN, m.radius, k);
  const c1 = weigh(coarse);
  const s1 = (2 * m.radius) / (k - 1);
  const mid = grid(c1.best.e, c1.best.n, s1, 9);
  const c2 = weigh(mid);
  const s2 = (2 * s1) / 8;
  const fine = grid(c2.best.e, c2.best.n, s2, 5);
  const c3 = weigh(fine);
  const best = c3.best;
  if (!(best.rms < m.angleSigma * 3)) return fail("skyline does not match the map here");
  // honest uncertainty: grid resolution, plus how many other places fit almost as well
  const sigma = Math.max(3, Math.hypot(c3.spread, s2 / Math.sqrt(12)), c1.spread > s1 ? c1.spread : 0);
  return {
    ok: true,
    e: best.e,
    n: best.n,
    sigma,
    headingCorrection: -best.shift * ((2 * Math.PI) / o.bins),
    rmsDeg: best.rms,
    observed,
    matched: best.sky,
  };
}

/** Rotate a skyline by an angle (radians, positive = features appear further clockwise). */
export function rotateSkyline(sky: Float32Array, angle: number): Float32Array {
  const B = sky.length;
  const out = new Float32Array(B);
  const shift = (angle / (2 * Math.PI)) * B;
  for (let i = 0; i < B; i++) {
    // linear interpolation between the two neighbouring bins
    const x = i - shift;
    const i0 = Math.floor(x);
    const t = x - i0;
    const a = sky[((i0 % B) + B) % B];
    const b = sky[(((i0 + 1) % B) + B) % B];
    out[i] = Number.isNaN(a) ? b : Number.isNaN(b) ? a : a * (1 - t) + b * t;
  }
  return out;
}
