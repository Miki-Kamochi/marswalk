/**
 * The moving background of the home screen: the real Gale Crater terrain (the same faceted
 * mesh as the planner and the walk preview), a camera that drifts and follows the pointer,
 * blowing dust, and one camera "shot" per menu item. The planner's shot shows the planned
 * routes and markers for Base Camp and the science stops.
 */
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { toLonLat } from "../data/frame";
import { nextLocalTime, sunPosition } from "../nav/sun";
import { World } from "../world/world";

export type ShotId = "title" | "planner" | "game" | "how" | "credits";

/** A camera position and the point it looks at, in map metres; heights are above the ground. */
interface Shot {
  pos: [number, number, number];
  look: [number, number, number];
  /** sideways drift while idle, metres */
  drift: number;
}

const SHOTS: Record<ShotId, Shot> = {
  // from the north-west corner across the buttes to Vera Rubin Ridge, Mount Sharp behind
  title: { pos: [8141000, -277450, 300], look: [8143300, -280500, 40], drift: 120 },
  // high above Base Camp, looking down the whole walk
  planner: { pos: [8143000, -275700, 1600], look: [8143300, -278500, 0], drift: 50 },
  // standing next to Base Camp, looking towards the ridge
  game: { pos: [8141650, -277700, 2.2], look: [8142816, -280120, 70], drift: 3 },
  // straight down on the map area from 2.3 km up, like the planner's 2D map
  how: { pos: [8142050, -278750, 2100], look: [8142050, -279250, 0], drift: 60 },
  // up on Vera Rubin Ridge, looking at Mount Sharp
  credits: { pos: [8142900, -280300, 60], look: [8171517, -318840, -1500], drift: 20 },
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface Readout {
  lat: number;
  lon: number;
  elevation: number;
  ltst: number;
  ls: number;
}

export class HomeScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(50, 1, 1, 400000);
  private world: World;
  private reduced: boolean;
  private utc: number;
  private shot: ShotId = "title";
  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private to = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private moveStart = -1;
  private moveTime = 2400;
  private pointer = new THREE.Vector2();
  private smooth = new THREE.Vector2();
  private dust: THREE.Points;
  private routes = new THREE.Group();
  private markers = new THREE.Group();
  private clock = performance.now();

  static async create(host: HTMLElement, reduced: boolean): Promise<HomeScene> {
    const low = matchMedia("(pointer: coarse)").matches || innerWidth < 900;
    // 16 m triangles: the same faceted, low-poly look as the walk preview
    const world = await World.load(() => {}, low, 8);
    return new HomeScene(host, world, reduced, low);
  }

  private constructor(host: HTMLElement, world: World, reduced: boolean, low: boolean) {
    this.world = world;
    this.reduced = reduced;
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.25 : 1.75));
    this.canvas = this.renderer.domElement;
    host.appendChild(this.canvas);

    // late afternoon at Gale: low sun, long shadows
    const base = world.place("base");
    this.utc = nextLocalTime(Date.UTC(2041, 0, 1), toLonLat(base.easting, base.northing).lon, 16.6);

    this.dust = this.makeDust();
    world.scene.add(this.dust, this.routes, this.markers);
    this.routes.visible = false;
    this.markers.visible = false;

    this.place(SHOTS.title, this.to);
    this.from.pos.copy(this.to.pos);
    this.from.look.copy(this.to.look);
    this.resize();
  }

  // ------------------------------------------------------------ shots
  private point(e: number, n: number, above: number, out: THREE.Vector3): THREE.Vector3 {
    const f = this.world.frame;
    const g = this.world.dataElevation(e, n);
    return out.set(f.toWorldX(e), f.toWorldY(Number.isNaN(g) ? -4300 : g) + above, f.toWorldZ(n));
  }

  private place(s: Shot, out: { pos: THREE.Vector3; look: THREE.Vector3 }): void {
    this.point(s.pos[0], s.pos[1], s.pos[2], out.pos);
    this.point(s.look[0], s.look[1], s.look[2], out.look);
  }

  /** Fly the camera to a menu item's view. */
  setShot(id: ShotId): void {
    if (id === this.shot && this.moveStart < 0) return;
    this.from.pos.copy(this.camera.position);
    this.from.look.copy(this.currentLook);
    this.shot = id;
    this.place(SHOTS[id], this.to);
    this.moveStart = this.reduced ? -1 : performance.now();
    if (this.reduced) {
      this.from.pos.copy(this.to.pos);
      this.from.look.copy(this.to.look);
    }
    this.routes.visible = id === "planner";
    this.markers.visible = id === "planner";
  }

  /** Pointer position, -1..1 on both axes. */
  setPointer(x: number, y: number): void {
    this.pointer.set(x, y);
  }

  // ------------------------------------------------------------ routes from the home data
  addRoutes(routes: { profile: string; points: [number, number][] }[]): void {
    for (const r of [...routes].sort((a) => (a.profile === "mix" ? 1 : -1))) {
      const rec = r.profile === "mix";
      const pts: number[] = [];
      const v = new THREE.Vector3();
      for (const [e, n] of r.points) {
        this.world.worldPos(e, n, 3, v);
        pts.push(v.x, v.y, v.z);
      }
      const geo = new LineGeometry();
      geo.setPositions(pts);
      const mat = new LineMaterial({
        color: rec ? 0xff6b2c : 0xf4ede6,
        linewidth: rec ? 4 : 1.5,
        transparent: true,
        opacity: rec ? 1 : 0.55,
        fog: false,
      });
      const line = new Line2(geo, mat);
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
    s.scale.setScalar(0.03);
    s.renderOrder = 10;
    this.world.worldPos(e, n, 4, s.position);
    this.markers.add(s);
  }

  // ------------------------------------------------------------ dust
  private makeDust(): THREE.Points {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xe8b48c, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    return p;
  }

  private moveDust(dt: number): void {
    const a = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const wrap = (v: number, h: number) => ((((v + h) % (2 * h)) + 2 * h) % (2 * h)) - h;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = wrap(arr[i] + dt * 7, 60);
      arr[i + 1] = wrap(arr[i + 1] + dt * Math.sin(i * 0.37 + this.elapsed * 0.6) * 0.6, 30);
      arr[i + 2] = wrap(arr[i + 2] + dt * 2.5, 60);
    }
    a.needsUpdate = true;
    this.dust.position.copy(this.camera.position);
  }

  // ------------------------------------------------------------ frame
  private currentLook = new THREE.Vector3();
  private elapsed = 0;

  frame(now: number): void {
    const dt = Math.min(0.05, (now - this.clock) / 1000);
    this.clock = now;
    this.elapsed += dt;
    let k = 1;
    if (this.moveStart >= 0) {
      k = Math.min(1, (now - this.moveStart) / this.moveTime);
      if (k >= 1) this.moveStart = -1;
    }
    const e = ease(k);
    const pos = this.camera.position.lerpVectors(this.from.pos, this.to.pos, e);
    this.currentLook.lerpVectors(this.from.look, this.to.look, e);

    // idle drift sideways, and a little parallax towards the pointer
    const fwd = new THREE.Vector3().subVectors(this.currentLook, pos).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const s = SHOTS[this.shot];
    const drift = this.reduced ? 0 : Math.sin(this.elapsed * 0.06) * s.drift;
    this.smooth.lerp(this.pointer, this.reduced ? 1 : Math.min(1, dt * 2.5));
    const dist = pos.distanceTo(this.currentLook);
    const par = this.reduced ? 0 : Math.min(dist * 0.025, 60);
    pos.addScaledVector(right, drift + this.smooth.x * par);
    pos.y += -this.smooth.y * par * 0.5;

    // never below the ground
    const f = this.world.frame;
    const g = this.world.dataElevation(f.toEasting(pos.x), f.toNorthing(pos.z));
    if (!Number.isNaN(g)) pos.y = Math.max(pos.y, f.toWorldY(g) + 1.6);
    this.camera.lookAt(this.currentLook);

    if (!this.reduced) this.moveDust(dt);
    this.world.setSky(this.utc, f.toEasting(pos.x), f.toNorthing(pos.z), 0, this.camera);
    this.renderer.render(this.world.scene, this.camera);
  }

  /** Where the camera is looking: shown in the corner of the screen. */
  readout(): Readout {
    const f = this.world.frame;
    const e = f.toEasting(this.currentLook.x);
    const n = f.toNorthing(this.currentLook.z);
    const ll = toLonLat(e, n);
    const sun = sunPosition(this.utc, ll.lat, ll.lon);
    return { lat: ll.lat, lon: ll.lon, elevation: this.world.dataElevation(e, n), ltst: sun.ltst, ls: sun.ls };
  }

  resize(): void {
    const w = this.canvas.parentElement!.clientWidth;
    const h = this.canvas.parentElement!.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const l of this.routes.children) (l as Line2).material.resolution.set(w, h);
  }
}
