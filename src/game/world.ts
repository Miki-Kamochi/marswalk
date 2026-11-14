/** The Mars world: real terrain, backdrop, sky, sun and a few placeholder objects. */
import * as THREE from "three";
import { Frame, toLonLat } from "../data/frame";
import {
  HeightGrid,
  loadGrid,
  loadJson,
  loadMeta,
  loadRaster,
  type Bounds,
  type Meta,
  type Place,
  type Positions,
  type Traverse,
} from "../data/loader";
import { sunPosition } from "../nav/sun";
import { buildTerrain, elevationTint, facetHeight, rasterColor } from "./terrainMesh";

export const HAZE = new THREE.Color(0xd4a076);
const CLEAR_FOG = 0.00002;

function inside(b: Bounds, e: number, n: number, margin = 0): boolean {
  return e > b.west + margin && e < b.east - margin && n > b.south + margin && n < b.north - margin;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly fog = new THREE.FogExp2(HAZE, CLEAR_FOG);
  readonly sunLight = new THREE.DirectionalLight(0xfff0dc, 2.6);
  readonly skyLight = new THREE.HemisphereLight(0xe9c7a4, 0x5c3b28, 1.0);
  private sunDisc: THREE.Sprite;
  /** current sun direction in the sky */
  sun = { azimuth: 0, elevation: 45 };
  /** the drawn play-area terrain (the route simulator recolours it with map layers) */
  playMesh = new THREE.Group();

  private constructor(
    readonly meta: Meta,
    readonly frame: Frame,
    readonly play: HeightGrid,
    readonly surround: HeightGrid,
    readonly mid: HeightGrid,
    readonly far: HeightGrid,
    readonly positions: Positions,
    readonly traverse: Traverse,
    /** grid step used for the drawn play-area mesh */
    readonly step: number,
  ) {
    this.scene.background = HAZE.clone();
    this.scene.fog = this.fog;
    this.scene.add(this.sunLight, this.sunLight.target, this.skyLight);
    this.sunDisc = makeSunDisc();
    this.scene.add(this.sunDisc);
  }

  static async load(onProgress: (msg: string) => void, lowDetail: boolean): Promise<World> {
    onProgress("Loading map of Gale Crater…");
    const meta = await loadMeta();
    const frame = new Frame(meta.frame.origin);
    const [play, surround, mid, far, positions, traverse] = await Promise.all([
      loadGrid(meta.grids.play),
      loadGrid(meta.grids.surround),
      loadGrid(meta.grids.mid),
      loadGrid(meta.grids.far),
      loadJson<Positions>("positions.json"),
      loadJson<Traverse>("traverse.json"),
    ]);
    onProgress("Loading HiRISE imagery…");
    const [color, surroundImg] = await Promise.all([
      loadRaster(meta.images.color.file, meta.images.color.bounds),
      loadRaster(meta.images.surround.file, meta.images.surround.bounds),
    ]);
    onProgress("Building terrain…");
    await new Promise((r) => setTimeout(r, 0));
    const step = lowDetail ? 6 : 3; // 12 m or 6 m triangles
    const w = new World(meta, frame, play, surround, mid, far, positions, traverse, step);
    const playB = meta.frame.play;
    const fetchB = meta.frame.fetch;
    const k = lowDetail ? 2 : 1;
    w.playMesh = buildTerrain(play, frame, { step, color: rasterColor(color, elevationTint), chunkCells: 48 });
    w.scene.add(
      w.playMesh,
      buildTerrain(surround, frame, {
        step: 2 * k,
        color: rasterColor(surroundImg, elevationTint),
        skip: (e, n) => inside(playB, e, n, 30),
        lift: -0.6,
        chunkCells: 64,
      }),
      buildTerrain(mid, frame, {
        step: 2 * k,
        color: elevationTint,
        skip: (e, n) => inside(fetchB, e, n, 150),
        lift: -3,
        curvature: true,
        chunkCells: 96,
      }),
      buildTerrain(far, frame, {
        step: 2 * k,
        color: elevationTint,
        // leave out a MOLA cell only where the finer grid really covers all of it
        skip: (e, n, half) => {
          const r = half + 400;
          for (const [de, dn] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r], [-r, 0], [r, 0], [0, -r], [0, r]]) {
            if (Number.isNaN(mid.sample(e + de, n + dn))) return false;
          }
          return true;
        },
        lift: -30,
        curvature: true,
      }),
    );
    return w;
  }

  place(id: string): Place {
    const p = this.positions.places.find((p) => p.id === id);
    if (!p) throw new Error(`unknown place ${id}`);
    return p;
  }

  /** Ground height (real elevation, m) of the drawn surface at a map position. */
  groundElevation(e: number, n: number): number {
    const z = facetHeight(this.play, this.step, e, n);
    return Number.isNaN(z) ? this.surround.sample(e, n) : z;
  }

  /** Smooth elevation from the full-resolution data (for navigation maths, not for standing on). */
  dataElevation(e: number, n: number): number {
    for (const g of [this.play, this.surround, this.mid, this.far]) {
      const z = g.sample(e, n);
      if (!Number.isNaN(z)) return z;
    }
    return NaN;
  }

  worldPos(e: number, n: number, above = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.frame.toWorldX(e), this.frame.toWorldY(this.groundElevation(e, n)) + above, this.frame.toWorldZ(n));
  }

  /** Keep a position inside the playable area. */
  clamp(e: number, n: number, margin = 60): [number, number] {
    const b = this.meta.frame.play;
    return [
      Math.min(Math.max(e, b.west + margin), b.east - margin),
      Math.min(Math.max(n, b.south + margin), b.north - margin),
    ];
  }

  /**
   * Put the sun where it really is for this instant at this spot, and set the dust level.
   * dust 0 = clear day, 1 = inside a dust storm.
   */
  setSky(utcMs: number, e: number, n: number, dust: number, camera: THREE.Camera) {
    const ll = toLonLat(e, n);
    const s = sunPosition(utcMs, ll.lat, ll.lon);
    this.sun = { azimuth: s.azimuth, elevation: s.elevation };
    const az = THREE.MathUtils.degToRad(s.azimuth);
    const el = THREE.MathUtils.degToRad(Math.max(s.elevation, 2));
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sunLight.position.copy(camera.position).addScaledVector(dir, 1000);
    this.sunLight.target.position.copy(camera.position);
    const day = THREE.MathUtils.clamp((s.elevation + 4) / 20, 0, 1);
    this.sunLight.intensity = 2.6 * day * (1 - 0.9 * dust);
    this.skyLight.intensity = (0.35 + 0.65 * day) * (1 - 0.35 * dust);
    this.sunDisc.position.copy(camera.position).addScaledVector(dir, 5000);
    (this.sunDisc.material as THREE.SpriteMaterial).opacity = day * Math.max(0, 1 - dust * 1.6);
    // haze: clear-day view of tens of km down to a few tens of metres in the storm
    this.fog.density = CLEAR_FOG * Math.pow(0.045 / CLEAR_FOG, dust);
    const sky = HAZE.clone().multiplyScalar(0.35 + 0.65 * day).lerp(new THREE.Color(0x8a5a36), dust * 0.75);
    (this.scene.background as THREE.Color).copy(sky);
    this.fog.color.copy(sky);
  }
}

function makeSunDisc(): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,245,1)");
  g.addColorStop(0.18, "rgba(255,250,235,0.95)");
  g.addColorStop(0.3, "rgba(215,225,255,0.35)"); // the sun's halo is bluish on Mars
  g.addColorStop(1, "rgba(215,225,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), fog: false, depthTest: true, transparent: true }),
  );
  s.scale.setScalar(420);
  return s;
}
