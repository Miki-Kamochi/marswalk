import type { Region } from '../nav/mgl';
import type { Nav } from './nav';
import { TIME_LIMIT } from './mission';
import type { World } from './world';
const $ = (id: string) => document.getElementById(id)!;
export interface CollectionTarget { id: string; name: string; e: number; n: number; collected: boolean; index: number }

export class Hud {
  mapOpen = false;
  readonly imagery = new Image();
  private map = $('minimap') as HTMLCanvasElement;
  private fullMap = $('fullMap') as HTMLCanvasElement;
  private lastDraw = -1;
  constructor(private world: World, url: string) {
    this.imagery.onload = () => { this.lastDraw = -1; }; this.imagery.src = url;
    addEventListener('resize', () => this.resize());
  }
  show(on: boolean) { $('hud').style.display = on ? 'block' : 'none'; this.resize(); }
  toggleMap(open = !this.mapOpen) { this.mapOpen = open; $('mapOverlay').hidden = !open; this.resize(); this.lastDraw = -1; }
  private resize() {
    for (const canvas of [this.map, this.fullMap]) {
      const r = canvas.getBoundingClientRect(); canvas.width = Math.max(1, Math.round(r.width * Math.min(devicePixelRatio, 2))); canvas.height = Math.max(1, Math.round(r.height * Math.min(devicePixelRatio, 2)));
    }
    this.lastDraw = -1;
  }
  update(nav: Nav, targets: CollectionTarget[], state: { time: number; remaining: number; dust: number; scan: string; message: string; heading: number; speed: number }) {
    const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const count = targets.filter(t => t.collected).length;
    $('clock').textContent = `経過 ${clock(state.time)} · 回収 ${count}/${targets.length}`;
    $('o2text').textContent = `強制帰還まで ${clock(state.remaining)}`;
    $('o2fill').style.width = `${Math.max(0, state.remaining / TIME_LIMIT) * 100}%`;
    $('heading').textContent = `方位 ${Math.round((state.heading * 180 / Math.PI % 360 + 360) % 360)}° · ${state.speed}×`;
    $('radius').textContent = `存在可能性円 · 半径 ${Math.ceil(nav.region.current.radius)} m`;
    $('scanStatus').textContent = state.scan; $('alert').textContent = state.message;
    $('weather').textContent = state.dust > 0.8 ? '砂嵐 · 中距離の地表も視認困難' : state.dust > 0.45 ? '砂嵐接近 · 視界低下中' : '薄い砂塵 · 視界安定';
    $('scanBtn').textContent = state.scan.startsWith('撮影') ? '撮影中…' : 'スキャン [右クリック / E]';
    $('targetList').innerHTML = targets.map((t, i) => `<span class="${t.collected ? 'done' : ''}">${t.collected ? '✓' : i + 1} ${t.name}</span>`).join('');
    if (state.time - this.lastDraw > 0.15 || this.lastDraw < 0) {
      this.drawMap(this.map, nav, targets); if (this.mapOpen) this.drawMap(this.fullMap, nav, targets); this.lastDraw = state.time;
    }
    const q = nav.lastMatch;
    $('quality').textContent = q ? `撮影範囲 ${Math.round(q.coverage * 100)}% · 地表の濃淡 ${Math.round(q.contrast * 100)}% · 視認性 ${Math.round(q.clarity * 100)}% · 姿勢 ${Math.round(q.orientation * 100)}% · 照合の一意性 ${Math.round(q.uniqueness * 100)}%` : '静止し、周囲の地表が広く見える場所でスキャンしてください。';
    $('scanLog').textContent = nav.region.pins.slice(-8).reverse().map(p => `#${p.id}  ${clock(p.time)}  半径 ${Math.ceil(p.radius)} m · ${p.improved ? '位置推定を更新' : '縮小なし'}`).join('\n');
  }
  drawMap(cv: HTMLCanvasElement, nav: Nav, targets: CollectionTarget[]) {
    const ctx = cv.getContext('2d')!, W = cv.width, H = cv.height, b = this.world.meta.frame.play;
    const scale = Math.min((W - 32) / (b.east - b.west), (H - 32) / (b.north - b.south));
    const ox = (W - (b.east - b.west) * scale) / 2, oy = (H - (b.north - b.south) * scale) / 2;
    const X = (e: number) => ox + (e - b.west) * scale, Y = (n: number) => oy + (b.north - n) * scale;
    ctx.fillStyle = '#1c1714'; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, (b.east - b.west) * scale, (b.north - b.south) * scale); ctx.clip();
    const imgB = this.world.meta.images.color.bounds;
    if (this.imagery.complete && this.imagery.naturalWidth) ctx.drawImage(this.imagery, X(imgB.west), Y(imgB.north), (imgB.east - imgB.west) * scale, (imgB.north - imgB.south) * scale);
    ctx.fillStyle = 'rgba(8,12,15,.15)'; ctx.fillRect(0, 0, W, H); ctx.font = `${Math.max(11, W / 65)}px system-ui`;
    const circle = (r: Region, historic: boolean, label = '') => {
      const radius = r.radius * scale; ctx.setLineDash(historic ? [4, 4] : []); ctx.strokeStyle = historic ? '#ffbf75' : '#91eaff'; ctx.lineWidth = historic ? 1.5 : 2;
      const fill = ctx.createRadialGradient(X(r.e), Y(r.n), 0, X(r.e), Y(r.n), Math.max(0.1, radius)); fill.addColorStop(0, historic ? 'rgba(255,190,110,.13)' : 'rgba(110,225,255,.3)'); fill.addColorStop(1, 'rgba(110,225,255,0.03)');
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(X(r.e), Y(r.n), radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); if (label) { ctx.fillStyle = '#ffddae'; ctx.fillText(label, X(r.e) + radius + 3, Y(r.n)); }
    };
    for (const pin of nav.region.pins) circle(pin, true, `#${pin.id}`); circle(nav.region.current, false);
    ctx.setLineDash([]);
    targets.forEach((target, i) => {
      const x = X(target.e), y = Y(target.n); ctx.fillStyle = target.collected ? '#84d69a' : '#ffd66b'; ctx.strokeStyle = '#24160e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(5, W / 75), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1b1511'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(target.collected ? '✓' : String(i + 1), x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    });
    ctx.restore(); ctx.fillStyle = '#fff4d4'; ctx.font = `${Math.max(12, W / 55)}px system-ui`; ctx.fillText('N ↑', 12, 22); const bar = 500 * scale; ctx.fillRect(12, H - 17, bar, 2); ctx.fillText('500 m', 12, H - 23);
  }
}
