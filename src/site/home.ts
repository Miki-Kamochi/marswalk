/**
 * Home: Mars in the middle, the title either side of it, a search box and "New plan" below,
 * and the plans saved in this browser. Simple on purpose.
 */
import { loadJson, type Place, type Positions } from "../data/loader";
import { placeName } from "../sim/text";
import { Globe } from "./globe";
import { getLang, initLang, setLang, tr } from "./lang";
import { attachPlaceSearch, searchable } from "./placeSearch";
import { ago, listProjects, removeProject, type Project } from "./projects";

initLang();

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let places: Place[] = [];
const open = (p: Place) => location.assign(`/sim.html?dest=${encodeURIComponent(p.id)}`);

function planPill(p: Project): string {
  return `<li>
    <a href="/sim.html?project=${encodeURIComponent(p.id)}"${p.summary && !p.summary.ok ? ' class="bad"' : ""}>
      <span class="nm">${esc(p.name)}</span><span class="when">${esc(ago(p.updated, getLang() === "ja"))}</span>
    </a>
    <button class="del" data-del="${esc(p.id)}" aria-label="${esc(tr(`Delete ${p.name}`, `${p.name}を削除`))}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
  </li>`;
}

function renderPlans(): void {
  const list = listProjects();
  const box = $("plans");
  if (!list.length) {
    const stops = places.filter((p) => p.kind === "stop");
    box.innerHTML = stops.length
      ? `<p class="try">${esc(tr("Try", "例えば"))} ${stops.map((p) => `<a href="/sim.html?dest=${p.id}">${esc(placeName(p.id, p.name))}</a>`).join("")}</p>`
      : "";
    return;
  }
  box.innerHTML = `<ul>${list.slice(0, 4).map(planPill).join("")}</ul>${
    list.length > 4 ? `<p class="more">${esc(tr(`+${list.length - 4} more`, `ほか${list.length - 4}件`))}</p>` : ""
  }`;
}

function renderText(): void {
  ($("q") as HTMLInputElement).placeholder = tr("Search Gale Crater", "ゲール・クレーターを検索");
  $("lang").textContent = getLang() === "ja" ? "EN" : "日本語";
  renderPlans();
}

$("lang").addEventListener("click", () => setLang(getLang() === "ja" ? "en" : "ja"));
$("plans").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-del]");
  if (!b) return;
  const p = listProjects().find((q) => q.id === b.dataset.del);
  if (p && confirm(tr(`Delete the plan "${p.name}"?`, `計画「${p.name}」を削除しますか？`))) {
    removeProject(p.id);
    renderPlans();
  }
});
document.addEventListener("langchange", renderText);
// back from the planner with the browser's back button: show what was saved meanwhile
addEventListener("pageshow", renderPlans);
renderText();

async function start(): Promise<void> {
  const host = $("globe");
  // the globe does not need the place list, so start both at once
  const globe = Globe.create(host, "/img/home/mars.jpg", reduced).catch((err) => {
    console.warn("globe unavailable", err);
    document.body.classList.add("no-globe");
    return null;
  });
  const pos = await loadJson<Positions>("positions.json");
  places = pos.places;
  renderText();
  attachPlaceSearch($("q") as HTMLInputElement, $("suggest"), searchable(places), open);

  const g = await globe;
  if (!g) return;
  addEventListener("resize", () => g.resize());
  const loop = (now: number) => {
    g.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  host.classList.add("ready");
}
void start();
