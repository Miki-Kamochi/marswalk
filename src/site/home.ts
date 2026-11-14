/**
 * EVA briefing (the first screen of the habitat planning display): science objectives,
 * conditions from Curiosity's weather station, the live local time at Gale, and the 3D site
 * view with the planned routes. Pointing at an objective shows it in the site view.
 */
import { toLonLat } from "../data/frame";
import { loadJson, type Place, type Positions } from "../data/loader";
import { sunPosition } from "../nav/sun";
import { initLang, tr } from "./lang";
import { OVERVIEW, SiteView, viewOf } from "./siteView";

initLang();

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Pair = [string, string];
interface Objective {
  id: string;
  name: Pair;
  why: Pair;
  source: Pair;
  primary?: boolean;
}
const OBJECTIVES: Objective[] = [
  {
    id: "stop_vera_rubin_ridge",
    name: ["Vera Rubin Ridge", "ヴェラ・ルービン・リッジ"],
    why: ["Hematite, an iron oxide that often forms in water. Collect a sample.", "水のある環境でできやすい酸化鉄、ヘマタイト。試料を採取する。"],
    source: ["MRO CRISM · spectral", "MRO CRISM · スペクトル"],
    primary: true,
  },
  {
    id: "stop_murray_buttes",
    name: ["Murray Buttes", "マレー・ビュート"],
    why: ["Layered mesas: each layer records a stage of the ancient lake.", "層になった台地。1枚1枚の層に、昔の湖の時代が記録されている。"],
    source: ["MRO HiRISE · topographic", "MRO HiRISE · 地形"],
  },
  {
    id: "stop_bagnold_dunes",
    name: ["Bagnold Dunes edge", "バグノルド砂丘の縁"],
    why: ["Active dark basalt dunes. Soft sand: look, don't cross.", "今も動く黒い玄武岩の砂丘。砂がやわらかいので、近くで観察するだけ。"],
    source: ["MRO CRISM · spectral", "MRO CRISM · スペクトル"],
  },
];

interface Weather {
  fields: string[];
  sols: (string | number | null)[][];
}

let view: SiteView | null = null;
let places: Place[] = [];
let weather: Weather | null = null;
let routeKm: number | null = null;
let current = "";

// ---------------------------------------------------------------- objectives
function renderObjectives(): void {
  const base = places.find((p) => p.id === "base");
  $("objectives").innerHTML = OBJECTIVES.map((o, i) => {
    const p = places.find((x) => x.id === o.id);
    let dist = "";
    if (o.primary && routeKm) dist = tr(`${routeKm.toFixed(1)} km walk`, `徒歩 ${routeKm.toFixed(1)} km`);
    else if (p && base) dist = tr(`${(Math.hypot(p.easting - base.easting, p.northing - base.northing) / 1000).toFixed(1)} km away`, `直線 ${(Math.hypot(p.easting - base.easting, p.northing - base.northing) / 1000).toFixed(1)} km`);
    return `<li><a class="obj" href="/sim.html?dest=${o.id}" data-id="${o.id}">
      <span class="n">${String(i + 1).padStart(2, "0")}</span>
      <span class="title">${esc(tr(...o.name))}${o.primary ? `<span class="pri">${tr("PRIMARY", "主目標")}</span>` : ""}</span>
      <span class="dist">${esc(dist)}</span>
      <span class="why">${esc(tr(...o.why))}</span>
      <span class="src">${esc(tr(...o.source))}</span>
      <span class="go">${tr("Plan", "計画")} →</span>
    </a></li>`;
  }).join("");
}

function showPlace(id: string): void {
  current = id;
  const p = places.find((x) => x.id === id);
  const o = OBJECTIVES.find((x) => x.id === id);
  if (p && o) {
    $("viewTitle").textContent = tr(...o.name);
    view?.setView(viewOf(p.easting, p.northing));
    $("overview").hidden = false;
  }
}

function showOverview(): void {
  current = "";
  $("viewTitle").textContent = tr("EVA-1 · Base Camp → Vera Rubin Ridge", "EVA-1 · ベースキャンプ → ヴェラ・ルービン・リッジ");
  view?.setView(OVERVIEW);
  $("overview").hidden = true;
}

const list = $("objectives");
list.addEventListener("mouseover", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("a.obj");
  if (a && a.dataset.id !== current) showPlace(a.dataset.id!);
});
list.addEventListener("focusin", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("a.obj");
  if (a) showPlace(a.dataset.id!);
});
$("overview").addEventListener("click", showOverview);

// ---------------------------------------------------------------- conditions
function renderConditions(): void {
  if (!weather) return;
  const F = weather.fields;
  const col = (name: string) => F.indexOf(name);
  // the latest sol with a full report
  const row = [...weather.sols].reverse().find((r) => r[col("air_min_c")] != null && r[col("pressure_pa")] != null);
  if (!row) return;
  const v = (name: string) => row[col(name)];
  const date = new Date(`${v("earth_date")}T00:00:00Z`).toLocaleDateString(tr("en-GB", "ja-JP"), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  $("condSource").textContent = tr(
    `Latest report · Curiosity REMS · sol ${v("sol")} · ${date}`,
    `最新の観測 · キュリオシティ REMS · ${v("sol")}ソル目 · ${date}`,
  );
  const sky = String(v("opacity"));
  const items: [Pair, string][] = [
    [["Air temperature", "気温"], `${v("air_min_c")} … ${v("air_max_c")} °C`],
    [["Ground temperature", "地面の温度"], `${v("ground_min_c")} … ${v("ground_max_c")} °C`],
    [["Pressure", "気圧"], `${v("pressure_pa")} Pa`],
    [["UV index", "紫外線"], tr(String(v("uv_index")), { Low: "弱い", Moderate: "中程度", High: "強い", "Very_High": "非常に強い" }[String(v("uv_index"))] ?? String(v("uv_index")))],
    [["Sunrise · sunset", "日の出 · 日の入り"], `${v("sunrise")} · ${v("sunset")}`],
    [["Sky", "空"], tr(sky, sky === "Sunny" ? "晴れ" : sky)],
  ];
  $("conditions").innerHTML = items.map(([k, val]) => `<div><dt>${esc(tr(...k))}</dt><dd>${esc(val)}</dd></div>`).join("");
}

// ---------------------------------------------------------------- live Mars clock
const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
function tick(): void {
  const base = places.find((p) => p.id === "base");
  if (!base) return;
  const ll = toLonLat(base.easting, base.northing);
  const h = sunPosition(Date.now(), ll.lat, ll.lon).ltst;
  $("ltst").textContent = `${pad(h)}:${pad((h % 1) * 60)}`;
}

function render(): void {
  renderObjectives();
  renderConditions();
  if (current) showPlace(current);
  else $("viewTitle").textContent = tr("EVA-1 · Base Camp → Vera Rubin Ridge", "EVA-1 · ベースキャンプ → ヴェラ・ルービン・リッジ");
}
document.addEventListener("langchange", render);

// ---------------------------------------------------------------- start
async function start(): Promise<void> {
  const [pos, w, routes] = await Promise.all([
    loadJson<Positions>("positions.json"),
    loadJson<Weather>("weather.json").catch(() => null),
    loadJson<{ routes: { profile: string; distance: number; points: [number, number][] }[] }>("home/routes.json").catch(() => null),
  ]);
  places = pos.places;
  weather = w;
  routeKm = routes?.routes.find((r) => r.profile === "mix") ? routes.routes.find((r) => r.profile === "mix")!.distance / 1000 : null;
  render();
  tick();
  setInterval(tick, 10000);

  try {
    const host = $("scene");
    view = await SiteView.create(host, reduced);
    if (routes) view.addRoutes(routes.routes, "mix");
    const base = places.find((p) => p.id === "base");
    if (base) view.addMarker(base.easting, base.northing, "#7cc8ff");
    for (const o of OBJECTIVES) {
      const p = places.find((x) => x.id === o.id);
      if (p) view.addMarker(p.easting, p.northing, "#ffd166");
    }
    host.addEventListener("pointermove", (e) => {
      const r = host.getBoundingClientRect();
      view?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    });
    host.parentElement!.addEventListener("pointerleave", () => view?.setPointer(0, 0));
    let queued = false;
    addEventListener("resize", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        view?.resize();
      });
    });
    const loop = (now: number) => {
      view!.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    $("loading").remove();
    // the pointer may already be on an objective
    if (current) showPlace(current);
    setTimeout(() => host.classList.add("ready"), 100);
  } catch (err) {
    // no WebGL: the still image stays and the briefing still works
    console.warn("3D site view unavailable", err);
    $("loading").remove();
  }
}
void start();
