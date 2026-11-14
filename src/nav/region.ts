import { Rng } from './rng.ts';
import type { Point, Region } from './mgl.ts';

/** Game uncertainty region, not a calibrated statistical confidence interval. */
export class PositionRegion {
  current: Region;
  readonly history: [number, number][] = [];
  readonly pins: Readonly<Region & { id: number; time: number; quality: number; improved: boolean }>[] = [];
  private rng: Rng;
  private bias: number;
  constructor(start: Point, seed: number) {
    this.rng = new Rng(seed);
    this.bias = (this.rng.next() - 0.5) * 0.07;
    this.current = this.offset(start, 75);
  }
  private offset(point: Point, radius: number): Region {
    const angle = this.rng.next() * 2 * Math.PI;
    const distance = radius * Math.sqrt(0.08 + this.rng.next() * 0.72);
    return { e: point.e + Math.sin(angle) * distance, n: point.n + Math.cos(angle) * distance, radius };
  }
  move(distance: number, course: number) {
    if (distance <= 0) return;
    this.current.e += Math.sin(course + this.bias) * distance * 1.025;
    this.current.n += Math.cos(course + this.bias) * distance * 1.025;
    this.current.radius += distance * 0.18;
    const last = this.history.at(-1);
    if (!last || Math.hypot(last[0] - this.current.e, last[1] - this.current.n) > 3)
      this.history.push([this.current.e, this.current.n]);
  }
  /** Truth is used only for the requested gameplay containment guarantee, never by the matcher. */
  record(truth: Point, match: { accepted: boolean; position: Point; radius: number; quality: number }, time: number) {
    let improved = false;
    if (match.accepted) {
      const error = Math.hypot(match.position.e - truth.e, match.position.n - truth.n);
      const radius = Math.max(match.radius, error * 1.5 + 4);
      if (radius < this.current.radius - 1) {
        const jitter = Math.max(0.1, (radius - error) * 0.8);
        this.current = { ...this.offset(match.position, jitter), radius };
        improved = true;
      }
    }
    const pin = Object.freeze({ ...this.current, id: this.pins.length + 1, time, quality: match.quality, improved });
    this.pins.push(pin);
    return pin;
  }
}
