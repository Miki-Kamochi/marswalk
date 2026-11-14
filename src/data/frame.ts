/**
 * Coordinate frames.
 *
 * Map frame  : Mars equirectangular metres (easting E, northing N), sphere R = 3 396 190 m.
 *              This is the frame of the NASA/USGS Gale mosaics and Curiosity's waypoints.
 * World frame: three.js metres, local to the play area.
 *              x = east, y = up, z = south  (so north is -z).
 */
export const MARS_RADIUS = 3396190;

export interface Origin {
  easting: number;
  northing: number;
  elevation: number;
}

export class Frame {
  constructor(readonly origin: Origin) {}

  toWorldX(easting: number): number {
    return easting - this.origin.easting;
  }
  toWorldZ(northing: number): number {
    return -(northing - this.origin.northing);
  }
  toWorldY(elevation: number): number {
    return elevation - this.origin.elevation;
  }
  toEasting(x: number): number {
    return x + this.origin.easting;
  }
  toNorthing(z: number): number {
    return this.origin.northing - z;
  }
  toElevation(y: number): number {
    return y + this.origin.elevation;
  }
}

export function toLonLat(easting: number, northing: number): { lon: number; lat: number } {
  return {
    lon: (easting / MARS_RADIUS) * (180 / Math.PI),
    lat: (northing / MARS_RADIUS) * (180 / Math.PI),
  };
}

/** How far the ground has curved away below a flat plane at horizontal distance d (metres). */
export function curvatureDrop(d: number): number {
  return (d * d) / (2 * MARS_RADIUS);
}
