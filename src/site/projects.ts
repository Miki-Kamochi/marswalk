/**
 * Saved plans ("projects"). Kept in this browser's localStorage: no backend, nothing leaves the
 * device. Every read and write is wrapped, so a blocked storage simply means no saved plans.
 */
import type { Profile } from "../plan/planner";
import type { AreaId } from "../data/areas";

export interface PlanSummary {
  profile: Profile;
  duration: number;
  distance: number;
  ok: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** the map area; plans saved before there were areas have none and are in "buttes" */
  area?: AreaId;
  /** true once the user typed a name; otherwise the name follows the destination */
  custom?: boolean;
  /** planner grid cells; -1 = not chosen */
  home: number;
  target: number;
  destName: string;
  /** destination position, so the home screen can fly there */
  destE?: number;
  destN?: number;
  /** the custom route's weights (0-100 each), if the user set them */
  weights?: { time: number; o2: number; locate: number };
  /** more stops after the destination, visited in this order (shift+click in the planner) */
  more?: { target: number; name: string }[];
  selected: Profile;
  o2: number;
  errorLimit: number;
  created: number;
  updated: number;
  summary?: PlanSummary;
}

const KEY = "marswalk.projects.v1";

function readAll(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Project[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string") : [];
  } catch {
    return [];
  }
}

function writeAll(list: Project[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** newest first */
export const listProjects = (): Project[] => readAll().sort((a, b) => b.updated - a.updated);

export const getProject = (id: string): Project | undefined => readAll().find((p) => p.id === id);

export function saveProject(p: Project): boolean {
  const list = readAll().filter((q) => q.id !== p.id);
  list.push({ ...p, updated: Date.now() });
  return writeAll(list);
}

export function removeProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function newProjectId(): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `p${Date.now().toString(36)}${r}`;
}

/** "2 min ago", "yesterday", "12 Nov" */
export function ago(t: number, ja: boolean): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return ja ? "たった今" : "just now";
  if (s < 3600) return ja ? `${Math.floor(s / 60)}分前` : `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return ja ? `${Math.floor(s / 3600)}時間前` : `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return ja ? "昨日" : "yesterday";
  const d = new Date(t);
  return ja ? `${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
