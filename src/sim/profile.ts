/**
 * Two small charts for one route, sharing the distance axis:
 *   top     elevation along the way;
 *   bottom  the position error: it grows with every step and drops at each photo fix.
 *           Stretches where no photo fix is possible are shaded.
 */
import type { PlanConfig } from "../plan/config";
import type { NavGrid } from "../plan/grid";
import type { Route } from "../plan/planner";

export function drawProfile(
  cv: HTMLCanvasElement,
  r: Route,
  grid: NavGrid,
  cfg: PlanConfig,
  color: string,
  label: { elev: string; err: string; limit: string },
): void {
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const c = cv.getContext("2d")!;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, W, H);
  c.font = "10.5px system-ui, sans-serif";
  const muted = "#cdb19c";
  const left = 34;
  const right = W - 6;
  const n = r.cells.length;
  const total = Math.max(r.dist[n - 1], 1);
  const x = (d: number) => left + ((right - left) * d) / total;

  // ---- elevation
  const eTop = 14;
  const eBot = 58;
  const elev = grid.layers.elev;
  let lo = Infinity;
  let hi = -Infinity;
  for (const cell of r.cells) {
    lo = Math.min(lo, elev[cell]);
    hi = Math.max(hi, elev[cell]);
  }
  const span = Math.max(hi - lo, 10);
  const ye = (z: number) => eBot - ((eBot - eTop) * (z - lo)) / span;
  c.beginPath();
  c.moveTo(x(0), eBot);
  for (let i = 0; i < n; i++) c.lineTo(x(r.dist[i]), ye(elev[r.cells[i]]));
  c.lineTo(x(total), eBot);
  c.closePath();
  c.fillStyle = "rgba(255, 184, 107, 0.2)";
  c.fill();
  c.beginPath();
  for (let i = 0; i < n; i++) c.lineTo(x(r.dist[i]), ye(elev[r.cells[i]]));
  c.strokeStyle = "#ffb86b";
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = muted;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText(`${label.elev}  ${Math.round(lo)} … ${Math.round(hi)} m`, left, 10);

  // ---- position error
  const top = 84;
  const bot = H - 16;
  const max = Math.max(cfg.errorLimit, r.stats.maxError) * 1.12;
  const yu = (u: number) => bot - ((bot - top) * u) / max;
  c.fillText(label.err, left, top - 8);
  // stretches without a possible photo fix
  c.fillStyle = "rgba(255, 107, 87, 0.3)";
  for (let i = 1; i < n; i++) {
    if (!grid.fixable[r.cells[i]]) c.fillRect(x(r.dist[i - 1]), top, Math.max(1, x(r.dist[i]) - x(r.dist[i - 1])), bot - top);
  }
  // axis and limit
  c.strokeStyle = "rgba(205, 177, 156, 0.45)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(left, top);
  c.lineTo(left, bot);
  c.lineTo(right, bot);
  c.stroke();
  c.setLineDash([4, 3]);
  c.strokeStyle = "#ff6b57";
  c.beginPath();
  c.moveTo(left, yu(cfg.errorLimit));
  c.lineTo(right, yu(cfg.errorLimit));
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = "#ff6b57";
  c.textAlign = "right";
  c.fillText(`${label.limit} ${cfg.errorLimit} m`, right, yu(cfg.errorLimit) - 3);
  c.fillStyle = muted;
  c.textBaseline = "middle";
  c.fillText("0", left - 5, bot);
  c.fillText(String(cfg.errorLimit), left - 5, yu(cfg.errorLimit));
  // the saw-tooth
  c.beginPath();
  c.moveTo(x(0), yu(r.errorOut[0]));
  for (let i = 1; i < n; i++) {
    c.lineTo(x(r.dist[i]), yu(r.errorIn[i]));
    if (r.errorOut[i] < r.errorIn[i]) c.lineTo(x(r.dist[i]), yu(r.errorOut[i]));
  }
  c.strokeStyle = color;
  c.lineWidth = 1.8;
  c.lineJoin = "round";
  c.stroke();
  for (const i of r.photos) {
    c.beginPath();
    c.arc(x(r.dist[i]), yu(r.errorIn[i]), 3, 0, Math.PI * 2);
    c.fillStyle = "#fff";
    c.fill();
    c.strokeStyle = "#1a0f0a";
    c.lineWidth = 1;
    c.stroke();
  }
  // distance axis
  c.fillStyle = muted;
  c.textBaseline = "alphabetic";
  const fmt = (d: number) => (total >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);
  c.textAlign = "left";
  c.fillText("0", left, H - 3);
  c.textAlign = "center";
  c.fillText(fmt(total / 2), x(total / 2), H - 3);
  c.textAlign = "right";
  c.fillText(fmt(total), right, H - 3);
}
