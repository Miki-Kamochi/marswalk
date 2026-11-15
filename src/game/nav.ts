import type { Raster } from '../data/loader';
import { matchTerrain, type Match, type Observation, type Surface } from '../nav/mgl';
import { PositionRegion } from '../nav/region';
import { Rng } from '../nav/rng';
import type { Player } from './player';
import type { World } from '../world/world';

/** Sensor simulation boundary; the matcher never receives the player's coordinates. */
export class Nav {
  readonly region: PositionRegion;
  readonly surface: Surface;
  lastMatch: Match | null = null;
  private lastScan: { e: number; n: number; match: Match } | null = null;
  constructor(
    world: World,
    private sand: Raster,
    orbital: Raster,
    player: Player,
    seed: number,
    private localizability: (e: number, n: number) => number = () => 1,
  ) {
    this.region = new PositionRegion(player, seed);
    this.surface = {
      intensity: (e, n) => { const i = orbital.index(e, n); return i < 0 ? NaN : orbital.rgba[i] / 255; },
      elevation: (e, n) => world.dataElevation(e, n),
    };
  }
  isSand(e: number, n: number) { const i = this.sand.index(e, n); return i >= 0 && this.sand.rgba[i] > 127; }
  update(player: Player) { this.region.move(player.lastStep, player.lastCourse); }
  /** Idealized stereo reconstruction with occlusion masks and noise, at 3–40 m. */
  observe(player: Player, dust: number): Observation {
    const samples: Observation['samples'] = [];
    const rng = new Rng(Math.floor(player.e / 8) * 31 + Math.floor(player.n / 8));
    const z0 = this.surface.elevation(player.e, player.n) + 1.7;
    let attempted = 0;
    for (let a = 0; a < 32; a++) for (const r of [5, 12, 22, 38]) {
      attempted++;
      const angle = a * Math.PI / 16;
      const de = Math.sin(angle) * r, dn = Math.cos(angle) * r;
      const e = player.e + de, n = player.n + dn;
      const z = this.surface.elevation(e, n);
      let visible = true;
      for (let d = 2; d < r - 1; d += 2)
        if (this.surface.elevation(player.e + de * d / r, player.n + dn * d / r) > z0 + (z - z0) * d / r + 0.15) visible = false;
      const intensity = this.surface.intensity(e, n);
      if (visible && Number.isFinite(z + intensity)) samples.push({ de, dn, height: z, intensity: intensity + rng.gauss(0.004 + dust * 0.008) });
    }
    const mean = samples.reduce((v, p) => v + p.intensity, 0) / Math.max(1, samples.length);
    const variance = samples.reduce((v, p) => v + (p.intensity - mean) ** 2, 0) / Math.max(1, samples.length);
    const mapSignal = Math.max(0, Math.min(1, this.localizability(player.e, player.n)));
    return { samples, coverage: samples.length / attempted, contrast: Math.min(1, Math.sqrt(variance) / 0.07),
      // The planner's localizability layer now drives how much useful terrain structure a scan yields.
      clarity: (1 - dust * 0.3) * (0.25 + 0.75 * mapSignal),
      orientation: Math.max(0.3, 1 - this.region.current.radius / 1300) };
  }
  scan(player: Player, dust: number, time: number) {
    const observation = this.observe(player, dust);
    let match = matchTerrain(observation, this.surface, this.region.current);
    const priorScan = this.lastScan;
    const repeated = !!priorScan && Math.hypot(player.e - priorScan.e, player.n - priorScan.n) < 8;
    if (repeated && priorScan)
      match = { ...priorScan.match, accepted: false };
    else this.lastScan = { e: player.e, n: player.n, match };
    this.lastMatch = match;
    const pin = this.region.record(player, match, time);
    return { match, pin, observation, repeated };
  }
}
