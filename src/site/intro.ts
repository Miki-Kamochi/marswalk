/** Introduction: the problem told as a walk, one screen at a time (see steps.ts). */
import { dataUrl, loadMeta } from "../data/loader";
import { DEFAULTS } from "../plan/config";
import { decodeNav, NavGrid } from "../plan/grid";
import { initLang, tr } from "./lang";
import { cellPixel, cropGray, match, pickCells, playMatch } from "./matcher";
import { drawStars } from "./stars";
import { clamp01, ease, startDeck, type SlideCtx } from "./steps";

initLang();
drawStars();

const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as unknown as T;
const SVG = "http://www.w3.org/2000/svg";

// ------------------------------------------------------------ data loaded once in the background
const ortho = new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = dataUrl("imagery/ortho_1m.jpg");
});
const navGrid = (async () => {
  const meta = await loadMeta();
  const nav = meta.nav.grid;
  const buf = await fetch(dataUrl(nav.file)).then((r) => r.arrayBuffer());
  const layers = decodeNav(nav, new Uint8Array(buf));
  return new NavGrid(nav, { ...layers, elev: new Float32Array(nav.width * nav.height) }, DEFAULTS);
})();
const cells = navGrid.then(pickCells);

/** Show the slide's next hidden group (what the Next button does first). */
function revealNext(el: HTMLElement) {
  const first = el.querySelector<HTMLElement>("[data-reveal]:not(.shown)");
  if (!first) return;
  const key = first.dataset.reveal;
  el.querySelectorAll<HTMLElement>("[data-reveal]:not(.shown)").forEach((e) => {
    if (e === first || (key && e.dataset.reveal === key)) e.classList.add("shown");
  });
}

function ticks(g: SVGGElement, r0: number, r1: number, every = 30) {
  if (g.childElementCount) return;
  for (let a = 0; a < 360; a += every) {
    const l = document.createElementNS(SVG, "line");
    const s = Math.sin((a * Math.PI) / 180);
    const c = Math.cos((a * Math.PI) / 180);
    l.setAttribute("x1", String(r0 * s));
    l.setAttribute("y1", String(-r0 * c));
    l.setAttribute("x2", String(r1 * s));
    l.setAttribute("y2", String(-r1 * c));
    g.appendChild(l);
  }
}

// ------------------------------------------------------------ 2: four problems, each animates when it appears
function problems(ctx: SlideCtx) {
  const el = ctx.el;
  const phone = q(el, ".mini-phone");
  phone.classList.remove("searching", "failed");
  q(el, ".mp-status").textContent = "";
  ticks(q<SVGGElement>(el, ".cp-ticks"), 46, 52);
  q(el, ".mg-num").textContent = "100%";
  const fill = q<SVGCircleElement>(el, ".q-o2 .g-fill");
  fill.style.strokeDasharray = `${2 * Math.PI * 48}`;
  fill.style.strokeDashoffset = "0";
}
function problemsReveal(i: number, ctx: SlideCtx) {
  const el = ctx.el;
  if (i === 0) {
    // the phone searches, and finds nothing
    const phone = q(el, ".mini-phone");
    const status = q(el, ".mp-status");
    phone.classList.add("searching");
    void ctx.frames((t) => {
      if (t < 2600) status.textContent = tr(`Searching… ${Math.floor(t / 400) * 5}s`, `衛星を探索中… ${Math.floor(t / 400) * 5}秒`);
      else {
        phone.classList.remove("searching");
        phone.classList.add("failed");
        status.textContent = tr("0 satellites", "衛星 0機");
        return false;
      }
    });
  } else if (i === 1) {
    // the needle wanders: there is no field to line up with
    const needle = q<SVGGElement>(el, ".mc-needle");
    let n = 0;
    let v = 0;
    void ctx.frames((t) => {
      v += (Math.sin(t / 800) * 0.6 + Math.sin(t / 333) + (Math.random() - 0.5) * 2) * 0.1;
      v *= 0.95;
      n += v;
      needle.setAttribute("transform", `rotate(${n})`);
    });
  } else if (i === 2) {
    // a message out and back; 1 second on screen = 3 minutes (12.5 min each way at 1.5 AU)
    const dot = q<SVGCircleElement>(el, ".mc-dot");
    const clock = q<SVGTextElement>(el, ".mc-clock");
    const each = 12.5;
    const msEach = (each / 3) * 1000;
    void ctx.frames((t) => {
      const k = (t / msEach) % 2.6;
      const x = k <= 1 ? 196 - 172 * k : k <= 2 ? 24 + 172 * (k - 1) : 196;
      dot.setAttribute("cx", String(x));
      const min = Math.min(2, k) * each;
      clock.textContent = `${String(Math.floor(min)).padStart(2, "0")}:${String(Math.floor((min % 1) * 60)).padStart(2, "0")}${k > 2 ? tr(" reply", " 返信") : ""}`;
    });
  } else if (i === 3) {
    // the tank keeps draining while you are unsure
    const fill = q<SVGCircleElement>(el, ".q-o2 .g-fill");
    const num = q<SVGTextElement>(el, ".mg-num");
    const C = 2 * Math.PI * 48;
    void ctx.frames((t) => {
      const left = 1 - 0.3 * clamp01(t / 12000);
      fill.style.strokeDashoffset = `${C * (1 - left)}`;
      fill.style.stroke = left < 0.8 ? "#ffc75a" : "#5fd3a0";
      num.textContent = `${Math.round(left * 100)}%`;
    });
  }
}

// ------------------------------------------------------------ 3: Apollo 14, from Earth to the Moon
function apolloIntro(ctx: SlideCtx) {
  const svg = q<SVGSVGElement>(ctx.el, ".rocket-svg");
  const stars = Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 97) % 400}" cy="${(i * 53) % 420}" r="${i % 7 === 0 ? 1.6 : 0.9}" class="rk-star"/>`).join("");
  svg.innerHTML = `${stars}
    <circle cx="70" cy="336" r="44" class="rk-earth"/>
    <path d="M84 294 C 130 190 230 150 290 112" class="rk-path"/>
    <circle cx="330" cy="78" r="38" class="rk-moon"/>
    <circle cx="318" cy="70" r="7" class="rk-crater"/><circle cx="342" cy="92" r="5" class="rk-crater"/>
    <g class="rk-ship"><path d="M0 -22 C7 -14 8 -2 7 12 L-7 12 C-8 -2 -7 -14 0 -22 Z" class="rk-body"/><path d="M-7 6 L-13 16 L-7 14 Z M7 6 L13 16 L7 14 Z" class="rk-fin"/><path d="M-4 13 L0 26 L4 13 Z" class="rk-flame"/></g>
    <text x="70" y="404" class="rk-t">${tr("Earth", "地球")}</text>
    <text x="330" y="136" class="rk-t">${tr("Moon", "月")}</text>
    <text x="200" y="22" class="rk-t rk-date">${tr("Launch 31 Jan 1971 → on the Moon 5 Feb", "1971年1月31日 打ち上げ → 2月5日 月面着陸")}</text>`;
  const path = q<SVGPathElement>(svg, ".rk-path");
  const ship = q<SVGGElement>(svg, ".rk-ship");
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  void ctx.frames((t) => {
    const k = ctx.reduced ? 1 : ease(clamp01(t / 3200));
    path.style.strokeDashoffset = `${len * (1 - k)}`;
    const p = path.getPointAtLength(len * k);
    const p2 = path.getPointAtLength(Math.min(len, len * k + 1));
    const ang = k >= 1 ? 150 : (Math.atan2(p2.y - p.y, p2.x - p.x) * 180) / Math.PI + 90;
    ship.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${ang}) scale(1.3)`);
    return k < 1;
  });
}

// ------------------------------------------------------------ 4: the walk to Cone Crater, playing by itself
function apollo(ctx: SlideCtx) {
  const el = ctx.el;
  const svg = q<SVGSVGElement>(el, ".ap-svg");
  const read = q(el, ".ap-read");
  // 1 unit = 1 m; Cone Crater is about 340 m across
  const cx = 470;
  const cy = 170;
  const R = 170;
  const ang = (168 * Math.PI) / 180;
  const at = (d: number): [number, number] => [cx + (R + d) * Math.cos(ang), cy + (R + d) * Math.sin(ang)];
  const turn = at(25);
  const rim = at(0);
  const path = `M -10 310 C 50 290 90 330 140 300 S 200 230 240 262 S ${turn[0] - 30} ${turn[1] + 30} ${turn[0]} ${turn[1]}`;
  svg.innerHTML = `
    <defs><radialGradient id="apC"><stop offset="0.75" stop-color="#1b1310"/><stop offset="1" stop-color="#3a2a20"/></radialGradient></defs>
    ${Array.from({ length: 9 }, (_, i) => `<path class="ap-wave" d="M 0 ${30 + i * 38} Q 160 ${10 + i * 38} 320 ${34 + i * 38} T 640 ${26 + i * 38}"/>`).join("")}
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#apC)"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" class="ap-rim"/>
    <text x="${cx}" y="${cy + 6}" class="ap-lbl">${tr("Cone Crater", "コーン・クレーター")}</text>
    <text x="16" y="336" class="ap-lbl ap-left">${tr("← lander, about 1.1 km", "← 着陸船 約1.1 km")}</text>
    <path d="${path}" class="ap-path"/>
    <g class="ap-walker"><circle r="7"/></g>
    <g class="ap-turn" transform="translate(${turn[0]} ${turn[1]})"><circle r="8"/><text y="26">${tr("turned back", "ここで引き返した")}</text></g>
    <g class="ap-gap"><line x1="${turn[0]}" y1="${turn[1]}" x2="${rim[0]}" y2="${rim[1]}"/><text x="${(turn[0] + rim[0]) / 2 + 6}" y="${(turn[1] + rim[1]) / 2 - 14}">${tr("tens of metres", "数十m")}</text></g>
    <g class="ap-scale" transform="translate(520 335)"><line x1="0" x2="100" y1="0" y2="0"/><text x="50" y="-6">100 m</text></g>`;
  const pathEl = q<SVGPathElement>(svg, ".ap-path");
  const walker = q<SVGGElement>(svg, ".ap-walker");
  const turnEl = q<SVGGElement>(svg, ".ap-turn");
  turnEl.style.opacity = "0";
  q<SVGGElement>(svg, ".ap-gap").style.opacity = "0";
  const len = pathEl.getTotalLength();
  pathEl.style.strokeDasharray = `${len}`;
  read.textContent = tr("Walking toward the rim…", "縁へ向かって歩いている…");
  void ctx.frames((t) => {
    const k = ctx.reduced ? 1 : ease(clamp01((t - 300) / 4200));
    pathEl.style.strokeDashoffset = `${len * (1 - k)}`;
    const p = pathEl.getPointAtLength(len * k);
    walker.setAttribute("transform", `translate(${p.x} ${p.y})`);
    if (k >= 1) {
      turnEl.style.opacity = "1";
      read.textContent = tr("Where is the rim? They turn back.", "縁はどこ？ ここで引き返した。");
      ctx.done();
    }
    return k < 1;
  });
}
function apolloReveal(_i: number, ctx: SlideCtx) {
  q<SVGGElement>(ctx.el, ".ap-turn").style.opacity = "1";
  q<SVGGElement>(ctx.el, ".ap-gap").style.opacity = "1";
  q(ctx.el, ".ap-read").textContent = tr("The rim was only tens of metres away.", "縁はたった数十m先だった。");
}

// ------------------------------------------------------------ 5: a slope seen from eye height
const TRUE_SLOPE = 26;
function drawSlope(cv: HTMLCanvasElement, deg: number, side: number | null) {
  const W = (cv.width = 640);
  const H = (cv.height = 400);
  const c = cv.getContext("2d")!;
  const sky = c.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, "#c99a74");
  sky.addColorStop(1, "#e2b993");
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  const eye = 1.7;
  const f = W * 1.1;
  const horizon = H * 0.58;
  const t = Math.tan((deg * Math.PI) / 180);
  // a hill 26 m ahead: its face climbs at deg for 22 m, then a flat top; the sides fall away
  const z0 = 26;
  const run = 22;
  const half = 26;
  const height = (x: number, z: number) => {
    const along = z < z0 ? 0 : Math.min(run, z - z0) * t;
    return along * Math.min(1, Math.max(0, (half - Math.abs(x)) / 10));
  };
  const proj = (x: number, z: number): [number, number] => [W / 2 + (f * x) / z, horizon - (f * (height(x, z) - eye)) / z];
  const step = 2;
  for (let z = 90; z >= 4; z -= step) {
    for (let x = -60; x < 60; x += step) {
      const a = proj(x, z);
      const b = proj(x + step, z);
      const cc = proj(x + step, z + step);
      const d = proj(x, z + step);
      const dy = height(x + 1, z + 1) - height(x + 1, z);
      const dx = height(x + 1, z + 1) - height(x, z + 1);
      const light = Math.max(0.5, Math.min(1.25, 0.7 + dy * 0.7 - dx * 0.5));
      const fog = Math.min(0.75, z / 120);
      const mix = (v: number, s: number) => (v * light * (1 - fog) + s * fog) | 0;
      c.fillStyle = `rgb(${mix(165, 214)},${mix(108, 168)},${mix(74, 130)})`;
      c.beginPath();
      c.moveTo(...a);
      c.lineTo(...b);
      c.lineTo(...cc);
      c.lineTo(...d);
      c.closePath();
      c.fill();
      c.strokeStyle = `rgba(60,30,15,${0.22 * (1 - fog)})`;
      c.stroke();
    }
  }
  for (const [x, z, r] of [[-6, 9, 0.35], [4, 14, 0.5], [-14, 20, 0.6], [10, 33, 0.7], [-3, 38, 0.5]] as const) {
    const [px, py] = proj(x, z);
    const rad = (f * r) / z;
    c.fillStyle = "rgba(70,40,25,0.85)";
    c.beginPath();
    c.ellipse(px, py - rad * 0.4, rad, rad * 0.6, 0, 0, Math.PI * 2);
    c.fill();
  }
  if (side !== null) {
    const x0 = W - 210;
    const y0 = H - 30;
    c.fillStyle = "rgba(16,13,11,0.85)";
    c.beginPath();
    c.roundRect(x0 - 16, y0 - 120, 210, 140, 12);
    c.fill();
    c.strokeStyle = "#ffb27a";
    c.lineWidth = 3;
    const len = 150;
    const rad = (side * Math.PI) / 180;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0 + len, y0);
    c.moveTo(x0, y0);
    c.lineTo(x0 + len * Math.cos(rad), y0 - len * Math.sin(rad));
    c.stroke();
    c.fillStyle = "#f4ede6";
    c.font = "600 18px system-ui, sans-serif";
    c.fillText(`${side}°`, x0 + 52, y0 - 8);
    c.lineWidth = 1;
  }
}
let eyesCheck: (() => void) | null = null;
function eyes(ctx: SlideCtx) {
  const el = ctx.el;
  const cv = q<HTMLCanvasElement>(el, ".eye-cv");
  const range = q<HTMLInputElement>(el, ".eye-range");
  const read = q(el, ".eye-guess");
  const go = q<HTMLButtonElement>(el, ".eye-go");
  drawSlope(cv, TRUE_SLOPE, null);
  const show = () => (read.textContent = tr(`Your guess: ${range.value}°`, `あなたの予想：${range.value}°`));
  range.oninput = show;
  show();
  go.disabled = false;
  eyesCheck = () => {
    go.disabled = true;
    drawSlope(cv, TRUE_SLOPE, TRUE_SLOPE);
    read.textContent = tr(`Your guess: ${range.value}° · Real: ${TRUE_SLOPE}°`, `あなたの予想：${range.value}° · 本当は：${TRUE_SLOPE}°`);
  };
  go.onclick = () => {
    eyesCheck?.();
    revealNext(el);
    ctx.done();
  };
}

// ------------------------------------------------------------ 6: Perseverance, and how it finds itself
function drawRover(svg: SVGSVGElement) {
  // a generic six-wheeled Mars rover with a camera mast (our illustration)
  svg.innerHTML = `
    <ellipse cx="210" cy="234" rx="170" ry="12" class="rv-shadow"/>
    <g class="rv-legs"><path d="M120 170 L92 214 M120 170 L150 214 M300 170 L272 214 M300 170 L330 214 M210 176 L210 214"/></g>
    ${[92, 150, 210, 272, 330].map((x) => `<circle cx="${x}" cy="214" r="20" class="rv-wheel"/><circle cx="${x}" cy="214" r="7" class="rv-hub"/>`).join("")}
    <rect x="96" y="132" width="230" height="44" rx="6" class="rv-body"/>
    <rect x="96" y="132" width="230" height="10" rx="4" class="rv-deck"/>
    <path d="M326 140 L360 128 L366 150 L330 164 Z" class="rv-rtg"/>
    <path d="M128 132 L128 54" class="rv-mast"/>
    <rect x="106" y="30" width="48" height="26" rx="5" class="rv-head"/>
    <circle cx="120" cy="43" r="5" class="rv-eye"/><circle cx="140" cy="43" r="5" class="rv-eye"/>
    <path d="M96 160 L66 150 L48 176" class="rv-arm"/>
    <path d="M154 43 L260 4 L260 82 Z" class="rv-beam"/>
    <text x="210" y="258" class="rv-t">${tr("Mars rover (illustration) · about 3 m long", "火星探査車（イラスト）· 長さ約3 m")}</text>`;
}
async function robot(ctx: SlideCtx) {
  const el = ctx.el;
  drawRover(q(el, ".rover-svg"));
  el.classList.remove("shoot", "match");
  const cv = q<HTMLCanvasElement>(el, ".robot-cv");
  const W = (cv.width = 720);
  const H = (cv.height = 420);
  const c = cv.getContext("2d")!;
  const [img, grid, pick] = await Promise.all([ortho, navGrid, cells]);
  if (!ctx.alive()) return;
  const [px, py] = cellPixel(grid, pick.rock);
  const MW = 360;
  const MH = 210;
  const sx = Math.max(0, Math.min(img.width - MW, px - MW / 2));
  const sy = Math.max(0, Math.min(img.height - MH, py - MH / 2));
  const T = 50;
  const tx = px - sx - T / 2;
  const ty = py - sy - T / 2;
  // a wandering search that closes in on the true spot
  const path: [number, number][] = [];
  let gx = 30;
  let gy = 140;
  for (let i = 0; i < 22; i++) {
    const k = i / 21;
    gx += (tx - gx) * (0.12 + 0.5 * k) + (1 - k) * (Math.random() - 0.5) * 120;
    gy += (ty - gy) * (0.12 + 0.5 * k) + (1 - k) * (Math.random() - 0.5) * 80;
    gx = Math.max(0, Math.min(MW - T, gx));
    gy = Math.max(0, Math.min(MH - T, gy));
    path.push([gx, gy]);
  }
  path.push([tx, ty]);
  const S = W / MW;
  let started = -1;
  void ctx.frames((t) => {
    const phase = el.classList.contains("match") ? 2 : el.classList.contains("shoot") ? 1 : 0;
    if (phase === 2 && started < 0) started = t;
    c.drawImage(img, sx, sy, MW, MH, 0, 0, W, H);
    c.fillStyle = "rgba(10,8,6,0.25)";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#f4ede6";
    c.font = "600 14px system-ui, sans-serif";
    c.fillText(tr("Map made from orbit (HiRISE)", "軌道から撮った地図（HiRISE）"), 16, H - 16);
    if (phase >= 1) {
      // the rover's own photo, seen a little differently
      c.save();
      c.filter = "contrast(1.25) brightness(1.1) sepia(0.4)";
      c.drawImage(img, sx + tx, sy + ty, T, T, 16, 16, 130, 130);
      c.restore();
      c.strokeStyle = "#f4ede6";
      c.lineWidth = 2;
      c.strokeRect(16, 16, 130, 130);
      c.fillStyle = "#f4ede6";
      c.fillText(tr("Rover's photo", "探査車の写真"), 20, 166);
    }
    if (phase === 2) {
      const k = ctx.reduced ? 1 : Math.min(1, (t - started) / 3600);
      const f = k * (path.length - 1);
      const i = Math.floor(f);
      const a = path[i];
      const b = path[Math.min(path.length - 1, i + 1)];
      const u = ease(f - i);
      const x = a[0] + (b[0] - a[0]) * u;
      const y = a[1] + (b[1] - a[1]) * u;
      const found = k >= 1;
      c.strokeStyle = found ? "#5fd3a0" : "#ff6b2c";
      c.lineWidth = found ? 4 : 2;
      c.strokeRect(x * S, y * S, T * S, T * S);
      c.fillStyle = "rgba(16,13,11,0.85)";
      c.fillRect(W - 262, 16, 246, 36);
      c.fillStyle = found ? "#5fd3a0" : "#ffb27a";
      c.fillText(found ? tr("Match: position to about 25 cm", "一致：位置は約25 cm") : tr("Comparing with the map…", "地図と照合中…"), W - 250, 39);
      if (found) ctx.done();
    }
  });
}
function robotReveal(i: number, ctx: SlideCtx) {
  if (i === 0) ctx.el.classList.add("shoot");
  if (i === 1) ctx.el.classList.add("match");
}

// ------------------------------------------------------------ 7: what a position check needs
function needs(ctx: SlideCtx) {
  const el = ctx.el;
  const [shade, horizon, often] = Array.from(el.querySelectorAll<SVGSVGElement>(".n-svg"));
  // shadow: a rock casting a long shadow; a camera in the sun works, in the shadow it does not
  shade.innerHTML = `
    <circle cx="190" cy="26" r="14" class="ns-sun"/>
    <path d="M0 96 L220 96 L220 130 L0 130 Z" class="ns-ground"/>
    <path d="M70 96 L96 46 L126 96 Z" class="ns-rock"/>
    <path d="M70 96 L126 96 L20 118 L4 108 Z" class="ns-shadow"/>
    <g transform="translate(40 104)"><circle r="10" class="ns-cam bad"/><path d="M-5 -5 L5 5 M5 -5 L-5 5" class="ns-mark"/></g>
    <g transform="translate(168 110)"><circle r="10" class="ns-cam ok"/><path d="M-5 0 L-1 4 L6 -4" class="ns-mark"/></g>`;
  // landmarks: Mount Sharp and buttes on the horizon
  horizon.innerHTML = `
    <path d="M0 90 L30 84 L60 60 L80 42 L104 30 L128 44 L150 66 L170 80 L220 86 L220 130 L0 130 Z" class="nh-far"/>
    <path d="M20 96 L34 80 L50 80 L58 96 Z M150 96 L160 84 L178 84 L186 96 Z" class="nh-butte"/>
    <path d="M0 96 L220 96 L220 130 L0 130 Z" class="ns-ground"/>
    <text x="104" y="22" class="nh-t">${tr("Mount Sharp", "シャープ山")}</text>
    <text x="40" y="72" class="nh-t">${tr("butte", "ビュート")}</text>`;
  often.innerHTML = `<path d="M10 100 C 60 70 120 120 210 60" class="no-path"/><circle class="no-circ" r="4"/><circle class="no-dot" r="4"/>`;
  el.querySelectorAll<HTMLCanvasElement>(".nu-heat").forEach((h) => (h.width = h.height = 1));
  q(el, ".no-read").textContent = "";
}
async function needsReveal(i: number, ctx: SlideCtx) {
  const el = ctx.el;
  if (i === 0) {
    // dunes vs rock, matched for real on the HiRISE image
    const [img, grid, pick] = await Promise.all([ortho, navGrid, cells]);
    if (!ctx.alive()) return;
    const heats = Array.from(el.querySelectorAll<HTMLCanvasElement>(".nu-heat"));
    [pick.dune, pick.rock].forEach((cell, k) => {
      const m = match(cropGray(img, ...cellPixel(grid, cell)));
      void playMatch(document.createElement("canvas"), heats[k], m, ctx.reduced ? 0 : 1400, ctx.alive);
    });
  } else if (i === 3) {
    // the error circle grows as you walk and snaps back at each photo check
    const svg = el.querySelectorAll<SVGSVGElement>(".n-svg")[2];
    const path = q<SVGPathElement>(svg, ".no-path");
    const circ = q<SVGCircleElement>(svg, ".no-circ");
    const dot = q<SVGCircleElement>(svg, ".no-dot");
    const read = q(el, ".no-read");
    const len = path.getTotalLength();
    void ctx.frames((t) => {
      const k = (t / 7000) % 1;
      const p = path.getPointAtLength(len * k);
      const sinceFix = (k * 3) % 1; // three checks along the way
      const err = 2 + 16 * sinceFix;
      for (const c of [circ, dot]) {
        c.setAttribute("cx", String(p.x));
        c.setAttribute("cy", String(p.y));
      }
      circ.setAttribute("r", String(err * 1.4));
      read.textContent = sinceFix < 0.08 ? tr("📷 photo check → 2 m", "📷 写真で確認 → 2 m") : tr(`position error ${err.toFixed(0)} m`, `位置の誤差 ${err.toFixed(0)} m`);
    });
  }
}

startDeck({
  problems: { enter: problems, reveal: problemsReveal },
  "apollo-intro": { enter: apolloIntro },
  apollo: { enter: apollo, reveal: apolloReveal },
  eyes: {
    enter: eyes,
    // "Next" before checking also shows the answer
    reveal: (i) => {
      if (i === 0) eyesCheck?.();
    },
  },
  robot: { enter: (c) => void robot(c), reveal: robotReveal },
  needs: { enter: needs, reveal: (i, c) => void needsReveal(i, c) },
});
