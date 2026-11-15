/**
 * Every number the route planner assumes, in one place.
 *
 * None of these are official NASA values. They are our working assumptions for a suited
 * astronaut on foot, chosen so the method can be shown end to end. The "How it works" page
 * lists them and says so.
 */
export interface PlanConfig {
  // --- safety layer (structure after JPL's GESTALT: tilt, roughness, step of a fitted plane)
  /** slope up to which walking is normal, degrees */
  tiltSafe: number;
  /** slope from which a cell is no-go, degrees */
  tiltMax: number;
  /** the same two limits on loose sand */
  sandTiltSafe: number;
  sandTiltMax: number;
  /** RMS roughness of the 1 m elevation samples around the fitted plane, metres */
  roughSafe: number;
  roughMax: number;
  /** largest height difference between neighbouring 1 m samples, plane removed, metres */
  stepSafe: number;
  stepMax: number;
  /** how much full sand cover lowers the safety score (0..1) */
  sandPenalty: number;

  // --- localizability layer
  /** score from which a photo fix is expected to work */
  locFix: number;

  // --- position uncertainty while walking
  /** growth of the position error from step counting, metres per metre walked */
  drift: number;
  /** error right after a successful photo fix, metres */
  fixError: number;
  /** the error must never exceed this, metres */
  errorLimit: number;
  /** take a photo fix once the error has grown to this, metres */
  photoTrigger: number;
  /** standing time for one photo fix, seconds */
  photoSeconds: number;

  // --- energy and oxygen
  bodyKg: number;
  suitKg: number;
  /** Mars gravity / Earth gravity */
  gravity: number;
  /** Pandolf terrain factor on firm ground and on loose sand */
  etaFirm: number;
  etaSand: number;
  /** Tobler's off-path factor */
  offPath: number;
  /** metabolic rate while standing or working at the site, watts */
  restWatts: number;
  workWatts: number;
  /** time spent working at the destination, seconds */
  workSeconds: number;
  /** energy the suit's oxygen supply covers when full, joules */
  tankJoules: number;
  /** energy released per gram of oxygen breathed, joules */
  joulesPerGramO2: number;
  /** share of a full tank that must still be left on arrival at home */
  reserve: number;

  // --- balanced route
  /** weight of the uncertainty term against the energy term */
  mixWeight: number;

  // --- custom route: the user's own weights (any scale; only their ratio matters)
  custom: { time: number; o2: number; locate: number };
}

export const DEFAULTS: PlanConfig = {
  tiltSafe: 15,
  tiltMax: 20,
  sandTiltSafe: 8,
  sandTiltMax: 15,
  roughSafe: 0.1,
  roughMax: 0.3,
  stepSafe: 0.3,
  stepMax: 0.6,
  sandPenalty: 0.5,

  locFix: 0.4,

  drift: 0.03,
  fixError: 2,
  errorLimit: 20,
  photoTrigger: 10,
  photoSeconds: 120,

  bodyKg: 80,
  suitKg: 80,
  gravity: 0.38,
  etaFirm: 1.2,
  etaSand: 2.1,
  offPath: 0.6,
  restWatts: 120,
  workWatts: 250,
  workSeconds: 30 * 60,
  tankJoules: 250 * 8 * 3600, // an 8 hour walk at an average of 250 W
  joulesPerGramO2: 14300,
  reserve: 0.2,

  mixWeight: 1,
  custom: { time: 1, o2: 1, locate: 1 },
};
