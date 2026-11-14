/** The astronaut's TRUE state in the world (Wayfinder never reads this directly). */
import type { Controls } from "./controls";
import type { World } from "./world";

export const EYE_HEIGHT = 1.7;
/** Screen movement at the default 4x multiplier. Other multipliers scale Player.update's dt. */
export const WALK_SPEED = 4.6;
/** Real suited walking pace this represents, m/s. */
export const REAL_PACE = 1.15;

export class Player {
  e = 0;
  n = 0;
  /** true distance walked, metres */
  walked = 0;
  /** metres moved in the last update, and the true direction of that movement (rad from north) */
  lastStep = 0;
  lastCourse = 0;
  /** hidden veer added to the walking direction when the astronaut cannot see (radians) */
  veer = 0;
  bob = 0;

  update(dt: number, c: Controls, world: World) {
    this.lastStep = 0;
    const mag = Math.min(1, Math.hypot(c.moveX, c.moveY));
    if (mag < 0.05) return;
    // direction the astronaut believes they are walking, plus the veer they do not notice
    const course = c.yaw + Math.atan2(c.moveX, c.moveY) + this.veer;
    const de = Math.sin(course);
    const dn = Math.cos(course);
    const here = world.groundElevation(this.e, this.n);
    const ahead = world.groundElevation(this.e + de * 2, this.n + dn * 2);
    const grade = (ahead - here) / 2;
    if (grade > 0.85) return; // too steep to climb in a suit (about 40 degrees)
    const slopeFactor = grade > 0.2 ? Math.max(0.4, 1 - (grade - 0.2) * 1.4) : 1;
    const dist = WALK_SPEED * mag * slopeFactor * dt;
    const [e, n] = world.clamp(this.e + de * dist, this.n + dn * dist);
    const moved = Math.hypot(e - this.e, n - this.n);
    this.e = e;
    this.n = n;
    this.walked += moved;
    this.lastStep = moved;
    this.lastCourse = course;
    this.bob += moved;
  }
}
