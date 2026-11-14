/** Faceted (flat-shaded, one colour per triangle) terrain meshes built from height grids. */
import * as THREE from "three";
import { Frame, curvatureDrop } from "../data/frame";
import type { HeightGrid, Raster } from "../data/loader";

export type ColorFn = (e: number, n: number, elev: number, out: THREE.Color) => void;

export interface TerrainOptions {
  /** use every `step`-th sample of the grid */
  step: number;
  color: ColorFn;
  /** leave out cells for which this returns true (cell centre, half cell size) */
  skip?: (e: number, n: number, half: number) => boolean;
  /** raise (+) or lower (-) the whole mesh, metres */
  lift?: number;
  /** drop distant ground by the curvature of Mars */
  curvature?: boolean;
  /** cells per chunk side (chunks let the renderer skip what is off-screen) */
  chunkCells?: number;
}

export const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

export function buildTerrain(grid: HeightGrid, frame: Frame, o: TerrainOptions): THREE.Group {
  const m = grid.meta;
  const step = o.step;
  const cols = Math.floor((m.width - 1) / step);
  const rows = Math.floor((m.height - 1) / step);
  const chunk = o.chunkCells ?? Math.max(cols, rows);
  const lift = o.lift ?? 0;
  const group = new THREE.Group();
  const c = new THREE.Color();
  const px = [0, 0, 0, 0];
  const py = [0, 0, 0, 0];
  const pz = [0, 0, 0, 0];
  const ev = [0, 0, 0, 0];
  const cc = [0, 0, 0, 0];
  const cr = [0, 0, 0, 0];
  const TRIS = [
    [0, 2, 1], // NW, SW, NE
    [1, 2, 3], // NE, SW, SE
  ];

  for (let R = 0; R < rows; R += chunk) {
    for (let Q = 0; Q < cols; Q += chunk) {
      const r1 = Math.min(R + chunk, rows);
      const q1 = Math.min(Q + chunk, cols);
      const pos = new Float32Array((r1 - R) * (q1 - Q) * 18);
      const col = new Float32Array(pos.length);
      let k = 0;
      for (let r = R; r < r1; r++) {
        for (let q = Q; q < q1; q++) {
          cc[0] = cc[2] = q * step;
          cc[1] = cc[3] = q * step + step;
          cr[0] = cr[1] = r * step;
          cr[2] = cr[3] = r * step + step;
          let ok = true;
          for (let i = 0; i < 4; i++) {
            ev[i] = grid.at(cc[i], cr[i]);
            if (Number.isNaN(ev[i])) ok = false;
          }
          if (!ok) continue;
          const half = (step * m.cell) / 2;
          if (o.skip?.(m.west + cc[0] * m.cell + half, m.north - cr[0] * m.cell - half, half)) continue;
          for (let i = 0; i < 4; i++) {
            px[i] = frame.toWorldX(m.west + cc[i] * m.cell);
            pz[i] = frame.toWorldZ(m.north - cr[i] * m.cell);
            py[i] = frame.toWorldY(ev[i]) + lift - (o.curvature ? curvatureDrop(Math.hypot(px[i], pz[i])) : 0);
          }
          for (const t of TRIS) {
            const ce = m.west + ((cc[t[0]] + cc[t[1]] + cc[t[2]]) / 3) * m.cell;
            const cn = m.north - ((cr[t[0]] + cr[t[1]] + cr[t[2]]) / 3) * m.cell;
            o.color(ce, cn, (ev[t[0]] + ev[t[1]] + ev[t[2]]) / 3, c);
            for (const i of t) {
              pos[k] = px[i];
              pos[k + 1] = py[i];
              pos[k + 2] = pz[i];
              col[k] = c.r;
              col[k + 1] = c.g;
              col[k + 2] = c.b;
              k += 3;
            }
          }
        }
      }
      if (k === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, k), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col.subarray(0, k), 3));
      geo.computeVertexNormals(); // non-indexed: one normal per face, which gives the faceted look
      group.add(new THREE.Mesh(geo, terrainMaterial));
    }
  }
  return group;
}

/**
 * Height of the faceted surface exactly as drawn (same triangles as buildTerrain), so the
 * player stands on what they see. NaN outside the grid.
 */
export function facetHeight(grid: HeightGrid, step: number, easting: number, northing: number): number {
  const m = grid.meta;
  const size = m.cell * step;
  const fx = (easting - m.west) / size;
  const fy = (m.north - northing) / size;
  const cols = Math.floor((m.width - 1) / step);
  const rows = Math.floor((m.height - 1) / step);
  if (fx < 0 || fy < 0 || fx >= cols || fy >= rows) return NaN;
  const q = Math.floor(fx);
  const r = Math.floor(fy);
  const tx = fx - q;
  const ty = fy - r;
  const nw = grid.at(q * step, r * step);
  const ne = grid.at(q * step + step, r * step);
  const sw = grid.at(q * step, r * step + step);
  const se = grid.at(q * step + step, r * step + step);
  return tx + ty <= 1 ? nw + (ne - nw) * tx + (sw - nw) * ty : se + (sw - se) * (1 - tx) + (ne - se) * (1 - ty);
}

export function rasterColor(raster: Raster, fallback: ColorFn): ColorFn {
  return (e, n, elev, out) => {
    const i = raster.index(e, n);
    if (i < 0) return fallback(e, n, elev, out);
    out.setRGB(raster.rgba[i] / 255, raster.rgba[i + 1] / 255, raster.rgba[i + 2] / 255, THREE.SRGBColorSpace);
  };
}

/** Plain Mars tone for the far backdrop, slightly lighter with height. */
export const elevationTint: ColorFn = (_e, _n, elev, out) => {
  const t = THREE.MathUtils.clamp((elev + 4600) / 6000, 0, 1);
  out.setRGB(0.36 + 0.2 * t, 0.23 + 0.14 * t, 0.15 + 0.1 * t);
};
