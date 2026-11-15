import { dataUrl } from "../data/loader";
import type { World } from "../world/world";
import { getProject, type Project } from "../site/projects";
import { DEFAULTS, type PlanConfig } from "./config";
import { walkingSpeed } from "./energy";
import { cellElevations, decodeNav, NavGrid } from "./grid";
import { Planner, type Route } from "./planner";

export interface MapPoint { e: number; n: number }

/** Everything the walking game consumes from the route planner. */
export interface WalkPlan {
  project: Project | null;
  cfg: PlanConfig;
  grid: NavGrid;
  route: Route;
  points: MapPoint[];
  start: MapPoint;
  target: MapPoint & { name: string };
  timeLimit: number;
  speedForGrade(grade: number): number;
  localizability(e: number, n: number): number;
  terrain(e: number, n: number): { tilt: number; sand: number; blocked: boolean };
}

const pointAt = (grid: NavGrid, cell: number): MapPoint => ({ e: grid.east(cell), n: grid.northOf(cell) });

/** Rebuild exactly the route selected in the planner, using the same grid and assumptions. */
export async function loadWalkPlan(world: World, projectId: string | null): Promise<WalkPlan> {
  const cfg: PlanConfig = { ...DEFAULTS };
  const project = projectId ? getProject(projectId) ?? null : null;
  if (project) {
    cfg.errorLimit = project.errorLimit;
    cfg.photoTrigger = Math.min(DEFAULTS.photoTrigger, cfg.errorLimit / 2);
  }

  const navMeta = world.meta.nav.grid;
  const response = await fetch(dataUrl(navMeta.file));
  if (!response.ok) throw new Error(`${navMeta.file}: HTTP ${response.status}`);
  const layers = decodeNav(navMeta, new Uint8Array(await response.arrayBuffer()));
  const grid = new NavGrid(navMeta, { ...layers, elev: cellElevations(world.meta.grids.play, world.play.data, navMeta) }, cfg);
  const planner = new Planner(grid, cfg);

  let home = project?.home ?? -1;
  let target = project?.target ?? -1;
  let targetName = project?.destName || "";
  if (home < 0 || target < 0) {
    const walk = world.positions.walk;
    const start = walk ? world.place(walk.camp) : world.place("base");
    const stop = walk ? world.place(walk.stop) : world.positions.places.find((p) => p.kind === "stop");
    if (!stop) throw new Error("このエリアに採取地点がありません。");
    home = grid.nearestOpen(grid.index(start.easting, start.northing));
    target = grid.index(stop.easting, stop.northing);
    targetName = stop.name.replace(/ \(.+\)$/, "");
  }
  if (!planner.setHome(home)) throw new Error("計画の出発地点が歩行可能範囲にありません。");
  const resolved = planner.resolve(target);
  if (resolved.problem || resolved.dest < 0) throw new Error(`計画経路を再現できません: ${resolved.problem ?? "unknown"}`);
  const route = planner.route(resolved.dest, project?.selected ?? "mix", project?.o2 ?? 1);
  if (!route) throw new Error("選択した経路を再計算できませんでした。");

  const points = route.cells.map((cell) => pointAt(grid, cell));
  const valueAt = (e: number, n: number, values: Float32Array, fallback: number) => {
    const i = grid.index(e, n);
    return i >= 0 && Number.isFinite(values[i]) ? values[i] : fallback;
  };
  return {
    project,
    cfg,
    grid,
    route,
    points,
    start: pointAt(grid, home),
    target: { ...pointAt(grid, resolved.dest), name: targetName || "採取地点" },
    timeLimit: Math.ceil(route.stats.duration),
    // Planner duration uses this same Tobler off-path model for every edge.
    speedForGrade: (grade) => walkingSpeed(grade, cfg),
    localizability: (e, n) => valueAt(e, n, grid.layers.loc, 0.2),
    terrain: (e, n) => {
      const i = grid.index(e, n);
      return i < 0
        ? { tilt: 90, sand: 0, blocked: true }
        : { tilt: grid.layers.tilt[i], sand: grid.layers.sand[i], blocked: !!grid.blocked[i] };
    },
  };
}
