/**
 * The planner's map as a cut block, like a model on a table: the real terrain on top and four
 * straight sides that follow the ground along each edge, so the edge of the data is shown as an
 * edge instead of being hidden in haze. Faint lines on the sides mark every 100 m of elevation.
 */
import * as THREE from "three";
import type { Frame } from "../data/frame";
import type { HeightGrid } from "../data/loader";

/** elevation lines on the sides, metres apart */
const CONTOUR = 100;
/** the colour of the sides: dark rock, lit a little differently on each face */
const ROCK = new THREE.Color(0x3f2a1d);
const SHADE = { north: 0.82, south: 1.25, west: 0.95, east: 1.1 };

/**
 * Sides of the drawn play-area mesh. `step` must be the step buildTerrain used, so the top of
 * each side meets the terrain's edge vertices exactly.
 */
export function buildBlock(grid: HeightGrid, frame: Frame, step: number): THREE.Group {
  const g = grid.meta;
  const cols = Math.floor((g.width - 1) / step);
  const rows = Math.floor((g.height - 1) / step);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < grid.data.length; i++) {
    if (!grid.data[i]) continue;
    const z = g.zMin + (grid.data[i] - 1) * g.zScale;
    lo = Math.min(lo, z);
    hi = Math.max(hi, z);
  }
  // the base sits below the lowest ground by a share of the relief, so both areas look solid
  const base = lo - Math.max(60, 0.25 * (hi - lo));

  // edge samples, walking each side; [col, row] in grid samples
  const sides: { name: keyof typeof SHADE; pts: [number, number][] }[] = [
    { name: "north", pts: Array.from({ length: cols + 1 }, (_, q) => [q * step, 0] as [number, number]) },
    { name: "east", pts: Array.from({ length: rows + 1 }, (_, r) => [cols * step, r * step] as [number, number]) },
    { name: "south", pts: Array.from({ length: cols + 1 }, (_, q) => [(cols - q) * step, rows * step] as [number, number]) },
    { name: "west", pts: Array.from({ length: rows + 1 }, (_, r) => [0, (rows - r) * step] as [number, number]) },
  ];

  const pos: number[] = [];
  const col: number[] = [];
  const elev: number[] = [];
  const c = new THREE.Color();
  const push = (x: number, z: number, e: number) => {
    pos.push(frame.toWorldX(x), frame.toWorldY(e), frame.toWorldZ(z));
    col.push(c.r, c.g, c.b);
    elev.push(e);
  };
  for (const s of sides) {
    c.copy(ROCK).multiplyScalar(SHADE[s.name]);
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [q0, r0] = s.pts[i];
      const [q1, r1] = s.pts[i + 1];
      const z0 = grid.at(q0, r0);
      const z1 = grid.at(q1, r1);
      if (Number.isNaN(z0) || Number.isNaN(z1)) continue;
      const e0 = g.west + q0 * g.cell;
      const n0 = g.north - r0 * g.cell;
      const e1 = g.west + q1 * g.cell;
      const n1 = g.north - r1 * g.cell;
      // two triangles from the ground edge down to the base, facing out of the block
      push(e0, n0, z0);
      push(e0, n0, base);
      push(e1, n1, z1);
      push(e1, n1, z1);
      push(e0, n0, base);
      push(e1, n1, base);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("elev", new THREE.Float32BufferAttribute(elev, 1));

  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBase = { value: base };
    sh.uniforms.uTop = { value: hi };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float elev;\nvarying float vElev;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvElev = elev;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uBase;\nuniform float uTop;\nvarying float vElev;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // darker towards the base, like a cut lit from above
        float h = clamp((vElev - uBase) / (uTop - uBase), 0.0, 1.0);
        diffuseColor.rgb *= 0.55 + 0.45 * h;
        // a thin line every ${CONTOUR} m of elevation, the same width on screen at any zoom
        float d = abs(fract(vElev / ${CONTOUR.toFixed(1)} + 0.5) - 0.5) * ${CONTOUR.toFixed(1)};
        float line = 1.0 - smoothstep(0.0, 1.2 * fwidth(vElev), d);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.89, 0.85), 0.16 * line);`,
      );
  };
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  group.add(lightPool(grid, frame, base));
  return group;
}

/**
 * A soft pool of warm light on an unseen floor under the block, like a model on a lit table:
 * it grounds the block so it does not just float in black. Drawn additively, so it only adds light.
 */
function lightPool(grid: HeightGrid, frame: Frame, base: number): THREE.Mesh {
  const g = grid.meta;
  const w = (g.width - 1) * g.cell;
  const h = (g.height - 1) * g.cell;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const ctx = cv.getContext("2d")!;
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255, 120, 60, 0.30)");
  grad.addColorStop(0.35, "rgba(255, 110, 50, 0.16)");
  grad.addColorStop(0.7, "rgba(255, 100, 40, 0.05)");
  grad.addColorStop(1, "rgba(255, 100, 40, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const size = 3.2 * Math.max(w, h);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(frame.toWorldX(g.west + w / 2), frame.toWorldY(base) - 2, frame.toWorldZ(g.north - h / 2));
  plane.renderOrder = -1;
  return plane;
}
