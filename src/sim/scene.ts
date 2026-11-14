/** What the 2D map and the 3D view have in common. */
import type { Profile, Route } from "../plan/planner";

export const ROUTE_COLORS: Record<Profile, string> = {
  short: "#ffffff",
  o2: "#52c8ff",
  found: "#ff8fdc",
  mix: "#ffe14d",
};

export interface ViewEvents {
  /** the user clicked the ground at this map position */
  onPick(easting: number, northing: number): void;
  onHover(easting: number | null, northing: number | null): void;
  onSelect(profile: Profile): void;
}

export interface SceneView {
  /** layer colours, one pixel per planner cell; null = no layer */
  setOverlay(cv: HTMLCanvasElement | null): void;
  /** walk-back limit shading; null = hidden */
  setLimit(cv: HTMLCanvasElement | null): void;
  setRoutes(routes: Route[], selected: Profile | null, back: number[]): void;
  setEnds(home: number, dest: number): void;
  setExtras(places: boolean, traverse: boolean): void;
  resize(): void;
}
