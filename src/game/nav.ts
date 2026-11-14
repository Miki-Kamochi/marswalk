/**
 * Glue between the true world and Wayfinder. This is the ONLY place that reads the
 * astronaut's true position, and it only uses it to simulate what the suit's sensors would
 * measure. Wayfinder then works from those measurements alone.
 */
import type { Raster } from "../data/loader";
import { guide, type Cue, type Guidance } from "../nav/guidance";
import { matchHorizon, rotateSkyline, skyline, type HorizonFix } from "../nav/horizon";
import { DEG, Rng } from "../nav/rng";
import { SensorSim } from "../nav/sensors";
import { visualRange } from "../nav/visibility";
import { Wayfinder } from "../nav/wayfinder";
import type { Controls } from "./controls";
import type { Player } from "./player";
import type { World } from "../world/world";

/** seconds of mission time between automatic sun sightings */
const SUN_PERIOD = 6;
/** below this visual range there is no skyline to match, metres */
export const MIN_HORIZON_RANGE = 400;

export interface NavTarget {
  e: number;
  n: number;
  name: string;
}

export interface NavStatus {
  sunOk: boolean;
  guidance: Guidance | null;
  /** distance still to walk to the rover along the recorded trail, metres */
  homeDistance: number;
  /** dark sand ahead on the current course (metres), or 0 */
  sandAhead: number;
  visualRange: number;
}

export interface SnapshotResult {
  fix: HorizonFix;
  /** how far the estimate moved because of the fix, metres */
  jump: number;
  r95Before: number;
  r95After: number;
  range: number;
}

export class Nav {
  readonly wf: Wayfinder;
  readonly sensors: SensorSim;
  status: NavStatus = { sunOk: false, guidance: null, homeDistance: 0, sandAhead: 0, visualRange: 1e5 };
  /** "site" = walk to a known map position; "home" = follow the recorded trail back */
  mode: "site" | "home" = "site";
  site: NavTarget | null = null;
  /** mission time of the last successful horizon fix, or null */
  lastHorizonFix: number | null = 0;
  fixesOk = 0;
  fixesFailed = 0;
  private nextSun = 0;
  private rng: Rng;
  private elev: (e: number, n: number) => number;

  constructor(
    private world: World,
    private sand: Raster,
    player: Player,
    yaw: number,
    readonly home: NavTarget,
    seed: number,
  ) {
    this.sensors = new SensorSim(seed, yaw);
    this.wf = new Wayfinder(player.e, player.n, this.sensors.gyroHeading, { seed: seed + 100 });
    this.rng = new Rng(seed + 200);
    this.elev = (e, n) => world.dataElevation(e, n);
  }

  isSand(e: number, n: number): boolean {
    const i = this.sand.index(e, n);
    return i >= 0 && this.sand.rgba[i] > 127;
  }

  /**
   * The suit photographs the skyline all around and matches it with skylines computed from
   * the orbital elevation map near where Wayfinder thinks you are.
   */
  snapshot(player: Player, yaw: number, t: number): SnapshotResult {
    const range = visualRange(this.world.fog.density);
    const before = this.wf.estimate;
    // what the camera sees: the real skyline from the TRUE position, cut off by the dust,
    // a little measurement noise, and turned by however wrong Wayfinder's heading is
    const truth = skyline(this.elev, player.e, player.n, range);
    for (let i = 0; i < truth.length; i++) if (!Number.isNaN(truth[i])) truth[i] += this.rng.gauss(0.05);
    const observed = rotateSkyline(truth, before.heading - yaw);
    const fix = matchHorizon(this.elev, observed, before.e, before.n, range, {
      radius: Math.min(220, Math.max(60, before.r95 * 2.2)),
      angleSigma: 0.1,
      maxShift: 3,
    });
    if (fix.ok) {
      this.wf.headingFix(before.heading + fix.headingCorrection, 2 * DEG);
      this.wf.positionFix(fix.e, fix.n, fix.sigma, t);
      this.lastHorizonFix = t;
      this.fixesOk++;
    } else this.fixesFailed++;
    const after = this.wf.estimate;
    return { fix, jump: Math.hypot(after.e - before.e, after.n - before.n), r95Before: before.r95, r95After: after.r95, range };
  }

  /**
   * dt: mission seconds since last call; t: mission elapsed seconds; utcMs: mission clock;
   * dust: 0 clear .. 1 storm.
   */
  update(dt: number, t: number, utcMs: number, dust: number, player: Player, c: Controls) {
    const { wf, sensors, world } = this;
    const yaw = c.yaw; // where the body (and helmet camera) really faces
    const m = sensors.motion(player.lastStep, yaw, dt);
    wf.predict(m.dist, m.gyroHeading, player.lastStep > 0 ? Math.atan2(c.moveX, c.moveY) : 0, dt);
    const st = this.status;
    st.visualRange = visualRange(world.fog.density);

    // sun compass: automatic whenever the sun disc can be seen
    if (t >= this.nextSun) {
      this.nextSun = t + SUN_PERIOD;
      const sigma = sensors.sunSigma(world.sun.elevation, dust);
      st.sunOk = sigma !== null;
      if (sigma !== null) wf.sunSighting(sensors.sunBearing(yaw, world.sun.azimuth, sigma), sigma, utcMs, t);
    }

    // ---- guidance, from the ESTIMATE only
    const est = wf.estimate;
    const homeward = wf.homeward(35);
    st.homeDistance = homeward.remaining;
    let target: NavTarget | null;
    if (this.mode === "home") {
      const dHome = Math.hypot(this.home.e - est.e, this.home.n - est.n);
      target = dHome < 45 || homeward.remaining < 45 ? this.home : { e: homeward.e, n: homeward.n, name: "your trail" };
    } else target = this.site;
    if (target) {
      const cues: Cue[] = st.sunOk ? [{ name: "Sun", bearing: world.sun.azimuth * DEG }] : [];
      const g = guide(est, target, cues);
      if (this.mode === "home") g.distance = homeward.remaining;
      st.guidance = g;
    } else st.guidance = null;

    // ---- hazard watch: dark sand ahead of where Wayfinder thinks you are heading
    st.sandAhead = 0;
    for (const d of [15, 30, 45, 60]) {
      if (this.isSand(est.e + Math.sin(est.heading) * d, est.n + Math.cos(est.heading) * d)) {
        st.sandAhead = d;
        break;
      }
    }
  }
}
