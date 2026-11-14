/** Browser-scale analogue of Censible/MGL, NOT JPL flight software.
 * Only observations, the orbital map and an odometry prior enter this matcher.
 */
export interface Point { e: number; n: number }
export interface Region extends Point { radius: number }
export interface Surface { intensity(e: number, n: number): number; elevation(e: number, n: number): number }
export interface Sample { de: number; dn: number; intensity: number; height: number }
export interface Observation { samples: Sample[]; coverage: number; contrast: number; clarity: number; orientation: number }
export interface Match {
  position: Point; quality: number; radius: number; accepted: boolean;
  coverage: number; contrast: number; clarity: number; orientation: number; uniqueness: number;
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Gameplay quality gates, not NASA's numeric acceptance thresholds. */
export function scanQuality(q: Omit<Match, 'position' | 'quality' | 'radius' | 'accepted'>): number {
  return Math.pow(q.coverage * q.contrast * q.clarity * q.orientation * q.uniqueness, 1 / 5);
}
/** Sparse masked census comparisons + mean-subtracted elevation SSD. */
export function matchTerrain(obs: Observation, map: Surface, prior: Region): Match {
  const samples = obs.samples;
  const observedMean = samples.reduce((v, p) => v + p.height, 0) / Math.max(1, samples.length);
  const score = (e: number, n: number) => {
    let census = 0, pairs = 0, sum = 0, sumSq = 0, valid = 0;
    let lastI = NaN, lastObserved = NaN;
    for (const p of samples) {
      const intensity = map.intensity(e + p.de, n + p.dn);
      const height = map.elevation(e + p.de, n + p.dn);
      if (!Number.isFinite(intensity + height)) { lastI = NaN; continue; }
      if (Number.isFinite(lastI) && Math.abs(p.intensity - lastObserved) > 0.005) {
        census += (intensity > lastI) === (p.intensity > lastObserved) ? 0 : 1;
        pairs++;
      }
      lastI = intensity; lastObserved = p.intensity;
      const delta = height - (p.height - observedMean);
      sum += delta; sumSq += delta * delta; valid++;
    }
    if (valid < samples.length * 0.85 || !pairs) return Infinity;
    const variance = Math.max(0, sumSq / valid - (sum / valid) ** 2);
    return census / pairs + 0.12 * Math.min(4, variance);
  };
  const candidates: (Point & { score: number })[] = [];
  const step = Math.max(3, prior.radius / 24);
  const add = (e: number, n: number) => {
    if (Math.hypot(e - prior.e, n - prior.n) > prior.radius) return;
    candidates.push({ e, n, score: score(e, n) });
  };
  for (let dn = -prior.radius; dn <= prior.radius; dn += step)
    for (let de = -prior.radius; de <= prior.radius; de += step) add(prior.e + de, prior.n + dn);
  add(prior.e, prior.n);
  candidates.sort((a, b) => a.score - b.score);
  // At most 4 * 17 * 17 refinement samples, even after a very long walk.
  for (const seed of candidates.slice(0, 4))
    for (let dn = -step; dn <= step; dn += Math.max(1, step / 8))
      for (let de = -step; de <= step; de += Math.max(1, step / 8)) add(seed.e + de, seed.n + dn);
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0] ?? { ...prior, score: Infinity };
  const runner = candidates.find(p => Math.hypot(p.e - best.e, p.n - best.n) > 15);
  const uniqueness = Number.isFinite(best.score) && runner
    ? clamp((runner.score - best.score) / 0.22) : 0;
  const factors = { coverage: obs.coverage, contrast: obs.contrast, clarity: obs.clarity, orientation: obs.orientation, uniqueness };
  const quality = scanQuality(factors);
  // Weak but non-ambiguous observations now provide a coarse fix instead of an all-or-nothing result.
  // The continuous radius yields roughly 15–110 m fixes across the useful quality range.
  const accepted = samples.length >= 16 && factors.coverage >= 0.18 && factors.contrast > 0.035
    && factors.orientation > 0.2 && uniqueness > 0.03 && quality > 0.26 && best.score < 0.85;
  return { ...factors, position: { e: best.e, n: best.n }, quality, accepted, radius: 14 + 170 * (1 - quality) ** 1.35 };
}
