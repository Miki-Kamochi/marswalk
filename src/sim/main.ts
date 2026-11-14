/**
 * Route simulator: pick a destination on the 2D map or in the 3D view and compare four routes
 * that all keep the astronaut safe, locatable and able to walk home.
 */
import { toLonLat } from "../data/frame";
import { dataUrl, loadGrid, loadJson, loadMeta, type Place, type Positions, type Traverse } from "../data/loader";
import { DEFAULTS, type PlanConfig } from "../plan/config";
import { cellElevations, decodeNav, NavGrid } from "../plan/grid";
import { Planner, PROFILES, type Profile, type Route } from "../plan/planner";
import { initLang, tr } from "../site/lang";
import { Map2D } from "./map2d";
import { HEMATITE, locStops, makeCanvas, NO_GO, paintLimit, paintOverlay, SAFETY, css, type OverlayId } from "./overlays";
import { drawProfile } from "./profile";
import { ROUTE_COLORS, type SceneView, type ViewEvents } from "./scene";
import { INFO, limiterName, placeName, profileName, profileWhat, t } from "./text";

type ViewMode = "2d" | "split" | "3d";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Let the browser draw before the next piece of heavy work. */
const breathe = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const pc = (x: number) => `${Math.round(x * 100)}%`;
const dur = (s: number) => {
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  return h ? tr(`${h} h ${m % 60} min`, `${h}時間${m % 60}分`) : tr(`${m} min`, `${m}分`);
};

const O2_COLORS = { before: "#5a4a40", out: "#52c8ff", work: "#b28dff", back: "#ffb86b", left: "rgba(88, 201, 138, 0.55)" };

async function main() {
  initLang();
  const params = new URLSearchParams(location.search);
  const cfg: PlanConfig = { ...DEFAULTS };
  const meta = await loadMeta();
  const nav = meta.nav.grid;
  const [play, navBuf, positions, traverse] = await Promise.all([
    loadGrid(meta.grids.play),
    fetch(dataUrl(nav.file)).then((r) => {
      if (!r.ok) throw new Error(`${nav.file}: HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
    loadJson<Positions>("positions.json"),
    loadJson<Traverse>("traverse.json"),
  ]);
  const grid = new NavGrid(nav, { ...decodeNav(nav, new Uint8Array(navBuf)), elev: cellElevations(meta.grids.play, play.data, nav) }, cfg);
  const planner = new Planner(grid, cfg);

  const cellOfPlace = (p: Place) => grid.nearestOpen(grid.index(p.easting, p.northing));
  const base = positions.places.find((p) => p.id === "base")!;
  const baseCell = cellOfPlace(base);
  const targets = positions.places.filter((p) => p.kind === "stop");

  const state = {
    view: "2d" as ViewMode,
    overlay: "loc" as OverlayId,
    showLimit: true,
    showPlaces: true,
    showTraverse: false,
    home: -1,
    /** the clicked cell, and the destination actually used */
    target: -1,
    dest: -1,
    moved: false,
    problem: undefined as "outside" | "no-go" | "cut-off" | undefined,
    homeBad: false,
    routes: [] as Route[],
    back: [] as number[],
    selected: "mix" as Profile,
    busy: false,
    o2: 1,
    pickStart: false,
    /** walkable cells beyond the walk-back limit */
    beyond: 0,
  };
  let token = 0;

  // ---------------------------------------------------------------- views
  const overlayCv = makeCanvas(grid);
  const limitCv = makeCanvas(grid);
  const ev: ViewEvents = {
    onPick: (e, n) => {
      const cell = grid.index(e, n);
      if (state.pickStart) void setHome(cell);
      else void setDest(cell);
    },
    onHover: (e, n) => renderReadout(e === null || n === null ? -1 : grid.index(e, n)),
    onSelect: (p) => select(p),
  };
  const map2d = new Map2D($("map2d"), meta, grid, positions, traverse, ev, (p) => placeName(p.id, p.name));
  const views: SceneView[] = [map2d];
  let asked3d = false;

  const pushOverlay = (to: SceneView[] = views) => {
    if (state.overlay !== "none") paintOverlay(overlayCv, grid, state.overlay, cfg);
    for (const v of to) v.setOverlay(state.overlay === "none" ? null : overlayCv);
    renderLegend();
  };
  const pushLimit = (to: SceneView[] = views) => {
    const within = planner.withinLimit(state.o2);
    let beyond = 0;
    for (let i = 0; i < grid.size; i++) if (!within[i] && planner.fromHome[i] < Infinity) beyond++;
    state.beyond = beyond;
    if (state.showLimit) paintLimit(limitCv, grid, within);
    for (const v of to) v.setLimit(state.showLimit ? limitCv : null);
    renderLegend();
  };
  const pushRoutes = (to: SceneView[] = views) => {
    for (const v of to) {
      v.setRoutes(state.routes, state.selected, state.back);
      v.setEnds(state.home, state.dest);
    }
  };
  const pushExtras = (to: SceneView[] = views) => {
    for (const v of to) v.setExtras(state.showPlaces, state.showTraverse);
  };

  function ensure3d() {
    if (asked3d) return;
    asked3d = true;
    const note = $("load3d");
    note.textContent = t("load3d");
    import("./view3d")
      .then((m) => m.View3D.create($("view3d"), grid, ev, () => (note.textContent = t("load3d"))))
      .then((v) => {
        note.remove();
        views.push(v);
        pushOverlay([v]);
        pushLimit([v]);
        pushRoutes([v]);
        pushExtras([v]);
        v.resize();
      })
      .catch((err) => {
        console.error(err);
        note.textContent = `3D: ${err.message}`;
      });
  }

  function setView(v: ViewMode) {
    state.view = v;
    $("app").dataset.view = v;
    for (const b of $("viewSeg").querySelectorAll<HTMLElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.view === v));
    if (v !== "2d") ensure3d();
    requestAnimationFrame(() => {
      views.forEach((x) => x.resize());
      map2d.fit();
    });
  }

  // ---------------------------------------------------------------- planning
  async function replan() {
    const my = ++token;
    state.routes = [];
    state.back = [];
    state.problem = undefined;
    state.moved = false;
    state.dest = -1;
    if (state.target >= 0 || state.target === -2) {
      const res = planner.resolve(state.target === -2 ? -1 : state.target);
      state.dest = res.dest;
      state.moved = res.moved;
      state.problem = res.problem;
      state.back = res.back;
    }
    state.busy = state.dest >= 0 && !state.problem;
    renderTrip();
    renderRoutes();
    pushRoutes();
    if (!state.busy) return;
    for (const p of PROFILES) {
      await breathe();
      if (my !== token) return;
      const r = planner.route(state.dest, p, state.o2);
      if (r) state.routes.push(r);
      if (p === PROFILES[PROFILES.length - 1]) state.busy = false;
      renderRoutes();
      pushRoutes();
    }
  }

  async function setDest(cell: number) {
    state.target = cell < 0 ? -2 : cell; // -2: a click outside the map
    await replan();
  }

  async function setHome(cell: number) {
    const open = grid.nearestOpen(cell);
    state.pickStart = false;
    state.homeBad = open < 0;
    if (open < 0) {
      renderTrip();
      renderRoutes();
      return;
    }
    token++;
    state.routes = [];
    state.busy = true;
    state.home = open;
    renderTrip();
    renderRoutes();
    pushRoutes();
    await breathe();
    planner.setHome(open);
    pushLimit();
    await replan();
  }

  function select(p: Profile) {
    state.selected = p;
    renderRoutes();
    pushRoutes();
    renderLegend();
  }

  // ---------------------------------------------------------------- panel
  function nameOf(cell: number): string {
    const e = grid.east(cell);
    const n = grid.northOf(cell);
    let best: Place | null = null;
    let bestD = 45;
    for (const p of positions.places) {
      if (p.kind === "backdrop" || p.kind === "landmark") continue;
      const d = Math.hypot(p.easting - e, p.northing - n);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) return placeName(best.id, best.name);
    const g = toLonLat(e, n);
    return `${Math.abs(g.lat).toFixed(4)}°${g.lat < 0 ? "S" : "N"} ${g.lon.toFixed(4)}°E`;
  }

  function renderTrip() {
    $("homeName").textContent = state.home >= 0 ? nameOf(state.home) : "…";
    $("destName").textContent = state.dest >= 0 ? nameOf(state.dest) : t("notChosen");
    $("changeStart").textContent = state.pickStart ? t("cancel") : t("change");
    $("hint").textContent = state.pickStart ? t("hintStart") : state.dest < 0 ? t("hint") : "";
    $("quick").innerHTML =
      targets
        .map((p) => `<button data-quick="${p.id}" aria-pressed="${cellOfPlace(p) === state.dest}">${esc(placeName(p.id, p.name))}</button>`)
        .join("") + (state.home !== baseCell && state.home >= 0 ? `<button data-quick="home-base">↺ ${esc(t("baseCamp"))}</button>` : "");
    document.body.classList.toggle("picking-start", state.pickStart);
  }

  function card(r: Route): string {
    const s = r.stats;
    const p = r.profile;
    const on = p === state.selected;
    const bad = !s.errorOk || !s.o2Ok;
    const meta = [
      `${dur(s.duration)} ${t("oneWay")}`,
      `O₂ ${pc(s.o2Out)}`,
      tr(`${s.photoCount} photo fixes`, `撮影${s.photoCount}回`),
      tr(`${Math.round(s.blindDistance)} m without fix`, `撮影不可 ${Math.round(s.blindDistance)} m`),
    ].join(" · ");
    const html = `<button class="route" data-route="${p}" aria-pressed="${on}">
      <span class="sw" style="background:${ROUTE_COLORS[p]}"></span>
      <span class="name">${esc(profileName(p))}${p === "mix" ? `<em class="rec">${esc(t("recommended"))}</em>` : ""}${bad ? '<span class="flag">!</span>' : ""}</span>
      <span class="big">${km(s.distance)}</span>
      <span class="meta">${esc(meta)}</span>
    </button>`;
    return html;
  }

  function detail(r: Route): string {
    const s = r.stats;
    const p = r.profile;
    const rule = (ok: boolean, text: string) => `<li class="${ok ? "" : "bad"}"><span class="mark">${ok ? "✓" : "✕"}</span><span>${esc(text)}</span></li>`;
    const seg = (w: number, c: string) => `<i style="width:${Math.max(0, w) * 100}%;background:${c}"></i>`;
    const key = (c: string, label: string, v: number) => `<span><i style="background:${c}"></i>${esc(label)} <b>${pc(v)}</b></span>`;
    return `<div class="detail">
      <h3><span class="sw" style="background:${ROUTE_COLORS[p]}"></span>${esc(profileName(p))}</h3>
      <p>${esc(profileWhat(p))}</p>
      <ul class="rules">
        ${rule(true, t("rule1"))}
        ${rule(s.errorOk, t("rule2", { y: cfg.errorLimit, u: s.maxError.toFixed(1) }))}
        ${rule(s.o2Ok, t("rule3", { r: pc(cfg.reserve) }))}
      </ul>
      <dl class="facts">
        <dt>${esc(t("climb"))}</dt><dd>${Math.round(s.ascent)} m</dd>
        <dt>${esc(t("sand"))}</dt><dd>${Math.round(s.sandDistance)} m</dd>
        <dt>${esc(t("caution"))}</dt><dd>${Math.round(s.cautionDistance)} m</dd>
        <dt>${esc(t("longest"))}</dt><dd>${Math.round(s.longestBlind)} m</dd>
      </dl>
      <div class="lbl">${esc(t("o2Title"))}</div>
      <div class="o2bar">
        ${seg(1 - state.o2, O2_COLORS.before)}${seg(s.o2Out, O2_COLORS.out)}${seg(s.o2Work, O2_COLORS.work)}${seg(s.o2Back, O2_COLORS.back)}${seg(s.o2Left, O2_COLORS.left)}
        <span class="reserve" style="width:${cfg.reserve * 100}%"></span>
      </div>
      <div class="o2key">
        ${key(O2_COLORS.out, t("o2Out"), s.o2Out)}${key(O2_COLORS.work, t("o2Work"), s.o2Work)}${key(O2_COLORS.back, t("o2Back"), s.o2Back)}${key(O2_COLORS.left, t("o2Left"), Math.max(0, s.o2Left))}
      </div>
      <canvas class="profile"></canvas>
      <div class="chartkey">
        <span><i style="width:9px;height:9px;border-radius:50%;background:#fff"></i>${esc(t("chartFix"))}</span>
        <span><i style="width:12px;height:9px;background:rgba(255,107,87,0.35)"></i>${esc(t("chartNoFix"))}</span>
      </div>
    </div>`;
  }

  function renderRoutes() {
    const notes: string[] = [];
    if (state.homeBad) notes.push(`<p class="bad">${esc(t("homeBad"))}</p>`);
    if (state.problem) notes.push(`<p class="bad">${esc(t(state.problem === "outside" ? "outside" : state.problem === "no-go" ? "noGo" : "cutOff"))}</p>`);
    if (state.moved) notes.push(`<p>${esc(t("moved"))}</p>`);
    if (state.routes.some((r) => !r.stats.errorOk)) notes.push(`<p class="bad">${esc(t("errorFlag"))}</p>`);
    if (state.routes.length && state.routes.every((r) => !r.stats.o2Ok)) notes.push(`<p class="bad">${esc(t("o2Flag"))}</p>`);
    $("notice").innerHTML = notes.join("");
    let html = "";
    for (const p of PROFILES) {
      const r = state.routes.find((r) => r.profile === p);
      if (r) html += card(r);
    }
    if (state.busy) html += `<div class="busy">${esc(t("calculating"))}</div>`;
    const sel = state.routes.find((r) => r.profile === state.selected);
    if (sel) html += detail(sel);
    $("routes").innerHTML = html;
    drawChart();
  }

  function drawChart() {
    const cv = $("routes").querySelector<HTMLCanvasElement>("canvas.profile");
    const r = state.routes.find((r) => r.profile === state.selected);
    if (cv && r) {
      drawProfile(cv, r, grid, cfg, ROUTE_COLORS[r.profile], { elev: t("chartElev"), err: t("chartErr"), limit: t("chartLimit") });
    }
  }

  function renderLegend() {
    const parts: string[] = [];
    const bar = (gradient: string, a: string, b: string, mid = "") =>
      `<div class="bar" style="background:${gradient}"></div><div class="ends"><span>${esc(a)}</span>${mid ? `<span>${esc(mid)}</span>` : ""}<span>${esc(b)}</span></div>`;
    if (state.overlay === "safety") {
      parts.push(
        bar(
          `linear-gradient(90deg, ${css(NO_GO)} 0 14%, ${css(SAFETY[0])} 14%, ${css(SAFETY[1])} 57%, ${css(SAFETY[2])} 100%)`,
          t("legNoGo"),
          t("legSafe"),
          t("legCaution"),
        ),
      );
    } else if (state.overlay === "loc") {
      const stops = locStops(cfg);
      const top = stops[stops.length - 1][0];
      parts.push(bar(`linear-gradient(90deg, ${stops.map((s) => `${css(s)} ${(s[0] / top) * 100}%`).join(", ")})`, t("legFails"), t("legWorks")));
    } else if (state.overlay === "hematite") {
      parts.push(bar(`linear-gradient(90deg, rgba(255,130,225,0.08), ${css(HEMATITE[1])} 30%, ${css(HEMATITE[2])})`, t("legLess"), t("legMore")));
    }
    const keys: string[] = [];
    if (state.routes.some((r) => r.profile === state.selected)) {
      keys.push(`<span><i style="width:9px;height:9px;border-radius:50%;background:#fff;border:1px solid #1a0f0a"></i>${esc(t("legFix"))}</span>`);
      keys.push(`<span><i style="width:18px;border-top:2px dashed #fff"></i>${esc(t("legBack"))}</span>`);
    }
    if (state.showLimit && state.beyond > 0) keys.push(`<span>${esc(t("legLimit"))}</span>`);
    if (keys.length) parts.push(`<div class="keys">${keys.join("")}</div>`);
    $("legend").innerHTML = parts.join("");
  }

  function renderReadout(cell: number) {
    const box = $("readout");
    box.hidden = cell < 0;
    if (cell < 0) return;
    const L = grid.layers;
    const g = toLonLat(grid.east(cell), grid.northOf(cell));
    const good = grid.good[cell];
    const cls = grid.blocked[cell] ? "bad" : good < 0.5 ? "warn" : "good";
    const word = grid.blocked[cell] ? t("noGoWord") : good < 0.5 ? t("cautionWord") : t("ok");
    const why = good < 0.999 ? ` (${limiterName(grid.limiter(cell, cfg))})` : "";
    const fix = grid.fixable[cell];
    const hem = L.hematite[cell];
    box.innerHTML =
      `${Math.abs(g.lat).toFixed(4)}°S ${g.lon.toFixed(4)}°E · ${Math.round(L.elev[cell])} m · ` +
      `${esc(t("slope"))} ${L.tilt[cell].toFixed(0)}° · ${esc(t("safety"))} <b class="${cls}">${esc(word + why)}</b> · ` +
      `${esc(t("photoFix"))} <b class="${fix ? "good" : "bad"}">${esc(fix ? t("works") : t("fails"))}</b> (${L.loc[cell].toFixed(2)}) · ` +
      `${esc(t("hematite"))} ${Number.isNaN(hem) ? esc(t("notSeen")) : hem.toFixed(2)}`;
  }

  function showInfo(id: string) {
    const info = INFO[id];
    if (!info) return;
    $("infoTitle").textContent = tr(...info.title);
    $("infoBody").innerHTML = info.body.map((p) => `<p>${esc(tr(...p))}</p>`).join("");
    const more = $<HTMLAnchorElement>("infoMore");
    more.textContent = t("more");
    more.href = `/how.html#${info.anchor}`;
    $("infoClose").textContent = t("close");
    $<HTMLDialogElement>("info").showModal();
  }

  function renderSliders() {
    $("o2Val").textContent = pc(state.o2);
    $("errVal").textContent = `${cfg.errorLimit} m`;
  }

  // ---------------------------------------------------------------- events
  $("panel").addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-route], [data-quick]");
    if (!el) return;
    if (el.dataset.route) select(el.dataset.route as Profile);
    else if (el.dataset.quick === "home-base") void setHome(baseCell);
    else {
      const p = positions.places.find((p) => p.id === el.dataset.quick);
      if (p) void setDest(cellOfPlace(p));
    }
  });
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button.info");
    if (!b) return;
    e.preventDefault();
    showInfo(b.dataset.info!);
  });
  $("changeStart").addEventListener("click", () => {
    state.pickStart = !state.pickStart;
    renderTrip();
  });
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="overlay"]')) {
    r.checked = r.value === state.overlay;
    r.addEventListener("change", () => {
      state.overlay = r.value as OverlayId;
      pushOverlay();
    });
  }
  const check = (id: string, set: (on: boolean) => void) => $<HTMLInputElement>(id).addEventListener("change", (e) => set((e.target as HTMLInputElement).checked));
  check("showLimit", (on) => {
    state.showLimit = on;
    pushLimit();
  });
  check("showPlaces", (on) => {
    state.showPlaces = on;
    pushExtras();
  });
  check("showTraverse", (on) => {
    state.showTraverse = on;
    pushExtras();
  });
  let o2Queued = false;
  $<HTMLInputElement>("o2").addEventListener("input", (e) => {
    state.o2 = Number((e.target as HTMLInputElement).value) / 100;
    renderSliders();
    if (o2Queued) return;
    o2Queued = true;
    requestAnimationFrame(() => {
      o2Queued = false;
      state.routes = state.routes.map((r) => planner.evaluate(r.cells, r.profile, state.o2));
      pushLimit();
      renderRoutes();
    });
  });
  const err = $<HTMLInputElement>("err");
  err.addEventListener("input", () => {
    cfg.errorLimit = Number(err.value);
    cfg.photoTrigger = Math.min(DEFAULTS.photoTrigger, cfg.errorLimit / 2);
    renderSliders();
  });
  err.addEventListener("change", () => void setHome(state.home));
  for (const b of $("viewSeg").querySelectorAll<HTMLElement>("button")) b.addEventListener("click", () => setView(b.dataset.view as ViewMode));
  document.addEventListener("langchange", () => {
    map2d.relabel();
    renderTrip();
    renderRoutes();
    renderLegend();
    renderSliders();
  });
  let resizeQueued = false;
  addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      views.forEach((v) => v.resize());
      drawChart();
    });
  });

  // ---------------------------------------------------------------- start
  if (innerWidth <= 860) $<HTMLDetailsElement>("layers").open = false;
  const wanted = params.get("view");
  setView(wanted === "2d" || wanted === "3d" || wanted === "split" ? wanted : innerWidth >= 1180 ? "split" : "2d");
  renderSliders();
  renderTrip();
  pushOverlay();
  pushExtras();
  $("boot").remove();
  await setHome(baseCell);
  const first = positions.places.find((p) => p.id === "stop_vera_rubin_ridge");
  if (first) await setDest(cellOfPlace(first));
  if (params.has("debug")) Object.assign(window, { __sim: { state, grid, planner, cfg, setDest, setHome, select, setView } });
}

main().catch((err) => {
  console.error(err);
  const boot = document.getElementById("boot");
  if (boot) boot.textContent = `Error: ${err.message}`;
});
