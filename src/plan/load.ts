/** Load everything the planner needs for the current area: the 6 m grid with its layers, and the places. */
import { dataUrl, loadGrid, loadJson, loadMeta, type HeightGrid, type Meta, type Positions } from "../data/loader";
import type { PlanConfig } from "./config";
import { cellElevations, decodeNav, NavGrid } from "./grid";

export interface PlanData {
  meta: Meta;
  grid: NavGrid;
  /** the 2 m elevation grid of the play area */
  play: HeightGrid;
  positions: Positions;
}

export async function loadPlanData(cfg: PlanConfig): Promise<PlanData> {
  const meta = await loadMeta();
  const nav = meta.nav.grid;
  const [play, navBuf, positions] = await Promise.all([
    loadGrid(meta.grids.play),
    fetch(dataUrl(nav.file)).then((r) => {
      if (!r.ok) throw new Error(`${nav.file}: HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
    loadJson<Positions>("positions.json"),
  ]);
  const grid = new NavGrid(nav, { ...decodeNav(nav, new Uint8Array(navBuf)), elev: cellElevations(meta.grids.play, play.data, nav) }, cfg);
  return { meta, grid, play, positions };
}

/** Load an image as an element (for drawing crops of it). */
export function loadImage(rel: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${rel}: could not load`));
    img.src = dataUrl(rel);
  });
}
