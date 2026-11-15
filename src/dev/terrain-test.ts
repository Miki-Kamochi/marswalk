/**
 * Phase 1 data check: renders the real Gale Crater terrain so we can see that the data has
 * the right shape, place and scale. This is NOT the game.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Frame, curvatureDrop, toLonLat } from "../data/frame";
import {
  HeightGrid,
  Raster,
  loadGrid,
  loadJson,
  loadMeta,
  loadRaster,
  type Bounds,
  type Meta,
  type Positions,
  type Traverse,
} from "../data/loader";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status");
const log = (msg: string) => (statusEl.textContent = msg);

const isPhone = matchMedia("(pointer: coarse)").matches;
const HAZE = new THREE.Color(0xd9a273);
const EYE_HEIGHT = 1.7;

const renderer = new THREE.WebGLRenderer({ antialias: !isPhone, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = HAZE;
const fog = new THREE.FogExp2(HAZE, 0.000018);
scene.fog = fog;

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 400000);
const sun = new THREE.DirectionalLight(0xfff1e0, 2.4);
sun.position.set(-0.5, 0.7, -0.45); // from the north-west, mid-afternoon-ish; real sun comes in Phase 2
scene.add(sun, new THREE.HemisphereLight(0xe8c9a8, 0x5a3a28, 1.1));

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.enableDamping = true;

let frame: Frame;
let meta: Meta;
let play: HeightGrid;
let useCurvature = true;

function inside(b: Bounds, e: number, n: number, margin = 0): boolean {
  return e > b.west + margin && e < b.east - margin && n > b.south + margin && n < b.north - margin;
}

/** Elevation at a map position from the best grid that covers it. */
let grids: HeightGrid[] = [];
function elevationAt(e: number, n: number): number {
  for (const g of grids) {
    const z = g.sample(e, n);
    if (!Number.isNaN(z)) return z;
  }
  return NaN;
}

function worldPoint(e: number, n: number, elev: number, lift = 0): THREE.Vector3 {
  const x = frame.toWorldX(e);
  const z = frame.toWorldZ(n);
  const drop = useCurvature ? curvatureDrop(Math.hypot(x, z)) : 0;
  return new THREE.Vector3(x, frame.toWorldY(elev) - drop + lift, z);
}

type ColorFn = (e: number, n: number, elev: number, out: THREE.Color) => void;

/**
 * Faceted (flat-shaded) mesh from a height grid: two triangles per cell, each with one
 * colour sampled at its centre. Cells for which `skip` is true are left out.
 */
function buildTerrain(
  grid: HeightGrid,
  step: number,
  color: ColorFn,
  skip?: (e: number, n: number, half: number) => boolean,
  lift = 0,
): THREE.Mesh {
  const m = grid.meta;
  const cols = Math.floor((m.width - 1) / step);
  const rows = Math.floor((m.height - 1) / step);
  const pos = new Float32Array(cols * rows * 18);
  const col = new Float32Array(cols * rows * 18);
  const c = new THREE.Color();
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const ev = [0, 0, 0, 0];
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const c0 = q * step;
      const r0 = r * step;
      const corners: [number, number][] = [
        [c0, r0],
        [c0 + step, r0],
        [c0, r0 + step],
        [c0 + step, r0 + step],
      ];
      let ok = true;
      for (let i = 0; i < 4; i++) {
        const z = grid.at(corners[i][0], corners[i][1]);
        if (Number.isNaN(z)) ok = false;
        ev[i] = z;
      }
      if (!ok) continue;
      const eC = m.west + (c0 + step / 2) * m.cell;
      const nC = m.north - (r0 + step / 2) * m.cell;
      if (skip?.(eC, nC, (step * m.cell) / 2)) continue;
      for (let i = 0; i < 4; i++) {
        p[i].copy(worldPoint(m.west + corners[i][0] * m.cell, m.north - corners[i][1] * m.cell, ev[i], lift));
      }
      // two triangles, counter-clockwise seen from above: (NW, SW, NE) and (NE, SW, SE)
      const tris = [
        [0, 2, 1],
        [1, 2, 3],
      ];
      for (const t of tris) {
        const ce = (m.west + ((corners[t[0]][0] + corners[t[1]][0] + corners[t[2]][0]) / 3) * m.cell);
        const cn = (m.north - ((corners[t[0]][1] + corners[t[1]][1] + corners[t[2]][1]) / 3) * m.cell);
        color(ce, cn, (ev[t[0]] + ev[t[1]] + ev[t[2]]) / 3, c);
        for (const i of t) {
          pos[k] = p[i].x;
          pos[k + 1] = p[i].y;
          pos[k + 2] = p[i].z;
          col[k] = c.r;
          col[k + 1] = c.g;
          col[k + 2] = c.b;
          k += 3;
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, k), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col.subarray(0, k), 3));
  geo.computeVertexNormals(); // non-indexed => one normal per face => faceted look
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.userData.triangles = k / 9;
  return mesh;
}

function rasterColor(raster: Raster, fallback: ColorFn): ColorFn {
  return (e, n, elev, out) => {
    const i = raster.index(e, n);
    if (i < 0) return fallback(e, n, elev, out);
    out.setRGB(raster.rgba[i] / 255, raster.rgba[i + 1] / 255, raster.rgba[i + 2] / 255, THREE.SRGBColorSpace);
  };
}

/** Overlay (RGBA) blended over a base colour by its alpha. */
function overlayColor(overlay: Raster, base: ColorFn): ColorFn {
  const o = new THREE.Color();
  return (e, n, elev, out) => {
    base(e, n, elev, out);
    const i = overlay.index(e, n);
    if (i < 0) return;
    const a = overlay.rgba[i + 3] / 255;
    if (a <= 0) return;
    o.setRGB(overlay.rgba[i] / 255, overlay.rgba[i + 1] / 255, overlay.rgba[i + 2] / 255, THREE.SRGBColorSpace);
    out.lerp(o, a);
  };
}

const elevationTint: ColorFn = (_e, _n, elev, out) => {
  const t = THREE.MathUtils.clamp((elev + 4600) / 6000, 0, 1);
  out.setRGB(0.36 + 0.2 * t, 0.23 + 0.14 * t, 0.15 + 0.1 * t);
};

function label(text: string, color = "#ffffff"): THREE.Sprite {
  const pad = 8;
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d")!;
  ctx.font = "600 28px system-ui, sans-serif";
  cv.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  cv.height = 44;
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillStyle = "rgba(20,10,5,0.75)";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, 23);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, fog: false }),
  );
  s.scale.set((cv.width / cv.height) * 0.035, 0.035, 1);
  s.renderOrder = 10;
  return s;
}

function line(points: THREE.Vector3[], color: number, dashed = false): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 12, gapSize: 8, fog: false })
    : new THREE.LineBasicMaterial({ color, fog: false });
  const l = new THREE.Line(geo, mat);
  if (dashed) l.computeLineDistances();
  return l;
}

const KIND_COLOR: Record<string, string> = {
  base: "#7fe3ff",
  stop: "#ffe066",
  landmark: "#ffffff",
  camp: "#b8f5a0",
  backdrop: "#ffb38a",
};

async function main() {
  log("loading meta…");
  meta = await loadMeta();
  frame = new Frame(meta.frame.origin);
  const [surround, mid, far] = await Promise.all([
    loadGrid(meta.grids.surround),
    loadGrid(meta.grids.mid),
    loadGrid(meta.grids.far),
  ]);
  play = await loadGrid(meta.grids.play);
  grids = [play, surround, mid, far];

  log("loading imagery…");
  const [color, ortho, surroundImg, positions, traverse] = await Promise.all([
    loadRaster(meta.images.color.file, meta.images.color.bounds),
    loadRaster(meta.images.ortho.file, meta.images.ortho.bounds),
    loadRaster(meta.images.surround.file, meta.images.surround.bounds),
    loadJson<Positions>("positions.json").catch(() => ({ places: [], route: [] }) as Positions),
    loadJson<Traverse>("traverse.json"),
  ]);

  const overlays = new Map<string, Raster>();
  const baseColor = rasterColor(color, elevationTint);
  const layerSelect = $<HTMLSelectElement>("layer");
  for (const [name, l] of Object.entries(meta.layers)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} — ${l.source.split(",")[0]}`;
    layerSelect.appendChild(opt);
  }

  const terrainGroup = new THREE.Group();
  const backdropGroup = new THREE.Group();
  const markerGroup = new THREE.Group();
  const routeGroup = new THREE.Group();
  scene.add(terrainGroup, backdropGroup, markerGroup, routeGroup);
  let playMesh: THREE.Mesh | undefined;
  const playStep = () => Number($<HTMLSelectElement>("detail").value);

  async function colorFnFor(layer: string): Promise<ColorFn> {
    if (layer === "color") return baseColor;
    if (layer === "ortho") return rasterColor(ortho, elevationTint);
    let o = overlays.get(layer);
    if (!o) {
      log(`loading layer ${layer}…`);
      o = await loadRaster(meta.layers[layer].file, meta.layers[layer].bounds);
      overlays.set(layer, o);
    }
    return overlayColor(o, rasterColor(ortho, elevationTint));
  }

  function dispose(group: THREE.Group) {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    group.clear();
  }

  async function rebuildPlay() {
    const fn = await colorFnFor(layerSelect.value);
    const t0 = performance.now();
    dispose(terrainGroup);
    playMesh = buildTerrain(play, playStep(), fn);
    terrainGroup.add(playMesh);
    const l = meta.layers[layerSelect.value];
    $("layerInfo").textContent = l
      ? `${l.description ?? layerSelect.value}. Source: ${l.source}`
      : layerSelect.value === "color"
        ? `Source: ${meta.images.color.source}`
        : `Source: ${meta.images.ortho.source}`;
    log(
      `play area: ${playMesh.userData.triangles.toLocaleString()} triangles at ${play.meta.cell * playStep()} m ` +
        `(${Math.round(performance.now() - t0)} ms)`,
    );
  }

  function rebuildBackdrop() {
    dispose(backdropGroup);
    const playB = meta.frame.play;
    const fetchB = meta.frame.fetch;
    backdropGroup.add(
      buildTerrain(surround, isPhone ? 4 : 2, rasterColor(surroundImg, elevationTint), (e, n) => inside(playB, e, n, 20), -0.5),
      buildTerrain(mid, isPhone ? 4 : 2, elevationTint, (e, n) => inside(fetchB, e, n, 150), -3),
      // leave out a MOLA cell only where the finer grid really covers all of it (plus a margin)
      buildTerrain(far, isPhone ? 4 : 2, elevationTint, (e, n, half) => {
        const r = half + 400;
        for (const [de, dn] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r], [-r, 0], [r, 0], [0, -r], [0, r]]) {
          if (Number.isNaN(mid.sample(e + de, n + dn))) return false;
        }
        return true;
      }, -30),
    );
  }

  function rebuildMarkers() {
    dispose(markerGroup);
    dispose(routeGroup);
    for (const pl of positions.places) {
      const ground = elevationAt(pl.easting, pl.northing);
      const elev = Number.isNaN(ground) ? pl.elevation : ground;
      const far = pl.kind === "backdrop";
      const h = far ? 600 : 45;
      const a = worldPoint(pl.easting, pl.northing, elev);
      const b = worldPoint(pl.easting, pl.northing, elev, h);
      const col = KIND_COLOR[pl.kind] ?? "#ffffff";
      markerGroup.add(line([a, b], new THREE.Color(col).getHex()));
      const s = label(pl.name, col);
      s.position.copy(b);
      markerGroup.add(s);
    }
    // 500 m ring around the base: a scale reference draped on the ground
    const base = positions.places.find((p) => p.kind === "base");
    if (base) {
      const ring: THREE.Vector3[] = [];
      for (let i = 0; i <= 180; i++) {
        const a = (i / 180) * Math.PI * 2;
        const e = base.easting + Math.cos(a) * 500;
        const n = base.northing + Math.sin(a) * 500;
        ring.push(worldPoint(e, n, elevationAt(e, n), 2));
      }
      routeGroup.add(line(ring, 0x7fe3ff, true));
      const s = label("500 m from base", "#7fe3ff");
      s.position.copy(worldPoint(base.easting, base.northing + 500, elevationAt(base.easting, base.northing + 500), 20));
      routeGroup.add(s);
    }
    // Curiosity's real path
    const f = meta.frame.fetch;
    const pts = traverse.waypoints
      .filter((w) => inside(f, w[1], w[2]))
      .map((w) => worldPoint(w[1], w[2], elevationAt(w[1], w[2]), 2.5));
    routeGroup.add(line(pts, 0xffffff));
    // planned EVA route
    for (const r of positions.route) {
      routeGroup.add(
        line(
          r.points.map(([e, n]) => worldPoint(e, n, elevationAt(e, n), 3)),
          0xffe066,
          true,
        ),
      );
    }
  }

  // ---- views
  let mode: "orbit" | "stand" = "orbit";
  let yaw = 0;
  let pitch = 0;
  function overview() {
    mode = "orbit";
    orbit.enabled = true;
    orbit.target.set(0, 0, 0);
    camera.position.set(-1800, 2600, 3200);
    orbit.update();
  }
  function standAt(e: number, n: number, lookE?: number, lookN?: number) {
    mode = "stand";
    orbit.enabled = false;
    camera.position.copy(worldPoint(e, n, elevationAt(e, n), EYE_HEIGHT));
    if (lookE !== undefined && lookN !== undefined) yaw = Math.atan2(lookE - e, lookN - n);
    pitch = 0.03;
  }
  function applyLook() {
    // yaw: 0 = north (-z), positive = clockwise toward east
    camera.rotation.set(pitch, -yaw, 0, "YXZ");
  }

  let drag: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener("pointerdown", (ev) => (drag = { x: ev.clientX, y: ev.clientY }));
  addEventListener("pointerup", () => (drag = null));
  addEventListener("pointermove", (ev) => {
    if (mode !== "stand" || !drag) return;
    yaw -= (ev.clientX - drag.x) * 0.004;
    pitch = THREE.MathUtils.clamp(pitch + (ev.clientY - drag.y) * 0.004, -1.2, 1.2);
    drag = { x: ev.clientX, y: ev.clientY };
  });

  // ---- click readout
  const ray = new THREE.Raycaster();
  let downAt = { x: 0, y: 0 };
  renderer.domElement.addEventListener("pointerdown", (ev) => (downAt = { x: ev.clientX, y: ev.clientY }));
  renderer.domElement.addEventListener("click", (ev) => {
    if (Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 4 || !playMesh) return;
    ray.setFromCamera(
      new THREE.Vector2((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1),
      camera,
    );
    const hit = ray.intersectObjects([...terrainGroup.children, ...backdropGroup.children])[0];
    if (!hit) return;
    const e = frame.toEasting(hit.point.x);
    const n = frame.toNorthing(hit.point.z);
    const ll = toLonLat(e, n);
    $("readout").textContent =
      `E ${e.toFixed(0)}  N ${n.toFixed(0)}\n` +
      `${(-ll.lat).toFixed(4)}°S  ${ll.lon.toFixed(4)}°E\n` +
      `elevation ${elevationAt(e, n).toFixed(1)} m\n` +
      `${hit.distance.toFixed(0)} m from camera`;
  });

  // ---- UI
  const viewSelect = $<HTMLSelectElement>("view");
  for (const pl of positions.places.filter((p) => p.kind !== "backdrop")) {
    const opt = document.createElement("option");
    opt.value = pl.id;
    opt.textContent = `Stand at: ${pl.name}`;
    viewSelect.appendChild(opt);
  }
  viewSelect.addEventListener("change", () => {
    const pl = positions.places.find((p) => p.id === viewSelect.value);
    const sharp = positions.places.find((p) => p.id === "mount_sharp_summit");
    if (!pl) overview();
    else standAt(pl.easting, pl.northing, sharp?.easting, sharp?.northing);
  });
  layerSelect.addEventListener("change", rebuildPlay);
  $("detail").addEventListener("change", rebuildPlay);
  $<HTMLInputElement>("backdrop").addEventListener("change", (e) => (backdropGroup.visible = (e.target as HTMLInputElement).checked));
  $<HTMLInputElement>("markers").addEventListener("change", (e) => {
    markerGroup.visible = routeGroup.visible = (e.target as HTMLInputElement).checked;
  });
  $<HTMLInputElement>("haze").addEventListener("change", (e) => (scene.fog = (e.target as HTMLInputElement).checked ? fog : null));
  $<HTMLInputElement>("curvature").addEventListener("change", async (e) => {
    useCurvature = (e.target as HTMLInputElement).checked;
    await rebuildPlay();
    rebuildBackdrop();
    rebuildMarkers();
  });

  // ---- sanity checks shown on the page
  const b = meta.frame.play;
  const checks: string[] = [];
  checks.push(`play area ${(b.east - b.west) / 1000} × ${(b.north - b.south) / 1000} km`);
  checks.push(`centre ${(-toLonLat(0, meta.frame.origin.northing).lat).toFixed(3)}°S ${toLonLat(meta.frame.origin.easting, 0).lon.toFixed(3)}°E`);
  const base = positions.places.find((p) => p.kind === "base");
  const sharp = positions.places.find((p) => p.id === "mount_sharp_summit");
  if (base && sharp) {
    const d = Math.hypot(sharp.easting - base.easting, sharp.northing - base.northing);
    checks.push(`Mount Sharp summit: ${(d / 1000).toFixed(1)} km away, ${(sharp.elevation - base.elevation).toFixed(0)} m above base`);
  }
  for (const pl of positions.places.filter((p) => p.kind === "stop")) {
    if (base) checks.push(`${pl.name}: ${Math.hypot(pl.easting - base.easting, pl.northing - base.northing).toFixed(0)} m from base`);
  }
  $("checks").textContent = checks.join("\n");

  if (isPhone) $<HTMLSelectElement>("detail").value = "8";
  await rebuildPlay();
  rebuildBackdrop();
  rebuildMarkers();
  overview();

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  let frames = 0;
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    if (mode === "orbit") orbit.update();
    else applyLook();
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - last > 1000) {
      $("fps").textContent = `${Math.round((frames * 1000) / (now - last))} fps · ${renderer.info.render.triangles.toLocaleString()} triangles`;
      frames = 0;
      last = now;
    }
  });
}

main().catch((err) => {
  console.error(err);
  log(`ERROR: ${err.message}`);
});
