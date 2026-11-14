/**
 * Home: the title, one search box, "New plan", and the plans saved in this browser.
 * The polygon terrain of Gale Crater moves slowly behind. Pointing at a plan or a place flies
 * the camera there; picking it opens the planner.
 */
import { loadJson, type Place, type Positions } from "../data/loader";
import { placeName, profileName } from "../sim/text";
import { HomeScene } from "./homeScene";
import { getLang, initLang, tr } from "./lang";
import { attachPlaceSearch, searchable } from "./placeSearch";
import { ago, listProjects, removeProject, type Project } from "./projects";

initLang();

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let scene: HomeScene | null = null;
let places: Place[] = [];

const open = (p: Place) => location.assign(`/sim.html?dest=${encodeURIComponent(p.id)}`);
const look = (e: number | null, n?: number) => {
  if (!scene) return;
  if (e !== null && n !== undefined) scene.focusOn(e, n);
  else scene.setShot("planner");
};
const lookPlace = (p: Place | null) => (p ? look(p.easting, p.northing) : look(null));

const dur = (s: number) => {
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  return h ? tr(`${h} h ${m % 60} min`, `${h}時間${m % 60}分`) : tr(`${m} min`, `${m}分`);
};
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

function planRow(p: Project): string {
  const s = p.summary;
  const facts = s ? `${profileName(s.profile)} · ${dur(s.duration)} · ${km(s.distance)}` : tr("No route yet", "ルート未計算");
  return `<li>
    <a href="/sim.html?project=${encodeURIComponent(p.id)}" data-plan="${esc(p.id)}">
      <span class="flag${s && !s.ok ? " bad" : ""}" aria-hidden="true"></span>
      <span class="nm">${esc(p.name)}</span>
      <span class="facts">${esc(facts)}</span>
      <span class="when">${esc(ago(p.updated, getLang() === "ja"))}</span>
    </a>
    <button class="del" data-del="${esc(p.id)}" aria-label="${esc(tr(`Delete ${p.name}`, `${p.name}を削除`))}" title="${esc(tr("Delete", "削除"))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" /></svg>
    </button>
  </li>`;
}

function renderPlans(): void {
  const list = listProjects();
  const stops = places.filter((p) => p.kind === "stop");
  const box = $("plans");
  if (!list.length) {
    // first visit: suggest the three science targets
    box.innerHTML = `<p class="empty">${esc(tr("No plans yet. Try a science target:", "まだ計画がありません。科学目標から始める："))}
      ${stops.map((p) => `<a href="/sim.html?dest=${p.id}" data-place="${p.id}">${esc(placeName(p.id, p.name))}</a>`).join("")}</p>`;
    return;
  }
  box.innerHTML = `<h2>${esc(tr("Your plans", "保存した計画"))}</h2><ul>${list.slice(0, 8).map(planRow).join("")}</ul>`;
}

function renderText(): void {
  ($("q") as HTMLInputElement).placeholder = tr("Search a place in Gale Crater", "ゲール・クレーターの場所を検索");
  renderPlans();
}

const plansBox = $("plans");
const focusFrom = (el: HTMLElement | null) => {
  if (!el) return;
  const a = el.closest<HTMLElement>("[data-plan], [data-place]");
  if (!a) return;
  if (a.dataset.place) lookPlace(places.find((p) => p.id === a.dataset.place) ?? null);
  else {
    const p = listProjects().find((q) => q.id === a.dataset.plan);
    if (p?.destE !== undefined && p.destN !== undefined) look(p.destE, p.destN);
  }
};
plansBox.addEventListener("mouseover", (e) => focusFrom(e.target as HTMLElement));
plansBox.addEventListener("focusin", (e) => focusFrom(e.target as HTMLElement));
plansBox.addEventListener("mouseleave", () => look(null));
plansBox.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-del]");
  if (!b) return;
  const p = listProjects().find((q) => q.id === b.dataset.del);
  if (p && confirm(tr(`Delete the plan "${p.name}"?`, `計画「${p.name}」を削除しますか？`))) {
    removeProject(p.id);
    renderPlans();
  }
});
document.addEventListener("langchange", renderText);
// coming back with the browser's back button: show plans saved meanwhile
addEventListener("pageshow", renderPlans);

// ---------------------------------------------------------------- background
addEventListener("pointermove", (e) => scene?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
function renderReadout(): void {
  if (!scene) return;
  const r = scene.readout();
  const lat = `${Math.abs(r.lat).toFixed(4)}°${r.lat < 0 ? "S" : "N"}`;
  const elev = Number.isNaN(r.elevation) ? "" : `  ·  ${Math.round(r.elevation).toLocaleString("en-US")} m`;
  $("readout").textContent = `${lat} ${r.lon.toFixed(4)}°E${elev}  ·  ${tr("local time", "現地時刻")} ${pad(r.ltst)}:${pad((r.ltst % 1) * 60)}`;
}

async function start(): Promise<void> {
  const [pos, routes] = await Promise.all([
    loadJson<Positions>("positions.json"),
    loadJson<{ routes: { profile: string; points: [number, number][] }[] }>("home/routes.json").catch(() => null),
  ]);
  places = pos.places;
  renderText();
  attachPlaceSearch($("q") as HTMLInputElement, $("suggest"), searchable(places), open, lookPlace);

  try {
    const host = $("bg");
    scene = await HomeScene.create(host, reduced);
    if (routes) scene.addRoutes(routes.routes);
    for (const p of places) {
      if (p.kind === "base") scene.addMarker(p.easting, p.northing, "#7cc8ff");
      else if (p.kind === "stop") scene.addMarker(p.easting, p.northing, "#ffd166");
    }
    setTimeout(() => look(null), reduced ? 0 : 1200);
    addEventListener("resize", () => scene?.resize());
    let last = 0;
    const loop = (now: number) => {
      scene!.frame(now);
      if (now - last > 250) {
        renderReadout();
        last = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    setTimeout(() => host.classList.add("ready"), 120);
  } catch (err) {
    // no WebGL: the still image stays and everything else works
    console.warn("3D background unavailable", err);
    $("readout").textContent = "";
  }
}
void start();
