/**
 * Route planner for a walking astronaut.
 *
 * Every route obeys three rules:
 *   1. never enter a no-go cell (safety layer);
 *   2. the position error from step counting never exceeds the limit: the walk may only
 *      cross a stretch without photo fixes if it is short enough (localizability layer);
 *   3. from every point on the way there is enough oxygen to walk home with the reserve left.
 * Rules 1 and 2 are built into the search. Rule 3 is checked on the finished route against
 * the "energy to walk home" map, the same idea as Apollo's walk-back limit.
 *
 * Four routes are offered. They differ only in what they keep small:
 *   short  distance
 *   o2     energy, and so oxygen
 *   found  the position error summed along the way
 *   mix    energy and position error together
 *
 * The search is A* over (cell, metres walked since the last possible photo fix). Moves go to
 * the 16 nearest cells, so paths can run in 16 directions instead of 8.
 */
import type { PlanConfig } from "./config.ts";
import { energyPerMetre, minEnergyPerMetre, terrainFactor, walkingPower, walkingSpeed } from "./energy.ts";
import type { NavGrid } from "./grid.ts";

export type Profile = "short" | "o2" | "found" | "mix";
export const PROFILES: Profile[] = ["short", "o2", "found", "mix"];

export interface RouteStats {
  /** metres along the ground */
  distance: number;
  /** seconds, photo stops included */
  duration: number;
  ascent: number;
  descent: number;
  /** largest and average position error on the way, metres */
  maxError: number;
  meanError: number;
  photoCount: number;
  /** metres walked through cells where a photo fix is not expected to work */
  blindDistance: number;
  longestBlind: number;
  sandDistance: number;
  /** metres through cells with a safety score under 0.5 */
  cautionDistance: number;
  /** shares of a full tank: walking out, working at the site, walking home, left at home */
  o2Out: number;
  o2Work: number;
  o2Back: number;
  o2Left: number;
  /** smallest spare oxygen on the way out if one had to turn home at that point (share of a tank) */
  minMargin: number;
  /** rule 2 and rule 3 */
  errorOk: boolean;
  o2Ok: boolean;
}

export interface Route {
  profile: Profile;
  cells: number[];
  /** per vertex, cumulative from the start (time and energy include photo stops) */
  dist: Float32Array;
  time: Float32Array;
  energy: Float32Array;
  /** position error on arriving at each vertex, and after the photo fix if one is taken there */
  errorIn: Float32Array;
  errorOut: Float32Array;
  /** vertex indices where a photo fix is taken */
  photos: number[];
  /** vertex index of each stop, in visiting order (the last one is the destination) */
  stops: number[];
  stats: RouteStats;
}

export interface PlanResult {
  /** destination actually used (moved to the nearest walkable cell if needed), or -1 */
  dest: number;
  moved: boolean;
  /** why there are no routes */
  problem?: "outside" | "no-go" | "cut-off";
  routes: Route[];
  /** the least-oxygen way home from the destination */
  back: number[];
}

// 4 straight, 4 diagonal and 8 knight moves (columns east, rows south)
const DC = [1, 0, -1, 0, 1, -1, -1, 1, 2, 1, -1, -2, -2, -1, 1, 2];
const DR = [0, 1, 0, -1, 1, 1, -1, -1, 1, 2, 2, 1, -1, -2, -2, -1];
// the two cells a diagonal or knight move passes between; both must be open
const M1C = DC.map((dc, k) => (k < 4 ? 0 : Math.abs(dc) === 2 ? Math.sign(dc) : Math.abs(DR[k]) === 2 ? 0 : dc));
const M1R = DR.map((dr, k) => (k < 4 ? 0 : Math.abs(DC[k]) === 2 ? 0 : Math.abs(dr) === 2 ? Math.sign(dr) : 0));
const M2C = DC.map((dc, k) => (k < 4 ? 0 : Math.abs(dc) === 2 ? Math.sign(dc) : Math.abs(DR[k]) === 2 ? dc : 0));
const M2R = DR.map((dr, k) => (k < 4 ? 0 : Math.abs(DC[k]) === 2 ? dr : Math.abs(dr) === 2 ? Math.sign(dr) : dr));

const RUN_BUCKETS = 8;
const SLOPE_MAX = 1.5;
const SLOPE_STEPS = 1500;

/** Binary min-heap of (key, value) pairs in flat arrays. */
class Heap {
  private keys = new Float64Array(1 << 16);
  private vals = new Int32Array(1 << 16);
  size = 0;

  clear() {
    this.size = 0;
  }

  push(key: number, val: number) {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2);
      k.set(this.keys);
      this.keys = k;
      const v = new Int32Array(this.size * 2);
      v.set(this.vals);
      this.vals = v;
    }
    let i = this.size++;
    const { keys, vals } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  /** Remove and return the value with the smallest key. */
  pop(): number {
    const { keys, vals } = this;
    const top = vals[0];
    const n = --this.size;
    const key = keys[n];
    const val = vals[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= key) break;
      keys[i] = keys[c];
      vals[i] = vals[c];
      i = c;
    }
    keys[i] = key;
    vals[i] = val;
    return top;
  }
}

export class Planner {
  readonly grid: NavGrid;
  readonly cfg: PlanConfig;
  /** where the walk starts and must end */
  home = -1;
  /** energy (J) to walk home from each cell, and to reach each cell from home */
  toHome: Float32Array;
  fromHome: Float32Array;
  /**
   * When set, search() appends each cell the first time it explores it, in order: the planner's
   * real work, which the map replays as the "calculating" animation.
   */
  trace: number[] | null = null;
  private seen: Uint8Array;

  private len: number[];
  private speed = new Float32Array(SLOPE_STEPS + 1);
  private heap = new Heap();
  private g: Float64Array;
  private run: Float32Array;
  private parent: Int32Array;
  private closed: Uint8Array;
  // result of the last edge() call
  private eLen = 0;
  private eTime = 0;
  private eEnergy = 0;
  private flatEnergy: number;
  private minEnergy: number;

  constructor(grid: NavGrid, cfg: PlanConfig) {
    this.grid = grid;
    this.cfg = cfg;
    this.len = DC.map((dc, k) => grid.cell * Math.hypot(dc, DR[k]));
    for (let i = 0; i <= SLOPE_STEPS; i++) {
      this.speed[i] = walkingSpeed((i / SLOPE_STEPS) * 2 * SLOPE_MAX - SLOPE_MAX, cfg);
    }
    const states = grid.size * RUN_BUCKETS;
    this.g = new Float64Array(states);
    this.run = new Float32Array(states);
    this.parent = new Int32Array(states);
    this.closed = new Uint8Array(states);
    this.seen = new Uint8Array(grid.size);
    this.toHome = new Float32Array(grid.size).fill(Infinity);
    this.fromHome = new Float32Array(grid.size).fill(Infinity);
    this.flatEnergy = energyPerMetre(0, cfg);
    this.minEnergy = minEnergyPerMetre(cfg);
  }

  /** The longest stretch that may be walked without a photo fix, metres. */
  get blindLimit(): number {
    return (this.cfg.errorLimit - this.cfg.fixError) / this.cfg.drift;
  }

  /**
   * Energy per metre spent standing still for photo fixes, if they are needed as often as on
   * ground where they always work. Added to the walk-home map, so that the way home is not
   * assumed to be free of stops.
   */
  get fixOverhead(): number {
    const c = this.cfg;
    return (c.photoSeconds * c.restWatts * c.drift) / Math.max(c.photoTrigger - c.fixError, 0.5);
  }

  /** Cell reached from a by move k, or -1 if that move is not allowed. */
  private neighbour(a: number, k: number): number {
    const w = this.grid.width;
    const bl = this.grid.blocked;
    const c = a % w;
    const r = (a - c) / w;
    const c2 = c + DC[k];
    const r2 = r + DR[k];
    if (c2 < 0 || r2 < 0 || c2 >= w || r2 >= this.grid.height) return -1;
    const b = r2 * w + c2;
    if (bl[b]) return -1;
    if (k >= 4 && (bl[(r + M1R[k]) * w + c + M1C[k]] || bl[(r + M2R[k]) * w + c + M2C[k]])) return -1;
    return b;
  }

  /** Length, time and energy of walking from cell a to cell b, horizontal distance L. */
  private edge(a: number, b: number, L: number): void {
    const { elev, sand } = this.grid.layers;
    const dz = elev[b] - elev[a];
    const slope = dz / L;
    const si = Math.round(((Math.min(Math.max(slope, -SLOPE_MAX), SLOPE_MAX) + SLOPE_MAX) / (2 * SLOPE_MAX)) * SLOPE_STEPS);
    const v = this.speed[si];
    const eta = terrainFactor(0.5 * (sand[a] + sand[b]), this.cfg);
    this.eLen = Math.hypot(L, dz);
    this.eTime = L / v;
    this.eEnergy = walkingPower(v, slope, eta, this.cfg) * this.eTime;
  }

  private moveLength(a: number, b: number): number {
    const w = this.grid.width;
    return this.grid.cell * Math.hypot((b % w) - (a % w), Math.floor(b / w) - Math.floor(a / w));
  }

  /** Least energy between `src` and every cell: towards src if `towards`, else away from it. */
  private field(src: number, towards: boolean): Float32Array {
    const n = this.grid.size;
    const d = new Float32Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    const heap = this.heap;
    const stops = this.fixOverhead;
    heap.clear();
    d[src] = 0;
    heap.push(0, src);
    while (heap.size) {
      const a = heap.pop();
      if (done[a]) continue;
      done[a] = 1;
      for (let k = 0; k < 16; k++) {
        const b = this.neighbour(a, k);
        if (b < 0 || done[b]) continue;
        if (towards) this.edge(b, a, this.len[k]);
        else this.edge(a, b, this.len[k]);
        const nd = d[a] + this.eEnergy + stops * this.len[k];
        if (nd < d[b]) {
          d[b] = nd;
          heap.push(nd, b);
        }
      }
    }
    return d;
  }

  /** Set where the walk starts and ends. Returns false if that cell is not walkable. */
  setHome(cell: number): boolean {
    if (cell < 0 || this.grid.blocked[cell]) return false;
    this.home = cell;
    this.toHome = this.field(cell, true);
    this.fromHome = this.field(cell, false);
    return true;
  }

  /** Energy of a round trip to each cell with the work at the site, as a share of a full tank. */
  roundTrip(cell: number): number {
    const c = this.cfg;
    return (this.fromHome[cell] + c.workSeconds * c.workWatts + this.toHome[cell]) / c.tankJoules;
  }

  /** 1 for every cell that can be visited and left with the reserve intact (the walk-back limit). */
  withinLimit(o2Start: number): Uint8Array {
    const out = new Uint8Array(this.grid.size);
    const max = o2Start - this.cfg.reserve;
    for (let i = 0; i < out.length; i++) out[i] = this.roundTrip(i) <= max ? 1 : 0;
    return out;
  }

  private search(start: number, goal: number, profile: Profile, limitError: boolean): number[] | null {
    const { cfg, grid, heap, g, run, parent, closed } = this;
    const fixable = grid.fixable;
    const w = grid.width;
    const dmax = limitError ? this.blindLimit : Infinity;
    const bw = limitError ? dmax / RUN_BUCKETS : Infinity;
    const gc = goal % w;
    const gr = Math.floor(goal / w);
    const perMetre =
      profile === "short"
        ? 1
        : profile === "o2"
          ? this.minEnergy
          : profile === "found"
            ? cfg.fixError
            : this.minEnergy / this.flatEnergy + (cfg.mixWeight * cfg.fixError) / cfg.errorLimit;
    const h = (cell: number) => perMetre * grid.cell * Math.hypot((cell % w) - gc, Math.floor(cell / w) - gr);

    g.fill(Infinity);
    closed.fill(0);
    heap.clear();
    const s0 = start * RUN_BUCKETS;
    g[s0] = 0;
    run[s0] = 0;
    parent[s0] = -1;
    heap.push(h(start), s0);
    while (heap.size) {
      const s = heap.pop();
      if (closed[s]) continue;
      closed[s] = 1;
      const a = (s / RUN_BUCKETS) | 0;
      if (this.trace && !this.seen[a]) {
        this.seen[a] = 1;
        this.trace.push(a);
      }
      if (a === goal) {
        const cells: number[] = [];
        for (let t = s; t >= 0; t = parent[t]) cells.push((t / RUN_BUCKETS) | 0);
        return cells.reverse();
      }
      const ra = run[s];
      for (let k = 0; k < 16; k++) {
        const b = this.neighbour(a, k);
        if (b < 0) continue;
        const L = this.len[k];
        // the error keeps growing until the fix on arrival, so the move into a good cell counts too
        if (ra + L > dmax) continue;
        const rb = fixable[b] ? 0 : ra + L;
        const t = b * RUN_BUCKETS + (limitError ? Math.min(RUN_BUCKETS - 1, Math.floor(rb / bw)) : 0);
        if (closed[t]) continue;
        this.edge(a, b, L);
        const errorSum = L * (cfg.fixError + cfg.drift * (ra + L / 2));
        const cost =
          profile === "short"
            ? this.eLen
            : profile === "o2"
              ? this.eEnergy
              : profile === "found"
                ? errorSum
                : this.eEnergy / this.flatEnergy + (cfg.mixWeight * errorSum) / cfg.errorLimit;
        const ng = g[s] + cost;
        if (ng < g[t]) {
          g[t] = ng;
          run[t] = rb;
          parent[t] = s;
          heap.push(ng + h(b), t);
        }
      }
    }
    return null;
  }

  /** Walk a path and work out everything shown about it. o2Start: share of a full tank at the start. */
  evaluate(cells: number[], profile: Profile, o2Start: number, stops: number[] = [cells.length - 1]): Route {
    const { cfg, grid } = this;
    // stops before the last: work there (counted in the energy so far) and a position check
    const midStop = new Set(stops.slice(0, -1));
    const workJ = cfg.workSeconds * cfg.workWatts;
    let midWork = 0;
    const { fixable, good } = grid;
    const { elev, sand } = grid.layers;
    const n = cells.length;
    const dist = new Float32Array(n);
    const time = new Float32Array(n);
    const energy = new Float32Array(n);
    const errorIn = new Float32Array(n);
    const errorOut = new Float32Array(n);
    const photos: number[] = [];
    let u = cfg.fixError;
    errorIn[0] = errorOut[0] = u;
    let ascent = 0;
    let descent = 0;
    let errorSum = 0;
    let flat = 0;
    let maxError = u;
    let blind = 0;
    let longest = 0;
    let stretch = 0;
    let sandM = 0;
    let caution = 0;
    const tank = cfg.tankJoules;
    let minMargin = o2Start - cfg.reserve - this.toHome[cells[0]] / tank;
    for (let i = 1; i < n; i++) {
      const a = cells[i - 1];
      const b = cells[i];
      const L = this.moveLength(a, b);
      this.edge(a, b, L);
      dist[i] = dist[i - 1] + this.eLen;
      time[i] = time[i - 1] + this.eTime;
      energy[i] = energy[i - 1] + this.eEnergy;
      const dz = elev[b] - elev[a];
      if (dz > 0) ascent += dz;
      else descent -= dz;
      errorSum += L * (u + (cfg.drift * L) / 2);
      flat += L;
      u += cfg.drift * L;
      errorIn[i] = u;
      maxError = Math.max(maxError, u);
      if (fixable[b]) stretch = 0;
      else {
        blind += L;
        stretch += L;
        longest = Math.max(longest, stretch);
      }
      sandM += (L * (sand[a] + sand[b])) / 2;
      if (good[b] < 0.5) caution += L;
      if (fixable[b] && u > cfg.fixError) {
        // take a photo fix when the error has grown, on arrival, or before a stretch without fixes
        let need = u >= cfg.photoTrigger || i === n - 1 || midStop.has(i);
        if (!need && !fixable[cells[i + 1]]) {
          let ahead = 0;
          let j = i;
          do {
            ahead += this.moveLength(cells[j], cells[j + 1]);
            j++;
          } while (j < n - 1 && !fixable[cells[j]]);
          need = u + cfg.drift * ahead > cfg.photoTrigger;
        }
        if (need) {
          photos.push(i);
          u = cfg.fixError;
          time[i] += cfg.photoSeconds;
          energy[i] += cfg.photoSeconds * cfg.restWatts;
        }
      }
      errorOut[i] = u;
      if (midStop.has(i)) {
        energy[i] += workJ;
        midWork += workJ;
      }
      minMargin = Math.min(minMargin, o2Start - cfg.reserve - (energy[i] + this.toHome[b]) / tank);
    }
    // walking only; the work at every stop is counted on its own
    const o2Out = (energy[n - 1] - midWork) / tank;
    const o2Work = (stops.length * workJ) / tank;
    const o2Back = this.toHome[cells[n - 1]] / tank;
    const o2Left = o2Start - o2Out - o2Work - o2Back;
    const stats: RouteStats = {
      distance: dist[n - 1],
      duration: time[n - 1],
      ascent,
      descent,
      maxError,
      meanError: flat > 0 ? errorSum / flat : u,
      photoCount: photos.length,
      blindDistance: blind,
      longestBlind: longest,
      sandDistance: sandM,
      cautionDistance: caution,
      o2Out,
      o2Work,
      o2Back,
      o2Left,
      minMargin,
      errorOk: maxError <= cfg.errorLimit + 1e-6,
      o2Ok: minMargin >= 0 && o2Left >= cfg.reserve - 1e-9,
    };
    return { profile, cells, dist, time, energy, errorIn, errorOut, photos, stops, stats };
  }

  /** The least-oxygen way home from a cell, by walking down the "energy to walk home" map. */
  wayHome(from: number): number[] {
    const out = [from];
    let a = from;
    for (let guard = 0; a !== this.home && guard < this.grid.size; guard++) {
      let best = -1;
      let bestCost = Infinity;
      for (let k = 0; k < 16; k++) {
        const b = this.neighbour(a, k);
        if (b < 0) continue;
        this.edge(a, b, this.len[k]);
        const c = this.eEnergy + this.fixOverhead * this.len[k] + this.toHome[b];
        if (c < bestCost) {
          bestCost = c;
          best = b;
        }
      }
      if (best < 0 || !(bestCost < Infinity)) break;
      out.push(best);
      a = best;
    }
    return out;
  }

  /** Check a clicked cell: the destination to use (moved to walkable ground if needed) or the problem. */
  resolve(target: number): PlanResult {
    const none = (problem: PlanResult["problem"], dest = -1): PlanResult => ({ dest, moved: false, problem, routes: [], back: [] });
    if (this.home < 0) throw new Error("setHome() first");
    if (target < 0) return none("outside");
    const dest = this.grid.nearestOpen(target);
    if (dest < 0) return none("no-go");
    if (!(this.fromHome[dest] < Infinity)) return none("cut-off", dest);
    return { dest, moved: dest !== target, routes: [], back: this.wayHome(dest) };
  }

  /** One route from home to a walkable, reachable cell. o2Start: share of a full tank at the start. */
  route(dest: number, profile: Profile, o2Start = 1): Route | null {
    return this.routeVia([dest], profile, o2Start);
  }

  /**
   * One route from home through several stops in the given order, each leg planned on its own.
   * The position is checked at every stop (the crew spends the work time there), so each leg starts
   * with a fresh position, like the walk from home.
   */
  routeVia(stops: number[], profile: Profile, o2Start = 1): Route | null {
    if (this.trace) this.seen.fill(0);
    const cells: number[] = [this.home];
    const at: number[] = [];
    for (const stop of stops) {
      const from = cells[cells.length - 1];
      // if no path keeps the position error under the limit, show the best one anyway, flagged
      const leg = from === stop ? [stop] : (this.search(from, stop, profile, true) ?? this.search(from, stop, profile, false));
      if (!leg) return null;
      cells.push(...leg.slice(1));
      at.push(cells.length - 1);
    }
    if (cells.length < 2) return null;
    return this.evaluate(cells, profile, o2Start, at);
  }

  /** Plan the four routes from home to a cell. */
  plan(target: number, o2Start = 1): PlanResult {
    const res = this.resolve(target);
    if (res.problem) return res;
    for (const p of PROFILES) {
      const r = this.route(res.dest, p, o2Start);
      if (r) res.routes.push(r);
    }
    return res;
  }
}
