import type { Region } from '../nav/mgl';
import type { Nav } from './nav';
import type { World } from '../world/world';
const $ = (id: string) => document.getElementById(id)!;
export interface CollectionTarget { id: string; name: string; e: number; n: number; collected: boolean; index: number }
export interface MapPoint { e: number; n: number }

export class Hud {
  mapOpen = false;
  readonly imagery = new Image();
  private map = $('minimap') as HTMLCanvasElement;
  private fixMap = $('fixMap') as HTMLCanvasElement;
  private lastDraw = -1;
  constructor(private world: World, url: string, private route: MapPoint[] = []) {
    this.imagery.onload = () => { this.lastDraw = -1; }; this.imagery.src = url;
    addEventListener('resize', () => this.resize());
  }
  show(on: boolean) { $('hud').style.display = on ? 'block' : 'none'; this.resize(); }
  toggleMap(open = !this.mapOpen) {
    this.mapOpen = open; $('mapBox').classList.toggle('expanded', open);
    requestAnimationFrame(() => this.resize()); setTimeout(() => this.resize(), 360);
    this.lastDraw = -1;
  }
  showLocalization(nav: Nav, targets: CollectionTarget[], from: Region, to: Region, progress = 0) {
    $('fixOverlay').hidden = false;
    const r = this.fixMap.getBoundingClientRect();
    this.fixMap.width = Math.max(1, Math.round(r.width * Math.min(devicePixelRatio, 2)));
    this.fixMap.height = Math.max(1, Math.round(r.height * Math.min(devicePixelRatio, 2)));
    const ease = 1 - Math.pow(1 - Math.min(1, progress), 3);
    const current = {
      e: from.e + (to.e - from.e) * ease,
      n: from.n + (to.n - from.n) * ease,
      radius: from.radius + (to.radius - from.radius) * ease,
    };
    const startSpan = Math.max(700, Math.min(1800, from.radius * 5));
    const endSpan = Math.max(180, to.radius * 8);
    const height = startSpan + (endSpan - startSpan) * ease;
    const width = height * Math.max(1, r.width / Math.max(1, r.height));
    this.drawMap(this.fixMap, nav, targets, current, {
      west: to.e - width / 2, east: to.e + width / 2,
      south: to.n - height / 2, north: to.n + height / 2,
    });
    const reticle = $('fixReticle'); reticle.style.left = '50%'; reticle.style.top = '50%';
  }
  hideLocalization() { $('fixOverlay').hidden = true; }
  private resize() {
    for (const canvas of [this.map]) {
      const r = canvas.getBoundingClientRect(); canvas.width = Math.max(1, Math.round(r.width * Math.min(devicePixelRatio, 2))); canvas.height = Math.max(1, Math.round(r.height * Math.min(devicePixelRatio, 2)));
    }
    this.lastDraw = -1;
  }
  update(nav: Nav, targets: CollectionTarget[], state: { time: number; remaining: number; total: number; dust: number; scan: string; message: string; heading: number; speed: number }) {
    const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const count = targets.filter(t => t.collected).length;
    $('clock').textContent = `経過 ${clock(state.time)} · 回収 ${count}/${targets.length}`;
    $('o2text').textContent = `強制帰還まで ${clock(state.remaining)}`;
    $('o2fill').style.width = `${Math.max(0, state.remaining / state.total) * 100}%`;
    $('heading').textContent = `方位 ${Math.round((state.heading * 180 / Math.PI % 360 + 360) % 360)}° · ${state.speed}×`;
    $('radius').textContent = `存在可能性円 · 半径 ${Math.ceil(nav.region.current.radius)} m`;
    $('scanStatus').textContent = state.scan; $('alert').textContent = state.message;
    $('weather').textContent = state.dust > 0.5 ? '砂塵濃度上昇 · 遠景が霞む' : state.dust > 0.3 ? '砂塵が増加中' : '薄い砂塵 · 視界安定';
    $('scanBtn').textContent = state.scan.startsWith('撮影') ? '撮影中…' : 'スキャン [右クリック / E]';
    $('targetList').innerHTML = targets.map((t, i) => `<span class="${t.collected ? 'done' : ''}">${t.collected ? '✓' : i + 1} ${t.name}</span>`).join('');
    if (state.time - this.lastDraw > 0.15 || this.lastDraw < 0) {
      this.drawMap(this.map, nav, targets); this.lastDraw = state.time;
    }
  }
  drawMap(cv: HTMLCanvasElement, nav: Nav, targets: CollectionTarget[], current: Region = nav.region.current, view?: { west: number; east: number; south: number; north: number }) {
    const ctx = cv.getContext('2d')!, W = cv.width, H = cv.height, b = view ?? this.world.meta.frame.play;
    const scale = Math.min((W - 32) / (b.east - b.west), (H - 32) / (b.north - b.south));
    const ox = (W - (b.east - b.west) * scale) / 2, oy = (H - (b.north - b.south) * scale) / 2;
    const X = (e: number) => ox + (e - b.west) * scale, Y = (n: number) => oy + (b.north - n) * scale;
    ctx.fillStyle = '#031923'; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, (b.east - b.west) * scale, (b.north - b.south) * scale); ctx.clip();
    const imgB = this.world.meta.images.color.bounds;
    if (this.imagery.complete && this.imagery.naturalWidth) ctx.drawImage(this.imagery, X(imgB.west), Y(imgB.north), (imgB.east - imgB.west) * scale, (imgB.north - imgB.south) * scale);
    ctx.fillStyle = 'rgba(0,25,38,.38)'; ctx.fillRect(0, 0, W, H); ctx.font = `${Math.max(11, W / 65)}px ui-monospace, monospace`;
    if (this.route.length > 1) {
      ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(2,18,24,.9)'; ctx.lineWidth = Math.max(4, W / 130); ctx.beginPath();
      this.route.forEach((p, i) => i ? ctx.lineTo(X(p.e), Y(p.n)) : ctx.moveTo(X(p.e), Y(p.n))); ctx.stroke();
      ctx.strokeStyle = '#ff9a58'; ctx.lineWidth = Math.max(2, W / 260); ctx.stroke();
    }
    const circle = (r: Region, historic: boolean, label = '') => {
      const radius = r.radius * scale; ctx.setLineDash(historic ? [4, 4] : []); ctx.strokeStyle = historic ? '#3fbad3' : '#91f2ff'; ctx.lineWidth = historic ? 1.5 : 2;
      const fill = ctx.createRadialGradient(X(r.e), Y(r.n), 0, X(r.e), Y(r.n), Math.max(0.1, radius)); fill.addColorStop(0, historic ? 'rgba(53,174,200,.13)' : 'rgba(110,225,255,.3)'); fill.addColorStop(1, 'rgba(110,225,255,0.03)');
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(X(r.e), Y(r.n), radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); if (label) { ctx.fillStyle = '#9cefff'; ctx.fillText(label, X(r.e) + radius + 3, Y(r.n)); }
    };
    for (const pin of nav.region.pins) circle(pin, true, `#${pin.id}`); circle(current, false);
    ctx.setLineDash([]);
    targets.forEach((target, i) => {
      const x = X(target.e), y = Y(target.n); ctx.fillStyle = target.collected ? '#8dffcf' : '#73edff'; ctx.strokeStyle = '#062936'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(5, W / 75), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#04202a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(target.collected ? '✓' : String(i + 1), x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    });
    ctx.restore(); ctx.fillStyle = '#c9f8ff'; ctx.font = `${Math.max(12, W / 55)}px ui-monospace, monospace`; ctx.fillText('N ↑', 12, 22); const bar = 500 * scale; ctx.fillRect(12, H - 17, bar, 2); ctx.fillText('500 m', 12, H - 23);
  }
}
