/** Helmet display: Wayfinder's compass, guidance, sources, the orbital map with the estimate. */
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
  /** live "where you would be without Wayfinder" path, drawn on the map */
  ghost: [number, number][];
}

/** A landmark as it appears on the visor. */
export interface Marker {
  id: string;
  name: string;
  /** screen position in CSS pixels; if off-screen, side says which edge */
  x: number;
  y: number;
  side: "" | "left" | "right";
  state: "idle" | "aim" | "done";
}

export class Hud {
  private tape = $<HTMLCanvasElement>("tape");
  private map = $<HTMLCanvasElement>("minimap");
  private imagery = new Image();
  private mapRange = 110; // metres from centre to edge of the map
  private markerEls = new Map<string, HTMLElement>();
  private coachUntil = 0;
  private coachSticky = false;

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

  /** Hide everything Wayfinder provides (used when the player is asked to guess unaided). */
  blind(on: boolean) {
    $("hud").classList.toggle("blind", on);
  }

  /** A short explanation card. sticky = stays until replaced or cleared. */
  coach(title: string, text: string, now: number, seconds = 9, sticky = false) {
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

  /** Landmark brackets on the visor and the aiming ring in the centre. */
  markers(list: Marker[], aimProgress: number) {
    const box = $("markers");
    const seen = new Set<string>();
    for (const m of list) {
      seen.add(m.id);
      let el = this.markerEls.get(m.id);
      if (!el) {
        el = document.createElement("div");
        el.innerHTML = "<i></i><span></span>";
        box.appendChild(el);
        this.markerEls.set(m.id, el);
      }
      el.className = `marker ${m.state} ${m.side}`;
      el.style.transform = `translate(${m.x}px, ${m.y}px)`;
      el.querySelector("span")!.textContent = m.state === "done" ? `${m.name} ✓` : m.side ? m.name : m.name;
    }
    for (const [id, el] of this.markerEls) {
      if (!seen.has(id)) {
        el.remove();
        this.markerEls.delete(id);
      }
    }
    const ring = $("aim");
    ring.style.opacity = aimProgress > 0 ? "1" : "0.35";
    ring.style.setProperty("--p", `${Math.round(aimProgress * 360)}deg`);
  }

  update(nav: Nav, s: HudState, now: number) {
    const est = nav.wf.estimate;
    const st = nav.status;
    const g = st.guidance;

    if (!this.coachSticky && now > this.coachUntil) $("coach").classList.remove("on");

    $("objective").textContent = s.objective;
    $("clock").textContent = s.clock;
    $("o2fill").style.width = `${Math.max(0, s.o2Fraction) * 100}%`;
    $("o2fill").className = s.o2Fraction < 0.2 ? "danger" : s.o2Fraction < 0.4 ? "warn" : "";
    $("o2text").textContent = `O₂ ${Math.max(0, Math.ceil(s.o2Minutes))} min`;

    let arrow = "";
    if (g) {
      const d = Math.abs(g.turn) / DEG;
      arrow = d < 10 ? "▲ " : d > 150 ? "▼ " : g.turn < 0 ? "◀ " : "";
      $("headline").textContent = `${arrow}${g.headline}${d >= 10 && d <= 150 && g.turn > 0 ? " ▶" : ""}`;
    } else $("headline").textContent = "";
    $("distance").textContent = g ? `${Math.round(g.distance / 5) * 5} m ${nav.mode === "home" ? "to the rover" : "to the sample site"}` : "";
    $("cues").textContent = g?.cues ? `Keep: ${g.cues}` : g ? "Nothing to steer by: using step count and gyro only" : "";

    const alert = $("alert");
    alert.textContent = s.alert;
    alert.className = s.alert ? `on ${s.alertLevel}` : "";
    const prompt = $("prompt");
    prompt.textContent = s.prompt;
    prompt.style.display = s.prompt ? "block" : "none";

    // how Wayfinder knows where you are
    const row = (id: string, cls: string, text: string) => {
      const el = $(id);
      el.className = `src ${cls}`;
      el.querySelector("span")!.textContent = text;
    };
    row("srcDr", "on", "always on, drifts");
    row("srcSun", st.sunOk ? "on" : "off", st.sunOk ? "true direction" : s.dust > 0.4 ? "hidden by dust" : "not usable");
    const n = st.inView.length;
    row("srcLm", n ? "on" : "off", n ? `${n} visible: look at a ◇` : "none visible");
    const pos = $("srcPos");
    const cls = est.r95 > 40 ? "bad" : est.r95 > 18 ? "mid" : "on";
    pos.className = `total ${cls}`;
    pos.textContent = `Wayfinder knows your position to ±${Math.round(est.r95)} m`;
    $("mapCaption").textContent = `Map from orbit · blue circle = Wayfinder's estimate (±${Math.round(est.r95)} m), not GPS`;

    if (this.map.width < 8 || this.tape.width < 8) this.resize();
    if (this.map.width < 8 || this.tape.width < 8) return;
    this.drawTape(nav, s);
    this.drawMap(nav, s);
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
    // centre line = where Wayfinder thinks you are facing
    ctx.fillStyle = s.dust > 0.5 ? "#ff8d7a" : "#7fe3ff";
    ctx.fillRect(W / 2 - k, 0, 2 * k, H);
  }

  /** North-up orbital map centred on Wayfinder's ESTIMATE, with the uncertainty circle. */
  private drawMap(nav: Nav, s: HudState) {
    const cv = this.map;
    const ctx = cv.getContext("2d")!;
    const S = cv.width;
    const est = nav.wf.estimate;
    // zoom so the uncertainty circle is always easy to see
    this.mapRange += (Math.max(110, Math.min(320, est.r95 * 3.2)) - this.mapRange) * 0.04;
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
      ctx.drawImage(this.imagery, (est.e - R - b.west) / mpp, (b.north - (est.n + R)) / mpp, (2 * R) / mpp, (2 * R) / mpp, 0, 0, S, S);
      ctx.globalAlpha = 1;
    }
    const line = (pts: [number, number][], color: string, width: number, dash: number[]) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    // recorded trail, and where you would be without Wayfinder
    line(nav.wf.breadcrumbs, "#ffffff", Math.max(1.5, S / 130), [S / 40, S / 50]);
    line(s.ghost, "#ff5a47", Math.max(2, S / 100), [S / 60, S / 60]);
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
    if (s.ghost.length) dot(s.ghost[s.ghost.length - 1][0], s.ghost[s.ghost.length - 1][1], "#ff5a47", S / 36);
    // where you might really be: the cloud of guesses and the circle that holds 95% of them
    const color = est.r95 > 40 ? "#ff6b57" : est.r95 > 18 ? "#ffb86b" : "#7fe3ff";
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    for (const p of nav.wf.cloud(70)) ctx.fillRect(X(p[0]) - 1, Y(p[1]) - 1, 2, 2);
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, Math.max(est.r95 * scale, 4), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, S / 90);
    ctx.stroke();
    // small heading tick (direction only: the position is the whole circle)
    ctx.translate(S / 2, S / 2);
    ctx.rotate(est.heading);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -S / 22);
    ctx.lineTo(-S / 50, S / 60);
    ctx.lineTo(S / 50, S / 60);
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
