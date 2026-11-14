/** Map-layer colours: one pixel per planner cell; the 3D view colours each facet from these. */
import type { PlanConfig } from "../plan/config";
import type { NavGrid } from "../plan/grid";

export type OverlayId = "none" | "hematite" | "safety" | "loc";

/** [position, red, green, blue, alpha] */
type Stop = [number, number, number, number, number];

function ramp(stops: Stop[], t: number, out: Uint8ClampedArray, o: number): void {
  let k = 1;
  while (k < stops.length - 1 && t > stops[k][0]) k++;
  const a = stops[k - 1];
  const b = stops[k];
  const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
  for (let j = 0; j < 4; j++) out[o + j] = a[j + 1] + (b[j + 1] - a[j + 1]) * f;
}

// heat maps: every cell coloured by its score, so the really good ground stands out too
export const NO_GO: Stop = [0, 200, 30, 40, 225];
/** safety score (0 worst … 1 best): red → amber → green */
export const SAFETY: Stop[] = [
  [0, 235, 70, 50, 190],
  [0.5, 255, 196, 70, 150],
  [0.8, 150, 215, 110, 140],
  [1, 60, 205, 130, 165],
];
/** how well a photo fix should work (0 … 1): violet where it fails, cyan where it works well */
export function locStops(c: PlanConfig): Stop[] {
  return [
    [0, 125, 80, 255, 200],
    [c.locFix, 190, 170, 255, 70],
    [Math.min(0.99, c.locFix + 0.15), 90, 220, 235, 120],
    [1, 40, 230, 220, 200],
  ];
}
export const HEMATITE: Stop[] = [
  [0, 255, 130, 225, 0],
  [0.3, 255, 115, 215, 110],
  [1, 205, 0, 165, 225],
];

export const css = (s: Stop | readonly number[]) => `rgba(${s[1]},${s[2]},${s[3]},${Math.max(0.55, (s[4] as number) / 255)})`;

export function makeCanvas(grid: NavGrid): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = grid.width;
  cv.height = grid.height;
  return cv;
}

/** Paint a layer into a canvas of the grid's size. */
export function paintOverlay(cv: HTMLCanvasElement, grid: NavGrid, id: OverlayId, c: PlanConfig): void {
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(grid.width, grid.height);
  const px = img.data;
  const L = grid.layers;
  const loc = locStops(c);
  for (let i = 0; i < grid.size; i++) {
    const o = i * 4;
    if (id === "safety") {
      if (grid.blocked[i]) for (let j = 0; j < 4; j++) px[o + j] = NO_GO[j + 1];
      else ramp(SAFETY, grid.good[i], px, o);
    } else if (id === "loc") {
      ramp(loc, L.loc[i], px, o);
    } else if (id === "hematite") {
      if (!Number.isNaN(L.hematite[i])) ramp(HEMATITE, L.hematite[i], px, o);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Darken everything beyond the walk-back limit and outline the limit. */
export function paintLimit(cv: HTMLCanvasElement, grid: NavGrid, within: Uint8Array): void {
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(grid.width, grid.height);
  const px = img.data;
  const w = grid.width;
  const h = grid.height;
  // no-go cells are never "within" the limit; leave them to the safety layer
  const out = (j: number) => !within[j] && !grid.blocked[j];
  for (let i = 0; i < grid.size; i++) {
    const o = i * 4;
    if (grid.blocked[i]) continue;
    if (!within[i]) {
      px[o] = 14;
      px[o + 1] = 6;
      px[o + 2] = 4;
      px[o + 3] = 165;
      continue;
    }
    const c = i % w;
    const r = (i - c) / w;
    if ((c > 0 && out(i - 1)) || (c < w - 1 && out(i + 1)) || (r > 0 && out(i - w)) || (r < h - 1 && out(i + w))) {
      px[o] = 255;
      px[o + 1] = 240;
      px[o + 2] = 210;
      px[o + 3] = 235;
    }
  }
  ctx.putImageData(img, 0, 0);
}
