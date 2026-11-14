/**
 * The planner's map: one value per 6 m cell for every terrain measure, plus the two layers
 * the routes are built from (safety and localizability). Row 0 is the northern edge.
 */
import type { PlanConfig } from "./config.ts";

export interface GridDim {
  width: number;
  height: number;
  /** cell size, metres */
  cell: number;
  /** map position of the centre of cell [row 0][col 0] */
  west: number;
  north: number;
}

export interface NavMeta extends GridDim {
  file: string;
  channels: { name: string; encoding: string; description: string }[];
}

export interface NavLayers {
  /** slope of the plane fitted to the cell, degrees */
  tilt: Float32Array;
  /** RMS roughness, metres */
  rough: Float32Array;
  /** largest step, metres */
  step: Float32Array;
  /** share of the cell covered by sand, 0..1 */
  sand: Float32Array;
  /** predicted success of a photo fix, 0..1 */
  loc: Float32Array;
  /** relative hematite band depth 0..1, NaN where CRISM did not look */
  hematite: Float32Array;
  /** ground elevation, metres */
  elev: Float32Array;
}

const ramp = (v: number, safe: number, max: number) => (v <= safe ? 1 : v >= max ? 0 : (max - v) / (max - safe));

/** Which of the safety measures is the worst at a cell: the reason shown to the user. */
export type Limiter = "tilt" | "rough" | "step" | "sand";

export class NavGrid {
  readonly width: number;
  readonly height: number;
  readonly cell: number;
  readonly west: number;
  readonly north: number;
  readonly size: number;
  readonly layers: NavLayers;
  /** safety score: 1 = safe, 0 = no-go (the worst of tilt, roughness, step and sand) */
  readonly good: Float32Array;
  readonly blocked: Uint8Array;
  /** 1 where a photo fix is expected to work */
  readonly fixable: Uint8Array;

  constructor(dim: GridDim, layers: NavLayers, cfg: PlanConfig) {
    this.width = dim.width;
    this.height = dim.height;
    this.cell = dim.cell;
    this.west = dim.west;
    this.north = dim.north;
    this.size = dim.width * dim.height;
    this.layers = layers;
    this.good = new Float32Array(this.size);
    this.blocked = new Uint8Array(this.size);
    this.fixable = new Uint8Array(this.size);
    this.classify(cfg);
  }

  /** Recompute the two layers from the measures (after a threshold changes). */
  classify(c: PlanConfig): void {
    const L = this.layers;
    for (let i = 0; i < this.size; i++) {
      const g = Math.min(...this.scores(i, c));
      this.good[i] = g;
      this.blocked[i] = g <= 0 ? 1 : 0;
      this.fixable[i] = L.loc[i] >= c.locFix ? 1 : 0;
    }
  }

  /** The four safety scores of a cell, each 1 = fine .. 0 = no-go: tilt, roughness, step, sand. */
  scores(i: number, c: PlanConfig): [number, number, number, number] {
    const L = this.layers;
    const s = L.sand[i];
    return [
      ramp(L.tilt[i], c.tiltSafe + (c.sandTiltSafe - c.tiltSafe) * s, c.tiltMax + (c.sandTiltMax - c.tiltMax) * s),
      ramp(L.rough[i], c.roughSafe, c.roughMax),
      ramp(L.step[i], c.stepSafe, c.stepMax),
      1 - c.sandPenalty * s,
    ];
  }

  limiter(i: number, c: PlanConfig): Limiter {
    const s = this.scores(i, c);
    const names: Limiter[] = ["tilt", "rough", "step", "sand"];
    let k = 0;
    for (let j = 1; j < 4; j++) if (s[j] < s[k]) k = j;
    return names[k];
  }

  /** Cell index at a map position, or -1 outside the grid. */
  index(easting: number, northing: number): number {
    const c = Math.round((easting - this.west) / this.cell);
    const r = Math.round((this.north - northing) / this.cell);
    if (c < 0 || r < 0 || c >= this.width || r >= this.height) return -1;
    return r * this.width + c;
  }

  east(i: number): number {
    return this.west + (i % this.width) * this.cell;
  }

  northOf(i: number): number {
    return this.north - Math.floor(i / this.width) * this.cell;
  }

  /** Nearest walkable cell within `reach` cells of i, or -1. */
  nearestOpen(i: number, reach = 6): number {
    if (i < 0) return -1;
    if (!this.blocked[i]) return i;
    const c0 = i % this.width;
    const r0 = Math.floor(i / this.width);
    let best = -1;
    let bestD = Infinity;
    for (let dr = -reach; dr <= reach; dr++) {
      for (let dc = -reach; dc <= reach; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || c < 0 || r >= this.height || c >= this.width) continue;
        const j = r * this.width + c;
        const d = dr * dr + dc * dc;
        if (!this.blocked[j] && d < bestD) {
          bestD = d;
          best = j;
        }
      }
    }
    return best;
  }
}

/** Decode public/data/nav/nav_6m.bin (see scripts/nav_layers.py for the encodings). */
export function decodeNav(meta: NavMeta, bytes: Uint8Array): Omit<NavLayers, "elev"> {
  const n = meta.width * meta.height;
  if (bytes.length !== n * meta.channels.length) {
    throw new Error(`${meta.file}: expected ${n * meta.channels.length} bytes, got ${bytes.length}`);
  }
  const channel = (name: string, scale: number): Float32Array => {
    const k = meta.channels.findIndex((c) => c.name === name);
    if (k < 0) throw new Error(`${meta.file}: no channel "${name}"`);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = bytes[k * n + i] / scale;
    return out;
  };
  const hematite = channel("hematite", 1);
  for (let i = 0; i < n; i++) hematite[i] = hematite[i] === 0 ? NaN : (hematite[i] - 1) / 254;
  return {
    tilt: channel("tilt", 4),
    rough: channel("rough", 250),
    step: channel("step", 100),
    sand: channel("sand", 255),
    loc: channel("loc", 255),
    hematite,
  };
}

export interface HeightSource {
  width: number;
  height: number;
  cell: number;
  west: number;
  north: number;
  zMin: number;
  zScale: number;
}

/** Mean elevation of each planner cell from the finer play-area elevation grid. */
export function cellElevations(src: HeightSource, data: Uint16Array, dim: GridDim): Float32Array {
  const out = new Float32Array(dim.width * dim.height);
  const k = Math.round(dim.cell / src.cell);
  const half = (k - 1) / 2;
  for (let r = 0; r < dim.height; r++) {
    for (let c = 0; c < dim.width; c++) {
      const cc = Math.round((dim.west + c * dim.cell - src.west) / src.cell - half);
      const cr = Math.round((src.north - (dim.north - r * dim.cell)) / src.cell - half);
      let sum = 0;
      let cnt = 0;
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const x = cc + i;
          const y = cr + j;
          if (x < 0 || y < 0 || x >= src.width || y >= src.height) continue;
          const v = data[y * src.width + x];
          if (v === 0) continue;
          sum += src.zMin + (v - 1) * src.zScale;
          cnt++;
        }
      }
      out[r * dim.width + c] = cnt ? sum / cnt : NaN;
    }
  }
  return out;
}
