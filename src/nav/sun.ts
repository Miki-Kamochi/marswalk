/**
 * Where the sun is in the Martian sky, following NASA GISS "Mars24"
 * (Allison & McEwen 2000, "A post-Pathfinder evaluation of areocentric solar coordinates").
 * Pure maths, no dependencies, so it can be unit-tested and questioned by an expert.
 */
const RAD = Math.PI / 180;
const cosd = (d: number) => Math.cos(d * RAD);
const sind = (d: number) => Math.sin(d * RAD);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Length of a Mars solar day in Earth days. */
export const SOL_IN_DAYS = 1.0274912517;

/** Terrestrial Time minus UTC, seconds (32.184 s plus the leap seconds in force at that date). */
function ttMinusUtc(utcMs: number): number {
  const steps: [number, number][] = [
    [Date.UTC(2017, 0, 1), 69.184],
    [Date.UTC(2015, 6, 1), 68.184],
    [Date.UTC(2012, 6, 1), 67.184],
    [Date.UTC(2009, 0, 1), 66.184],
    [Date.UTC(2006, 0, 1), 65.184],
  ];
  for (const [from, v] of steps) if (utcMs >= from) return v;
  return 64.184;
}

// planetary perturbation terms: amplitude (deg), period (Julian years), phase (deg)
const PBS: [number, number, number][] = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
];

export interface MarsTime {
  /** areocentric solar longitude (season), degrees: 0 = northern spring equinox */
  ls: number;
  /** equation of time, degrees */
  eotDeg: number;
  /** Mars Sol Date */
  msd: number;
  /** Coordinated Mars Time (mean solar time at the prime meridian), hours */
  mtc: number;
  /** solar declination, degrees */
  declination: number;
}

export function marsTime(utcMs: number): MarsTime {
  const jdTT = utcMs / 86400000 + 2440587.5 + ttMinusUtc(utcMs) / 86400;
  const dt = jdTT - 2451545.0;
  const M = 19.3871 + 0.52402073 * dt; // mean anomaly
  const alphaFMS = 270.3871 + 0.524038496 * dt; // angle of fictitious mean sun
  let pbs = 0;
  for (const [a, tau, phi] of PBS) pbs += a * cosd((0.985626 * dt) / tau + phi);
  const nuMinusM =
    (10.691 + 3.0e-7 * dt) * sind(M) +
    0.623 * sind(2 * M) +
    0.05 * sind(3 * M) +
    0.005 * sind(4 * M) +
    0.0005 * sind(5 * M) +
    pbs;
  const ls = mod(alphaFMS + nuMinusM, 360);
  const eotDeg = 2.861 * sind(2 * ls) - 0.071 * sind(4 * ls) + 0.002 * sind(6 * ls) - nuMinusM;
  const msd = (jdTT - 2451549.5) / SOL_IN_DAYS + 44796.0 - 0.0009626;
  const mtc = mod(24 * msd, 24);
  const declination = Math.asin(0.42565 * sind(ls)) / RAD + 0.25 * sind(ls);
  return { ls, eotDeg, msd, mtc, declination };
}

export interface SunPosition extends MarsTime {
  /** degrees clockwise from north */
  azimuth: number;
  /** degrees above the horizon (negative = below) */
  elevation: number;
  /** local true solar time, hours */
  ltst: number;
}

/** Sun direction for an observer at planetocentric latitude / east longitude (degrees). */
export function sunPosition(utcMs: number, latDeg: number, lonEastDeg: number): SunPosition {
  const t = marsTime(utcMs);
  const lmst = mod(t.mtc + lonEastDeg / 15, 24); // local mean solar time
  const ltst = mod(lmst + t.eotDeg / 15, 24); // local true solar time
  const H = (ltst - 12) * 15; // hour angle, degrees, positive in the afternoon
  const sinEl = sind(t.declination) * sind(latDeg) + cosd(t.declination) * cosd(latDeg) * cosd(H);
  const elevation = Math.asin(sinEl) / RAD;
  const azimuth = mod(
    Math.atan2(
      -sind(H) * cosd(t.declination),
      cosd(latDeg) * sind(t.declination) - sind(latDeg) * cosd(t.declination) * cosd(H),
    ) / RAD,
    360,
  );
  return { ...t, azimuth, elevation, ltst };
}

/** The UTC instant, on or after `fromUtcMs`, when local true solar time at the site is `ltstHours`. */
export function nextLocalTime(fromUtcMs: number, lonEastDeg: number, ltstHours: number): number {
  let t = fromUtcMs;
  for (let i = 0; i < 6; i++) {
    const now = sunPosition(t, 0, lonEastDeg).ltst;
    let dh = ltstHours - now;
    if (i === 0) dh = mod(dh, 24);
    t += dh * 3600000 * SOL_IN_DAYS;
  }
  return t;
}
