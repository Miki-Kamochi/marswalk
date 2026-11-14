/**
 * Home page: starfield, scroll reveals, and the route example drawn from routes.json
 * (precomputed by scripts/home_assets.ts with the real planner).
 */
import { initLang, tr } from "./lang";

initLang();

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- nav background after scrolling
const nav = document.getElementById("nav")!;
const onScroll = () => nav.classList.toggle("scrolled", scrollY > 24);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------------------------------------------------------------- stars
function drawStars(): void {
  const cv = document.querySelector<HTMLCanvasElement>(".hero .stars");
  if (!cv) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const c = cv.getContext("2d")!;
  c.scale(dpr, dpr);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const n = Math.round((w * h) / 5200);
  for (let i = 0; i < n; i++) {
    const r = rnd() < 0.92 ? 0.5 + rnd() * 0.6 : 1.1 + rnd() * 0.7;
    c.globalAlpha = 0.15 + rnd() * 0.55;
    c.fillStyle = rnd() < 0.15 ? "#ffd2b0" : "#ffffff";
    c.beginPath();
    c.arc(rnd() * w, rnd() * h * 0.85, r, 0, Math.PI * 2);
    c.fill();
  }
}
drawStars();
let starQueued = false;
addEventListener("resize", () => {
  if (starQueued) return;
  starQueued = true;
  requestAnimationFrame(() => {
    starQueued = false;
    drawStars();
  });
});

// ---------------------------------------------------------------- reveal on scroll
const reveals = document.querySelectorAll<HTMLElement>(".reveal");
if (reduced || !("IntersectionObserver" in window)) {
  reveals.forEach((el) => el.classList.add("in"));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  // stagger items that sit side by side
  reveals.forEach((el) => {
    const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => c.classList.contains("reveal")) : [];
    const k = sibs.indexOf(el);
    if (k > 0 && el.parentElement?.matches(".stats, .layers, .missions")) el.style.transitionDelay = `${k * 90}ms`;
    io.observe(el);
  });
}

// ---------------------------------------------------------------- route example
type Pt = [number, number];
interface HomeRoute {
  profile: "short" | "o2" | "found" | "mix";
  points: Pt[];
  photos: Pt[];
  distance: number;
  minutes: number;
  o2Out: number;
  o2Left: number;
  climb: number;
  blind: number;
  sand: number;
  photoCount: number;
}
interface HomeRoutes {
  from: Pt;
  to: Pt;
  bounds: { west: number; east: number; south: number; north: number };
  routes: HomeRoute[];
}

const NAMES: Record<HomeRoute["profile"], [string, string]> = {
  mix: ["Balanced", "統合"],
  short: ["Shortest", "最短"],
  o2: ["Least oxygen", "省エネ"],
  found: ["Easiest to locate", "迷いにくさ"],
};
const ORDER: HomeRoute["profile"][] = ["mix", "short", "o2", "found"];
const SVG = "http://www.w3.org/2000/svg";
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

async function routes(): Promise<void> {
  const r = await fetch("/data/home/routes.json");
  if (!r.ok) return;
  const data = (await r.json()) as HomeRoutes;
  const b = data.bounds;
  const W = b.east - b.west;
  const H = b.north - b.south;
  const x = (p: Pt) => (p[0] - b.west).toFixed(1);
  const y = (p: Pt) => (b.north - p[1]).toFixed(1);
  const d = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p)} ${y(p)}`).join("");

  const svg = document.getElementById("routeSvg") as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.append(el("image", { href: "/img/home/routes.jpg", x: 0, y: 0, width: W, height: H, preserveAspectRatio: "none" }));
  const byProfile = new Map(data.routes.map((rt) => [rt.profile, rt]));
  const lines = new Map<string, SVGPathElement>();
  // alternatives first, the recommended route on top
  for (const p of ["short", "o2", "found", "mix"] as const) {
    const rt = byProfile.get(p);
    if (!rt) continue;
    const path = el("path", { d: d(rt.points), class: `rt draw ${p === "mix" ? "rec" : "alt"}`, pathLength: 1 });
    lines.set(p, path);
    svg.append(path);
  }
  const rec = byProfile.get("mix");
  if (rec) for (const ph of rec.photos.slice(0, -1)) svg.append(el("circle", { class: "fix", cx: x(ph), cy: y(ph), r: 9 }));
  // ends
  const end = (p: Pt, fill: string, label: [string, string], dy: number) => {
    svg.append(el("circle", { cx: x(p), cy: y(p), r: 26, fill: "none", stroke: fill, "stroke-width": 1.4, "vector-effect": "non-scaling-stroke", opacity: 0.7 }));
    svg.append(el("circle", { cx: x(p), cy: y(p), r: 11, fill, stroke: "#0b0908", "stroke-width": 2, "vector-effect": "non-scaling-stroke" }));
    const t = el("text", { x: x(p), y: (+y(p) + dy).toFixed(1), "text-anchor": "middle", class: "end-label" });
    t.dataset.en = label[0];
    t.dataset.ja = label[1];
    svg.append(t);
  };
  end(data.from, "#7cc8ff", ["Base Camp", "ベースキャンプ"], -48);
  end(data.to, "#ff6b2c", ["Vera Rubin Ridge", "ヴェラ・ルービン・リッジ"], 70);

  // the end labels are drawn in viewBox units; keep them about 12 px on screen
  const sizeLabels = () => {
    const k = W / Math.max(1, svg.clientWidth);
    for (const t of svg.querySelectorAll<SVGTextElement>("text.end-label")) {
      t.style.fontSize = `${12 * k}px`;
      t.style.strokeWidth = `${4 * k}px`;
    }
  };
  addEventListener("resize", sizeLabels);

  // draw the lines once the map scrolls into view
  if (reduced) svg.classList.add("in");
  else {
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          svg.classList.add("in");
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(svg);
  }

  const list = document.getElementById("routeList")!;
  const render = () => {
    for (const t of svg.querySelectorAll<SVGTextElement>("text.end-label")) t.textContent = tr(t.dataset.en!, t.dataset.ja!);
    sizeLabels();
    list.innerHTML = ORDER.map((p) => {
      const rt = byProfile.get(p);
      if (!rt) return "";
      const name = tr(...NAMES[p]);
      const tag = p === "mix" ? `<em>${tr("Recommended", "おすすめ")}</em>` : "";
      return `<li data-p="${p}" class="${p === "mix" ? "rec" : ""}">
        <span class="sw"></span>
        <span class="name">${name}${tag}</span>
        <span class="num time">${(Math.round(rt.distance / 10) / 100).toFixed(2)} km</span>
        <span class="num blind"><b>${rt.blind} m</b> ${tr("unchecked", "確認不可")}</span>
      </li>`;
    }).join("");
    const s = byProfile.get("short");
    if (s && rec) {
      const extra = rec.distance - s.distance;
      document.getElementById("routeNote")!.innerHTML = tr(
        `The shortest route crosses <b>${s.blind} m</b> where no position check works and <b>${s.sand} m</b> of sand. The balanced route walks just <b>${extra} m</b> further and cuts both: <b>${rec.blind} m</b> and <b>${rec.sand} m</b>.`,
        `最短ルートは、位置を確かめられない場所を<b>${s.blind} m</b>、砂地を<b>${s.sand} m</b>通ります。統合ルートは<b>${extra} m</b>長いだけで、それぞれ<b>${rec.blind} m</b>と<b>${rec.sand} m</b>に減らします。`,
      );
    }
  };
  render();
  document.addEventListener("langchange", render);

  // hovering a row highlights its line
  list.addEventListener("mouseover", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-p]");
    for (const [p, path] of lines) path.classList.toggle("on", !!li && li.dataset.p === p && p !== "mix");
    svg.classList.toggle("dim", !!li && li.dataset.p !== "mix");
    list.querySelectorAll("li").forEach((x) => x.classList.toggle("on", x === li));
  });
  list.addEventListener("mouseleave", () => {
    for (const path of lines.values()) path.classList.remove("on");
    svg.classList.remove("dim");
    list.querySelectorAll("li").forEach((x) => x.classList.remove("on"));
  });
}
void routes();
