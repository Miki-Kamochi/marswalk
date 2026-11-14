/** Helmet display: Wayfinder's compass, guidance, sources, uncertainty map, oxygen. */
import { DEG, wrap } from "../nav/rng";
import type { Nav } from "./nav";
import type { World } from "./world";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudState {
  objective: string;
  clock: string;
  o2Fraction: number;
  o2Minutes: number;
  alert: string;
  alertLevel: "info" | "warn" | "danger";
  prompt: string;
  dust: number;
}

export class Hud {
  private tape = $<HTMLCanvasElement>("tape");
  private map = $<HTMLCanvasElement>("minimap");
  private imagery = new Image();
  private mapRange = 260; // metres from centre to edge of the minimap

  constructor(private world: World, imageryUrl: string) {
    this.imagery.src = imageryUrl;
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  private resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    for (const cv of [this.tape, this.map]) {
      const r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    }
  }

  show(on: boolean) {
    $("hud").style.display = on ? "block" : "none";
    if (on) this.resize(); // canvases have no size while hidden
  }

  update(nav: Nav, s: HudState) {
    const est = nav.wf.estimate;
    const st = nav.status;
    const g = st.guidance;

    $("objective").textContent = s.objective;
    $("clock").textContent = s.clock;
    $("o2fill").style.width = `${Math.max(0, s.o2Fraction) * 100}%`;
    $("o2fill").className = s.o2Fraction < 0.2 ? "danger" : s.o2Fraction < 0.4 ? "warn" : "";
    $("o2text").textContent = `O₂ ${Math.max(0, Math.ceil(s.o2Minutes))} min`;

    $("headline").textContent = g ? g.headline : "";
    $("distance").textContent = g ? `${Math.round(g.distance / 5) * 5} m ${nav.mode === "home" ? "to rover" : "to go"}` : "";
    $("cues").textContent = g?.cues ? `Keep: ${g.cues}` : g ? "No sun or landmark in view: steering by gyro and steps" : "";

    const alert = $("alert");
    alert.textContent = s.alert;
    alert.className = s.alert ? `on ${s.alertLevel}` : "";
    const prompt = $("prompt");
    prompt.textContent = s.prompt;
    prompt.style.display = s.prompt ? "block" : "none";

    // sources panel
    const row = (id: string, on: boolean, text: string) => {
      const el = $(id);
      el.className = on ? "src on" : "src off";
      el.querySelector("span")!.textContent = text;
    };
    row("srcDr", true, `drifts ~4% of distance`);
    row("srcSun", st.sunOk, st.sunOk ? `heading ±${st.sunSigmaDeg.toFixed(1)}°` : s.dust > 0.5 ? "sun hidden by dust" : "sun not usable");
    const names = st.inView.map((l) => l.name);
    row("srcLm", names.length > 0, names.length ? (names.length > 2 ? `${names.length} in view` : names.join(", ")) : "none in view");
    const pos = $("srcPos");
    pos.className = est.r95 > 60 ? "src bad" : est.r95 > 25 ? "src mid" : "src on";
    pos.querySelector("span")!.textContent = `within ±${Math.round(est.r95)} m`;

    if (this.map.width < 8 || this.tape.width < 8) this.resize();
    if (this.map.width < 8 || this.tape.width < 8) return;
    this.drawTape(nav, s);
    this.drawMap(nav);
  }

  /** Compass strip: Wayfinder's heading, with the course to walk and what is in view. */
  private drawTape(nav: Nav, s: HudState) {
    const cv = this.tape;
    const ctx = cv.getContext("2d")!;
    const W = cv.width;
    const H = cv.height;
    const k = W / 420;
    const est = nav.wf.estimate;
    const st = nav.status;
    const span = 110 * DEG; // field shown on the strip
    const x = (b: number) => W / 2 + (wrap(b - est.heading) / span) * W;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(18,10,6,0.55)";
    ctx.fillRect(0, 0, W, H);
    // heading uncertainty band (2 sigma)
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
      ctx.fillStyle = major ? "#fff" : "rgba(255,255,255,0.55)";
      ctx.fillRect(px - k * 0.5, H - (major ? 14 : d % 15 === 0 ? 9 : 5) * k, k, (major ? 14 : d % 15 === 0 ? 9 : 5) * k);
      if (major) ctx.fillText(["N", "NE", "E", "SE", "S", "SW", "W", "NW"][d / 45], px, 3 * k);
      else if (d % 15 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(String(d), px, 3 * k);
      }
    }
    const mark = (b: number, color: string, label: string) => {
      const px = Math.min(Math.max(x(b), 10 * k), W - 10 * k);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px, H - 16 * k);
      ctx.lineTo(px - 6 * k, H - 27 * k);
      ctx.lineTo(px + 6 * k, H - 27 * k);
      ctx.fill();
      if (label) {
        ctx.font = `${10 * k}px system-ui, sans-serif`;
        ctx.fillText(label, px, H - 40 * k);
      }
    };
    if (st.sunOk) mark(this.world.sun.azimuth * DEG, "#fff2a8", "SUN");
    for (const l of st.inView.slice(0, 4)) mark(Math.atan2(l.e - est.e, l.n - est.n), "#ffffff", "");
    if (st.guidance) mark(st.guidance.course, "#ffb86b", "");
    // centre line = where Wayfinder thinks you are facing
    ctx.fillStyle = s.dust > 0.5 ? "#ff8d7a" : "#7fe3ff";
    ctx.fillRect(W / 2 - k, 0, 2 * k, H);
  }

  /** North-up map centred on Wayfinder's ESTIMATE, with the uncertainty circle. */
  private drawMap(nav: Nav) {
    const cv = this.map;
    const ctx = cv.getContext("2d")!;
    const S = cv.width;
    const est = nav.wf.estimate;
    const R = this.mapRange;
    const scale = S / (2 * R); // px per metre
    const X = (e: number) => S / 2 + (e - est.e) * scale;
    const Y = (n: number) => S / 2 - (n - est.n) * scale;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#2a1a12";
    ctx.fillRect(0, 0, S, S);
    const b = this.world.meta.images.color.bounds;
    if (this.imagery.complete && this.imagery.naturalWidth) {
      const mpp = (b.east - b.west) / this.imagery.naturalWidth;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(
        this.imagery,
        (est.e - R - b.west) / mpp,
        (b.north - (est.n + R)) / mpp,
        (2 * R) / mpp,
        (2 * R) / mpp,
        0,
        0,
        S,
        S,
      );
      ctx.globalAlpha = 1;
    }
    // recorded trail
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5, S / 130);
    ctx.setLineDash([S / 40, S / 50]);
    ctx.beginPath();
    nav.wf.breadcrumbs.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.stroke();
    ctx.setLineDash([]);
    // landmarks
    for (const l of nav.landmarks) {
      const seen = nav.status.inView.includes(l);
      const px = X(l.e);
      const py = Y(l.n);
      if (px < -5 || py < -5 || px > S + 5 || py > S + 5) continue;
      ctx.fillStyle = seen ? "#ffffff" : "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(px, py - S / 40);
      ctx.lineTo(px - S / 50, py + S / 80);
      ctx.lineTo(px + S / 50, py + S / 80);
      ctx.fill();
      if (seen) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(S / 2, S / 2);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
    const dot = (e: number, n: number, color: string, r: number) => {
      // pin things that are off the map to its edge
      let dx = X(e) - S / 2;
      let dy = Y(n) - S / 2;
      const d = Math.hypot(dx, dy);
      const max = S / 2 - r - 2;
      if (d > max) {
        dx *= max / d;
        dy *= max / d;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(S / 2 + dx, S / 2 + dy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a0f0a";
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    dot(nav.home.e, nav.home.n, "#7fe3ff", S / 28);
    if (nav.mode === "site" && nav.site) dot(nav.site.e, nav.site.n, "#ffe066", S / 28);
    // particle cloud + 95% circle: where you might really be
    ctx.fillStyle = "rgba(127,227,255,0.5)";
    for (const p of nav.wf.cloud(60)) ctx.fillRect(X(p[0]) - 1, Y(p[1]) - 1, 2, 2);
    ctx.strokeStyle = est.r95 > 60 ? "#ff6b57" : est.r95 > 25 ? "#ffb86b" : "#7fe3ff";
    ctx.lineWidth = Math.max(2, S / 90);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, Math.max(est.r95 * scale, 3), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;
    // heading arrow
    ctx.translate(S / 2, S / 2);
    ctx.rotate(est.heading);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -S / 16);
    ctx.lineTo(-S / 32, S / 32);
    ctx.lineTo(0, S / 64);
    ctx.lineTo(S / 32, S / 32);
    ctx.fill();
    ctx.restore();
    // rim + north mark
    ctx.strokeStyle = "rgba(255,184,107,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `${S / 12}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("N", S / 2, S / 9);
  }
}
