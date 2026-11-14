/**
 * The 3D site view on the EVA briefing screen: the real Gale Crater terrain (the same faceted
 * mesh as the planner) with the planned routes drawn on it. The camera eases between views
 * (the whole walk, or one science stop), drifts slowly, and follows the pointer a little.
 */
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { toLonLat } from "../data/frame";
import { nextLocalTime } from "../nav/sun";
import { World } from "../world/world";

/** A camera position and the point it looks at, in map metres; heights are above the ground. */
export interface View {
  pos: [number, number, number];
  look: [number, number, number];
  /** sideways drift while idle, metres */
  drift: number;
}

/** The whole walk from Base Camp to Vera Rubin Ridge, seen from the north. */
export const OVERVIEW: View = { pos: [8141700, -275700, 2300], look: [8142200, -278450, 0], drift: 60 };

/** A close view of one place, from the north-west and above. */
export function viewOf(e: number, n: number): View {
  return { pos: [e - 330, n + 430, 230], look: [e, n, 10], drift: 25 };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class SiteView {
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(42, 1, 1, 400000);
  private world: World;
  private reduced: boolean;
  private utc: number;
  private view: View = OVERVIEW;
  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private to = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private look = new THREE.Vector3();
  private moveStart = -1;
  private pointer = new THREE.Vector2();
  private smooth = new THREE.Vector2();
  private routes = new THREE.Group();
  private markers = new THREE.Group();
  private elapsed = 0;
  private clock = performance.now();
  private host: HTMLElement;
  private started = false;

  static async create(host: HTMLElement, reduced: boolean): Promise<SiteView> {
    const low = matchMedia("(pointer: coarse)").matches;
    const world = await World.load(() => {}, low);
    return new SiteView(host, world, reduced, low);
  }

  private constructor(host: HTMLElement, world: World, reduced: boolean, low: boolean) {
    this.host = host;
    this.world = world;
    this.reduced = reduced;
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.25 : 2));
    host.appendChild(this.renderer.domElement);

    // mid-afternoon at Gale, so the relief casts readable shadows
    const base = world.place("base");
    this.utc = nextLocalTime(Date.UTC(2041, 0, 1), toLonLat(base.easting, base.northing).lon, 15.5);
    world.scene.add(this.routes, this.markers);

    this.place(OVERVIEW, this.to);
    this.from.pos.copy(this.to.pos);
    this.from.look.copy(this.to.look);
    this.resize();
  }

  private point(e: number, n: number, above: number, out: THREE.Vector3): THREE.Vector3 {
    const f = this.world.frame;
    const g = this.world.dataElevation(e, n);
    return out.set(f.toWorldX(e), f.toWorldY(Number.isNaN(g) ? -4300 : g) + above, f.toWorldZ(n));
  }

  private place(v: View, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void {
    this.point(v.pos[0], v.pos[1], v.pos[2], out.pos);
    this.point(v.look[0], v.look[1], v.look[2], out.look);
  }

  /** Ease the camera to another view. */
  setView(v: View): void {
    this.from.pos.copy(this.started ? this.camera.position : this.to.pos);
    this.from.look.copy(this.look);
    this.view = v;
    this.place(v, this.to);
    this.moveStart = this.reduced ? -1 : performance.now();
    if (this.reduced) {
      this.from.pos.copy(this.to.pos);
      this.from.look.copy(this.to.look);
    }
  }

  /** Pointer position over the view, -1..1 on both axes; (0, 0) when it leaves. */
  setPointer(x: number, y: number): void {
    this.pointer.set(x, y);
  }

  /** Draw routes as lines on the ground: the recommended one in the accent colour. */
  addRoutes(routes: { profile: string; points: [number, number][] }[], recommended: string): void {
    for (const r of [...routes].sort((a) => (a.profile === recommended ? 1 : -1))) {
      const rec = r.profile === recommended;
      const v = new THREE.Vector3();
      const pts: number[] = [];
      for (const [e, n] of r.points) {
        this.world.worldPos(e, n, 3, v);
        pts.push(v.x, v.y, v.z);
      }
      const geo = new LineGeometry();
      geo.setPositions(pts);
      const line = new Line2(
        geo,
        new LineMaterial({ color: rec ? 0xff6b2c : 0xf4ede6, linewidth: rec ? 4 : 1.5, transparent: true, opacity: rec ? 1 : 0.6, fog: false }),
      );
      line.renderOrder = rec ? 6 : 5;
      this.routes.add(line);
    }
  }

  /** A marker that keeps the same size on screen: a filled square with a dark outline. */
  addMarker(e: number, n: number, color: string): void {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#0d0b0a";
    c.fillRect(6, 6, 20, 20);
    c.fillStyle = color;
    c.fillRect(9, 9, 14, 14);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, fog: false }),
    );
    s.scale.setScalar(0.032);
    s.renderOrder = 10;
    this.world.worldPos(e, n, 4, s.position);
    this.markers.add(s);
  }

  frame(now: number): void {
    const dt = Math.min(0.05, (now - this.clock) / 1000);
    this.clock = now;
    this.elapsed += dt;
    this.started = true;
    let k = 1;
    if (this.moveStart >= 0) {
      k = Math.min(1, (now - this.moveStart) / 1800);
      if (k >= 1) this.moveStart = -1;
    }
    const e = ease(k);
    const pos = this.camera.position.lerpVectors(this.from.pos, this.to.pos, e);
    this.look.lerpVectors(this.from.look, this.to.look, e);

    const fwd = new THREE.Vector3().subVectors(this.look, pos).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    this.smooth.lerp(this.pointer, this.reduced ? 1 : Math.min(1, dt * 2));
    const par = this.reduced ? 0 : Math.min(pos.distanceTo(this.look) * 0.02, 40);
    const drift = this.reduced ? 0 : Math.sin(this.elapsed * 0.08) * this.view.drift;
    pos.addScaledVector(right, drift + this.smooth.x * par);
    pos.y -= this.smooth.y * par * 0.5;

    const f = this.world.frame;
    const g = this.world.dataElevation(f.toEasting(pos.x), f.toNorthing(pos.z));
    if (!Number.isNaN(g)) pos.y = Math.max(pos.y, f.toWorldY(g) + 2);
    this.camera.lookAt(this.look);
    this.world.setSky(this.utc, f.toEasting(pos.x), f.toNorthing(pos.z), 0, this.camera);
    this.renderer.render(this.world.scene, this.camera);
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
