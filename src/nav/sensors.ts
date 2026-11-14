/**
 * Simulated suit sensors. They look at the astronaut's TRUE motion and return what real
 * instruments would report: close, but never perfect. Wayfinder only ever sees these outputs.
 *
 * Error sizes are typical of real hardware:
 *  - step length: a few percent off, and the error wanders over minutes as terrain, slope
 *    and fatigue change the stride (the usual accuracy of pedestrian dead reckoning);
 *  - gyro heading: drifts by roughly 10-20 degrees per hour (small MEMS gyro) with no
 *    magnetic compass to correct it, because Mars has no global magnetic field;
 *  - sun sensor: about 1 degree, worse when the sun is high (its direction along the ground
 *    is then poorly defined) and in dust, lost when the sun disc is hidden;
 *  - landmark camera: about 2 degrees in bearing to a recognised landmark.
 */
import { DEG, Rng, wrap } from "./rng.ts";

export interface SensorConfig {
  strideBiasSigma: number;
  /** how quickly the stride error wanders, seconds of mission time */
  strideBiasTau: number;
  strideNoise: number;
  gyroBiasSigma: number; // rad per second of mission time (steady drift rate)
  gyroNoise: number; // rad per sqrt(second)
  sunSigma: number; // rad, clear sky, sun low
  landmarkSigma: number; // rad
}

export const DEFAULT_SENSORS: SensorConfig = {
  strideBiasSigma: 0.04,
  strideBiasTau: 240,
  strideNoise: 0.05,
  gyroBiasSigma: (15 * DEG) / 3600,
  gyroNoise: 0.02 * DEG,
  sunSigma: 1.0 * DEG,
  landmarkSigma: 2.0 * DEG,
};

export class SensorSim {
  private rng: Rng;
  private strideBias: number;
  private gyroBias: number;
  /** heading as integrated by the gyro (starts aligned with the truth) */
  gyroHeading: number;
  private lastTrueYaw: number;
  readonly cfg: SensorConfig;

  constructor(seed: number, trueYaw: number, cfg: SensorConfig = DEFAULT_SENSORS) {
    this.cfg = cfg;
    this.rng = new Rng(seed);
    this.strideBias = this.rng.gauss(cfg.strideBiasSigma);
    this.gyroBias = this.rng.gauss(cfg.gyroBiasSigma);
    this.gyroHeading = trueYaw + this.rng.gauss(1.0 * DEG); // initial alignment error
    this.lastTrueYaw = trueYaw;
  }

  /**
   * Advance by dt seconds of mission time. Returns the pedometer distance for the true
   * distance walked and updates the gyro heading from the true change in heading.
   */
  motion(trueDist: number, trueYaw: number, dt: number): { dist: number; gyroHeading: number } {
    const dYaw = wrap(trueYaw - this.lastTrueYaw);
    this.lastTrueYaw = trueYaw;
    this.gyroHeading += dYaw + this.gyroBias * dt + this.rng.gauss(this.cfg.gyroNoise) * Math.sqrt(dt);
    const { strideBiasSigma: sb, strideBiasTau: tau } = this.cfg;
    this.strideBias += (-this.strideBias / tau) * dt + this.rng.gauss(sb * Math.sqrt((2 * dt) / tau));
    const dist = trueDist > 0 ? trueDist * (1 + this.strideBias + this.rng.gauss(this.cfg.strideNoise)) : 0;
    return { dist, gyroHeading: this.gyroHeading };
  }

  /** How well the sun sensor works right now (sigma in radians), or null if the sun is lost. */
  sunSigma(sunElevationDeg: number, dust: number): number | null {
    if (sunElevationDeg < 3 || sunElevationDeg > 80 || dust > 0.4) return null;
    return (this.cfg.sunSigma / Math.max(Math.cos(sunElevationDeg * DEG), 0.2)) * (1 + 8 * dust);
  }

  /** Measured direction of the sun relative to where the astronaut faces (radians, + = to the right). */
  sunBearing(trueYaw: number, sunAzimuthDeg: number, sigma: number): number {
    return wrap(sunAzimuthDeg * DEG - trueYaw + this.rng.gauss(sigma));
  }

  /** Measured direction of a landmark relative to where the astronaut faces. */
  landmarkBearing(trueYaw: number, trueBearing: number): number {
    return wrap(trueBearing - trueYaw + this.rng.gauss(this.cfg.landmarkSigma));
  }
}
