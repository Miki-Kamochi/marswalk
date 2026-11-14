/**
 * Wayfinder: a GPS-free navigator.
 *
 * It never sees the astronaut's true position. It only receives sensor readings
 * (step lengths, gyro heading, sun direction, bearings to recognised landmarks) and keeps a
 * cloud of several hundred guesses ("particles") of where the astronaut could be.
 *
 *  - Dead reckoning moves every guess by the measured step along the measured heading, each
 *    with slightly different assumed sensor errors, so the cloud spreads as you walk.
 *  - A sun sighting keeps only the guesses whose heading agrees with the sun (true heading).
 *  - A landmark bearing keeps only the guesses that see that landmark in that direction.
 *    Two or more landmarks pin the position down.
 *  - The spread of the cloud IS the uncertainty shown to the astronaut.
 *
 * This is a standard particle filter. Pure maths, no rendering, unit-tested.
 */
import { DEG, Rng, bearing, wrap } from "./rng.ts";
import { sunPosition } from "./sun.ts";

const MARS_RADIUS = 3396190;

export interface Landmark {
  id: string;
  name: string;
  e: number;
  n: number;
  /** elevation of the point that is recognised (summit), metres */
  elev: number;
  /** extra bearing uncertainty for broad, far-away shapes (radians) */
  fuzz?: number;
}

export interface Estimate {
  e: number;
  n: number;
  /** heading, radians clockwise from north */
  heading: number;
  /** radius (m) that should contain the true position 95% of the time */
  r95: number;
  /** 1-sigma heading uncertainty, radians */
  headingSigma: number;
}

export interface Fix {
  /** mission time of the sighting, seconds */
  t: number;
  kind: "sun" | "landmark";
  id?: string;
}

export interface WayfinderConfig {
  particles: number;
  strideSigma: number; // assumed spread of the unknown stride scale
  strideTau: number; // assumed time over which the stride error wanders, s
  strideNoise: number; // assumed step-to-step scatter
  headingWalk: number; // assumed growth of heading error, rad per sqrt(second)
  seed: number;
}

export const DEFAULT_WAYFINDER: WayfinderConfig = {
  particles: 400,
  strideSigma: 0.04,
  strideTau: 240,
  strideNoise: 0.06,
  headingWalk: 0.12 * DEG,
  seed: 7,
};

export class Wayfinder {
  private N: number;
  private pe: Float64Array;
  private pn: Float64Array;
  /** per-particle guess of (gyro heading - true heading) */
  private ph: Float64Array;
  /** per-particle guess of the stride scale error */
  private ps: Float64Array;
  private w: Float64Array;
  private rng: Rng;
  private cfg: WayfinderConfig;
  private gyroHeading: number;
  private est: Estimate;

  /** recorded outbound path (estimated positions), the safest way home */
  readonly breadcrumbs: [number, number][] = [];
  /** every estimate over time, for the end-of-mission reveal */
  readonly history: [number, number][] = [];
  recording = true;
  lastFix: Fix | null = null;
  /** landmark ids used in the most recent landmark update */
  sighted: string[] = [];
  /** metres walked (as measured) since the last position fix from two or more landmarks */
  sinceFix = 0;

  constructor(startE: number, startN: number, gyroHeading: number, cfg: Partial<WayfinderConfig> = {}) {
    this.cfg = { ...DEFAULT_WAYFINDER, ...cfg };
    const N = (this.N = this.cfg.particles);
    this.rng = new Rng(this.cfg.seed);
    this.pe = new Float64Array(N);
    this.pn = new Float64Array(N);
    this.ph = new Float64Array(N);
    this.ps = new Float64Array(N);
    this.w = new Float64Array(N).fill(1 / N);
    this.gyroHeading = gyroHeading;
    for (let i = 0; i < N; i++) {
      // starts at a known spot (the rover) with a well-aligned heading
      this.pe[i] = startE + this.rng.gauss(1.0);
      this.pn[i] = startN + this.rng.gauss(1.0);
      this.ph[i] = this.rng.gauss(1.5 * DEG);
      this.ps[i] = this.rng.gauss(this.cfg.strideSigma);
    }
    this.est = { e: startE, n: startN, heading: gyroHeading, r95: 2.5, headingSigma: 1.5 * DEG };
    this.breadcrumbs.push([startE, startN]);
    this.history.push([startE, startN]);
  }

  /**
   * Dead reckoning. dist: pedometer distance since the last call; gyroHeading: integrated gyro
   * heading; relDir: direction of the step relative to where the body faces (0 = forward);
   * dt: mission seconds since the last call.
   */
  predict(dist: number, gyroHeading: number, relDir: number, dt: number) {
    this.gyroHeading = gyroHeading;
    const { rng, cfg } = this;
    const hw = cfg.headingWalk * Math.sqrt(dt);
    const sw = cfg.strideSigma * Math.sqrt((2 * dt) / cfg.strideTau);
    const decay = dt / cfg.strideTau;
    for (let i = 0; i < this.N; i++) {
      this.ph[i] += rng.gauss(hw);
      // the stride error wanders: whatever was learned about it slowly goes stale
      this.ps[i] += -this.ps[i] * decay + rng.gauss(sw);
      if (dist > 0) {
        const d = dist * (1 + this.ps[i] + rng.gauss(cfg.strideNoise));
        const h = gyroHeading - this.ph[i] + relDir;
        this.pe[i] += d * Math.sin(h);
        this.pn[i] += d * Math.cos(h);
      }
    }
    this.sinceFix += dist;
    this.refresh();
    if (dist > 0) {
      const last = this.history[this.history.length - 1];
      if (Math.hypot(this.est.e - last[0], this.est.n - last[1]) >= 4) this.history.push([this.est.e, this.est.n]);
      if (this.recording) {
        const b = this.breadcrumbs[this.breadcrumbs.length - 1];
        if (Math.hypot(this.est.e - b[0], this.est.n - b[1]) >= 6) this.breadcrumbs.push([this.est.e, this.est.n]);
      }
    }
  }

  /**
   * Sun compass. relBearing: measured direction of the sun relative to the body (radians).
   * The sun's true azimuth is computed from the mission clock and the estimated position.
   */
  sunSighting(relBearing: number, sigma: number, utcMs: number, t: number) {
    const sun = sunPosition(utcMs, (this.est.n / MARS_RADIUS) / DEG, (this.est.e / MARS_RADIUS) / DEG);
    const heading = sun.azimuth * DEG - relBearing;
    const inv = 1 / (2 * sigma * sigma);
    for (let i = 0; i < this.N; i++) {
      const d = wrap(heading - (this.gyroHeading - this.ph[i]));
      this.w[i] *= Math.exp(-d * d * inv) + 1e-12;
    }
    this.lastFix = { t, kind: "sun" };
    this.resample();
  }

  /** Bearings to recognised landmarks, each relative to the body (radians). */
  landmarkSightings(sightings: { lm: Landmark; relBearing: number }[], sigma: number, t: number) {
    this.sighted = sightings.map((s) => s.lm.id);
    if (!sightings.length) return;
    for (const { lm, relBearing } of sightings) {
      const s = Math.hypot(sigma, lm.fuzz ?? 0);
      const inv = 1 / (2 * s * s);
      for (let i = 0; i < this.N; i++) {
        const predicted = bearing(this.pe[i], this.pn[i], lm.e, lm.n) - (this.gyroHeading - this.ph[i]);
        const d = wrap(relBearing - predicted);
        this.w[i] *= Math.exp(-d * d * inv) + 1e-12;
      }
      this.lastFix = { t, kind: "landmark", id: lm.id };
    }
    if (sightings.filter((s) => !s.lm.fuzz).length >= 2) this.sinceFix = 0;
    this.resample();
  }

  private resample() {
    const { N, w, rng } = this;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += w[i];
    if (!(sum > 1e-300)) {
      // readings contradict every guess: do not trust them blindly, start over with equal weights
      w.fill(1 / N);
      this.refresh();
      return;
    }
    let sq = 0;
    for (let i = 0; i < N; i++) {
      w[i] /= sum;
      sq += w[i] * w[i];
    }
    if (1 / sq < N * 0.6) {
      // systematic resampling: keep likely guesses, drop unlikely ones
      const e = new Float64Array(N);
      const n = new Float64Array(N);
      const h = new Float64Array(N);
      const s = new Float64Array(N);
      let c = w[0];
      let j = 0;
      const u0 = rng.next() / N;
      for (let i = 0; i < N; i++) {
        const u = u0 + i / N;
        while (u > c && j < N - 1) c += w[++j];
        // a little jitter keeps the cloud from collapsing onto a few identical guesses
        e[i] = this.pe[j] + rng.gauss(0.35);
        n[i] = this.pn[j] + rng.gauss(0.35);
        h[i] = this.ph[j] + rng.gauss(0.15 * DEG);
        s[i] = this.ps[j] + rng.gauss(0.002);
      }
      this.pe = e;
      this.pn = n;
      this.ph = h;
      this.ps = s;
      w.fill(1 / N);
    }
    this.refresh();
  }

  private refresh() {
    const { N, w } = this;
    let e = 0;
    let n = 0;
    let sh = 0;
    let ch = 0;
    for (let i = 0; i < N; i++) {
      e += w[i] * this.pe[i];
      n += w[i] * this.pn[i];
      const h = this.gyroHeading - this.ph[i];
      sh += w[i] * Math.sin(h);
      ch += w[i] * Math.cos(h);
    }
    let sum = 0;
    for (let i = 0; i < N; i++) sum += w[i];
    e /= sum;
    n /= sum;
    const heading = Math.atan2(sh, ch);
    let ve = 0;
    let vn = 0;
    let vh = 0;
    for (let i = 0; i < N; i++) {
      const wi = w[i] / sum;
      ve += wi * (this.pe[i] - e) ** 2;
      vn += wi * (this.pn[i] - n) ** 2;
      vh += wi * wrap(this.gyroHeading - this.ph[i] - heading) ** 2;
    }
    // 95% radius of a 2-D normal distribution: 2.45 x the per-axis standard deviation
    this.est = { e, n, heading, r95: 2.45 * Math.sqrt((ve + vn) / 2) + 1.0, headingSigma: Math.sqrt(vh) };
  }

  get estimate(): Estimate {
    return this.est;
  }

  /** A sample of the particle cloud, for drawing. */
  cloud(max = 80): [number, number][] {
    const out: [number, number][] = [];
    const step = Math.max(1, Math.floor(this.N / max));
    for (let i = 0; i < this.N; i += step) out.push([this.pe[i], this.pn[i]]);
    return out;
  }

  /** Length of the recorded trail from the given breadcrumb back to the start, metres. */
  trailLength(fromIndex = this.breadcrumbs.length - 1): number {
    let d = 0;
    for (let i = fromIndex; i > 0; i--) {
      d += Math.hypot(this.breadcrumbs[i][0] - this.breadcrumbs[i - 1][0], this.breadcrumbs[i][1] - this.breadcrumbs[i - 1][1]);
    }
    return d;
  }

  /**
   * Where to walk next to go home along the recorded trail: the breadcrumb `lookAhead` metres
   * back toward the start from the point of the trail nearest the estimated position.
   * Also returns the distance still to walk along the trail.
   */
  homeward(lookAhead = 35): { e: number; n: number; remaining: number; offTrail: number } {
    const b = this.breadcrumbs;
    const { e, n } = this.est;
    let dmin = Infinity;
    for (const p of b) dmin = Math.min(dmin, Math.hypot(p[0] - e, p[1] - n));
    // if the trail passes nearby more than once, join it at the point closest to home
    let i = 0;
    while (Math.hypot(b[i][0] - e, b[i][1] - n) > dmin + 8) i++;
    let j = i;
    let acc = 0;
    while (j > 0 && acc < lookAhead) {
      acc += Math.hypot(b[j][0] - b[j - 1][0], b[j][1] - b[j - 1][1]);
      j--;
    }
    return { e: b[j][0], n: b[j][1], remaining: this.trailLength(i) + dmin, offTrail: dmin };
  }
}
