/** Turns Wayfinder's numbers into directions a person can follow without reading coordinates. */
import { DEG, bearing, wrap } from "./rng.ts";

export interface Cue {
  name: string;
  /** absolute bearing from the astronaut, radians */
  bearing: number;
}

export interface Guidance {
  /** how far to turn: + = right, - = left, radians */
  turn: number;
  distance: number;
  /** absolute course to walk, radians */
  course: number;
  headline: string;
  /** what to keep where while walking the course */
  cues: string;
}

/** Where something is relative to the direction of travel, in plain words. */
export function sector(rel: number): string {
  const d = wrap(rel) / DEG;
  const a = Math.abs(d);
  const side = d < 0 ? "left" : "right";
  if (a < 20) return "ahead";
  if (a < 65) return `ahead on your ${side}`;
  if (a < 115) return `on your ${side}`;
  if (a < 160) return `behind on your ${side}`;
  return "behind you";
}

export function guide(
  est: { e: number; n: number; heading: number },
  target: { e: number; n: number; name: string },
  cuesAvailable: Cue[],
): Guidance {
  const course = bearing(est.e, est.n, target.e, target.n);
  const distance = Math.hypot(target.e - est.e, target.n - est.n);
  const turn = wrap(course - est.heading);
  const deg = Math.round(Math.abs(turn) / DEG / 5) * 5;
  let headline: string;
  if (deg < 10) headline = "Straight ahead";
  else if (deg > 150) headline = "Turn around";
  else headline = `Turn ${turn < 0 ? "left" : "right"} ${deg}°`;
  const cues = cuesAvailable
    .slice(0, 2)
    .map((c) => `${c.name} ${sector(c.bearing - course)}`)
    .join(" · ");
  return { turn, distance, course, headline, cues };
}
