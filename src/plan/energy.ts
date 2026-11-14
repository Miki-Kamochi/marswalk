/**
 * How fast a suited astronaut walks and how much energy (and so oxygen) it takes.
 *
 * Speed:  Tobler's hiking function (1993), off-path version.
 * Power:  Pandolf's load-carriage equation (1977). The terms that come from carrying weight
 *         are scaled by Mars gravity; the standing term is not. Downhill is treated as level,
 *         because the equation is not valid for descents (this errs on the careful side).
 * Both were measured on Earth without a pressure suit. They rank routes sensibly; the
 * absolute numbers are estimates.
 */
import type { PlanConfig } from "./config.ts";

/** Walking speed in m/s over ground with slope = rise / run (negative downhill). */
export function walkingSpeed(slope: number, c: PlanConfig): number {
  return (c.offPath * 6 * Math.exp(-3.5 * Math.abs(slope + 0.05))) / 3.6;
}

/** Metabolic power in watts at speed v (m/s) on a slope, with Pandolf terrain factor eta. */
export function walkingPower(v: number, slope: number, eta: number, c: PlanConfig): number {
  const grade = Math.max(0, slope * 100);
  const total = c.bodyKg + c.suitKg;
  const load = 2.0 * total * (c.suitKg / c.bodyKg) ** 2;
  const move = eta * total * (1.5 * v * v + 0.35 * v * grade);
  return 1.5 * c.bodyKg + c.gravity * (load + move);
}

export function terrainFactor(sand: number, c: PlanConfig): number {
  return c.etaFirm + (c.etaSand - c.etaFirm) * sand;
}

/** Energy per metre (J/m) on firm ground with the given slope. */
export function energyPerMetre(slope: number, c: PlanConfig): number {
  const v = walkingSpeed(slope, c);
  return walkingPower(v, slope, c.etaFirm, c) / v;
}

/** The cheapest energy per metre over all slopes: a lower bound used to steer the search. */
export function minEnergyPerMetre(c: PlanConfig): number {
  let best = Infinity;
  for (let s = -0.5; s <= 0.5; s += 0.005) best = Math.min(best, energyPerMetre(s, c));
  return best;
}

export const gramsO2 = (joules: number, c: PlanConfig) => joules / c.joulesPerGramO2;
