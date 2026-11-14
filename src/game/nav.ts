/**
 * Glue between the true world and Wayfinder. This is the ONLY place that reads the
 * astronaut's true position, and it only uses it to simulate what the suit's sensors would
 * measure. Wayfinder then works from those measurements alone.
 */
import type { Raster } from "../data/loader";
import { guide, type Cue, type Guidance } from "../nav/guidance";
import { DEG, bearing } from "../nav/rng";
import { SensorSim } from "../nav/sensors";
import { lineOfSight, visualRange } from "../nav/visibility";
import { Wayfinder, type Landmark } from "../nav/wayfinder";
import type { Controls } from "./controls";
import { EYE_HEIGHT, type Player } from "./player";
import type { World } from "./world";

/** seconds of mission time between sightings */
const SIGHTING_PERIOD = 6;

export interface NavTarget {
  e: number;
  n: number;
  name: string;
}

export interface NavStatus {
  sunOk: boolean;
  sunSigmaDeg: number;
  /** landmarks in view right now */
  inView: Landmark[];
  guidance: Guidance | null;
  /** distance still to walk to the rover along the recorded trail, metres */
  homeDistance: number;
  /** dark sand ahead on the current course (metres), or 0 */
  sandAhead: number;
  visualRange: number;
}

export class Nav {
  readonly wf: Wayfinder;
  readonly sensors: SensorSim;
  readonly landmarks: Landmark[];
  status: NavStatus = {
    sunOk: false,
    sunSigmaDeg: 0,
    inView: [],
    guidance: null,
    homeDistance: 0,
    sandAhead: 0,
    visualRange: 1e5,
  };
  /** "site" = walk to a known map position; "home" = follow the recorded trail back */
  mode: "site" | "home" = "site";
  site: NavTarget | null = null;
  fixes = 0;
  private nextSun = 0;
  private nextLandmarks = 3;
  private lastSharp = 2;

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
    this.landmarks = world.positions.places
      .filter((p) => p.kind === "landmark" && /^(butte|knob|vrr)/.test(p.id))
      .map((p) => ({ id: p.id, name: p.name, e: p.easting, n: p.northing, elev: p.elevation }));
    const sharp = world.place("mount_sharp_skyline");
    // a broad mountain 21 km away: a good direction reference, a poor position reference
    this.landmarks.push({ id: sharp.id, name: "Mount Sharp", e: sharp.easting, n: sharp.northing, elev: sharp.elevation, fuzz: 4 * DEG });
    // the rover's beacon is recognisable when you are close enough to see it
    this.landmarks.push({ id: "rover", name: "Rover beacon", e: home.e, n: home.n, elev: world.dataElevation(home.e, home.n) + 4 });
  }

  isSand(e: number, n: number): boolean {
    const i = this.sand.index(e, n);
    return i >= 0 && this.sand.rgba[i] > 127;
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

    const range = visualRange(world.fog.density);
    const st = this.status;
    st.visualRange = range;

    if (t >= this.nextSun) {
      this.nextSun = t + SIGHTING_PERIOD;
      const sigma = sensors.sunSigma(world.sun.elevation, dust);
      st.sunOk = sigma !== null;
      st.sunSigmaDeg = sigma === null ? 0 : sigma / DEG;
      if (sigma !== null) wf.sunSighting(sensors.sunBearing(yaw, world.sun.azimuth, sigma), sigma, utcMs, t);
    }

    if (t >= this.nextLandmarks) {
      this.nextLandmarks = t + SIGHTING_PERIOD;
      const seen: { lm: Landmark; relBearing: number }[] = [];
      for (const lm of this.landmarks) {
        const d = Math.hypot(lm.e - player.e, lm.n - player.n);
        if (d < 25 || d > range) continue;
        const targetHeight = lm.elev - world.dataElevation(lm.e, lm.n) + 1;
        if (!lineOfSight((e, n) => world.dataElevation(e, n), player.e, player.n, EYE_HEIGHT, lm.e, lm.n, targetHeight)) continue;
        seen.push({ lm, relBearing: sensors.landmarkBearing(yaw, bearing(player.e, player.n, lm.e, lm.n)) });
      }
      wf.landmarkSightings(seen, sensors.cfg.landmarkSigma, t);
      // a "fix" = two or more landmarks come into view after a spell with fewer
      const sharp = seen.filter((s) => !s.lm.fuzz).length;
      if (sharp >= 2 && this.lastSharp < 2) this.fixes++;
      this.lastSharp = sharp;
      st.inView = seen.map((s) => s.lm);
    }

    // ---- guidance, from the ESTIMATE only
    const est = wf.estimate;
    const homeward = wf.homeward(35);
    st.homeDistance = homeward.remaining;
    let target: NavTarget | null = null;
    if (this.mode === "home") {
      const dHome = Math.hypot(this.home.e - est.e, this.home.n - est.n);
      target = dHome < 45 || homeward.remaining < 45 ? this.home : { e: homeward.e, n: homeward.n, name: "your trail" };
    } else {
      target = this.site;
    }
    if (target) {
      const cues: Cue[] = [];
      if (st.sunOk) cues.push({ name: "Sun", bearing: world.sun.azimuth * DEG });
      const near = st.inView
        .filter((l) => l.id !== "rover")
        .sort((a, b) => Math.hypot(a.e - est.e, a.n - est.n) - Math.hypot(b.e - est.e, b.n - est.n));
      for (const l of near.slice(0, 2)) cues.push({ name: l.name, bearing: bearing(est.e, est.n, l.e, l.n) });
      const g = guide(est, target, cues);
      // report the distance that matters: along the trail when heading home
      if (this.mode === "home") g.distance = homeward.remaining;
      st.guidance = g;
    } else {
      st.guidance = null;
    }

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
