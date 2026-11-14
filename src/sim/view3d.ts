/**
 * The 3D view of the route simulator: the same faceted Gale Crater terrain as the game, seen
 * from above with map-style controls. Map layers are mixed into the terrain colour in the
 * shader, so the relief stays visible under them.
 */
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { toLonLat } from "../data/frame";
import { World } from "../game/world";
import { nextLocalTime } from "../nav/sun";
import type { NavGrid } from "../plan/grid";
import type { Profile, Route } from "../plan/planner";
import { ROUTE_COLORS, type SceneView, type ViewEvents } from "./scene";

const LIFT = 2; // routes float this far above the ground, metres

function cellTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // row 0 of the canvas is the northern edge
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function iconSprite(draw: (ctx: CanvasRenderingContext2D) => void, size: number, anchorY: number): THREE.Sprite {
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

const drawHome = (c: CanvasRenderingContext2D) => {
  c.fillStyle = "#0d2a33";
  c.strokeStyle = "#7fe3ff";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(32, 32, 27, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.lineWidth = 4.5;
  c.lineJoin = c.lineCap = "round";
  c.beginPath();
  c.moveTo(17, 33);
  c.lineTo(32, 19);
  c.lineTo(47, 33);
  c.moveTo(22, 30);
  c.lineTo(22, 45);
  c.lineTo(42, 45);
  c.lineTo(42, 30);
  c.stroke();
};
const drawDest = (c: CanvasRenderingContext2D) => {
  c.fillStyle = "#ffe14d";
  c.strokeStyle = "#3a2600";
  c.lineWidth = 3.5;
  c.beginPath();
  c.moveTo(32, 62);
  c.bezierCurveTo(32, 62, 52, 40, 52, 24);
  c.arc(32, 24, 20, 0, Math.PI, true);
  c.bezierCurveTo(12, 40, 32, 62, 32, 62);
  c.fill();
  c.stroke();
  c.fillStyle = "#3a2600";
  c.beginPath();
  c.arc(32, 24, 7.5, 0, Math.PI * 2);
  c.fill();
};
const drawDot = (fill: string) => (c: CanvasRenderingContext2D) => {
  c.fillStyle = fill;
  c.strokeStyle = "#1a0f0a";
  c.lineWidth = 7;
  c.beginPath();
  c.arc(32, 32, 20, 0, Math.PI * 2);
  c.fill();
  c.stroke();
};

export class View3D implements SceneView {
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
  private pending = false;
  private utc: number;
  private el: HTMLElement;
  private world: World;
  private grid: NavGrid;

  static async create(el: HTMLElement, grid: NavGrid, ev: ViewEvents, onProgress: (msg: string) => void): Promise<View3D> {
    const low = matchMedia("(pointer: coarse)").matches;
    const world = await World.load(onProgress, low);
    return new View3D(el, world, grid, ev, low);
  }

  private constructor(el: HTMLElement, world: World, grid: NavGrid, ev: ViewEvents, low: boolean) {
    this.el = el;
    this.world = world;
    this.grid = grid;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: !low, logarithmicDepthBuffer: true }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
    el.appendChild(renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 2, 400000);
    this.camera.position.set(-1100, 1350, -3700);

    // mix the layer and the walk-back shading into the terrain colour, by map position
    const play = world.meta.frame.play;
    const f = world.frame;
    this.uniforms.uBounds.value.set(f.toWorldX(play.west), f.toWorldZ(play.north), play.east - play.west, play.north - play.south);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform vec4 uBounds;\nvarying vec2 vCell;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvec4 mwPos = modelMatrix * vec4(transformed, 1.0);\nvCell = (mwPos.xz - uBounds.xy) / uBounds.zw;",
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D uOverlay;\nuniform sampler2D uLimit;\nuniform float uOverlayOn;\nuniform float uLimitOn;\nvarying vec2 vCell;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          if (vCell.x >= 0.0 && vCell.x <= 1.0 && vCell.y >= 0.0 && vCell.y <= 1.0) {
            if (uOverlayOn > 0.5) { vec4 o = texture2D(uOverlay, vCell); diffuseColor.rgb = mix(diffuseColor.rgb, o.rgb, o.a * 0.8); }
            if (uLimitOn > 0.5) { vec4 m = texture2D(uLimit, vCell); diffuseColor.rgb = mix(diffuseColor.rgb, m.rgb, m.a); }
          }`,
        );
    };
    world.playMesh.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = mat;
    });
    world.scene.add(this.routes, this.ends, this.places, this.traverse);

    for (const p of world.positions.places) {
      if (p.kind !== "stop" && p.kind !== "camp") continue;
      const s = iconSprite(drawDot("#ffe14d"), 0.018, 0.5);
      s.position.copy(world.worldPos(p.easting, p.northing, 3));
      this.places.add(s);
    }
    const fb = world.meta.frame.fetch;
    const path = world.traverse.waypoints.filter((w) => w[1] > fb.west && w[1] < fb.east && w[2] > fb.south && w[2] < fb.north);
    if (path.length > 1) {
      this.traverse.add(this.line(path.map((w) => world.worldPos(w[1], w[2], LIFT)), "#ffffff", 1.5, { opacity: 0.7, dashed: true }));
    }

    const base = world.place("base");
    this.utc = nextLocalTime(Date.UTC(2041, 0, 1), toLonLat(base.easting, base.northing).lon, 14);

    const controls = (this.controls = new MapControls(this.camera, renderer.domElement));
    controls.target.copy(world.worldPos(base.easting + 700, base.northing - 1900, 0));
    controls.enableDamping = true;
    controls.dampingFactor = 0.14;
    controls.maxPolarAngle = 1.46;
    controls.minDistance = 80;
    controls.maxDistance = 11000;
    controls.zoomToCursor = true;
    controls.addEventListener("change", () => this.request());

    // a click that is not a drag picks the ground under the pointer
    let down: { x: number; y: number } | null = null;
    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", (e) => (down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null));
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

  private line(points: THREE.Vector3[], color: string, width: number, o: { opacity?: number; dashed?: boolean; xray?: boolean } = {}): Line2 {
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
      fog: false,
    });
    const l = new Line2(geo, mat);
    if (o.dashed) l.computeLineDistances();
    l.renderOrder = o.xray ? 4 : 5;
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

  setOverlay(cv: HTMLCanvasElement | null): void {
    this.setTexture(this.uniforms.uOverlay, this.uniforms.uOverlayOn, cv);
  }

  setLimit(cv: HTMLCanvasElement | null): void {
    this.setTexture(this.uniforms.uLimit, this.uniforms.uLimitOn, cv);
  }

  setRoutes(routes: Route[], selected: Profile | null, back: number[]): void {
    this.clear(this.routes);
    const sel = routes.find((r) => r.profile === selected);
    if (sel && back.length > 1) this.routes.add(this.line(this.pathPoints(back), "#ffffff", 2, { opacity: 0.75, dashed: true }));
    for (const r of routes) {
      if (r === sel) continue;
      this.routes.add(this.line(this.pathPoints(r.cells), ROUTE_COLORS[r.profile], 2.5, { opacity: 0.9 }));
    }
    if (sel) {
      const pts = this.pathPoints(sel.cells);
      // a faint copy that shows through hills, then the route itself
      this.routes.add(this.line(pts, ROUTE_COLORS[sel.profile], 3, { opacity: 0.28, xray: true }));
      this.routes.add(this.line(pts, ROUTE_COLORS[sel.profile], 5));
      for (const i of sel.photos) {
        const s = iconSprite(drawDot("#ffffff"), 0.013, 0.5);
        s.position.copy(this.world.worldPos(this.grid.east(sel.cells[i]), this.grid.northOf(sel.cells[i]), LIFT));
        this.routes.add(s);
      }
    }
    this.request();
  }

  setEnds(home: number, dest: number): void {
    this.clear(this.ends);
    const at = (cell: number, s: THREE.Sprite) => {
      s.position.copy(this.world.worldPos(this.grid.east(cell), this.grid.northOf(cell), LIFT));
      this.ends.add(s);
    };
    if (home >= 0) at(home, iconSprite(drawHome, 0.04, 0.5));
    if (dest >= 0) at(dest, iconSprite(drawDest, 0.05, 0.03));
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
    const moving = this.controls.update();
    // stay above the ground
    const cam = this.camera.position;
    const f = this.world.frame;
    const g = this.world.groundElevation(f.toEasting(cam.x), f.toNorthing(cam.z));
    if (!Number.isNaN(g)) cam.y = Math.max(cam.y, f.toWorldY(g) + 12);
    this.world.setSky(this.utc, f.toEasting(cam.x), f.toNorthing(cam.z), 0, this.camera);
    this.renderer.render(this.world.scene, this.camera);
    if (moving) this.request();
  }
}
