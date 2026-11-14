/** Small seeded random generator so the navigation simulation is repeatable in tests. */
export class Rng {
  private s: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }

  /** uniform in [0, 1) (mulberry32) */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** normal distribution with the given standard deviation */
  gauss(sigma = 1): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v * sigma;
    }
    let u = 0;
    while (u < 1e-12) u = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const a = 2 * Math.PI * this.next();
    this.spare = r * Math.sin(a);
    return r * Math.cos(a) * sigma;
  }
}

export const DEG = Math.PI / 180;

/** wrap an angle to (-pi, pi] */
export function wrap(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** compass bearing (radians clockwise from north) from one map point to another */
export function bearing(e0: number, n0: number, e1: number, n1: number): number {
  return Math.atan2(e1 - e0, n1 - n0);
}
