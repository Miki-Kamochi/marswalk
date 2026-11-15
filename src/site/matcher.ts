/**
 * The "easy to locate" idea, computed for real on the HiRISE image: cut the patch a suit camera
 * would see (32 m) and slide it over its surroundings (up to 24 m away). Where another spot
 * looks just as similar, a photo fix could land in the wrong place.
 * Same method as scripts/nav_layers.py, shown live for one cell.
 */
import type { NavGrid } from "../plan/grid";

export const PATCH = 32;
export const REACH = 24;
const SIZE = PATCH + 2 * REACH; // pixels (1 m each) around the cell

export interface Match {
  /** the 80 × 80 m image around the cell, grey 0..255 */
  gray: Float32Array;
  /** similarity for every shift, (2 REACH + 1)² values, -1..1 */
  ncc: Float32Array;
  /** the most similar spot at least 5 m away, and its shift */
  best: number;
  bestAt: [number, number];
}

/** Cell index → pixel of the 1 m orthoimage (the nav grid's cells are 6 × 6 pixels). */
export const cellPixel = (grid: NavGrid, i: number): [number, number] => [(i % grid.width) * 6 + 3, Math.floor(i / grid.width) * 6 + 3];

export function cropGray(img: CanvasImageSource, cx: number, cy: number): Float32Array {
  const cv = document.createElement("canvas");
  cv.width = cv.height = SIZE;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(img, cx - SIZE / 2, cy - SIZE / 2, SIZE, SIZE, 0, 0, SIZE, SIZE);
  const d = c.getImageData(0, 0, SIZE, SIZE).data;
  const g = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < g.length; i++) g[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  return g;
}

/** Normalised cross-correlation of the centre patch with the patch at every shift. */
export function match(gray: Float32Array): Match {
  const n = 2 * REACH + 1;
  const ncc = new Float32Array(n * n);
  const stats = (x0: number, y0: number) => {
    let s = 0;
    let s2 = 0;
    for (let y = 0; y < PATCH; y++)
      for (let x = 0; x < PATCH; x++) {
        const v = gray[(y0 + y) * SIZE + x0 + x];
        s += v;
        s2 += v * v;
      }
    const m = s / (PATCH * PATCH);
    return [m, Math.sqrt(Math.max(1e-6, s2 / (PATCH * PATCH) - m * m))];
  };
  const [ma, sa] = stats(REACH, REACH);
  let best = -1;
  let bestAt: [number, number] = [0, 0];
  for (let dy = -REACH; dy <= REACH; dy++)
    for (let dx = -REACH; dx <= REACH; dx++) {
      const [mb, sb] = stats(REACH + dx, REACH + dy);
      let cov = 0;
      for (let y = 0; y < PATCH; y++)
        for (let x = 0; x < PATCH; x++) {
          cov += (gray[(REACH + y) * SIZE + REACH + x] - ma) * (gray[(REACH + dy + y) * SIZE + REACH + dx + x] - mb);
        }
      const r = cov / (PATCH * PATCH * sa * sb);
      ncc[(dy + REACH) * n + dx + REACH] = r;
      if (Math.hypot(dx, dy) >= 5 && r > best) {
        best = r;
        bestAt = [dx, dy];
      }
    }
  return { gray, ncc, best, bestAt };
}

/** A dune cell (sand, hard to locate) and a rock cell (firm, easy to locate), picked from the data. */
export function pickCells(grid: NavGrid): { dune: number; rock: number } {
  const L = grid.layers;
  let dune = -1;
  let rock = -1;
  let dLoc = Infinity;
  let rLoc = -Infinity;
  const m = 12; // keep away from the edges so the 80 m crop fits
  for (let r = m; r < grid.height - m; r += 2)
    for (let c = m; c < grid.width - m; c += 2) {
      const i = r * grid.width + c;
      if (L.sand[i] > 0.9 && L.loc[i] < dLoc) {
        dLoc = L.loc[i];
        dune = i;
      }
      if (L.sand[i] < 0.02 && L.tilt[i] < 12 && !grid.blocked[i] && L.loc[i] > rLoc) {
        rLoc = L.loc[i];
        rock = i;
      }
    }
  return { dune, rock };
}

/**
 * Draw a match: the image with the patch sliding over it, and next to it the similarity of every
 * shift filling in (bright = looks the same). Resolves when done or when alive() turns false.
 */
export async function playMatch(
  view: HTMLCanvasElement,
  heat: HTMLCanvasElement,
  m: Match,
  ms: number,
  alive: () => boolean,
): Promise<void> {
  const n = 2 * REACH + 1;
  view.width = view.height = SIZE;
  heat.width = heat.height = n;
  const vc = view.getContext("2d")!;
  const hc = heat.getContext("2d")!;
  const base = vc.createImageData(SIZE, SIZE);
  for (let i = 0; i < m.gray.length; i++) {
    const v = m.gray[i];
    base.data.set([v, v, v, 255], i * 4);
  }
  const himg = hc.createImageData(n, n);
  const t0 = performance.now();
  return new Promise((resolve) => {
    const frame = () => {
      if (!alive()) return resolve();
      const k = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1;
      const upto = Math.floor(k * n * n);
      for (let j = 0; j < upto; j++) {
        const r = m.ncc[j];
        // dark → orange → white as the shifted patch looks more like the original
        const t = Math.max(0, r);
        himg.data.set([Math.min(255, 40 + 330 * t), Math.min(255, 20 + 250 * t * t), Math.min(255, 20 + 220 * t ** 4), 255], j * 4);
      }
      hc.putImageData(himg, 0, 0);
      vc.putImageData(base, 0, 0);
      const j = Math.min(upto, n * n - 1);
      const dx = (j % n) - REACH;
      const dy = Math.floor(j / n) - REACH;
      // the original patch (white) and the shifted one being compared (orange)
      vc.lineWidth = 1;
      vc.strokeStyle = "rgba(255,255,255,0.9)";
      vc.strokeRect(REACH + 0.5, REACH + 0.5, PATCH - 1, PATCH - 1);
      if (k < 1) {
        vc.strokeStyle = "#ff6b2c";
        vc.strokeRect(REACH + dx + 0.5, REACH + dy + 0.5, PATCH - 1, PATCH - 1);
        requestAnimationFrame(frame);
      } else {
        // the look-alike, if any
        vc.strokeStyle = m.best > 0.6 ? "#ff5a5a" : "rgba(255,107,44,0.7)";
        vc.setLineDash([3, 2]);
        vc.strokeRect(REACH + m.bestAt[0] + 0.5, REACH + m.bestAt[1] + 0.5, PATCH - 1, PATCH - 1);
        vc.setLineDash([]);
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
