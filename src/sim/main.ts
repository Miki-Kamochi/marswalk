/**
 * Planner: choose a destination (search, a science target, or a click on the map) and compare
 * four routes, like directions in a map app. Every route stays on safe ground, keeps the
 * position known, and leaves enough oxygen to walk home.
 */
import { AREA, AREAS, areaOf } from "../data/areas";
import { toLonLat } from "../data/frame";
import { dataUrl, loadGrid, loadJson, loadMeta, type Place, type Positions, type Traverse } from "../data/loader";
import { DEFAULTS, type PlanConfig } from "../plan/config";
import { cellElevations, decodeNav, NavGrid } from "../plan/grid";
import { Planner, type Profile, type Route } from "../plan/planner";
import { initLang, tr } from "../site/lang";
import { attachPlaceSearch, searchable } from "../site/placeSearch";
import { revealed } from "../site/reveal";
import { getProject, newProjectId, saveProject, type Project } from "../site/projects";
import { HEMATITE, makeCanvas, NO_GO, paintLimit, paintOverlay, SAFETY, css, locStops, type OverlayId } from "./overlays";
import { drawProfile } from "./profile";
import { INFO, limiterName, placeName, profileName, t } from "./text";
import { View3D } from "./view3d";

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

const ACCENT = "#ff6b2c";
const O2_COLORS = { before: "#3c4043", out: "#8ab4f8", work: "#c58af9", back: "#fdd663", left: "rgba(129, 201, 149, 0.6)" };
/** recommended first, then the alternatives */
const ORDER: Profile[] = ["mix", "short", "o2", "found"];

/** a walk without a plan, measured with the same model as the planned routes */
interface Naive {
  id: "line" | "rover";
  cells: number[];
  duration: number;
  distance: number;
  /** metres on ground the planner never enters */
  unsafe: number;
  /** oxygen there, at work, and back the same way, as a share of a full tank */
  o2: number;
  o2Ok: boolean;
}

async function main() {
  initLang();
  const params = new URLSearchParams(location.search);
  const cfg: PlanConfig = { ...DEFAULTS };
  // a saved plan opens in its own area
  const saved = getProject(params.get("project") ?? "");
  if (saved && areaOf(saved.area) !== AREA) {
    location.replace(`?area=${areaOf(saved.area)}&project=${saved.id}`);
    return;
  }
  // the data loads during the page-change animation; the heavy work waits until it is over
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
    overlay: "none" as OverlayId,
    showLimit: true,
    showTraverse: false,
    flat: false,
    home: -1,
    /** the clicked cell (-2 = outside the map), and the destination actually used */
    target: -1,
    dest: -1,
    destName: "",
    moved: false,
    problem: undefined as "outside" | "no-go" | "cut-off" | undefined,
    homeBad: false,
    routes: [] as Route[],
    back: [] as number[],
    selected: "mix" as Profile,
    busy: false,
    o2: 1,
    pickStart: false,
    beyond: 0,
    /** the same walk without a plan: a straight line, and Curiosity's own path where it passes both ends */
    naive: [] as Naive[],
    /** the selected route's details dropdown, and the profile strip, both closed at first */
    detailsOpen: false,
    stripOpen: false,
  };
  let token = 0;
  let view: View3D | null = null;

  // ---------------------------------------------------------------- saved plan
  /** the plan being edited; created on the first destination, then saved on every change */
  let project: Project | null = saved ?? null;
  let restoring = false;
  const nameInput = $<HTMLInputElement>("planName");
  const defaultName = () =>
    state.dest < 0 ? tr("New plan", "新しい計画") : state.destName ? tr(`To ${state.destName}`, `${state.destName}へ`) : nameOf(state.dest);
  function renderName() {
    if (document.activeElement !== nameInput) nameInput.value = project?.custom ? project.name : defaultName();
  }
  function save(force = false) {
    if (restoring) return;
    if (!project) {
      if (state.target < 0 && !force) return;
      const now = Date.now();
      project = { id: newProjectId(), area: AREA, name: "", home: -1, target: -1, destName: "", selected: "mix", o2: 1, errorLimit: cfg.errorLimit, created: now, updated: now };
      history.replaceState(null, "", `?area=${AREA}&project=${project.id}`);
    }
    const sel = state.routes.find((r) => r.profile === state.selected);
    Object.assign(project, {
      home: state.home,
      target: state.target >= 0 ? state.target : -1,
      destName: state.destName,
      destE: state.dest >= 0 ? grid.east(state.dest) : undefined,
      destN: state.dest >= 0 ? grid.northOf(state.dest) : undefined,
      selected: state.selected,
      o2: state.o2,
      errorLimit: cfg.errorLimit,
      summary: sel ? { profile: sel.profile, duration: sel.stats.duration, distance: sel.stats.distance, ok: sel.stats.errorOk && sel.stats.o2Ok } : undefined,
    });
    if (!project.custom) project.name = defaultName();
    saveProject(project);
    renderName();
  }

  // ---------------------------------------------------------------- map
  const overlayCv = makeCanvas(grid);
  const limitCv = makeCanvas(grid);
  const narrow = () => innerWidth <= 760;

  const pushOverlay = () => {
    if (state.overlay !== "none") paintOverlay(overlayCv, grid, state.overlay, cfg);
    view?.setOverlay(state.overlay === "none" ? null : overlayCv);
    renderLayers();
  };
  const pushLimit = () => {
    const within = planner.withinLimit(state.o2);
    let beyond = 0;
    for (let i = 0; i < grid.size; i++) if (!within[i] && planner.fromHome[i] < Infinity) beyond++;
    state.beyond = beyond;
    if (state.showLimit && beyond) paintLimit(limitCv, grid, within);
    view?.setLimit(state.showLimit && beyond ? limitCv : null);
  };
  const pushRoutes = () => {
    view?.setRoutes(state.routes, state.selected, state.back);
    view?.setNaive(state.naive.map((n) => n.cells));
    view?.setEnds(state.home, state.dest);
  };
  const fit = () => {
    const sel = state.routes.find((r) => r.profile === state.selected);
    if (sel) view?.fitCells([...sel.cells, state.home]);
    else if (state.dest >= 0) view?.fitCells([state.home, state.dest]);
  };

  // ---------------------------------------------------------------- planning
  async function replan(fitAfter = true) {
    const my = ++token;
    state.routes = [];
    state.naive = [];
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
    renderAll();
    pushRoutes();
    if (!state.busy) {
      save();
      return;
    }
    for (const p of ORDER) {
      await breathe();
      if (my !== token) return;
      const r = planner.route(state.dest, p, state.o2);
      if (r) state.routes.push(r);
      if (p === ORDER[ORDER.length - 1]) state.busy = false;
      renderRoutes();
      pushRoutes();
      if (p === state.selected && fitAfter) fit();
    }
    computeNaive();
    renderRoutes();
    pushRoutes();
    renderStrip();
    save();
  }

  async function setDest(cell: number, name = "") {
    state.target = cell < 0 ? -2 : cell;
    state.destName = name;
    await replan();
  }

  function clearDest() {
    token++;
    state.target = -1;
    state.dest = -1;
    state.destName = "";
    state.routes = [];
    state.naive = [];
    state.back = [];
    state.problem = undefined;
    state.moved = false;
    state.busy = false;
    $<HTMLInputElement>("to").value = "";
    renderAll();
    pushRoutes();
    save();
  }

  async function setHome(cell: number) {
    const open = grid.nearestOpen(cell);
    state.pickStart = false;
    state.homeBad = open < 0;
    if (open < 0) {
      renderAll();
      return;
    }
    token++;
    state.routes = [];
    state.busy = state.target >= 0;
    state.home = open;
    renderAll();
    pushRoutes();
    await breathe();
    planner.setHome(open);
    pushLimit();
    await replan();
  }

  function select(p: Profile) {
    state.selected = p;
    renderRoutes();
    renderStrip();
    pushRoutes();
    save();
  }

  // ---------------------------------------------------------------- without a plan
  /** Grid cells along a polyline of map positions. */
  function cellsAlong(pts: [number, number][]): number[] {
    const cells: number[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const [a, b] = [pts[k], pts[k + 1]];
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (grid.cell / 2));
      for (let i = 0; i <= steps; i++) {
        const c = grid.index(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps);
        if (c >= 0 && c !== cells[cells.length - 1]) cells.push(c);
      }
    }
    return cells;
  }
  /** Curiosity's path between the two ends, if it passes within 150 m of both. */
  function roverPath(from: [number, number], to: [number, number]): [number, number][] | null {
    const wp = traverse.waypoints;
    const nearest = (p: [number, number]) => {
      let best = -1;
      let bestD = 150;
      wp.forEach((w, i) => {
        const d = Math.hypot(w[1] - p[0], w[2] - p[1]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };
    const i = nearest(from);
    const j = nearest(to);
    if (i < 0 || j < 0 || Math.abs(i - j) < 2) return null;
    const seg = (i < j ? wp.slice(i, j + 1) : wp.slice(j, i + 1).reverse()).map((w) => [w[1], w[2]] as [number, number]);
    return [from, ...seg, to];
  }
  function computeNaive() {
    state.naive = [];
    if (state.home < 0 || state.dest < 0 || !state.routes.length) return;
    const from: [number, number] = [grid.east(state.home), grid.northOf(state.home)];
    const to: [number, number] = [grid.east(state.dest), grid.northOf(state.dest)];
    const paths: [Naive["id"], [number, number][] | null][] = [
      ["line", [from, to]],
      ["rover", roverPath(from, to)],
    ];
    for (const [id, pts] of paths) {
      if (!pts) continue;
      const cells = cellsAlong(pts);
      if (cells.length < 2) continue;
      const out = planner.evaluate(cells, "short", state.o2);
      const back = planner.evaluate([...cells].reverse(), "short", state.o2);
      let unsafe = 0;
      for (let i = 1; i < cells.length; i++) {
        if (grid.blocked[cells[i]] || grid.blocked[cells[i - 1]]) {
          unsafe += Math.hypot(grid.east(cells[i]) - grid.east(cells[i - 1]), grid.northOf(cells[i]) - grid.northOf(cells[i - 1]));
        }
      }
      const o2 = out.stats.o2Out + out.stats.o2Work + back.stats.o2Out;
      state.naive.push({ id, cells, duration: out.stats.duration, distance: out.stats.distance, unsafe, o2, o2Ok: o2 <= state.o2 - cfg.reserve });
    }
  }

  // ---------------------------------------------------------------- names
  function nameOf(cell: number): string {
    const e = grid.east(cell);
    const n = grid.northOf(cell);
    let best: Place | null = null;
    let bestD = Infinity;
    for (const p of positions.places) {
      if (p.kind === "backdrop") continue;
      const d = Math.hypot(p.easting - e, p.northing - n);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best && bestD < 45) return placeName(best.id, best.name);
    // a point on the map: say what it is near, not its coordinates
    if (best && bestD < 1500) {
      const name = placeName(best.id, best.name).replace(/（[^）]*）|\s*\([^)]*\)/, "");
      return tr(`Near ${name}`, `${name}付近`);
    }
    const g = toLonLat(e, n);
    return `${Math.abs(g.lat).toFixed(3)}°S ${g.lon.toFixed(3)}°E`;
  }

  // ---------------------------------------------------------------- card
  function renderTop() {
    renderName();
    $("homeName").textContent = state.home >= 0 ? nameOf(state.home) : "…";
    $("changeStart").textContent = state.pickStart ? t("cancel") : t("change");
    const to = $<HTMLInputElement>("to");
    to.placeholder = tr("Choose destination", "目的地を選択");
    if (document.activeElement !== to) to.value = state.dest >= 0 ? state.destName || nameOf(state.dest) : "";
    $("clearTo").hidden = state.dest < 0 && !to.value;
    const showChips = state.dest < 0 && !state.problem && !state.pickStart;
    $("hint").innerHTML = state.pickStart
      ? esc(tr("Click the map where the walk starts and ends.", "地図をクリックして、出発・帰還地点を選んでください。"))
      : showChips
        ? esc(tr("Search, pick a science target, or click the map.", "検索するか、科学目標を選ぶか、地図をクリックしてください。")) +
          `<span class="chiprow">${targets.map((p) => `<button data-quick="${p.id}"><span class="sq"></span>${esc(placeName(p.id, p.name))}</button>`).join("")}${
            state.home !== baseCell && state.home >= 0 ? `<button data-quick="home-base">↺ ${esc(t("baseCamp"))}</button>` : ""
          }</span>`
        : "";
  }

  function why(r: Route): string {
    const s = r.stats;
    if (!s.o2Ok) return tr("Not enough oxygen to get home with the reserve.", "余裕を残して帰る酸素が足りません。");
    if (!s.errorOk) return tr("Your position gets too uncertain.", "途中で位置が分からなくなりすぎます。");
    const blind = Math.round(s.blindDistance);
    const sand = Math.round(s.sandDistance);
    switch (r.profile) {
      case "mix":
        return tr(`Balances oxygen and position checks. <b>${blind} m</b> without a check.`, `酸素と位置確認のバランス。確認できない区間 <b>${blind} m</b>。`);
      case "short":
        return tr(`Shortest. <b>${blind} m</b> without a position check.`, `最短。確認できない区間 <b>${blind} m</b>。`);
      case "o2":
        return tr(`Avoids climbs and soft sand (<b>${sand} m</b> of sand).`, `登りと砂を避ける（砂地 <b>${sand} m</b>）。`);
      default:
        return tr(`Position can be checked almost all the way (<b>${blind} m</b> without).`, `ほぼ全行程で位置を確認できる（確認できない区間 <b>${blind} m</b>）。`);
    }
  }

  function option(r: Route): string {
    const s = r.stats;
    const on = r.profile === state.selected;
    const bad = !s.errorOk || !s.o2Ok;
    return `<button class="opt${bad ? " bad" : ""}" data-route="${r.profile}" aria-pressed="${on}">
      <span class="ic" aria-hidden="true"></span>
      <span class="name">${esc(profileName(r.profile))}${r.profile === "mix" ? `<span class="rec">${esc(t("recommended"))}</span>` : ""}</span>
      <span class="time">${dur(s.duration)}</span>
      <span class="l2">${esc(km(s.distance))} · O₂ ${pc(s.o2Out + s.o2Work + s.o2Back)}${bad ? ` · <b>${esc(tr("not safe", "条件を満たさない"))}</b>` : ""}</span>
    </button>${on ? detail(r) : ""}`;
  }

  function detail(r: Route): string {
    const s = r.stats;
    const check = (ok: boolean, text: string) => `<li class="${ok ? "" : "bad"}"><span class="m">${ok ? "✓" : "!"}</span><span>${esc(text)}</span></li>`;
    const seg = (w: number, c: string) => `<i style="width:${Math.max(0, w) * 100}%;background:${c}"></i>`;
    const key = (c: string, label: string, v: number) => `<span><i style="background:${c}"></i>${esc(label)} <b>${pc(v)}</b></span>`;
    return `<details class="detail" ${state.detailsOpen ? "open" : ""}>
      <summary>${esc(tr("Details", "詳しく"))}</summary>
      <p class="why">${why(r)}</p>
      <ul class="checks">
        ${check(true, tr("Safe ground only", "安全な地面だけ"))}
        ${check(s.errorOk, tr(`Position error ≤ ${cfg.errorLimit} m (max ${s.maxError.toFixed(0)} m)`, `位置の誤差 ${cfg.errorLimit} m以内（最大 ${s.maxError.toFixed(0)} m）`))}
        ${check(s.o2Ok, tr(`Walk home from anywhere, ${pc(cfg.reserve)} O₂ left`, `どこからでも帰れる（酸素${pc(cfg.reserve)}残る）`))}
      </ul>
      <div class="o2bar">${seg(1 - state.o2, O2_COLORS.before)}${seg(s.o2Out, O2_COLORS.out)}${seg(s.o2Work, O2_COLORS.work)}${seg(s.o2Back, O2_COLORS.back)}${seg(
        s.o2Left,
        O2_COLORS.left,
      )}<span class="reserve" style="width:${cfg.reserve * 100}%"></span></div>
      <div class="o2key">${key(O2_COLORS.out, t("o2Out"), s.o2Out)}${key(O2_COLORS.work, t("o2Work"), s.o2Work)}${key(O2_COLORS.back, t("o2Back"), s.o2Back)}${key(
        O2_COLORS.left,
        t("o2Left"),
        Math.max(0, s.o2Left),
      )}</div>
    </details>`;
  }

  function renderRoutes() {
    const notes: string[] = [];
    if (state.homeBad) notes.push(`<p class="bad">${esc(t("homeBad"))}</p>`);
    if (state.problem) notes.push(`<p class="bad">${esc(t(state.problem === "outside" ? "outside" : state.problem === "no-go" ? "noGo" : "cutOff"))}</p>`);
    if (state.moved) notes.push(`<p>${esc(t("moved"))}</p>`);
    $("notice").innerHTML = notes.join("");
    let html = "";
    for (const p of ORDER) {
      const r = state.routes.find((r) => r.profile === p);
      if (r) html += option(r);
    }
    if (state.busy) html += `<p class="busy">${esc(t("calculating"))}</p>`;
    else if (state.naive.length) html += naiveBlock();
    $("routes").innerHTML = html;
  }

  /** The same walk without a plan, against the selected route. */
  function naiveBlock(): string {
    const sel = state.routes.find((r) => r.profile === state.selected);
    if (!sel) return "";
    const name = { line: tr("Straight line", "まっすぐ歩く"), rover: tr("Curiosity's path", "キュリオシティの道") };
    const rows = state.naive.map((n) => {
      const dt = Math.round((n.duration - sel.stats.duration) / 60);
      const delta = dt ? ` <em>${dt > 0 ? "+" : "−"}${Math.abs(dt)} ${esc(tr("min", "分"))}</em>` : "";
      const warn: string[] = [];
      if (n.unsafe >= 10) warn.push(tr(`${Math.round(n.unsafe)} m on unsafe ground`, `危険な地面を${Math.round(n.unsafe)} m`));
      if (!n.o2Ok) warn.push(tr("not enough O₂ to get back", "帰りの酸素が足りない"));
      return `<li><span class="sw ${n.id}" aria-hidden="true"></span><span class="nm">${esc(name[n.id])}</span>
        <span class="f">${esc(dur(n.duration))}${delta} · O₂ ${pc(n.o2)}</span>${warn.length ? `<span class="w">${esc(warn.join(" · "))}</span>` : ""}</li>`;
    });
    return `<section class="naive"><h3>${esc(tr("Without a plan", "計画なしの場合"))}</h3><ul>${rows.join("")}</ul></section>`;
  }

  function renderStrip() {
    const r = state.routes.find((r) => r.profile === state.selected);
    const strip = $("strip");
    strip.hidden = !r || narrow();
    strip.classList.toggle("open", state.stripOpen);
    $("stripBtn").setAttribute("aria-expanded", String(state.stripOpen));
    if (!r || strip.hidden) return;
    const elev = grid.layers.elev;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of r.cells) {
      lo = Math.min(lo, elev[c]);
      hi = Math.max(hi, elev[c]);
    }
    $("stripSum").textContent = tr(
      `Elevation ${Math.round(hi - lo)} m · position error max ${r.stats.maxError.toFixed(0)} m`,
      `高低差 ${Math.round(hi - lo)} m ・ 位置の誤差 最大 ${r.stats.maxError.toFixed(0)} m`,
    );
    if (state.stripOpen) {
      drawProfile($<HTMLCanvasElement>("profile"), r, grid, cfg, ACCENT, {
        elev: t("chartElev"),
        err: tr("Position error (m)", "位置の誤差 (m)"),
        limit: t("chartLimit"),
      });
    }
  }

  function renderLayers() {
    for (const b of document.querySelectorAll<HTMLElement>(".tile")) b.setAttribute("aria-checked", String(b.dataset.layer === state.overlay));
    const bar = (stops: readonly (readonly number[])[], lo: string, hi: string) =>
      `<span class="grad" style="background:linear-gradient(90deg,${stops.map((s) => `${css(s)} ${s[0] * 100}%`).join(",")})"></span><span class="ends"><span>${esc(lo)}</span><span>${esc(hi)}</span></span>`;
    const legend: Record<OverlayId, string> = {
      none: esc(tr("Real HiRISE colours.", "HiRISEの実際の色。")),
      safety: bar(SAFETY, tr("Risky", "危険"), tr("Safe", "安全")) + `<span class="ng"><i style="background:${css(NO_GO)}"></i>${esc(tr("No-go", "通行不可"))}</span>`,
      loc: bar(locStops(cfg), tr("Easy to get lost", "迷いやすい"), tr("Easy to locate", "迷いにくい")),
      hematite: bar(HEMATITE, tr("Less", "少"), tr("More hematite", "ヘマタイト多")),
    };
    $("layerLegend").innerHTML = legend[state.overlay];
    $("layerInfo").hidden = state.overlay === "none";
  }

  function renderSliders() {
    $("o2Val").textContent = pc(state.o2);
    $("errVal").textContent = `${cfg.errorLimit} m`;
  }

  function renderAll() {
    renderTop();
    renderRoutes();
    renderStrip();
  }

  // ---------------------------------------------------------------- status bar
  function renderStatus(cell: number) {
    const box = $("status");
    if (cell < 0) {
      box.textContent = "";
      return;
    }
    const L = grid.layers;
    const good = grid.good[cell];
    const cls = grid.blocked[cell] ? "bad" : good < 0.5 ? "warn" : "good";
    const word = grid.blocked[cell] ? tr("No-go", "通行不可") : good < 0.5 ? tr("Careful", "注意") : tr("Safe", "安全");
    const reason = good < 0.999 ? ` (${limiterName(grid.limiter(cell, cfg))})` : "";
    const fix = grid.fixable[cell];
    const hem = L.hematite[cell];
    box.innerHTML = [
      `${Math.round(L.elev[cell]).toLocaleString("en-US")} m`,
      `${tr("slope", "傾斜")} ${L.tilt[cell].toFixed(0)}°`,
      `<b class="${cls}">${esc(word + reason)}</b>`,
      `<b class="${fix ? "good" : "vio"}">${esc(fix ? tr("Easy to locate", "迷いにくい") : tr("Easy to get lost", "迷いやすい"))}</b>`,
      Number.isNaN(hem) ? "" : `${tr("hematite", "ヘマタイト")} ${hem.toFixed(2)}`,
    ]
      .filter(Boolean)
      .join("<span>·</span>");
  }

  // ---------------------------------------------------------------- info dialog
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

  // ---------------------------------------------------------------- events
  $("card").addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-route], [data-quick]");
    if (!el) return;
    if (el.dataset.route) select(el.dataset.route as Profile);
    else if (el.dataset.quick === "home-base") void setHome(baseCell);
    else {
      const p = positions.places.find((p) => p.id === el.dataset.quick);
      if (p) void setDest(cellOfPlace(p), placeName(p.id, p.name));
    }
  });
  $("stripBtn").addEventListener("click", () => {
    state.stripOpen = !state.stripOpen;
    renderStrip();
  });
  $("routes").addEventListener("toggle", (e) => {
    if ((e.target as HTMLElement).matches("details.detail")) state.detailsOpen = (e.target as HTMLDetailsElement).open;
  }, true);
  $("changeStart").addEventListener("click", () => {
    state.pickStart = !state.pickStart;
    renderTop();
  });
  $("clearTo").addEventListener("click", clearDest);
  nameInput.addEventListener("change", () => {
    const v = nameInput.value.trim();
    save(true);
    project!.custom = v !== "";
    project!.name = v || defaultName();
    saveProject(project!);
    renderName();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInput.blur();
  });
  attachPlaceSearch($<HTMLInputElement>("to"), $("toList"), searchable(positions.places), (p) => void setDest(cellOfPlace(p), placeName(p.id, p.name)));
  $("to").addEventListener("input", () => {
    $("clearTo").hidden = !$<HTMLInputElement>("to").value && state.dest < 0;
  });

  // map buttons
  const pop = $("layers");
  const layersBtn = $("layersBtn");
  const setPop = (open: boolean) => {
    pop.hidden = !open;
    layersBtn.setAttribute("aria-expanded", String(open));
  };
  layersBtn.addEventListener("click", () => setPop(pop.hidden === true));
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node) && !layersBtn.contains(e.target as Node)) setPop(false);
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") setPop(false);
  });
  for (const b of document.querySelectorAll<HTMLElement>(".tile")) {
    b.addEventListener("click", () => {
      state.overlay = b.dataset.layer as OverlayId;
      pushOverlay();
    });
  }
  $("layerInfo").addEventListener("click", () => showInfo(state.overlay === "none" ? "routes" : state.overlay));
  $<HTMLInputElement>("showLimit").addEventListener("change", (e) => {
    state.showLimit = (e.target as HTMLInputElement).checked;
    pushLimit();
  });
  $<HTMLInputElement>("showTraverse").addEventListener("change", (e) => {
    state.showTraverse = (e.target as HTMLInputElement).checked;
    view?.setExtras(true, state.showTraverse);
  });
  $("flatBtn").addEventListener("click", () => {
    state.flat = !state.flat;
    view?.setFlat(state.flat);
  });
  $("fitBtn").addEventListener("click", fit);
  $("northBtn").addEventListener("click", () => view?.northUp());
  $("zoomIn").addEventListener("click", () => view?.zoom(0.6));
  $("zoomOut").addEventListener("click", () => view?.zoom(1.6));

  // what if
  let o2Queued = false;
  $<HTMLInputElement>("o2").addEventListener("input", (e) => {
    state.o2 = Number((e.target as HTMLInputElement).value) / 100;
    renderSliders();
    if (o2Queued) return;
    o2Queued = true;
    requestAnimationFrame(() => {
      o2Queued = false;
      state.routes = state.routes.map((r) => planner.evaluate(r.cells, r.profile, state.o2));
      computeNaive();
      pushLimit();
      renderRoutes();
      save();
    });
  });
  const err = $<HTMLInputElement>("err");
  err.addEventListener("input", () => {
    cfg.errorLimit = Number(err.value);
    cfg.photoTrigger = Math.min(DEFAULTS.photoTrigger, cfg.errorLimit / 2);
    renderSliders();
  });
  err.addEventListener("change", () => void setHome(state.home));

  document.addEventListener("langchange", () => {
    renderAll();
    renderLayers();
    renderSliders();
  });
  let resizeQueued = false;
  addEventListener("resize", () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      view?.resize();
      renderStrip();
    });
  });

  // ---------------------------------------------------------------- area
  // two map areas; switching opens a new plan in the other one (the current plan stays saved)
  function renderAreas() {
    $("areas").innerHTML = AREAS.map(
      (a) =>
        `<a href="/sim.html?area=${a.id}" role="tab" aria-selected="${a.id === AREA}" title="${esc(tr(...a.what))}">${esc(tr(...a.name))}</a>`,
    ).join("");
  }
  renderAreas();
  document.addEventListener("langchange", renderAreas);
  $<HTMLAnchorElement>("walkBtn").href = `/game.html?area=${AREA}`;
  // the hematite layer exists only where CRISM saw the ground
  const hemTile = document.querySelector<HTMLElement>('.tile[data-layer="hematite"]');
  if (hemTile && !meta.layers.hematite) hemTile.hidden = true;

  // ---------------------------------------------------------------- start
  renderSliders();
  renderLayers();
  renderTop();
  const needle = $("needle");
  try {
    await revealed();
    view = await View3D.create($("map"), grid, {
      onPick: (e, n) => {
        const cell = grid.index(e, n);
        if (state.pickStart) void setHome(cell);
        else void setDest(cell);
      },
      onHover: (e, n) => renderStatus(e === null || n === null ? -1 : grid.index(e, n)),
      onCamera: (heading, flat) => {
        needle.style.transform = `rotate(${(-heading * 180) / Math.PI}deg)`;
        $("flatBtn").textContent = flat ? "3D" : "2D";
      },
    });
  } catch (err) {
    console.error(err);
    $("boot").textContent = `3D: ${(err as Error).message}`;
    return;
  }
  $("boot").remove();
  // sim.html?layer=safety|loc|hematite opens with that heat map
  const layer = params.get("layer");
  if (layer === "safety" || layer === "loc" || (layer === "hematite" && meta.layers.hematite)) state.overlay = layer;
  pushOverlay();
  if (project) {
    // reopen a saved plan with its settings
    const p = project;
    restoring = true;
    cfg.errorLimit = p.errorLimit;
    cfg.photoTrigger = Math.min(DEFAULTS.photoTrigger, cfg.errorLimit / 2);
    err.value = String(p.errorLimit);
    state.o2 = p.o2;
    $<HTMLInputElement>("o2").value = String(Math.round(p.o2 * 100));
    state.selected = p.selected;
    renderSliders();
    await setHome(p.home >= 0 ? p.home : baseCell);
    restoring = false;
    if (p.target >= 0) await setDest(p.target, p.destName);
  } else {
    if (params.has("project")) history.replaceState(null, "", `${location.pathname}?area=${AREA}`);
    await setHome(baseCell);
    // the home screen can ask for a destination: sim.html?dest=<place id>
    const wanted = positions.places.find((p) => p.id === params.get("dest"));
    if (wanted) await setDest(cellOfPlace(wanted), placeName(wanted.id, wanted.name));
  }
  if (params.has("debug")) Object.assign(window, { __sim: { state, grid, planner, cfg, setDest, setHome, select, view } });
}

main().catch((err) => {
  console.error(err);
  const boot = document.getElementById("boot");
  if (boot) boot.textContent = `Error: ${err.message}`;
});
