/** End-of-mission map: the real path, Wayfinder's estimate, and where you would have gone without it. */
import type { World } from "./world";

export interface RevealData {
  /** true path, whole EVA */
  truth: [number, number][];
  /** index into truth where the storm closed in */
  stormIndex: number;
  /** Wayfinder's estimated path */
  estimate: [number, number][];
  /** simulated path home without Wayfinder: same steps, unnoticed veer, no corrections */
  unaided: [number, number][];
  home: [number, number];
  site: [number, number];
}

export function drawReveal(cv: HTMLCanvasElement, world: World, imagery: HTMLImageElement, d: RevealData) {
  const dpr = Math.min(devicePixelRatio, 2);
  const rect = cv.getBoundingClientRect();
  cv.width = Math.round(rect.width * dpr);
  cv.height = Math.round(rect.height * dpr);
  const ctx = cv.getContext("2d")!;
  const all = [...d.truth, ...d.unaided, d.home, d.site];
  let w = Infinity;
  let e = -Infinity;
  let s = Infinity;
  let n = -Infinity;
  for (const p of all) {
    w = Math.min(w, p[0]);
    e = Math.max(e, p[0]);
    s = Math.min(s, p[1]);
    n = Math.max(n, p[1]);
  }
  const pad = 90;
  w -= pad;
  e += pad;
  s -= pad;
  n += pad;
  // keep the canvas aspect ratio
  const aspect = cv.width / cv.height;
  if ((e - w) / (n - s) < aspect) {
    const extra = (n - s) * aspect - (e - w);
    w -= extra / 2;
    e += extra / 2;
  } else {
    const extra = (e - w) / aspect - (n - s);
    s -= extra / 2;
    n += extra / 2;
  }
  const scale = cv.width / (e - w);
  const X = (x: number) => (x - w) * scale;
  const Y = (y: number) => (n - y) * scale;

  ctx.fillStyle = "#2a1a12";
  ctx.fillRect(0, 0, cv.width, cv.height);
  const b = world.meta.images.color.bounds;
  if (imagery.complete && imagery.naturalWidth) {
    const mpp = (b.east - b.west) / imagery.naturalWidth;
    ctx.globalAlpha = 0.8;
    ctx.drawImage(imagery, (w - b.west) / mpp, (b.north - n) / mpp, (e - w) / mpp, (n - s) / mpp, 0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1;
  }
  const k = dpr;
  const path = (pts: [number, number][], color: string, width: number, dash: number[] = []) => {
    if (pts.length < 2) return;
    ctx.strokeStyle = "rgba(20,10,6,0.7)";
    ctx.lineWidth = (width + 2.5) * k;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.setLineDash(dash.map((v) => v * k));
    for (const pass of [0, 1]) {
      if (pass === 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width * k;
      }
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };
  path(d.truth.slice(0, d.stormIndex + 1), "#ffffff", 2.5);
  path(d.unaided, "#ff5a47", 3, [7, 6]);
  path(d.estimate, "#ffe066", 1.5, [2, 4]);
  path(d.truth.slice(d.stormIndex), "#7fe3ff", 3.5);

  const pin = (p: [number, number], color: string, label: string, left = false) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = "#1a0f0a";
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(X(p[0]), Y(p[1]), 6 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `600 ${12 * k}px system-ui, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(20,10,6,0.85)";
    ctx.lineWidth = 3 * k;
    ctx.textAlign = left ? "right" : "left";
    const lx = X(p[0]) + (left ? -9 : 9) * k;
    ctx.strokeText(label, lx, Y(p[1]) + 4 * k);
    ctx.fillText(label, lx, Y(p[1]) + 4 * k);
    ctx.textAlign = "left";
  };
  pin(d.home, "#7fe3ff", "Rover");
  pin(d.site, "#ffe066", "Hematite sample");
  if (d.unaided.length) pin(d.unaided[d.unaided.length - 1], "#ff5a47", "Without Wayfinder");
  pin(d.truth[d.stormIndex], "#ffffff", "Storm hits", true);

  // scale bar
  const bar = 100 * scale;
  ctx.fillStyle = "#fff";
  ctx.fillRect(12 * k, cv.height - 16 * k, bar, 3 * k);
  ctx.font = `${11 * k}px system-ui, sans-serif`;
  ctx.fillText("100 m", 12 * k, cv.height - 22 * k);
}
