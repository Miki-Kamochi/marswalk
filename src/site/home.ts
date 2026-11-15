/**
 * Home: Mars in the middle with "Ares" and "Sight" either side, one search bar with "New plan"
 * inside it, and a row of cards below: your recent plans, or the science targets to start from.
 */
import { AREAS, areaOf, type AreaId } from "../data/areas";
import { loadJson, type Place, type Positions } from "../data/loader";
import { placeName, profileName } from "../sim/text";
import { Globe } from "./globe";
import { getLang, initLang, tr } from "./lang";
import { attachPlaceSearch, searchable } from "./placeSearch";
import { ago, listProjects, removeProject, type Project } from "./projects";
import { revealed } from "./reveal";

initLang();

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** places of every map area, each tagged with its area */
type AreaPlace = Place & { area: AreaId };
let places: AreaPlace[] = [];
const destUrl = (p: AreaPlace) => `/sim.html?area=${p.area}&dest=${encodeURIComponent(p.id)}`;
const open = (p: Place) => location.assign(destUrl(p as AreaPlace));

/** what each science target is for, in a few words */
const WHY: Record<string, [string, string]> = {
  stop_murray_buttes: ["Rock layers of an old lake", "古い湖の地層"],
  stop_bagnold_dunes: ["Active dark sand dunes", "動いている黒い砂丘"],
  stop_vera_rubin_ridge: ["Hematite seen from orbit", "軌道から見えたヘマタイト"],
  stop_marker_band: ["Ripples of an ancient lake", "古代の湖の波の跡"],
  stop_gediz_ridge: ["Debris left by floods", "洪水が残した岩くず"],
  stop_sulfur_field: ["Pure sulfur stones", "純粋な硫黄の石"],
};

const dur = (s: number) => {
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  return h ? tr(`${h} h ${m % 60} min`, `${h}時間${m % 60}分`) : tr(`${m} min`, `${m}分`);
};

function planCard(p: Project): string {
  const s = p.summary;
  const facts = s ? `${profileName(s.profile)} · ${dur(s.duration)}` : tr("No route yet", "ルート未計算");
  return `<li class="card">
    <a href="/sim.html?area=${areaOf(p.area)}&project=${encodeURIComponent(p.id)}">
      <span class="dot${s && !s.ok ? " bad" : " plan"}" aria-hidden="true"></span>
      <span class="nm">${esc(p.name)}</span>
      <span class="sub">${esc(facts)}</span>
      <span class="meta">${esc(ago(p.updated, getLang() === "ja"))}</span>
    </a>
    <button class="del" data-del="${esc(p.id)}" aria-label="${esc(tr(`Delete ${p.name}`, `${p.name}を削除`))}" title="${esc(tr("Delete", "削除"))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
  </li>`;
}

function targetCard(p: AreaPlace): string {
  const base = places.find((q) => q.kind === "base" && q.area === p.area);
  const km = base ? `${(Math.hypot(p.easting - base.easting, p.northing - base.northing) / 1000).toFixed(1)} km` : "";
  const why = WHY[p.id];
  return `<li class="card">
    <a href="${destUrl(p)}">
      <span class="dot" aria-hidden="true"></span>
      <span class="nm">${esc(placeName(p.id, p.name).replace(/（[^）]*）|\s*\([^)]*\)/, ""))}</span>
      <span class="sub">${why ? esc(tr(...why)) : ""}</span>
      <span class="meta">${esc(tr(`${km} from Base Camp`, `ベースキャンプから ${km}`))}</span>
    </a>
  </li>`;
}

/** which tab is open below the search: saved plans or science targets */
let tab: "plans" | "targets" | null = null;

function renderBelow(): void {
  const plans = listProjects();
  const stops = places.filter((p) => p.kind === "stop");
  const box = $("below");
  if (!plans.length) tab = "targets";
  else if (!tab) tab = "plans";
  const tabBtn = (id: "plans" | "targets", label: string) =>
    `<button role="tab" data-tab="${id}" aria-selected="${tab === id}">${esc(label)}</button>`;
  const head = plans.length
    ? `<div class="head" role="tablist">${tabBtn("plans", tr("History", "履歴"))}${tabBtn("targets", tr("Science targets", "科学目標"))}${
        tab === "plans" && plans.length > 6 ? `<span class="count">${esc(tr(`${plans.length} saved`, `${plans.length}件保存`))}</span>` : ""
      }</div>`
    : `<div class="head"><h2>${esc(tr("Start with a science target", "科学目標から始める"))}</h2></div>`;
  const cards = tab === "plans" ? plans.slice(0, 6).map(planCard) : stops.map(targetCard);
  box.innerHTML = `${head}<ul class="cards">${cards.join("")}</ul>`;
  renderButton();
}

function renderButton(): void {
  const n = listProjects().length;
  $("ddLabel").textContent = n ? tr("History", "履歴") : tr("Science targets", "科学目標");
  $("ddCount").textContent = n ? String(n) : "";
}

function setOpen(open: boolean): void {
  $("below").hidden = !open;
  $("ddBtn").setAttribute("aria-expanded", String(open));
}
$("ddBtn").addEventListener("click", () => setOpen($("below").hidden === true));
document.addEventListener("pointerdown", (e) => {
  if (!$("dd").contains(e.target as Node)) setOpen(false);
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape") setOpen(false);
});

function renderText(): void {
  ($("q") as HTMLInputElement).placeholder = tr("Search a place in Gale Crater", "ゲール・クレーターの場所を検索");
  renderBelow();
}

$("below").addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
  if (t) {
    tab = t.dataset.tab as "plans" | "targets";
    renderBelow();
    return;
  }
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-del]");
  if (!b) return;
  const p = listProjects().find((q) => q.id === b.dataset.del);
  if (p && confirm(tr(`Delete the plan "${p.name}"?`, `計画「${p.name}」を削除しますか？`))) {
    removeProject(p.id);
    renderBelow();
  }
});
document.addEventListener("langchange", renderText);
// back from the planner with the browser's back button: show what was saved meanwhile
addEventListener("pageshow", renderBelow);
renderText();

async function start(): Promise<void> {
  const host = $("globe");
  // building the globe is heavy: let the page-change animation finish first
  const globe = revealed().then(() => Globe.create(host, "/img/home/mars.jpg", reduced)).catch((err) => {
    console.warn("globe unavailable", err);
    document.body.classList.add("no-globe");
    return null;
  });
  const all = await Promise.all(AREAS.map((a) => loadJson<Positions>("positions.json", a.id).catch(() => null)));
  places = all.flatMap((pos, i) => (pos ? pos.places.map((p) => ({ ...p, area: AREAS[i].id })) : []));
  renderText();
  attachPlaceSearch($("q") as HTMLInputElement, $("suggest"), searchable(places), open);

  const g = await globe;
  if (!g) return;
  // the globe sits between the top bar (or the title on phones) and the cards / search bar
  g.area = () => {
    const phone = innerWidth < 720;
    const top = phone ? document.querySelector(".title")!.getBoundingClientRect().bottom + 8 : document.querySelector(".bar")!.getBoundingClientRect().bottom - 16;
    let bottom = document.querySelector(".start")!.getBoundingClientRect().top;
    // on narrow screens the plans button sits just above the search bar
    if (innerWidth <= 1000) bottom = Math.min(bottom, $("ddBtn").getBoundingClientRect().top);
    return { top, bottom };
  };
  g.resize();
  // the "Gale Crater" label follows the marker while it faces us
  const spot = $("spot");
  g.onSpot = (x, y, facing) => {
    spot.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    spot.style.opacity = String(Math.max(0, Math.min(1, (facing - 0.3) / 0.25)));
  };
  addEventListener("resize", () => g.resize());
  // Stop drawing the moment we leave: a page that keeps redrawing while the browser takes its
  // snapshot makes Chrome skip the page-change animation. Restart if we come back via back/forward.
  let running = true;
  const loop = (now: number) => {
    if (!running) return;
    g.frame(now);
    requestAnimationFrame(loop);
  };
  addEventListener("pageswap", () => (running = false));
  addEventListener("pageshow", (e) => {
    if (e.persisted && !running) {
      running = true;
      requestAnimationFrame(loop);
    }
  });
  requestAnimationFrame(loop);
  host.classList.add("ready");
}
void start();
