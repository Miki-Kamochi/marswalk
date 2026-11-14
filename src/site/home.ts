/**
 * Home: "Where do you want to walk today?" One search box for places in Gale Crater, the three
 * science targets as chips, and the polygon terrain behind. Pointing at a place flies the
 * camera there; picking it opens the planner with that destination.
 */
import { loadJson, type Place, type Positions } from "../data/loader";
import { placeName } from "../sim/text";
import { HomeScene } from "./homeScene";
import { initLang, tr } from "./lang";
import { attachPlaceSearch, searchable } from "./placeSearch";

initLang();

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let scene: HomeScene | null = null;
let places: Place[] = [];
let base: Place | undefined;

const open = (p: Place) => location.assign(`/sim.html?dest=${encodeURIComponent(p.id)}`);
const look = (p: Place | null) => {
  if (!scene) return;
  if (p) scene.focusOn(p.easting, p.northing);
  else scene.setShot("planner");
};

function renderChips(): void {
  const stops = places.filter((p) => p.kind === "stop");
  $("chips").innerHTML = stops
    .map((p) => {
      const km = base ? (Math.hypot(p.easting - base.easting, p.northing - base.northing) / 1000).toFixed(1) : "";
      return `<a href="/sim.html?dest=${p.id}" data-id="${p.id}"><span class="sq" aria-hidden="true"></span>${esc(placeName(p.id, p.name))}<span class="km">${km} km</span></a>`;
    })
    .join("");
}

function renderText(): void {
  ($("q") as HTMLInputElement).placeholder = tr("Search Gale Crater", "ゲール・クレーターで検索");
  renderChips();
}

const chips = $("chips");
chips.addEventListener("mouseover", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("a[data-id]");
  if (a) look(places.find((p) => p.id === a.dataset.id) ?? null);
});
chips.addEventListener("focusin", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("a[data-id]");
  if (a) look(places.find((p) => p.id === a.dataset.id) ?? null);
});
chips.addEventListener("mouseleave", () => look(null));
document.addEventListener("langchange", renderText);

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
  base = places.find((p) => p.kind === "base");
  renderText();
  attachPlaceSearch($("q") as HTMLInputElement, $("suggest"), searchable(places), open, look);

  try {
    const host = $("bg");
    scene = await HomeScene.create(host, reduced);
    if (routes) scene.addRoutes(routes.routes);
    for (const p of places) {
      if (p.kind === "base") scene.addMarker(p.easting, p.northing, "#7cc8ff");
      else if (p.kind === "stop") scene.addMarker(p.easting, p.northing, "#ffd166");
    }
    // a slow establishing shot, then the whole planned walk
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
    // no WebGL: the still image stays and the search works as normal
    console.warn("3D background unavailable", err);
    $("readout").textContent = "";
  }
}
void start();
