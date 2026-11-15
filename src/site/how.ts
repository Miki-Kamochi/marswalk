/**
 * How it works: from NASA data to a route, one step per screen (see steps.ts). Every map here is
 * drawn from the planner's own grid, scores and colours, and the route step runs the real search.
 */
import { DEFAULTS, type PlanConfig } from "../plan/config";
import { energyPerMetre, walkingSpeed } from "../plan/energy";
import { loadImage, loadPlanData, type PlanData } from "../plan/load";
import { Planner, type Profile, type Route } from "../plan/planner";
import { HEMATITE, locStops, NO_GO, ramp, SAFETY, type Stop } from "../sim/overlays";
import { profileName } from "../sim/text";
import { initLang, tr } from "./lang";
import { cellPixel, cropGray, match, pickCells, playMatch } from "./matcher";
import { drawStars } from "./stars";
import { clamp01, ease, startDeck, type SlideCtx } from "./steps";

initLang();
drawStars();

const cfg: PlanConfig = { ...DEFAULTS, custom: { time: 50, o2: 50, locate: 50 } };
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as unknown as T;
const all = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel)) as unknown as T[];
const breathe = () => new Promise((r) => setTimeout(r, 0));
const COLORS: Record<Profile, string> = { mix: "#ff6b2c", short: "#7cc8ff", o2: "#5fd3a0", found: "#c58af9", custom: "#ffd166" };
const ORDER: Profile[] = ["mix", "short", "o2", "found"];

// ------------------------------------------------------------ data and the layer pictures (500 × 600, one pixel per cell)
interface Layers {
  d: PlanData;
  img: HTMLImageElement;
  W: number;
  H: number;
  hill: HTMLCanvasElement;
  ortho: HTMLCanvasElement;
  score: Record<"tilt" | "rough" | "step" | "sand", HTMLCanvasElement>;
  safety: HTMLCanvasElement;
  loc: HTMLCanvasElement;
  locLow: HTMLCanvasElement;
  hem: HTMLCanvasElement;
  cells: { dune: number; rock: number };
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return cv;
}

/** A layer picture: each cell coloured from a ramp (null = transparent). */
function paint(W: number, H: number, value: (i: number) => number | null, stops: Stop[], noGo?: (i: number) => boolean): HTMLCanvasElement {
  const cv = canvas(W, H);
  const c = cv.getContext("2d")!;
  const img = c.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    if (noGo?.(i)) {
      img.data.set(NO_GO.slice(1), i * 4);
      continue;
    }
    const v = value(i);
    if (v !== null) ramp(stops, v, img.data, i * 4);
  }
  c.putImageData(img, 0, 0);
  return cv;
}

/** Terrain shading from the cell elevations (sun from the north-west). */
function hillshade(d: PlanData): HTMLCanvasElement {
  const g = d.grid;
  const W = g.width;
  const H = g.height;
  const z = g.layers.elev;
  const cv = canvas(W, H);
  const c = cv.getContext("2d")!;
  const img = c.createImageData(W, H);
  const at = (r: number, k: number) => z[Math.min(H - 1, Math.max(0, r)) * W + Math.min(W - 1, Math.max(0, k))];
  for (let r = 0; r < H; r++)
    for (let k = 0; k < W; k++) {
      const dx = (at(r, k + 1) - at(r, k - 1)) / (2 * g.cell);
      const dy = (at(r - 1, k) - at(r + 1, k)) / (2 * g.cell); // northward
      const len = Math.hypot(dx, dy, 1);
      const s = Math.max(0.15, (-dx * -0.5 + -dy * 0.5 + 0.7) / len / 1.05);
      const ok = Number.isFinite(s);
      img.data.set(ok ? [118 * s + 18, 84 * s + 12, 62 * s + 10, 255] : [20, 16, 14, 255], (r * W + k) * 4);
    }
  c.putImageData(img, 0, 0);
  return cv;
}

const ready: Promise<Layers> = (async () => {
  const d = await loadPlanData(cfg);
  const img = await loadImage(d.meta.images.ortho.file);
  const g = d.grid;
  const W = g.width;
  const H = g.height;
  const scores = Array.from({ length: g.size }, (_, i) => g.scores(i, cfg));
  const ortho = canvas(W, H);
  ortho.getContext("2d")!.drawImage(img, 0, 0, img.width, img.height, 0, 0, W, H);
  const sc = (k: number) => paint(W, H, (i) => scores[i][k], SAFETY, (i) => scores[i][k] <= 0);
  const L = g.layers;
  return {
    d,
    img,
    W,
    H,
    hill: hillshade(d),
    ortho,
    score: { tilt: sc(0), rough: sc(1), step: sc(2), sand: paint(W, H, (i) => (L.sand[i] > 0.02 ? scores[i][3] : null), SAFETY) },
    safety: paint(W, H, (i) => g.good[i], SAFETY, (i) => !!g.blocked[i]),
    loc: paint(W, H, (i) => L.loc[i], locStops(cfg)),
    locLow: paint(W, H, (i) => (L.loc[i] < cfg.locFix ? L.loc[i] : null), locStops(cfg)),
    hem: paint(W, H, (i) => (Number.isNaN(L.hematite[i]) ? null : L.hematite[i]), HEMATITE),
    cells: pickCells(g),
  };
})();

/** Draw base, then `top` revealed from north to south with a bright scan line. */
async function sweep(cv: HTMLCanvasElement, base: CanvasImageSource | null, top: CanvasImageSource, ms: number, ctx: SlideCtx, alpha = 1) {
  const L = await ready;
  cv.width = L.W;
  cv.height = L.H;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  await ctx.frames((t) => {
    const k = ctx.reduced ? 1 : ease(clamp01(t / ms));
    const y = Math.round(k * L.H);
    c.clearRect(0, 0, L.W, L.H);
    if (base) c.drawImage(base, 0, 0);
    c.globalAlpha = alpha;
    if (y > 0) c.drawImage(top, 0, 0, L.W, y, 0, 0, L.W, y);
    c.globalAlpha = 1;
    if (k < 1) {
      const gr = c.createLinearGradient(0, y - 18, 0, y + 2);
      gr.addColorStop(0, "rgba(255,178,122,0)");
      gr.addColorStop(1, "rgba(255,178,122,0.9)");
      c.fillStyle = gr;
      c.fillRect(0, y - 18, L.W, 20);
    }
    return k < 1;
  });
}

/** The layers stacked into the planner's map. */
function composite(L: Layers, on: { safety: boolean; loc: boolean; hem: boolean }, scale = 1): HTMLCanvasElement {
  const cv = canvas(L.W * scale, L.H * scale);
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  c.drawImage(L.hill, 0, 0, cv.width, cv.height);
  if (on.safety) {
    c.globalAlpha = 0.5;
    c.drawImage(L.safety, 0, 0, cv.width, cv.height);
  }
  if (on.loc) {
    c.globalAlpha = 0.55;
    c.drawImage(L.locLow, 0, 0, cv.width, cv.height);
  }
  if (on.hem) {
    c.globalAlpha = 0.9;
    c.drawImage(L.hem, 0, 0, cv.width, cv.height);
  }
  c.globalAlpha = 1;
  return cv;
}

// ------------------------------------------------------------ 2: three kinds of data
async function data(ctx: SlideCtx) {
  const L = await ready;
  if (!ctx.alive()) return;
  const put = (sel: string, draw: (c: CanvasRenderingContext2D) => void) => {
    const cv = q<HTMLCanvasElement>(ctx.el, sel);
    cv.width = L.W;
    cv.height = L.H;
    draw(cv.getContext("2d")!);
  };
  put(".t-hill", (c) => c.drawImage(L.hill, 0, 0));
  put(".t-ortho", (c) => c.drawImage(L.ortho, 0, 0));
  put(".t-hem", (c) => {
    c.fillStyle = "#120e0c";
    c.fillRect(0, 0, L.W, L.H);
    c.globalAlpha = 0.35;
    c.drawImage(L.hill, 0, 0);
    c.globalAlpha = 1;
    c.drawImage(L.hem, 0, 0);
  });
}

// ------------------------------------------------------------ 3: the grid, zooming in to real cells
async function grid(ctx: SlideCtx) {
  const L = await ready;
  if (!ctx.alive()) return;
  const g = L.d.grid;
  const cv = q<HTMLCanvasElement>(ctx.el, ".g-cv");
  const info = q(ctx.el, ".g-info");
  const dpr = Math.min(2, devicePixelRatio);
  const box = cv.getBoundingClientRect();
  cv.width = Math.round(box.width * dpr);
  cv.height = Math.round(box.height * dpr);
  const c = cv.getContext("2d")!;
  const [px, py] = cellPixel(g, L.cells.rock);
  // view: centre and width in metres (1 image pixel = 1 m)
  const full = { x: L.img.width / 2, y: L.img.height / 2, w: L.img.height * (cv.width / cv.height) };
  const zoom = { x: px, y: py, w: 90 };
  let view = { ...full };
  let hover = L.cells.rock;
  const showInfo = (i: number) => {
    const Ly = g.layers;
    const hem = Ly.hematite[i];
    info.innerHTML = `<b>${tr("Cell", "マス")} ${i % g.width}, ${Math.floor(i / g.width)}</b>
      <span>${tr("Slope", "傾き")}</span><i>${Ly.tilt[i].toFixed(1)}°</i>
      <span>${tr("Roughness", "でこぼこ")}</span><i>${Ly.rough[i].toFixed(2)} m</i>
      <span>${tr("Step", "段差")}</span><i>${Ly.step[i].toFixed(2)} m</i>
      <span>${tr("Sand", "砂地")}</span><i>${Math.round(Ly.sand[i] * 100)}%</i>
      <span>${tr("Easy to locate", "迷いにくさ")}</span><i>${Ly.loc[i].toFixed(2)}</i>
      <span>${tr("Hematite", "ヘマタイト")}</span><i>${Number.isNaN(hem) ? "—" : hem.toFixed(2)}</i>
      <span>${tr("Safety", "安全度")}</span><i class="${g.blocked[i] ? "bad" : ""}">${g.blocked[i] ? tr("no-go", "通行不可") : g.good[i].toFixed(2)}</i>`;
  };
  const draw = () => {
    const h = view.w * (cv.height / cv.width);
    const sx = view.x - view.w / 2;
    const sy = view.y - h / 2;
    const k = cv.width / view.w; // screen px per metre
    c.fillStyle = "#000";
    c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(L.img, sx, sy, view.w, h, 0, 0, cv.width, cv.height);
    const gridA = clamp01((700 - view.w) / 500);
    if (gridA > 0) {
      c.strokeStyle = `rgba(255,178,122,${0.55 * gridA})`;
      c.lineWidth = 1;
      c.beginPath();
      const step = 6;
      for (let x = Math.ceil(sx / step) * step; x < sx + view.w; x += step) {
        c.moveTo((x - sx) * k, 0);
        c.lineTo((x - sx) * k, cv.height);
      }
      for (let y = Math.ceil(sy / step) * step; y < sy + h; y += step) {
        c.moveTo(0, (y - sy) * k);
        c.lineTo(cv.width, (y - sy) * k);
      }
      c.stroke();
      // the cell being looked at
      const hx = (hover % g.width) * 6;
      const hy = Math.floor(hover / g.width) * 6;
      c.strokeStyle = `rgba(255,107,44,${gridA})`;
      c.lineWidth = 3 * dpr;
      c.strokeRect((hx - sx) * k, (hy - sy) * k, 6 * k, 6 * k);
    }
    // scale bar
    c.fillStyle = "rgba(16,13,11,0.8)";
    const bar = view.w > 600 ? 1000 : view.w > 150 ? 100 : 12;
    c.fillRect(10 * dpr, cv.height - 30 * dpr, bar * k + 16 * dpr, 22 * dpr);
    c.fillStyle = "#f4ede6";
    c.fillRect(18 * dpr, cv.height - 16 * dpr, bar * k, 3 * dpr);
    c.font = `${11 * dpr}px ui-monospace, monospace`;
    c.fillText(`${bar} m`, 18 * dpr, cv.height - 20 * dpr);
  };
  showInfo(hover);
  await ctx.frames((t) => {
    const k = ctx.reduced ? 1 : ease(clamp01((t - 400) / 2600));
    // zoom in on a log scale so it feels even
    view = {
      x: full.x + (zoom.x - full.x) * k,
      y: full.y + (zoom.y - full.y) * k,
      w: Math.exp(Math.log(full.w) + (Math.log(zoom.w) - Math.log(full.w)) * k),
    };
    draw();
    return k < 1;
  });
  if (!ctx.alive()) return;
  cv.onpointermove = (e) => {
    const r = cv.getBoundingClientRect();
    const h = view.w * (cv.height / cv.width);
    const mx = view.x - view.w / 2 + ((e.clientX - r.left) / r.width) * view.w;
    const my = view.y - h / 2 + ((e.clientY - r.top) / r.height) * h;
    const i = Math.floor(my / 6) * g.width + Math.floor(mx / 6);
    if (i >= 0 && i < g.size && i !== hover) {
      hover = i;
      showInfo(i);
      draw();
      ctx.done();
    }
  };
}

// ------------------------------------------------------------ 4 and 5: one cell in 3D, a plane fitted through it
interface CellFit {
  pts: [number, number, number][];
  plane: [number, number, number]; // z = a x + b y + c
  tilt: number;
}
function fitCell(L: Layers, i: number): CellFit {
  const g = L.d.grid;
  const e0 = g.east(i);
  const n0 = g.northOf(i);
  const pts: [number, number, number][] = [];
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) pts.push([x, y, L.d.play.sample(e0 + x, n0 + y)]);
  const z0 = pts.reduce((s, p) => s + p[2], 0) / pts.length;
  for (const p of pts) p[2] -= z0;
  // least squares for z = a x + b y + c (x and y are symmetric around 0)
  let sxx = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  for (const [x, y, z] of pts) {
    sxx += x * x;
    syy += y * y;
    sxz += x * z;
    syz += y * z;
  }
  const a = sxz / sxx;
  const b = syz / syy;
  return { pts, plane: [a, b, 0], tilt: (Math.atan(Math.hypot(a, b)) * 180) / Math.PI };
}

/** Pick a cell that shows the idea well: sloping (or rough), on firm ground. */
function demoCell(L: Layers, want: "tilt" | "rough"): number {
  const g = L.d.grid;
  const Ly = g.layers;
  let best = L.cells.rock;
  let score = -Infinity;
  for (let r = 20; r < g.height - 20; r += 3)
    for (let k = 20; k < g.width - 20; k += 3) {
      const i = r * g.width + k;
      if (Ly.sand[i] > 0.05) continue;
      const s = want === "tilt" ? -Math.abs(Ly.tilt[i] - 14) - Ly.rough[i] * 10 : Ly.rough[i] * 10 - Math.abs(Ly.tilt[i] - 6) * 0.1 + (Ly.rough[i] < 0.35 ? 0 : -9);
      if (s > score) {
        score = s;
        best = i;
      }
    }
  return best;
}

async function cell3d(cv: HTMLCanvasElement, f: CellFit, mode: "tilt" | "rough", label: string, ctx: SlideCtx) {
  const dpr = Math.min(2, devicePixelRatio);
  const W = 360;
  const H = 300;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const c = cv.getContext("2d")!;
  c.scale(dpr, dpr);
  const kx = 22;
  const kz = mode === "rough" ? 60 : 22; // heights are stretched for roughness (they are centimetres)
  const P = (x: number, y: number, z: number): [number, number] => [W / 2 + (x - y) * kx * 0.87, H / 2 + 20 + (x + y) * kx * 0.5 - z * kz];
  const [a, b] = f.plane;
  const pz = (x: number, y: number) => a * x + b * y;
  await ctx.frames((t) => {
    const k = ctx.reduced ? 1 : clamp01(t / 2200);
    c.clearRect(0, 0, W, H);
    // the points drop in, then the plane appears
    const drop = ease(clamp01(k / 0.55));
    const plane = ease(clamp01((k - 0.5) / 0.4));
    if (plane > 0) {
      c.globalAlpha = 0.45 * plane;
      c.fillStyle = "#ffb27a";
      c.beginPath();
      for (const [x, y] of [[-3.4, -3.4], [3.4, -3.4], [3.4, 3.4], [-3.4, 3.4]] as const) c.lineTo(...P(x, y, pz(x, y)));
      c.closePath();
      c.fill();
      c.globalAlpha = plane;
      c.strokeStyle = "#ffb27a";
      c.stroke();
      c.globalAlpha = 1;
    }
    const sorted = [...f.pts].sort((p, q2) => p[0] + p[1] - (q2[0] + q2[1]));
    for (const [x, y, z] of sorted) {
      const zz = z + (1 - drop) * 3;
      if (mode === "rough" && plane > 0) {
        const res = z - pz(x, y);
        c.strokeStyle = Math.abs(res) > 0.08 ? "rgba(255,90,90,0.9)" : "rgba(124,200,255,0.8)";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(...P(x, y, pz(x, y)));
        c.lineTo(...P(x, y, pz(x, y) + res * plane));
        c.stroke();
      }
      c.fillStyle = "#f4ede6";
      c.beginPath();
      c.arc(...P(x, y, zz), 3.2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(236,228,218,0.7)";
    c.font = "12px ui-monospace, monospace";
    c.fillText(tr("one cell · 6 × 6 m", "1マス · 6 × 6 m"), 12, 20);
    if (plane >= 1) {
      c.fillStyle = "#ffb27a";
      c.font = "700 22px system-ui, sans-serif";
      c.fillText(label, 12, H - 16);
    }
    return k < 1;
  });
}

async function tilt(ctx: SlideCtx) {
  const L = await ready;
  if (!ctx.alive()) return;
  const f = fitCell(L, demoCell(L, "tilt"));
  void cell3d(q(ctx.el, ".cell3d"), f, "tilt", tr(`slope ${f.tilt.toFixed(1)}°`, `傾き ${f.tilt.toFixed(1)}°`), ctx);
  await sweep(q(ctx.el, ".m-tilt"), L.hill, L.score.tilt, 1800, ctx, 0.85);
}

async function rough(ctx: SlideCtx) {
  const L = await ready;
  if (!ctx.alive()) return;
  const i = demoCell(L, "rough");
  const f = fitCell(L, i);
  const Ly = L.d.grid.layers;
  void cell3d(q(ctx.el, ".cell3d"), f, "rough", tr(`roughness ${Ly.rough[i].toFixed(2)} m · step ${Ly.step[i].toFixed(2)} m`, `でこぼこ ${Ly.rough[i].toFixed(2)} m · 段差 ${Ly.step[i].toFixed(2)} m`), ctx);
  const map = q<HTMLCanvasElement>(ctx.el, ".m-rough");
  const chips = all<HTMLButtonElement>(ctx.el, "[data-m]");
  const show = (m: "rough" | "step") => {
    chips.forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    void sweep(map, L.hill, L.score[m], 1200, ctx, 0.85);
  };
  chips.forEach((b) => (b.onclick = () => show(b.dataset.m as "rough" | "step")));
  show("rough");
}

async function sand(ctx: SlideCtx) {
  const L = await ready;
  if (!ctx.alive()) return;
  const o = q<HTMLCanvasElement>(ctx.el, ".m-ortho");
  o.width = L.W;
  o.height = L.H;
  o.getContext("2d")!.drawImage(L.ortho, 0, 0);
  await sweep(q(ctx.el, ".m-sand"), L.ortho, L.score.sand, 1800, ctx, 0.9);
}

// ------------------------------------------------------------ 7: four scores → one safety map
async function safety(ctx: SlideCtx) {
  const L = await ready;
  if (!ctx.alive()) return;
  const box = q(ctx.el, ".combine");
  box.classList.remove("merge");
  const set = (sel: string, src: HTMLCanvasElement) => {
    const cv = q<HTMLCanvasElement>(ctx.el, sel);
    cv.width = L.W;
    cv.height = L.H;
    const c = cv.getContext("2d")!;
    c.drawImage(L.hill, 0, 0);
    c.globalAlpha = 0.85;
    c.drawImage(src, 0, 0);
  };
  set(".c-tilt", L.score.tilt);
  set(".c-rough", L.score.rough);
  set(".c-step", L.score.step);
  set(".c-sand", L.score.sand);
  const safe = q<HTMLCanvasElement>(ctx.el, ".c-safe");
  safe.width = L.W;
  safe.height = L.H;
  safe.getContext("2d")!.clearRect(0, 0, L.W, L.H);
  const g = L.d.grid;
  let blocked = 0;
  for (let i = 0; i < g.size; i++) blocked += g.blocked[i];
  q(ctx.el, ".s-read").textContent = tr(`No-go: ${((blocked / g.size) * 100).toFixed(1)}% of the cells`, `通行不可：全体の ${((blocked / g.size) * 100).toFixed(1)}%`);
  if (!(await ctx.wait(1200))) return;
  box.classList.add("merge");
  if (!(await ctx.wait(700))) return;
  await sweep(safe, L.hill, L.safety, 1400, ctx, 0.85);
}

// ------------------------------------------------------------ 8: easy to locate, matched live
async function loc(ctx: SlideCtx) {
  const L = await ready;
  if (!ctx.alive()) return;
  const view = q<HTMLCanvasElement>(ctx.el, ".l-view");
  const heat = q<HTMLCanvasElement>(ctx.el, ".l-heat");
  const read = q(ctx.el, ".l-read");
  const chips = all<HTMLButtonElement>(ctx.el, "[data-cell]");
  let run = 0;
  const show = async (which: "rock" | "dune") => {
    const my = ++run;
    chips.forEach((b) => b.classList.toggle("on", b.dataset.cell === which));
    const i = L.cells[which];
    const m = match(cropGray(L.img, ...cellPixel(L.d.grid, i)));
    read.textContent = "";
    await playMatch(view, heat, m, ctx.reduced ? 0 : 1400, () => ctx.alive() && my === run);
    if (my !== run || !ctx.alive()) return;
    read.innerHTML = tr(
      `Closest look-alike ${m.best.toFixed(2)} · score of this cell <b>${L.d.grid.layers.loc[i].toFixed(2)}</b>`,
      `一番似た別の場所 ${m.best.toFixed(2)} · このマスの点数 <b>${L.d.grid.layers.loc[i].toFixed(2)}</b>`,
    );
    ctx.done();
  };
  chips.forEach((b) => (b.onclick = () => void show(b.dataset.cell as "rock" | "dune")));
  void show("rock");
  await sweep(q(ctx.el, ".m-loc"), L.hill, L.loc, 2000, ctx, 0.85);
}

// ------------------------------------------------------------ 9: hematite, and what CRISM sees
function spectrum(svg: SVGSVGElement, ctx: SlideCtx) {
  const X = (um: number) => 40 + ((um - 0.4) / 0.8) * 300;
  const Y = (r: number) => 220 - r * 180;
  const line = (f: (um: number) => number) => {
    let d = "";
    for (let um = 0.42; um <= 1.18; um += 0.01) d += `${d ? "L" : "M"}${X(um).toFixed(1)} ${Y(f(um)).toFixed(1)}`;
    return d;
  };
  const rock = (um: number) => 0.32 + 0.22 * (um - 0.4);
  const hem = (um: number) => 0.2 + 0.55 * clamp01((um - 0.5) / 0.25) - 0.26 * Math.exp(-(((um - 0.86) / 0.09) ** 2)) + 0.05 * (um - 0.4);
  svg.innerHTML = `
    <line x1="40" y1="220" x2="345" y2="220" class="sp-axis"/><line x1="40" y1="30" x2="40" y2="220" class="sp-axis"/>
    <text x="190" y="248" class="sp-t">${tr("wavelength (µm)", "波長（µm）")}</text>
    <text x="14" y="125" class="sp-t" transform="rotate(-90 14 125)">${tr("reflected light", "反射の強さ")}</text>
    ${[0.5, 0.7, 0.9, 1.1].map((u) => `<text x="${X(u)}" y="235" class="sp-n">${u}</text>`).join("")}
    <rect x="${X(0.8)}" y="30" width="${X(0.92) - X(0.8)}" height="190" class="sp-band"/>
    <text x="${X(0.86)}" y="24" class="sp-n sp-hl">0.86</text>
    <path d="${line(rock)}" class="sp-rock"/>
    <path d="${line(hem)}" class="sp-hem"/>
    <text x="${X(1.12)}" y="${Y(rock(1.12)) + 16}" class="sp-l">${tr("other rock", "ふつうの岩")}</text>
    <text x="${X(1.1)}" y="${Y(hem(1.1)) - 8}" class="sp-l sp-hl">${tr("hematite", "ヘマタイト")}</text>`;
  const p = svg.querySelector<SVGPathElement>(".sp-hem")!;
  const len = p.getTotalLength();
  p.style.strokeDasharray = `${len}`;
  void ctx.frames((t) => {
    const k = ctx.reduced ? 1 : ease(clamp01(t / 1600));
    p.style.strokeDashoffset = `${len * (1 - k)}`;
    return k < 1;
  });
}
async function hem(ctx: SlideCtx) {
  spectrum(q(ctx.el, ".spec"), ctx);
  const L = await ready;
  if (!ctx.alive()) return;
  const dim = canvas(L.W, L.H);
  const c = dim.getContext("2d")!;
  c.fillStyle = "#120e0c";
  c.fillRect(0, 0, L.W, L.H);
  c.globalAlpha = 0.45;
  c.drawImage(L.hill, 0, 0);
  await sweep(q(ctx.el, ".m-hem"), dim, L.hem, 1800, ctx);
}

// ------------------------------------------------------------ 10: time and oxygen on a slope
function energy(ctx: SlideCtx) {
  const el = ctx.el;
  const svg = q<SVGSVGElement>(el, ".en-svg");
  const range = q<HTMLInputElement>(el, ".en-range");
  const speedEl = q(el, ".en-speed");
  const o2El = q(el, ".en-o2");
  const o2Per100 = (deg: number) => (energyPerMetre(Math.tan((deg * Math.PI) / 180), cfg) * 100) / cfg.joulesPerGramO2;
  // chart of oxygen per 100 m against slope, on the right
  const cx = (deg: number) => 290 + ((deg + 20) / 40) * 210;
  const max = Math.max(o2Per100(-20), o2Per100(20));
  const cy = (v: number) => 190 - (v / max) * 160;
  let d = "";
  for (let deg = -20; deg <= 20; deg += 1) d += `${d ? "L" : "M"}${cx(deg).toFixed(1)} ${cy(o2Per100(deg)).toFixed(1)}`;
  const draw = () => {
    const deg = Number(range.value);
    const rad = (deg * Math.PI) / 180;
    const v = walkingSpeed(Math.tan(rad), cfg);
    speedEl.textContent = (v * 3.6).toFixed(1);
    o2El.textContent = o2Per100(deg).toFixed(1);
    // the walker on the slope, on the left
    const x0 = 30;
    const y0 = 150;
    const len = 220;
    const x1 = x0 + len * Math.cos(rad);
    const y1 = y0 - len * Math.sin(rad);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    svg.innerHTML = `
      <path d="M${x0} ${y0} L${x1} ${y1} L${x1} 210 L${x0} 210 Z" class="en-ground"/>
      <g transform="translate(${mx} ${my}) rotate(${-deg * 0.3})">
        <circle cx="0" cy="-46" r="11" class="en-body"/>
        <rect x="-9" y="-34" width="18" height="26" rx="6" class="en-body"/>
        <rect x="-17" y="-32" width="9" height="20" rx="3" class="en-pack"/>
        <path d="M-4 -9 L-9 0 M4 -9 L9 0" class="en-leg"/>
      </g>
      <text x="${x0}" y="200" class="en-deg">${deg > 0 ? "+" : ""}${deg}°</text>
      <line x1="290" y1="190" x2="500" y2="190" class="sp-axis"/>
      <path d="${d}" class="en-curve"/>
      <circle cx="${cx(deg)}" cy="${cy(o2Per100(deg))}" r="6" class="en-dot"/>
      <text x="290" y="208" class="sp-n">−20°</text><text x="395" y="208" class="sp-n">0°</text><text x="500" y="208" class="sp-n">+20°</text>
      <text x="395" y="22" class="sp-t">${tr("oxygen per 100 m", "100 mあたりの酸素")}</text>`;
  };
  range.oninput = () => {
    draw();
    ctx.done();
  };
  range.value = "0";
  draw();
}

// ------------------------------------------------------------ 11: the stack
async function stack(ctx: SlideCtx) {
  const L = await ready;
  if (!ctx.alive()) return;
  const box = q(ctx.el, ".stack");
  box.classList.remove("flat");
  const set = (sel: string, draw: (c: CanvasRenderingContext2D) => void) => {
    const cv = q<HTMLCanvasElement>(ctx.el, sel);
    cv.width = L.W;
    cv.height = L.H;
    draw(cv.getContext("2d")!);
  };
  set(".st-hill", (c) => c.drawImage(L.hill, 0, 0));
  set(".st-safety", (c) => c.drawImage(L.safety, 0, 0));
  set(".st-loc", (c) => c.drawImage(L.loc, 0, 0));
  set(".st-hem", (c) => c.drawImage(L.hem, 0, 0));
  const on = { safety: true, loc: true, hem: true };
  const drawComp = () => set(".st-comp", (c) => c.drawImage(composite(L, on), 0, 0));
  drawComp();
  all<HTMLButtonElement>(ctx.el, "[data-layer]").forEach((b) => {
    const k = b.dataset.layer as keyof typeof on;
    b.classList.toggle("on", on[k]);
    b.onclick = () => {
      on[k] = !on[k];
      b.classList.toggle("on", on[k]);
      drawComp();
    };
  });
}
function stackReveal(i: number, ctx: SlideCtx) {
  if (i === 0) q(ctx.el, ".stack").classList.add("flat");
}

// ------------------------------------------------------------ the routes, planned once with the real planner
interface Plans {
  planner: Planner;
  home: number;
  dest: number;
  trace: number[];
  routes: Route[];
  /** walking straight there, with no plan: its cells and how much of it is no-go */
  line: { cells: number[]; route: Route; noGo: number };
}

/** Cells on the straight line between two cells (Bresenham). */
function straight(w: number, a: number, b: number): number[] {
  let x0 = a % w;
  let y0 = Math.floor(a / w);
  const x1 = b % w;
  const y1 = Math.floor(b / w);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out: number[] = [];
  for (;;) {
    out.push(y0 * w + x0);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
let plans: Promise<Plans> | null = null;
function getPlans(): Promise<Plans> {
  plans ??= (async () => {
    const L = await ready;
    const g = L.d.grid;
    const planner = new Planner(g, cfg);
    const base = L.d.positions.places.find((p) => p.id === "base")!;
    const stop = L.d.positions.places.find((p) => p.id === "stop_vera_rubin_ridge") ?? L.d.positions.places.find((p) => p.kind === "stop")!;
    const home = g.nearestOpen(g.index(base.easting, base.northing));
    planner.setHome(home);
    const dest = planner.resolve(g.index(stop.easting, stop.northing)).dest;
    const routes: Route[] = [];
    planner.trace = [];
    const first = planner.routeVia([dest], "mix", 1);
    const trace = planner.trace ?? [];
    planner.trace = null;
    if (first) routes.push(first);
    for (const p of ORDER.slice(1)) {
      await breathe();
      const r = planner.routeVia([dest], p, 1);
      if (r) routes.push(r);
    }
    const cells = straight(g.width, home, dest);
    let noGo = 0;
    for (let k = 1; k < cells.length; k++) {
      if (g.blocked[cells[k]] || g.blocked[cells[k - 1]]) noGo += Math.hypot((cells[k] % g.width) - (cells[k - 1] % g.width), Math.floor(cells[k] / g.width) - Math.floor(cells[k - 1] / g.width)) * g.cell;
    }
    const line = { cells, route: planner.evaluate(cells, "short", 1), noGo };
    return { planner, home, dest, trace, routes, line };
  })();
  return plans;
}

/** Map position of a cell centre, in picture pixels (scale px per cell). */
const at = (L: Layers, i: number, s: number): [number, number] => [((i % L.W) + 0.5) * s, (Math.floor(i / L.W) + 0.5) * s];

function drawRoute(c: CanvasRenderingContext2D, L: Layers, r: Route, s: number, color: string, width: number, upto = r.cells.length) {
  c.strokeStyle = "rgba(20,8,3,0.8)";
  c.lineWidth = width + 3;
  c.lineJoin = c.lineCap = "round";
  for (const pass of [0, 1]) {
    c.beginPath();
    for (let k = 0; k < upto; k++) c.lineTo(...at(L, r.cells[k], s));
    c.stroke();
    if (pass === 0) {
      c.strokeStyle = color;
      c.lineWidth = width;
    }
  }
}

function pin(c: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, s: number) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, 5 * s, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#14110f";
  c.lineWidth = 2 * s;
  c.stroke();
  c.fillStyle = "#f4ede6";
  c.font = `600 ${11 * s}px system-ui, sans-serif`;
  const w = c.measureText(label).width;
  const right = x + 8 * s + w < c.canvas.width / (c.getTransform().a || 1) - c.getTransform().e / (c.getTransform().a || 1);
  c.fillText(label, right ? x + 8 * s : x - 8 * s - w, y + 4 * s);
}

// ------------------------------------------------------------ 12: the error circle along the real route
async function error(ctx: SlideCtx) {
  const [L, P] = await Promise.all([ready, getPlans()]);
  if (!ctx.alive()) return;
  const r = P.routes.find((x) => x.profile === "mix") ?? P.routes[0];
  if (!r) return;
  const cv = q<HTMLCanvasElement>(ctx.el, ".e-cv");
  const read = q(ctx.el, ".e-read");
  // frame the route
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of r.cells) {
    const [x, y] = at(L, i, 1);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const pad = 14;
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  const s = Math.min(900 / (x1 - x0), 640 / (y1 - y0));
  cv.width = Math.round((x1 - x0) * s);
  cv.height = Math.round((y1 - y0) * s);
  const c = cv.getContext("2d")!;
  const comp = composite(L, { safety: true, loc: true, hem: false });
  const total = r.cells.length - 1;
  const photos = new Set(r.photos);
  const dur = 9000;
  await ctx.frames((t) => {
    const k = ctx.reduced ? 1 : clamp01(t / dur);
    const f = k * total;
    const v = Math.min(total, Math.floor(f));
    c.imageSmoothingEnabled = false;
    c.drawImage(comp, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.width, cv.height);
    c.save();
    c.translate(-x0 * s, -y0 * s);
    drawRoute(c, L, r, s, "rgba(255,178,122,0.35)", 3);
    drawRoute(c, L, r, s, "#ff6b2c", 4, v + 1);
    for (const p of r.photos) if (p <= v) pin(c, ...at(L, r.cells[p], s), "#7cc8ff", "", 0.7);
    const [hx, hy] = at(L, P.home, s);
    pin(c, hx, hy, "#7cc8ff", tr("Base", "基地"), 1.2);
    const [dx, dy] = at(L, P.dest, s);
    pin(c, dx, dy, "#ffd166", tr("Vera Rubin Ridge", "ヴェラ・ルービン・リッジ"), 1.2);
    // the walker and the circle it could be in (metres → pixels: 1 cell = 6 m)
    const [wx, wy] = at(L, r.cells[v], s);
    const err = r.errorIn[v] + (r.errorIn[Math.min(total, v + 1)] - r.errorIn[v]) * (f - v);
    const shown = photos.has(v) ? r.errorOut[v] : err;
    const rad = (shown / 6) * s;
    c.fillStyle = shown > cfg.errorLimit * 0.8 ? "rgba(255,90,90,0.25)" : "rgba(124,200,255,0.22)";
    c.strokeStyle = shown > cfg.errorLimit * 0.8 ? "#ff5a5a" : "#7cc8ff";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(wx, wy, Math.max(rad, 3), 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(wx, wy, 4, 0, Math.PI * 2);
    c.fill();
    c.restore();
    const photosSoFar = r.photos.filter((p) => p <= v).length;
    read.textContent = tr(
      `${Math.round(r.dist[v])} m walked · position error ${shown.toFixed(1)} m · photo fixes ${photosSoFar}`,
      `${Math.round(r.dist[v])} m · 位置の誤差 ${shown.toFixed(1)} m · 写真で確認 ${photosSoFar}回`,
    );
    return k < 1;
  });
}

// ------------------------------------------------------------ 13: the search, replayed, and the four routes
async function routes(ctx: SlideCtx) {
  const cards = q(ctx.el, ".r-cards");
  cards.innerHTML = `<p class="readout">${tr("Searching…", "探索中…")}</p>`;
  const [L, P] = await Promise.all([ready, getPlans()]);
  if (!ctx.alive()) return;
  const s = 2;
  const cv = q<HTMLCanvasElement>(ctx.el, ".r-cv");
  cv.width = L.W * s;
  cv.height = L.H * s;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const base = composite(L, { safety: true, loc: false, hem: false }, s);
  const glow = canvas(L.W, L.H);
  const gc = glow.getContext("2d")!;
  const ms = 2600;
  const fade = 700;
  let done = 0;
  const pins = () => {
    pin(c, ...at(L, P.home, s), "#7cc8ff", tr("Base", "基地"), 2);
    pin(c, ...at(L, P.dest, s), "#ffd166", tr("Vera Rubin Ridge", "ヴェラ・ルービン・リッジ"), 2);
  };
  // 1: the search spreading from the base
  await ctx.frames((t) => {
    const k = ctx.reduced ? 1 : clamp01(t / ms);
    const upto = Math.floor(P.trace.length * (1 - (1 - k) ** 2));
    gc.globalCompositeOperation = "destination-out";
    gc.fillStyle = k < 1 ? "rgba(0,0,0,0.05)" : `rgba(0,0,0,${clamp01((t - ms) / fade)})`;
    gc.fillRect(0, 0, L.W, L.H);
    gc.globalCompositeOperation = "source-over";
    gc.fillStyle = "rgba(255,196,120,0.95)";
    for (; done < upto; done++) {
      const i = P.trace[done];
      gc.fillRect(i % L.W, Math.floor(i / L.W), 1, 1);
    }
    c.drawImage(base, 0, 0);
    c.globalCompositeOperation = "lighter";
    c.drawImage(glow, 0, 0, cv.width, cv.height);
    c.globalCompositeOperation = "source-over";
    pins();
    return t < ms + fade;
  });
  if (!ctx.alive()) return;
  // 2: the routes
  let custom: Route | null = null;
  const render = (sel: Profile = "mix") => {
    c.drawImage(base, 0, 0);
    const list = custom ? [...P.routes, custom] : P.routes;
    // no plan: straight there
    c.setLineDash([8, 6]);
    c.strokeStyle = "#ff5a5a";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(...at(L, P.home, s));
    c.lineTo(...at(L, P.dest, s));
    c.stroke();
    c.setLineDash([]);
    for (const r of list) if (r.profile !== sel) drawRoute(c, L, r, s, COLORS[r.profile], 3);
    const top = list.find((r) => r.profile === sel);
    if (top) drawRoute(c, L, top, s, COLORS[top.profile], 6);
    pins();
    cards.innerHTML = list
      .map((r) => {
        const st = r.stats;
        const o2 = Math.round((st.o2Out + st.o2Work + st.o2Back) * 100);
        return `<button class="r-card ${r.profile === sel ? "on" : ""}" data-p="${r.profile}" type="button"><i style="background:${COLORS[r.profile]}"></i><b>${profileName(r.profile)}</b><span>${Math.round(st.duration / 60)} ${tr("min", "分")}</span><span>O₂ ${o2}%</span><span>${(st.distance / 1000).toFixed(2)} km</span></button>`;
      })
      .join("") +
      `<div class="r-card naive"><i></i><b>${tr("Straight, no plan", "まっすぐ（計画なし）")}</b><span>${tr(`no-go ${Math.round(P.line.noGo)} m`, `通行不可 ${Math.round(P.line.noGo)} m`)}</span><span>${tr(`error ${Math.round(P.line.route.stats.maxError)} m`, `誤差 ${Math.round(P.line.route.stats.maxError)} m`)}</span><span>${(P.line.route.stats.distance / 1000).toFixed(2)} km</span></div>`;
    all<HTMLButtonElement>(cards, ".r-card").forEach((b) => (b.onclick = () => render(b.dataset.p as Profile)));
  };
  const mix = P.routes.find((r) => r.profile === "mix");
  if (mix && !ctx.reduced) {
    await ctx.frames((t) => {
      const k = ease(clamp01(t / 900));
      c.drawImage(base, 0, 0);
      drawRoute(c, L, mix, s, COLORS.mix, 6, Math.max(2, Math.ceil(mix.cells.length * k)));
      pins();
      return k < 1;
    });
  }
  if (!ctx.alive()) return;
  render();
  ctx.done();
  all<HTMLInputElement>(ctx.el, "[data-w]").forEach((inp) => {
    inp.onchange = () => {
      const w = inp.dataset.w as "time" | "o2" | "locate";
      cfg.custom = { ...cfg.custom, [w]: Number(inp.value) };
      custom = P.planner.routeVia([P.dest], "custom", 1);
      render("custom");
    };
  });
}

startDeck({
  data: { enter: (c) => void data(c) },
  grid: { enter: (c) => void grid(c) },
  tilt: { enter: (c) => void tilt(c) },
  rough: { enter: (c) => void rough(c) },
  sand: { enter: (c) => void sand(c) },
  safety: { enter: (c) => void safety(c) },
  loc: { enter: (c) => void loc(c) },
  hem: { enter: (c) => void hem(c) },
  energy: { enter: energy },
  stack: { enter: (c) => void stack(c), reveal: stackReveal },
  error: { enter: (c) => void error(c) },
  routes: { enter: (c) => void routes(c) },
});
// start the route search early, so it is ready by the time the talk gets there
void ready.then(() => setTimeout(() => void getPlans(), 1500));
