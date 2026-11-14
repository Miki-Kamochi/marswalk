/** Helmet display: Wayfinder's directions, what it is based on, and a fixed orbital map with its estimate. */
import type { Bounds } from "../data/loader";
import { DEG, wrap } from "../nav/rng";
import type { Nav, SnapshotResult } from "./nav";
import type { World } from "../world/world";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudState {
  objective: string;
  clock: string;
  o2Fraction: number;
  o2Minutes: number;
  power: number; // 0..1
  alert: string;
  alertLevel: "info" | "warn" | "danger";
  prompt: string;
  dust: number;
  linkOk: boolean;
  scanning: boolean;
  /** mission seconds since the last horizon fix */
  sinceFix: number | null;
}

export class Hud {
  private tape = $<HTMLCanvasElement>("tape");
  private map = $<HTMLCanvasElement>("minimap");
  private sky = $<HTMLCanvasElement>("skyGraph");
  private imagery = new Image();
  private base: HTMLCanvasElement | null = null;
  private coachUntil = 0;
  private coachSticky = false;
  private skyUntil = 0;
  private bounds: Bounds;

  constructor(
    private world: World,
    imageryUrl: string,
    /** map area: every place the EVA can go */
    area: [number, number][],
    private route: [number, number][],
  ) {
    let w = Infinity;
    let e = -Infinity;
    let s = Infinity;
    let n = -Infinity;
    for (const [x, y] of area) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
    const half = Math.max(e - w, n - s) / 2 + 160;
    const cx = (w + e) / 2;
    const cy = (s + n) / 2;
    this.bounds = { west: cx - half, east: cx + half, south: cy - half, north: cy + half };
    this.imagery.src = imageryUrl;
    this.imagery.onload = () => (this.base = null);
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  private resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    for (const cv of [this.tape, this.map, this.sky]) {
      const r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    }
    this.base = null;
  }

  show(on: boolean) {
    $("hud").style.display = on ? "block" : "none";
    if (on) this.resize(); // canvases have no size while hidden
  }

  /** A short explanation card. sticky = stays until replaced or cleared. */
  coach(title: string, text: string, now: number, seconds = 10, sticky = false) {
    $("coachTitle").textContent = title;
    $("coachText").textContent = text;
    $("coach").classList.add("on");
    this.coachUntil = now + seconds;
    this.coachSticky = sticky;
  }

  clearCoach() {
    $("coach").classList.remove("on");
    this.coachSticky = false;
  }

  /** Show the skyline the camera saw against the best match from the elevation map. */
  showSkyline(r: SnapshotResult, now: number) {
    this.skyUntil = now + 7;
    const cv = this.sky;
    const ctx = cv.getContext("2d")!;
    const W = cv.width;
    const H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(18,10,6,0.75)";
    ctx.fillRect(0, 0, W, H);
    const k = W / 300;
    const B = r.fix.observed.length;
    let lo = Infinity;
    let hi = -Infinity;
    for (const arr of [r.fix.observed, r.fix.matched])
      for (const v of arr)
        if (!Number.isNaN(v)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
    if (!Number.isFinite(lo)) {
      lo = -2;
      hi = 2;
    }
    const pad = Math.max(0.5, (hi - lo) * 0.15);
    lo -= pad;
    hi += pad;
    const top = 16 * k;
    const X = (i: number) => (i / (B - 1)) * W;
    const Y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (H - top - 4 * k);
    const draw = (arr: Float32Array, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * k;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < B; i++) {
        if (Number.isNaN(arr[i])) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(X(i), Y(arr[i]));
        else ctx.moveTo(X(i), Y(arr[i]));
        pen = true;
      }
      ctx.stroke();
    };
    if (r.fix.ok) draw(r.fix.matched, "#7fe3ff", 3);
    draw(r.fix.observed, "#ffffff", 1.5);
    ctx.font = `600 ${10 * k}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("What the camera sees", 6 * k, 3 * k);
    ctx.fillStyle = r.fix.ok ? "#7fe3ff" : "#ff8d7a";
    ctx.textAlign = "right";
    ctx.fillText(r.fix.ok ? "Matched to the NASA elevation map" : "Nothing to match: dust", W - 6 * k, 3 * k);
    ctx.textAlign = "left";
    $("skyBox").classList.add("on");
  }

  update(nav: Nav, s: HudState, now: number) {
    const est = nav.wf.estimate;
    const st = nav.status;
    const g = st.guidance;

    if (!this.coachSticky && now > this.coachUntil) $("coach").classList.remove("on");
    if (now > this.skyUntil) $("skyBox").classList.remove("on");

    $("objective").textContent = s.objective;
    $("clock").textContent = s.clock;
    const bar = (id: string, f: number, label: string) => {
      const fill = $(`${id}fill`);
      fill.style.width = `${Math.max(0, f) * 100}%`;
      fill.className = f < 0.2 ? "danger" : f < 0.4 ? "warn" : "";
      $(`${id}text`).textContent = label;
    };
    bar("o2", s.o2Fraction, `O₂ ${Math.max(0, Math.ceil(s.o2Minutes))} min`);
    bar("pw", s.power, `Power ${Math.max(0, Math.round(s.power * 100))}%`);

    if (g) {
      const d = Math.abs(g.turn) / DEG;
      const arrow = d < 10 ? "▲ " : d > 150 ? "▼ " : g.turn < 0 ? "◀ " : "";
      $("headline").textContent = `${arrow}${g.headline}${d >= 10 && d <= 150 && g.turn > 0 ? " ▶" : ""}`;
    } else $("headline").textContent = "";
    $("distance").textContent = g ? `${Math.round(g.distance / 5) * 5} m ${nav.mode === "home" ? "to the rover" : "to the sample site"}` : "";
    $("cues").textContent = g?.cues ? `Keep the ${g.cues}` : "";

    const alert = $("alert");
    alert.textContent = s.alert;
    alert.className = s.alert ? `on ${s.alertLevel}` : "";
    const prompt = $("prompt");
    prompt.textContent = s.prompt;
    prompt.style.display = s.prompt ? "block" : "none";

    // what Wayfinder's position is based on right now
    const row = (id: string, cls: string, text: string) => {
      const el = $(id);
      el.className = `src ${cls}`;
      el.querySelector("span")!.textContent = text;
    };
    row("srcDr", "on", "always on · drifts");
    row("srcSun", st.sunOk ? "on" : "off", st.sunOk ? "true north" : s.dust > 0.4 ? "hidden by dust" : "not usable");
    const age = s.sinceFix === null ? "" : s.sinceFix < 60 ? "just now" : `${Math.round(s.sinceFix / 60)} min ago`;
    row(
      "srcHz",
      s.scanning ? "mid" : st.visualRange >= 400 ? "on" : "off",
      s.scanning ? "scanning…" : st.visualRange >= 400 ? `possible · last ${age || "never"}` : `blocked · last ${age || "never"}`,
    );
    row("srcLink", s.linkOk ? "on" : "bad", s.linkOk ? "connected" : "LOST");
    const pos = $("srcPos");
    pos.className = `total ${est.r95 > 45 ? "bad" : est.r95 > 20 ? "mid" : "on"}`;
    pos.textContent = `Position known to ±${Math.round(est.r95)} m`;

    if (this.map.width < 8 || this.tape.width < 8) this.resize();
    if (this.map.width < 8 || this.tape.width < 8) return;
    this.drawTape(nav, s);
    this.drawMap(nav);
  }

  /** Compass strip: Wayfinder's heading, with the course to walk. */
  private drawTape(nav: Nav, s: HudState) {
    const cv = this.tape;
    const ctx = cv.getContext("2d")!;
    const W = cv.width;
    const H = cv.height;
    const k = W / 420;
    const est = nav.wf.estimate;
    const st = nav.status;
    const span = 110 * DEG;
    const x = (b: number) => W / 2 + (wrap(b - est.heading) / span) * W;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(18,10,6,0.55)";
    ctx.fillRect(0, 0, W, H);
    const band = Math.max((2 * est.headingSigma) / span, 0.004) * W;
    ctx.fillStyle = "rgba(127,227,255,0.22)";
    ctx.fillRect(W / 2 - band, 0, band * 2, H);
    ctx.font = `${12 * k}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let d = 0; d < 360; d += 5) {
      const px = x(d * DEG);
      if (px < -20 || px > W + 20) continue;
      const major = d % 45 === 0;
      const h = (major ? 14 : d % 15 === 0 ? 9 : 5) * k;
      ctx.fillStyle = major ? "#fff" : "rgba(255,255,255,0.55)";
      ctx.fillRect(px - k * 0.5, H - h, k, h);
      if (major) ctx.fillText(["N", "NE", "E", "SE", "S", "SW", "W", "NW"][d / 45], px, 3 * k);
      else if (d % 15 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(String(d), px, 3 * k);
      }
    }
    const mark = (b: number, color: string, label: string, big = false) => {
      const px = Math.min(Math.max(x(b), 10 * k), W - 10 * k);
      const r = (big ? 9 : 5) * k;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px, H - 15 * k);
      ctx.lineTo(px - r, H - 15 * k - r * 1.6);
      ctx.lineTo(px + r, H - 15 * k - r * 1.6);
      ctx.fill();
      if (label) {
        ctx.font = `${10 * k}px system-ui, sans-serif`;
        ctx.fillText(label, px, H - 42 * k);
      }
    };
    if (st.sunOk) mark(this.world.sun.azimuth * DEG, "#fff2a8", "SUN");
    if (st.guidance) mark(st.guidance.course, "#ffb86b", "", true);
    ctx.fillStyle = s.dust > 0.5 ? "#ff8d7a" : "#7fe3ff";
    ctx.fillRect(W / 2 - k, 0, 2 * k, H);
  }

  /** Fixed north-up orbital map of the EVA area. It shows Wayfinder's ESTIMATE, never the truth. */
  private drawMap(nav: Nav) {
    const cv = this.map;
    const ctx = cv.getContext("2d")!;
    const S = cv.width;
    const b = this.bounds;
    const scale = S / (b.east - b.west);
    const X = (e: number) => (e - b.west) * scale;
    const Y = (n: number) => (b.north - n) * scale;
    if (!this.base) {
      // orbital image + planned route, drawn once
      const base = document.createElement("canvas");
      base.width = base.height = S;
      const bc = base.getContext("2d")!;
      bc.fillStyle = "#2a1a12";
      bc.fillRect(0, 0, S, S);
      const ib = this.world.meta.images.color.bounds;
      if (this.imagery.complete && this.imagery.naturalWidth) {
        const mpp = (ib.east - ib.west) / this.imagery.naturalWidth;
        bc.drawImage(this.imagery, (b.west - ib.west) / mpp, (ib.north - b.north) / mpp, (b.east - b.west) / mpp, (b.north - b.south) / mpp, 0, 0, S, S);
      }
      bc.strokeStyle = "rgba(255,184,107,0.85)";
      bc.lineWidth = Math.max(1.5, S / 150);
      bc.setLineDash([S / 50, S / 70]);
      bc.beginPath();
      this.route.forEach((p, i) => (i ? bc.lineTo(X(p[0]), Y(p[1])) : bc.moveTo(X(p[0]), Y(p[1]))));
      bc.stroke();
      this.base = base;
    }
    ctx.drawImage(this.base, 0, 0);
    // recorded trail
    const trail = nav.wf.breadcrumbs;
    if (trail.length > 1) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.5, S / 140);
      ctx.beginPath();
      trail.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      ctx.stroke();
    }
    const dot = (e: number, n: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(e), Y(n), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a0f0a";
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    dot(nav.home.e, nav.home.n, "#7fe3ff", S / 32);
    if (nav.site) dot(nav.site.e, nav.site.n, "#ffe066", S / 32);
    // Wayfinder's estimate: a dot and the circle you are inside 95% of the time
    const est = nav.wf.estimate;
    const color = est.r95 > 45 ? "#ff6b57" : est.r95 > 20 ? "#ffb86b" : "#7fe3ff";
    const r = Math.max(est.r95 * scale, S / 70);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(X(est.e), Y(est.n), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, S / 110);
    ctx.stroke();
    ctx.save();
    ctx.translate(X(est.e), Y(est.n));
    ctx.rotate(est.heading);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -S / 26);
    ctx.lineTo(-S / 60, S / 80);
    ctx.lineTo(S / 60, S / 80);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${S / 16}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("N ↑", S - S / 12, S / 40);
    // 100 m scale bar
    ctx.fillRect(S / 30, S - S / 18, 100 * scale, Math.max(2, S / 120));
    ctx.font = `${S / 20}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("100 m", S / 30, S - S / 15);
  }
}
