/**
 * The planner's map: the polygon Gale Crater terrain (the same faceted mesh as the home screen
 * and the walk preview) with map-app controls. Layers colour whole facets: the shader looks up
 * the layer at each triangle's centre. "2D" is the same map seen straight from above.
 */
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { toLonLat } from "../data/frame";
import { nextLocalTime } from "../nav/sun";
import type { NavGrid } from "../plan/grid";
import type { Profile, Route } from "../plan/planner";
import { World } from "../world/world";
import { buildBlock } from "./block";

/** routes float this far above the ground, metres (the facets are 16 m wide) */
const LIFT = 4;
/** grid step of the drawn terrain (2 m samples): 16 m triangles */
const FACET = 8;
const ACCENT = "#ff6b2c";
const ALT = "#cdbfae";
/** the same walk without a plan (sim.css .naive uses the same colours) */
const NAIVE_LINE = "#ff6464";
const NAIVE_ROVER = "#7cc8ff";
/** what the far terrain fades into: the near-black of the page behind the stars (block view) */
const SPACE = new THREE.Color(0x050403);
/** the background of the surroundings view: the land fades into a warm near-black */
const DUSK = new THREE.Color(0x0d0b0a);

/** How the map sits on screen: a cut block in space, or with the land around it out to the crater rim. */
export type SceneMode = "block" | "land";
const TILT_3D = 0.95; // radians from straight down

export interface ViewEvents {
  /** the user clicked the ground at this map position */
  onPick(easting: number, northing: number): void;
  onHover(easting: number | null, northing: number | null): void;
  /** the camera turned: heading in radians (0 = north up), and whether the view is 2D */
  onCamera(heading: number, flat: boolean): void;
}

function cellTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // row 0 of the canvas is the northern edge
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function sprite(draw: (c: CanvasRenderingContext2D) => void, size: number, anchorY = 0.5): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  draw(cv.getContext("2d")!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, fog: false, transparent: true }));
  s.scale.setScalar(size);
  s.center.set(0.5, anchorY);
  s.renderOrder = 10;
  return s;
}

/** start: the habitat, a square in the base colour */
const drawStart = (c: CanvasRenderingContext2D) => {
  c.fillStyle = "#14110f";
  c.fillRect(10, 10, 44, 44);
  c.fillStyle = "#7cc8ff";
  c.fillRect(17, 17, 30, 30);
  c.fillStyle = "#14110f";
  c.fillRect(27, 27, 10, 10);
};
/** destination: a survey flag on a stake (anchored at the foot of the stake) */
const drawPin = (c: CanvasRenderingContext2D) => {
  c.fillStyle = "#14110f";
  c.fillRect(27, 4, 8, 60);
  c.beginPath();
  c.moveTo(31, 2);
  c.lineTo(60, 14);
  c.lineTo(31, 28);
  c.closePath();
  c.fill();
  c.fillStyle = "#ece4da";
  c.fillRect(29, 6, 4, 58);
  c.fillStyle = ACCENT;
  c.beginPath();
  c.moveTo(33, 7);
  c.lineTo(53, 15);
  c.lineTo(33, 23);
  c.closePath();
  c.fill();
};
/** photo check: a small diamond */
const drawCheck = (c: CanvasRenderingContext2D) => {
  c.fillStyle = "#14110f";
  c.beginPath();
  c.moveTo(32, 6);
  c.lineTo(58, 32);
  c.lineTo(32, 58);
  c.lineTo(6, 32);
  c.closePath();
  c.fill();
  c.fillStyle = "#ece4da";
  c.beginPath();
  c.moveTo(32, 16);
  c.lineTo(48, 32);
  c.lineTo(32, 48);
  c.lineTo(16, 32);
  c.closePath();
  c.fill();
};
const drawStop = (c: CanvasRenderingContext2D) => {
  c.fillStyle = "#14110f";
  c.fillRect(14, 14, 36, 36);
  c.fillStyle = "#ffd166";
  c.fillRect(20, 20, 24, 24);
};

const ease = (t: number) => 1 - (1 - t) ** 3;

export class View3D {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private controls: MapControls;
  private uniforms = {
    uOverlay: { value: cellTexture() },
    uLimit: { value: cellTexture() },
    uOverlayOn: { value: 0 },
    uLimitOn: { value: 0 },
    uBounds: { value: new THREE.Vector4() },
  };
  private routes = new THREE.Group();
  private ends = new THREE.Group();
  private places = new THREE.Group();
  private traverse = new THREE.Group();
  private naive = new THREE.Group();
  private block = new THREE.Group();
  private mode: SceneMode = "block";
  private landBg = new THREE.Color();
  private pending = false;
  private utc: number;
  private el: HTMLElement;
  private world: World;
  private grid: NavGrid;
  private ev: ViewEvents;
  private flat = false;
  private tween: { t0: number; pos0: THREE.Vector3; tgt0: THREE.Vector3; pos1: THREE.Vector3; tgt1: THREE.Vector3 } | null = null;

  static async create(el: HTMLElement, grid: NavGrid, ev: ViewEvents): Promise<View3D> {
    const low = matchMedia("(pointer: coarse)").matches;
    const world = await World.load(() => {}, low, FACET);
    return new View3D(el, world, grid, ev, low);
  }

  private constructor(el: HTMLElement, world: World, grid: NavGrid, ev: ViewEvents, low: boolean) {
    this.el = el;
    this.world = world;
    this.grid = grid;
    this.ev = ev;
    // transparent: the page's star field shows around the block
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: true, logarithmicDepthBuffer: true }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
    el.appendChild(renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 2, 400000);

    // layers: look up the layer at the triangle's centre, so each facet gets one colour
    const play = world.meta.frame.play;
    const f = world.frame;
    this.uniforms.uBounds.value.set(f.toWorldX(play.west), f.toWorldZ(play.north), play.east - play.west, play.north - play.south);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 center;\nuniform vec4 uBounds;\nvarying vec2 vCell;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCell = (center - uBounds.xy) / uBounds.zw;");
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D uOverlay;\nuniform sampler2D uLimit;\nuniform float uOverlayOn;\nuniform float uLimitOn;\nvarying vec2 vCell;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          if (vCell.x >= 0.0 && vCell.x <= 1.0 && vCell.y >= 0.0 && vCell.y <= 1.0) {
            if (uOverlayOn > 0.5) { vec4 o = texture2D(uOverlay, vCell); diffuseColor.rgb = mix(diffuseColor.rgb, o.rgb, o.a); }
            if (uLimitOn > 0.5) { vec4 m = texture2D(uLimit, vCell); diffuseColor.rgb = mix(diffuseColor.rgb, m.rgb, m.a); }
          }`,
        );
    };
    world.playMesh.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = mat;
    });
    this.block = buildBlock(world.play, world.frame, FACET);
    world.scene.add(this.block, this.routes, this.naive, this.ends, this.places, this.traverse);
    world.sunDisc.visible = false;
    this.setScene("block");

    for (const p of world.positions.places) {
      if (p.kind !== "stop") continue;
      const s = sprite(drawStop, 0.024);
      s.position.copy(world.worldPos(p.easting, p.northing, LIFT));
      this.places.add(s);
    }
    const fb = world.meta.frame.fetch;
    const path = world.traverse.waypoints.filter((w) => w[1] > fb.west && w[1] < fb.east && w[2] > fb.south && w[2] < fb.north);
    // skip the odd waypoint with no elevation under it (a gap in the elevation model)
    const pts = path.map((w) => world.worldPos(w[1], w[2], LIFT)).filter((v) => Number.isFinite(v.y));
    if (pts.length > 1) this.traverse.add(this.line(pts, "#ffffff", 1.5, { opacity: 0.7, dashed: true }));
    this.traverse.visible = false;

    const base = world.place("base");
    this.utc = nextLocalTime(Date.UTC(2041, 0, 1), toLonLat(base.easting, base.northing).lon, 14);

    const controls = (this.controls = new MapControls(this.camera, renderer.domElement));
    controls.enableDamping = true;
    controls.dampingFactor = 0.14;
    controls.maxPolarAngle = 1.35;
    controls.minDistance = 80;
    controls.maxDistance = 11000;
    controls.zoomToCursor = true;
    controls.addEventListener("change", () => this.request());
    // start with the whole block in view, turned a little so two of its sides show
    const pb = world.meta.frame.play;
    const c = world.worldPos((pb.west + pb.east) / 2, (pb.north + pb.south) / 2, 0);
    c.y = world.frame.toWorldY(world.meta.frame.origin.elevation);
    controls.target.copy(c);
    this.camera.position.copy(this.offset(c, 6400, TILT_3D, -0.45));

    // a click that is not a drag picks the ground under the pointer
    let down: { x: number; y: number } | null = null;
    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", (e) => {
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      this.tween = null;
    });
    dom.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
        const hit = this.pick(e.clientX, e.clientY);
        if (hit) ev.onPick(hit[0], hit[1]);
      }
      down = null;
    });
    let hoverQueued = false;
    dom.addEventListener("pointermove", (e) => {
      if (e.buttons || hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        const hit = this.pick(e.clientX, e.clientY);
        ev.onHover(hit ? hit[0] : null, hit ? hit[1] : null);
      });
    });
    dom.addEventListener("pointerleave", () => ev.onHover(null, null));
    this.resize();
  }

  // ------------------------------------------------------------ camera
  /** Camera position at `dist` from target, tilted `tilt` from straight down, heading `heading` (0 = north up). */
  private offset(target: THREE.Vector3, dist: number, tilt: number, heading: number): THREE.Vector3 {
    const t = Math.max(tilt, 0.0005);
    return new THREE.Vector3(
      target.x - Math.sin(heading) * Math.sin(t) * dist,
      target.y + Math.cos(t) * dist,
      target.z + Math.cos(heading) * Math.sin(t) * dist,
    );
  }

  private heading(): number {
    const d = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    return Math.atan2(-d.x, d.z);
  }

  private flyTo(target: THREE.Vector3, dist: number, tilt: number, heading: number): void {
    this.tween = {
      t0: performance.now(),
      pos0: this.camera.position.clone(),
      tgt0: this.controls.target.clone(),
      pos1: this.offset(target, dist, tilt, heading),
      tgt1: target.clone(),
    };
    this.request();
  }

  /** Frame a set of cells (a route) so all of it is in view. */
  fitCells(cells: number[], padding = 1.35): void {
    if (!cells.length) return;
    const g = this.grid;
    let w = Infinity;
    let e = -Infinity;
    let s = Infinity;
    let n = -Infinity;
    for (const c of cells) {
      w = Math.min(w, g.east(c));
      e = Math.max(e, g.east(c));
      s = Math.min(s, g.northOf(c));
      n = Math.max(n, g.northOf(c));
    }
    const size = Math.max(e - w, (n - s) * this.camera.aspect, 300) * padding;
    const dist = size / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.max(this.camera.aspect, 1);
    const target = this.world.worldPos((w + e) / 2, (s + n) / 2, 0);
    this.flyTo(target, Math.min(dist * 1.15, this.controls.maxDistance), this.flat ? 0 : TILT_3D, this.flat ? 0 : this.heading());
  }

  /** Straight from above (true) or tilted (false). */
  setFlat(flat: boolean): void {
    this.flat = flat;
    this.controls.enableRotate = !flat;
    this.controls.maxPolarAngle = flat ? 0.0005 : 1.35;
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.flyTo(this.controls.target.clone(), dist, flat ? 0 : TILT_3D, flat ? 0 : this.heading());
  }

  /** Turn so north is up. */
  northUp(): void {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const tilt = this.flat ? 0 : this.controls.getPolarAngle();
    this.flyTo(this.controls.target.clone(), dist, tilt, 0);
  }

  zoom(factor: number): void {
    const dist = THREE.MathUtils.clamp(this.camera.position.distanceTo(this.controls.target) * factor, this.controls.minDistance, this.controls.maxDistance);
    this.flyTo(this.controls.target.clone(), dist, this.flat ? 0 : this.controls.getPolarAngle(), this.flat ? this.heading() : this.heading());
  }

  // ------------------------------------------------------------ picking
  /** Map position of the ground under a screen point, by walking along the view ray. */
  private pick(clientX: number, clientY: number): [number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const f = this.world.frame;
    const p = new THREE.Vector3();
    const above = (t: number): number => {
      p.copy(o).addScaledVector(d, t);
      const g = this.world.groundElevation(f.toEasting(p.x), f.toNorthing(p.z));
      return Number.isNaN(g) ? Infinity : p.y - f.toWorldY(g);
    };
    let t0 = 0;
    for (let t = 2; t < 30000; t += Math.max(3, t * 0.012)) {
      if (above(t) < 0) {
        let lo = t0;
        let hi = t;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          if (above(mid) < 0) hi = mid;
          else lo = mid;
        }
        p.copy(o).addScaledVector(d, hi);
        const e = f.toEasting(p.x);
        const n = f.toNorthing(p.z);
        return this.grid.index(e, n) >= 0 ? [e, n] : null;
      }
      t0 = t;
    }
    return null;
  }

  // ------------------------------------------------------------ drawing helpers
  private line(points: THREE.Vector3[], color: string, width: number, o: { opacity?: number; dashed?: boolean; xray?: boolean; order?: number; under?: boolean } = {}): Line2 {
    const flat = new Float32Array(points.length * 3);
    points.forEach((p, i) => p.toArray(flat, i * 3));
    const geo = new LineGeometry();
    geo.setPositions(flat);
    const mat = new LineMaterial({
      color,
      linewidth: width,
      transparent: true,
      opacity: o.opacity ?? 1,
      dashed: !!o.dashed,
      dashSize: 14,
      gapSize: 14,
      depthTest: !o.xray,
      // a casing must not hide the line drawn on top of it at the same depth
      depthWrite: !o.under,
      fog: false,
    });
    const l = new Line2(geo, mat);
    if (o.dashed) l.computeLineDistances();
    l.renderOrder = o.order ?? (o.xray ? 4 : 5);
    return l;
  }

  /** World positions along a chain of cells, close enough together to follow the facets. */
  private pathPoints(cells: number[]): THREE.Vector3[] {
    const g = this.grid;
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < cells.length; i++) {
      const e = g.east(cells[i]);
      const n = g.northOf(cells[i]);
      if (i > 0) {
        const e0 = g.east(cells[i - 1]);
        const n0 = g.northOf(cells[i - 1]);
        const parts = Math.ceil(Math.hypot(e - e0, n - n0) / 3);
        for (let k = 1; k < parts; k++) out.push(this.world.worldPos(e0 + ((e - e0) * k) / parts, n0 + ((n - n0) * k) / parts, LIFT));
      }
      out.push(this.world.worldPos(e, n, LIFT));
    }
    return out;
  }

  private clear(group: THREE.Group): void {
    for (const o of [...group.children]) {
      group.remove(o);
      if (o instanceof Line2) {
        o.geometry.dispose();
        o.material.dispose();
      }
    }
  }

  private setTexture(u: { value: THREE.CanvasTexture }, on: { value: number }, cv: HTMLCanvasElement | null): void {
    if (cv) {
      u.value.image = cv;
      u.value.needsUpdate = true;
    }
    on.value = cv ? 1 : 0;
    this.request();
  }

  // ------------------------------------------------------------ content
  setOverlay(cv: HTMLCanvasElement | null): void {
    this.setTexture(this.uniforms.uOverlay, this.uniforms.uOverlayOn, cv);
  }

  setLimit(cv: HTMLCanvasElement | null): void {
    this.setTexture(this.uniforms.uLimit, this.uniforms.uLimitOn, cv);
  }

  /** Routes like a map app: the selected one in the accent colour with a dark casing, the others grey. */
  setRoutes(routes: Route[], selected: Profile | null, back: number[]): void {
    this.clear(this.routes);
    const sel = routes.find((r) => r.profile === selected);
    for (const r of routes) {
      if (r === sel) continue;
      this.routes.add(this.line(this.pathPoints(r.cells), ALT, 3, { opacity: 0.75 }));
    }
    if (sel) {
      if (back.length > 1) this.routes.add(this.line(this.pathPoints(back), "#ffffff", 2, { opacity: 0.7, dashed: true }));
      const pts = this.pathPoints(sel.cells);
      this.routes.add(this.line(pts, ACCENT, 3, { opacity: 0.3, xray: true }));
      this.routes.add(this.line(pts, "#2a0d03", 9, { order: 6, under: true }));
      this.routes.add(this.line(pts, ACCENT, 5, { order: 7 }));
      for (const i of sel.photos) {
        const s = sprite(drawCheck, 0.014);
        s.position.copy(this.world.worldPos(this.grid.east(sel.cells[i]), this.grid.northOf(sel.cells[i]), LIFT));
        this.routes.add(s);
      }
    }
    this.request();
  }

  /** The same walk without a plan, dashed: a straight line (red) and Curiosity's path (blue). */
  setNaive(paths: number[][]): void {
    this.clear(this.naive);
    paths.forEach((cells, i) => this.naive.add(this.line(this.pathPoints(cells), i === 0 ? NAIVE_LINE : NAIVE_ROVER, 2.5, { opacity: 0.9, dashed: true, order: 4 })));
    this.request();
  }

  /** Block (the area alone, cut out, in space) or land (with its surroundings out to the crater rim). */
  setScene(mode: SceneMode): void {
    this.mode = mode;
    this.block.visible = mode === "block";
    this.world.backdrop.visible = mode === "land";
    this.request();
  }

  setEnds(home: number, dest: number): void {
    this.clear(this.ends);
    const at = (cell: number, s: THREE.Sprite) => {
      s.position.copy(this.world.worldPos(this.grid.east(cell), this.grid.northOf(cell), LIFT));
      this.ends.add(s);
    };
    if (home >= 0) at(home, sprite(drawStart, 0.028));
    if (dest >= 0) at(dest, sprite(drawPin, 0.05, 0.0));
    this.request();
  }

  setExtras(places: boolean, traverse: boolean): void {
    this.places.visible = places;
    this.traverse.visible = traverse;
    this.request();
  }

  resize(): void {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // centre the map in the space right of the plan panel (on phones the panel is a bottom sheet)
    const card = document.getElementById("card");
    const shift = card && w > 760 ? card.getBoundingClientRect().right / 2 : 0;
    if (shift) this.camera.setViewOffset(w, h, -shift, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.request();
  }

  private request(): void {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.draw();
    });
  }

  private draw(): void {
    if (!this.el.clientWidth) return;
    let busy = false;
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / 700);
      const e = ease(k);
      this.camera.position.lerpVectors(this.tween.pos0, this.tween.pos1, e);
      this.controls.target.lerpVectors(this.tween.tgt0, this.tween.tgt1, e);
      if (k >= 1) this.tween = null;
      busy = true;
    }
    const moving = this.controls.update();
    // stay above the ground
    const cam = this.camera.position;
    const f = this.world.frame;
    const g = this.world.groundElevation(f.toEasting(cam.x), f.toNorthing(cam.z));
    if (!Number.isNaN(g)) cam.y = Math.max(cam.y, f.toWorldY(g) + 12);
    this.world.setSky(this.utc, f.toEasting(cam.x), f.toNorthing(cam.z), 0, this.camera);
    if (this.mode === "block") {
      // the block sits in space, like the home screen's globe; a touch of fog darkens its far side
      this.world.scene.background = null;
      this.world.fog.color.copy(SPACE);
      this.world.fog.density = 0.00006;
    } else {
      // the land around the area fades out with distance; the planning area stays clear
      // our own colour object: setSky above writes into whatever Color the background holds
      this.landBg.copy(DUSK);
      this.world.scene.background = this.landBg;
      this.world.fog.color.copy(DUSK);
      this.world.fog.density = 0.0001;
    }
    this.renderer.render(this.world.scene, this.camera);
    this.ev.onCamera(this.heading(), this.flat);
    if (moving || busy) this.request();
  }
}
