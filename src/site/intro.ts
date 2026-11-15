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

const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T & Element>(sel) as T;
const SVG = "http://www.w3.org/2000/svg";

// ------------------------------------------------------------ shared data, loaded once in the background
/** time "spent working out where you are" on the slides before the oxygen one, in mission minutes */
let lostMinutes = 0;
let lostFrom = 0;
let callMinutes = 0;

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

// ------------------------------------------------------------ 2: the phone finds no satellites
function phone(ctx: SlideCtx) {
  lostFrom = performance.now();
  const el = ctx.el;
  const btn = q<HTMLButtonElement>(el, ".ph-btn");
  const status = q(el, ".ph-status");
  const ring = q(el, ".ph-ring");
  el.classList.remove("searching", "failed");
  status.textContent = tr("Ready", "待機中");
  btn.disabled = false;
  btn.onclick = async () => {
    btn.disabled = true;
    el.classList.add("searching");
    for (let s = 0; s <= 6; s++) {
      status.textContent = tr(`Searching for satellites… ${s * 5}s`, `衛星を探しています… ${s * 5}秒`);
      if (!(await ctx.wait(450))) return;
    }
    el.classList.remove("searching");
    el.classList.add("failed");
    ring.textContent = "";
    status.textContent = tr("No signal · 0 satellites found", "圏外 · 見つかった衛星 0機");
    btn.disabled = false;
    revealNext(el);
    ctx.done();
  };
}

/** show the slide's next hidden line (the same thing the Next button does first) */
function revealNext(el: HTMLElement) {
  el.querySelector("[data-reveal]:not(.shown)")?.classList.add("shown");
}

// ------------------------------------------------------------ 3: a compass with nothing to point at
function compass(ctx: SlideCtx) {
  const el = ctx.el;
  const svg = q<SVGSVGElement>(el, "svg.compass");
  const dial = q<SVGGElement>(el, ".cp-dial");
  const needle = q<SVGGElement>(el, ".cp-needle");
  const read = q(el, ".cp-read");
  const ticks = q<SVGGElement>(el, ".cp-ticks");
  if (!ticks.childElementCount) {
    for (let a = 0; a < 360; a += 10) {
      const l = document.createElementNS(SVG, "line");
      const r1 = a % 90 === 0 ? 112 : 118;
      l.setAttribute("x1", String(r1 * Math.sin((a * Math.PI) / 180)));
      l.setAttribute("y1", String(-r1 * Math.cos((a * Math.PI) / 180)));
      l.setAttribute("x2", String(126 * Math.sin((a * Math.PI) / 180)));
      l.setAttribute("y2", String(-126 * Math.cos((a * Math.PI) / 180)));
      ticks.appendChild(l);
    }
  }
  let heading = 0;
  let turned = 0;
  let dragging = false;
  let lastA = 0;
  const angleAt = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
  };
  svg.onpointerdown = (e) => {
    dragging = true;
    lastA = angleAt(e);
    svg.setPointerCapture(e.pointerId);
  };
  svg.onpointermove = (e) => {
    if (!dragging) return;
    const a = angleAt(e);
    let d = a - lastA;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    heading += d;
    turned += Math.abs(d);
    lastA = a;
    if (turned > 120) {
      revealNext(el);
      ctx.done();
    }
  };
  svg.onpointerup = () => (dragging = false);
  // the needle drifts at random: there is no field to line up with
  let n = 0;
  let nv = 0;
  void ctx.frames((t) => {
    nv += (Math.sin(t / 900) * 0.6 + Math.sin(t / 377) * 0.9 + (Math.random() - 0.5) * 2) * 0.08;
    nv *= 0.96;
    n += nv;
    dial.setAttribute("transform", `rotate(${-heading})`);
    needle.setAttribute("transform", `rotate(${n})`);
    read.textContent = tr("Needle: no steady direction", "針：一定の方向を指さない");
  });
}

// ------------------------------------------------------------ 4: a message to Earth and back
function earth(ctx: SlideCtx) {
  const el = ctx.el;
  const au = q<HTMLInputElement>(el, ".call-au");
  const mars = q<SVGCircleElement>(el, ".call-mars");
  const marsT = q<SVGTextElement>(el, ".call-mars-t");
  const line = q<SVGLineElement>(el, ".call-line");
  const dot = q<SVGCircleElement>(el, ".call-dot");
  const delayEl = q(el, ".call-delay");
  const clock = q(el, ".call-clock");
  const state = q(el, ".call-state");
  const send = q<HTMLButtonElement>(el, ".call-send");
  const x = () => 150 + ((Number(au.value) - 0.38) / (2.67 - 0.38)) * 420;
  const delay = () => (Number(au.value) * 499) / 60; // light minutes
  const fmt = (min: number) => `${String(Math.floor(min)).padStart(2, "0")}:${String(Math.floor((min % 1) * 60)).padStart(2, "0")}`;
  const layout = () => {
    const mx = x();
    mars.setAttribute("cx", String(mx));
    marsT.setAttribute("x", String(mx));
    line.setAttribute("x2", String(mx));
    dot.setAttribute("cx", String(mx));
    delayEl.textContent = tr(`${Number(au.value).toFixed(2)} AU · one way ${delay().toFixed(1)} min`, `${Number(au.value).toFixed(2)} 天文単位 · 片道 ${delay().toFixed(1)} 分`);
  };
  au.oninput = layout;
  layout();
  clock.textContent = "00:00";
  state.textContent = "";
  send.disabled = false;
  send.onclick = async () => {
    send.disabled = true;
    au.disabled = true;
    const d = delay();
    // 1 second on screen = 3 minutes
    const each = (d / 3) * 1000;
    const mx = x();
    await ctx.frames((t) => {
      const k = Math.min(2, t / each);
      const pos = k <= 1 ? mx + (70 - mx) * k : 70 + (mx - 70) * (k - 1);
      dot.setAttribute("cx", String(pos));
      clock.textContent = fmt(k * d);
      state.textContent = k < 1 ? tr("Your message is on its way to Earth…", "メッセージが地球へ向かっている…") : k < 2 ? tr("Earth answers. Waiting for the reply…", "地球が返信。返事を待っている…") : "";
      return k < 2;
    });
    if (!ctx.alive()) return;
    callMinutes = 2 * d;
    state.textContent = tr(`Reply received after ${fmt(2 * d)}. You have walked on since asking.`, `返事が届いたのは ${fmt(2 * d)} 後。聞いたときの場所から、もう歩いている。`);
    send.disabled = false;
    au.disabled = false;
    revealNext(el);
    ctx.done();
  };
}

// ------------------------------------------------------------ 5: the oxygen used while being unsure
function oxygen(ctx: SlideCtx) {
  if (lostFrom) lostMinutes = (performance.now() - lostFrom) / 1000;
  // what the walk-through cost: every real second counted as a mission minute, plus the call
  const minutes = Math.round(Math.min(150, Math.max(20, lostMinutes + callMinutes)));
  const tankMin = (DEFAULTS.tankJoules / 250 / 60) | 0; // a full tank at a steady walk, minutes
  const share = minutes / tankMin;
  const el = ctx.el;
  const fill = q<SVGCircleElement>(el, ".g-fill");
  const num = q<SVGTextElement>(el, ".g-num");
  const C = 2 * Math.PI * 92;
  fill.style.strokeDasharray = `${C}`;
  q(el, ".ox-text").innerHTML = tr(
    `Working out where you are just took you about <b>${minutes} minutes</b>. A full suit tank lasts about ${Math.round(tankMin / 60)} hours of walking: that is <b>${Math.round(share * 100)}%</b> of it gone.`,
    `ここまで位置を確かめようとして、約<b>${minutes}分</b>かかった。宇宙服の酸素は歩き続けて約${Math.round(tankMin / 60)}時間分。その<b>${Math.round(share * 100)}%</b>を使ったことになる。`,
  );
  void ctx.frames((t) => {
    const k = ctx.reduced ? 1 : ease(clamp01(t / 1800));
    const left = 1 - share * k;
    fill.style.strokeDashoffset = `${C * (1 - left)}`;
    num.textContent = `${Math.round(left * 100)}%`;
    return k < 1;
  });
}

// ------------------------------------------------------------ 6: Apollo 14 and Cone Crater
function apollo(ctx: SlideCtx) {
  const el = ctx.el;
  const svg = q<SVGSVGElement>(el, ".ap-svg");
  const range = q<HTMLInputElement>(el, ".ap-range");
  const guessEl = q(el, ".ap-guess");
  const go = q<HTMLButtonElement>(el, ".ap-go");
  // 1 unit = 1 m; Cone Crater is about 340 m across
  const cx = 470;
  const cy = 170;
  const R = 170;
  const ang = (168 * Math.PI) / 180;
  const at = (d: number): [number, number] => [cx + (R + d) * Math.cos(ang), cy + (R + d) * Math.sin(ang)];
  const turn = at(25);
  const path = `M -10 310 C 50 290 90 330 140 300 S 200 230 240 262 S ${turn[0] - 30} ${turn[1] + 30} ${turn[0]} ${turn[1]}`;
  svg.innerHTML = `
    <defs><radialGradient id="apC"><stop offset="0.75" stop-color="#1b1310"/><stop offset="1" stop-color="#3a2a20"/></radialGradient></defs>
    ${Array.from({ length: 9 }, (_, i) => `<path class="ap-wave" d="M 0 ${30 + i * 38} Q 160 ${10 + i * 38} 320 ${34 + i * 38} T 640 ${26 + i * 38}"/>`).join("")}
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#apC)" class="ap-crater"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" class="ap-rim"/>
    <text x="${cx}" y="${cy + 6}" class="ap-lbl">${tr("Cone Crater", "コーン・クレーター")}</text>
    <text x="16" y="336" class="ap-lbl ap-left">${tr("← lander, about 1.1 km", "← 着陸船 約1.1 km")}</text>
    <path d="${path}" class="ap-path"/>
    <g class="ap-guessmark"><circle r="7"/><text y="-14">${tr("your guess", "あなたの予想")}</text></g>
    <g class="ap-turn" transform="translate(${turn[0]} ${turn[1]})"><circle r="8"/><text y="26">${tr("turned back", "ここで引き返した")}</text></g>
    <g class="ap-scale" transform="translate(520 335)"><line x1="0" x2="100" y1="0" y2="0"/><text x="50" y="-6">100 m</text></g>`;
  const pathEl = q<SVGPathElement>(svg, ".ap-path");
  const len = pathEl.getTotalLength();
  pathEl.style.strokeDasharray = `${len}`;
  pathEl.style.strokeDashoffset = `${len}`;
  const mark = q<SVGGElement>(svg, ".ap-guessmark");
  const turnEl = q<SVGGElement>(svg, ".ap-turn");
  turnEl.style.opacity = "0";
  const show = () => {
    const [x, y] = at(Number(range.value));
    mark.setAttribute("transform", `translate(${x} ${y})`);
    guessEl.textContent = tr(`Your guess: ${range.value} m from the rim`, `あなたの予想：縁まで ${range.value} m`);
  };
  range.oninput = show;
  range.disabled = false;
  show();
  go.disabled = false;
  go.onclick = async () => {
    go.disabled = true;
    range.disabled = true;
    await ctx.frames((t) => {
      const k = ctx.reduced ? 1 : ease(clamp01(t / 2200));
      pathEl.style.strokeDashoffset = `${len * (1 - k)}`;
      return k < 1;
    });
    if (!ctx.alive()) return;
    turnEl.style.opacity = "1";
    guessEl.textContent = tr(`Your guess: ${range.value} m · Real: tens of metres (about 15–50 m)`, `あなたの予想：${range.value} m · 実際：数十m（約15〜50 m）`);
    revealNext(el);
    ctx.done();
  };
}

// ------------------------------------------------------------ 7: a slope seen from eye height
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
  // a hill 30 m ahead: its face climbs at deg for 22 m (horizontal), then a flat top; the sides
  // fall away so it reads as a slope, not a wall
  const z0 = 26;
  const run = 22;
  const half = 26;
  const height = (x: number, z: number) => {
    const along = z < z0 ? 0 : Math.min(run, z - z0) * t;
    const side = Math.min(1, Math.max(0, (half - Math.abs(x)) / 10));
    return along * side;
  };
  const proj = (x: number, z: number): [number, number] => {
    const y = height(x, z);
    return [W / 2 + (f * x) / z, horizon - (f * (y - eye)) / z];
  };
  const step = 2;
  for (let z = 90; z >= 4; z -= step) {
    for (let x = -60; x < 60; x += step) {
      const a = proj(x, z);
      const b = proj(x + step, z);
      const cc = proj(x + step, z + step);
      const d = proj(x, z + step);
      // light from the upper left: faces that climb toward the viewer are brighter
      const dy = height(x + 1, z + 1) - height(x + 1, z);
      const dx = height(x + 1, z + 1) - height(x, z + 1);
      const light = Math.max(0.5, Math.min(1.25, 0.7 + dy * 0.7 - dx * 0.5));
      const fog = Math.min(0.75, z / 120);
      const mix = (v: number, sky: number) => (v * light * (1 - fog) + sky * fog) | 0;
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
  // a few rocks of unknown size: no help in judging distance
  for (const [x, z, r] of [[-6, 9, 0.35], [4, 14, 0.5], [-14, 20, 0.6], [10, 33, 0.7], [-3, 38, 0.5]] as const) {
    const [px, py] = proj(x, z);
    const rad = (f * r) / z;
    c.fillStyle = "rgba(70,40,25,0.85)";
    c.beginPath();
    c.ellipse(px, py - rad * 0.4, rad, rad * 0.6, 0, 0, Math.PI * 2);
    c.fill();
  }
  if (side !== null) {
    // side view of the real slope, bottom right
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
  go.onclick = () => {
    go.disabled = true;
    drawSlope(cv, TRUE_SLOPE, TRUE_SLOPE);
    read.textContent = tr(`Your guess: ${range.value}° · Real: ${TRUE_SLOPE}°`, `あなたの予想：${range.value}° · 本当は：${TRUE_SLOPE}°`);
    revealNext(el);
    ctx.done();
  };
}

// ------------------------------------------------------------ 8: a rover photo matched to the orbital map
async function robot(ctx: SlideCtx) {
  const cv = q<HTMLCanvasElement>(ctx.el, ".robot-cv");
  const W = (cv.width = 720);
  const H = (cv.height = 480);
  const c = cv.getContext("2d")!;
  const [img, grid, pick] = await Promise.all([ortho, navGrid, cells]);
  if (!ctx.alive()) return;
  // 360 × 240 m of real orbital image around a rocky spot, at 2 px per metre
  const [px, py] = cellPixel(grid, pick.rock);
  const sx = Math.max(0, Math.min(img.width - 360, px - 180));
  const sy = Math.max(0, Math.min(img.height - 240, py - 120));
  const T = 50; // the rover's view, metres across
  const tx = px - sx - T / 2;
  const ty = py - sy - T / 2;
  // a random walk of guesses that closes in on the true spot
  const path: [number, number][] = [];
  let gx = 40;
  let gy = 150;
  for (let i = 0; i < 22; i++) {
    const k = i / 21;
    gx += (tx - gx) * (0.12 + 0.5 * k) + (1 - k) * (Math.random() - 0.5) * 120;
    gy += (ty - gy) * (0.12 + 0.5 * k) + (1 - k) * (Math.random() - 0.5) * 90;
    gx = Math.max(0, Math.min(360 - T, gx));
    gy = Math.max(0, Math.min(240 - T, gy));
    path.push([gx, gy]);
  }
  path.push([tx, ty]);
  const S = 2;
  await ctx.frames((t) => {
    const total = 4200;
    const k = ctx.reduced ? 1 : Math.min(1, t / total);
    const f = k * (path.length - 1);
    const i = Math.floor(f);
    const a = path[i];
    const b = path[Math.min(path.length - 1, i + 1)];
    const u = ease(f - i);
    const x = a[0] + (b[0] - a[0]) * u;
    const y = a[1] + (b[1] - a[1]) * u;
    c.drawImage(img, sx, sy, 360, 240, 0, 0, W, H);
    c.fillStyle = "rgba(10,8,6,0.25)";
    c.fillRect(0, 0, W, H);
    // the rover's own view (inset): the same ground, seen a little differently
    c.save();
    c.filter = "contrast(1.25) brightness(1.1) sepia(0.4)";
    c.drawImage(img, sx + tx, sy + ty, T, T, 18, 18, 130, 130);
    c.restore();
    c.strokeStyle = "#f4ede6";
    c.lineWidth = 2;
    c.strokeRect(18, 18, 130, 130);
    c.fillStyle = "#f4ede6";
    c.font = "600 13px system-ui, sans-serif";
    c.fillText(tr("Rover's photo", "探査車の写真"), 22, 166);
    const found = k >= 1;
    c.strokeStyle = found ? "#5fd3a0" : "#ff6b2c";
    c.lineWidth = found ? 4 : 2;
    c.strokeRect(x * S, y * S, T * S, T * S);
    const dist = Math.hypot(x - tx, y - ty);
    const sim = Math.max(0, 1 - dist / 140);
    c.fillStyle = "rgba(16,13,11,0.85)";
    c.fillRect(W - 220, H - 52, 204, 36);
    c.fillStyle = found ? "#5fd3a0" : "#ffb27a";
    c.fillRect(W - 212, H - 30, 188 * sim, 6);
    c.fillStyle = "#f4ede6";
    c.fillText(found ? tr("Match: position to about 25 cm", "一致：位置は約25 cm") : tr("Comparing with the orbital map…", "軌道からの地図と照合中…"), W - 212, H - 36);
    if (found) ctx.done();
    return !found;
  });
}

// ------------------------------------------------------------ 9: dunes vs rock, matched for real
async function unique(ctx: SlideCtx) {
  const el = ctx.el;
  const picks = Array.from(el.querySelectorAll<HTMLElement>(".pick"));
  const [img, grid, pick] = await Promise.all([ortho, navGrid, cells]);
  if (!ctx.alive()) return;
  const which = [pick.dune, pick.rock];
  const grays = which.map((i) => cropGray(img, ...cellPixel(grid, i)));
  picks.forEach((p, k) => {
    p.classList.remove("chosen", "right", "wrong");
    const view = q<HTMLCanvasElement>(p, ".pk-view");
    const heat = q<HTMLCanvasElement>(p, ".pk-heat");
    heat.width = heat.height = 1;
    heat.getContext("2d")!.clearRect(0, 0, 1, 1);
    q(p, ".pk-read").textContent = "";
    view.width = view.height = 80;
    const vc = view.getContext("2d")!;
    const d = vc.createImageData(80, 80);
    grays[k].forEach((v, j) => d.data.set([v, v, v, 255], j * 4));
    vc.putImageData(d, 0, 0);
  });
  let ran = false;
  el.querySelectorAll<HTMLButtonElement>(".pick-btn").forEach((b) => {
    b.disabled = false;
    b.onclick = async () => {
      if (ran) return;
      ran = true;
      b.closest(".pick")!.classList.add("chosen");
      el.querySelectorAll<HTMLButtonElement>(".pick-btn").forEach((x) => (x.disabled = true));
      const results = grays.map(match);
      await Promise.all(
        picks.map((p, k) => playMatch(q(p, ".pk-view"), q(p, ".pk-heat"), results[k], ctx.reduced ? 0 : 1600, ctx.alive)),
      );
      if (!ctx.alive()) return;
      picks.forEach((p, k) => {
        const r = results[k];
        p.classList.add(k === 1 ? "right" : "wrong");
        q(p, ".pk-read").innerHTML =
          k === 0
            ? tr(`Dunes · closest look-alike <b>${r.best.toFixed(2)}</b>: easy to confuse`, `砂丘 · 一番似た別の場所 <b>${r.best.toFixed(2)}</b>：取り違えやすい`)
            : tr(`Rock · closest look-alike <b>${r.best.toFixed(2)}</b>: only one match`, `岩 · 一番似た別の場所 <b>${r.best.toFixed(2)}</b>：一致は1か所だけ`);
      });
      revealNext(el);
      ctx.done();
    };
  });
}

startDeck({
  phone: { enter: phone },
  compass: { enter: compass },
  earth: { enter: earth },
  oxygen: { enter: oxygen },
  apollo: { enter: apollo },
  eyes: { enter: eyes },
  robot: { enter: (c) => void robot(c) },
  unique: { enter: (c) => void unique(c) },
});
