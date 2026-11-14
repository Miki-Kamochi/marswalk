/** Loaders for the processed NASA data in /public/data (see scripts/process_data.py). */

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GridMeta {
  file: string;
  width: number;
  height: number;
  /** spacing between samples, metres */
  cell: number;
  /** map position of sample [row 0][col 0] */
  west: number;
  north: number;
  zMin: number;
  zScale: number;
  source: string;
}

export interface LayerMeta {
  file: string;
  raw: string;
  bounds: Bounds;
  description?: string;
  source: string;
  legend?: number[];
  legendUnit?: string;
  parameter?: string;
  coverage?: number;
}

export interface ImageMeta {
  file: string;
  bounds: Bounds;
  metersPerPixel: number;
  source: string;
}

export interface Meta {
  frame: {
    projection: string;
    radius: number;
    play: Bounds;
    fetch: Bounds;
    origin: { easting: number; northing: number; elevation: number };
  };
  grids: Record<"play" | "surround" | "mid" | "far", GridMeta>;
  images: Record<"ortho" | "color" | "surround", ImageMeta>;
  layers: Record<string, LayerMeta>;
}

export interface Place {
  id: string;
  name: string;
  kind: "base" | "stop" | "landmark" | "backdrop";
  easting: number;
  northing: number;
  elevation: number;
  note?: string;
  [extra: string]: unknown;
}

export interface Positions {
  places: Place[];
  route: { id: string; points: [number, number][]; lengthM: number }[];
}

export interface Traverse {
  /** [sol, easting, northing, elevation, odometry_m] */
  waypoints: [number, number, number, number, number][];
  playAreaSols: [number, number];
}

const BASE = `${import.meta.env.BASE_URL}data/`;

export async function loadJson<T>(rel: string): Promise<T> {
  const r = await fetch(BASE + rel);
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export const loadMeta = () => loadJson<Meta>("meta.json");

/** An elevation grid. Row 0 is the northern edge. */
export class HeightGrid {
  constructor(
    readonly meta: GridMeta,
    readonly data: Uint16Array,
  ) {}

  get east(): number {
    return this.meta.west + (this.meta.width - 1) * this.meta.cell;
  }
  get south(): number {
    return this.meta.north - (this.meta.height - 1) * this.meta.cell;
  }

  /** Elevation (m) at integer sample, or NaN where there is no data. */
  at(col: number, row: number): number {
    const v = this.data[row * this.meta.width + col];
    return v === 0 ? NaN : this.meta.zMin + (v - 1) * this.meta.zScale;
  }

  /** Bilinear elevation at a map position; NaN outside the grid. */
  sample(easting: number, northing: number): number {
    const m = this.meta;
    const fx = (easting - m.west) / m.cell;
    const fy = (m.north - northing) / m.cell;
    if (fx < 0 || fy < 0 || fx > m.width - 1 || fy > m.height - 1) return NaN;
    const c = Math.min(Math.floor(fx), m.width - 2);
    const r = Math.min(Math.floor(fy), m.height - 2);
    const tx = fx - c;
    const ty = fy - r;
    const top = this.at(c, r) * (1 - tx) + this.at(c + 1, r) * tx;
    const bot = this.at(c, r + 1) * (1 - tx) + this.at(c + 1, r + 1) * tx;
    return top * (1 - ty) + bot * ty;
  }
}

export async function loadGrid(meta: GridMeta): Promise<HeightGrid> {
  const r = await fetch(BASE + meta.file);
  if (!r.ok) throw new Error(`${meta.file}: HTTP ${r.status}`);
  const data = new Uint16Array(await r.arrayBuffer());
  if (data.length !== meta.width * meta.height) {
    throw new Error(`${meta.file}: expected ${meta.width * meta.height} samples, got ${data.length}`);
  }
  return new HeightGrid(meta, data);
}

/** An image decoded to pixels so it can be sampled by map position. */
export class Raster {
  constructor(
    readonly bounds: Bounds,
    readonly width: number,
    readonly height: number,
    readonly rgba: Uint8ClampedArray,
  ) {}

  /** Nearest pixel at a map position as [r, g, b, a] offsets into rgba, or -1 outside. */
  index(easting: number, northing: number): number {
    const b = this.bounds;
    const c = Math.floor(((easting - b.west) / (b.east - b.west)) * this.width);
    const r = Math.floor(((b.north - northing) / (b.north - b.south)) * this.height);
    if (c < 0 || r < 0 || c >= this.width || r >= this.height) return -1;
    return (r * this.width + c) * 4;
  }
}

export async function loadRaster(file: string, bounds: Bounds): Promise<Raster> {
  const r = await fetch(BASE + file);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return new Raster(bounds, bmp.width, bmp.height, img.data);
}

export const dataUrl = (rel: string) => BASE + rel;
