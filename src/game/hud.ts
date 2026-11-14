import type { Region } from '../nav/mgl';
import type { Nav } from './nav';
import type { World } from './world';
const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  mapOpen = false;
  readonly imagery = new Image();
  private map = $('minimap') as HTMLCanvasElement;
  private fullMap = $('fullMap') as HTMLCanvasElement;
  private lastDraw = -1;
  constructor(private world: World, url: string) {
    this.imagery.onload = () => { this.lastDraw = -1; };
    this.imagery.src = url;
    addEventListener('resize', () => this.resize());
  }
  show(on: boolean) { $('hud').style.display = on ? 'block' : 'none'; this.resize(); }
  toggleMap(open = !this.mapOpen) {
    this.mapOpen = open;
    $('mapOverlay').hidden = !open;
    this.resize(); this.lastDraw = -1;
  }
  private resize() {
    for (const canvas of [this.map, this.fullMap]) {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * Math.min(devicePixelRatio, 2)));
      canvas.height = Math.max(1, Math.round(r.height * Math.min(devicePixelRatio, 2)));
    }
    this.lastDraw = -1;
  }
  update(nav: Nav, home: {e: number;n: number}, state: { time: number; oxygen: number; dust: number; scan: string; message: string; heading: number }) {
    $('clock').textContent = `EVA ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')} · 試料回収済み`;
    $('o2text').textContent = `O₂ ${Math.max(0, Math.ceil(state.oxygen / 60))} min`;
    $('o2fill').style.width = `${Math.max(0, state.oxygen / (30 * 60)) * 100}%`;
    $('heading').textContent = `方位 ${Math.round((state.heading * 180 / Math.PI % 360 + 360) % 360)}°`;
    $('radius').textContent = `存在可能性円 · 半径 ${Math.ceil(nav.region.current.radius)} m`;
    $('scanStatus').textContent = state.scan;
    $('alert').textContent = state.message;
    $('weather').textContent = state.dust > 0.53 ? '砂塵の突風 · 地平線の視認性低下' : '薄い砂塵 · 近くの地表は視認可能';
    $('scanBtn').textContent = state.scan.startsWith('撮影') ? '撮影中…' : 'スキャン [右クリック / E]';
    if (state.time - this.lastDraw > 0.15 || this.lastDraw < 0) {
      this.drawMap(this.map, nav, home);
      if (this.mapOpen) this.drawMap(this.fullMap, nav, home);
      this.lastDraw = state.time;
    }
    const q = nav.lastMatch;
    $('quality').textContent = q
      ? `撮影範囲 ${Math.round(q.coverage*100)}% · 地表の濃淡 ${Math.round(q.contrast*100)}% · 視認性 ${Math.round(q.clarity*100)}% · 姿勢 ${Math.round(q.orientation*100)}% · 照合の一意性 ${Math.round(q.uniqueness*100)}%`
      : '静止し、周囲の地表が広く見える場所でスキャンしてください。';
    $('scanLog').textContent = nav.region.pins.slice(-8).reverse().map(p => `#${p.id}  ${Math.floor(p.time/60)}:${String(Math.floor(p.time%60)).padStart(2,'0')}  半径 ${Math.ceil(p.radius)} m · ${p.improved ? '位置推定を更新' : '縮小なし'}`).join('\n');
  }
  drawMap(cv: HTMLCanvasElement, nav: Nav, home: {e: number;n: number}) {
    const ctx = cv.getContext('2d')!, W = cv.width, H = cv.height;
    const b = this.world.meta.frame.play;
    const scale = Math.min((W-32)/(b.east-b.west), (H-32)/(b.north-b.south));
    const ox = (W-(b.east-b.west)*scale)/2, oy = (H-(b.north-b.south)*scale)/2;
    const X = (e: number) => ox+(e-b.west)*scale, Y = (n: number) => oy+(b.north-n)*scale;
    ctx.fillStyle = '#1c1714'; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.beginPath(); ctx.rect(ox,oy,(b.east-b.west)*scale,(b.north-b.south)*scale); ctx.clip();
    const imgB = this.world.meta.images.color.bounds;
    if (this.imagery.complete && this.imagery.naturalWidth)
      ctx.drawImage(this.imagery,X(imgB.west),Y(imgB.north),(imgB.east-imgB.west)*scale,(imgB.north-imgB.south)*scale);
    ctx.fillStyle = 'rgba(8,12,15,.15)';ctx.fillRect(0,0,W,H);
    ctx.font = `${Math.max(11, W/65)}px system-ui`;
    const circle = (r: Region, historic: boolean, label = '') => {
      const radius = r.radius*scale;
      ctx.setLineDash(historic ? [4,4] : []);
      ctx.strokeStyle = historic ? '#ffbf75' : '#91eaff';
      ctx.lineWidth = historic ? 1.5 : 2;
      const fill = ctx.createRadialGradient(X(r.e),Y(r.n),0,X(r.e),Y(r.n),Math.max(0.1,radius));
      fill.addColorStop(0, historic ? 'rgba(255,190,110,.13)' : 'rgba(110,225,255,.3)');
      fill.addColorStop(1,'rgba(110,225,255,0.03)');
      ctx.fillStyle=fill;ctx.beginPath();ctx.arc(X(r.e),Y(r.n),radius,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(label){ctx.fillStyle='#ffddae';ctx.fillText(label,X(r.e)+radius+3,Y(r.n));}
    };
    for(const pin of nav.region.pins) circle(pin,true,`#${pin.id}`);
    circle(nav.region.current,false);
    // Only the known base has a point symbol. No live-position or heading marker.
    ctx.setLineDash([]);ctx.fillStyle='#fff4d4';ctx.fillRect(X(home.e)-4,Y(home.n)-4,8,8);
    ctx.fillText('BASE',X(home.e)+8,Y(home.n)-7);
    ctx.restore();ctx.fillStyle='#fff4d4';ctx.font=`${Math.max(12,W/55)}px system-ui`;
    ctx.fillText('N ↑',12,22);
    const bar=500*scale;ctx.fillRect(12,H-17,bar,2);ctx.fillText('500 m',12,H-23);
  }
}
