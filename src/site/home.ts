/**
 * Home screen: title and menu over the real Gale Crater terrain. Each menu item flies the
 * camera to its own view; the planner's view shows the planned routes and the science stops.
 * Keys: up/down (or W/S) select, Enter opens, L switches language.
 */
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import { loadJson, type Positions } from "../data/loader";
import { HomeScene, type ShotId } from "./homeScene";
import { getLang, initLang, setLang, tr } from "./lang";

initLang();

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- film grain tile
(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  document.body.style.setProperty("--noise", `url(${cv.toDataURL()})`);
})();

// ---------------------------------------------------------------- menu
type Pair = [string, string];
const ITEMS: Partial<Record<ShotId, Pair>> = {
  planner: ["Pick a science target. Compare four routes that get you home.", "科学目標を選び、必ず帰れる4つのルートを比べる。"],
  game: ["Walk the route at eye level before you go.", "出発前に、目の高さでルートを歩いてみる。"],
  how: ["The data, the map layers and our assumptions.", "データ、地図のレイヤー、そして私たちの仮定。"],
  credits: ["The NASA missions behind every pixel.", "すべてのピクセルの元になったNASAのミッション。"],
};

const links = [...document.querySelectorAll<HTMLAnchorElement>("#items a")];
let selected = 0;
let scene: HomeScene | null = null;

function select(i: number, focus = false): void {
  selected = (i + links.length) % links.length;
  links.forEach((a, k) => a.classList.toggle("on", k === selected));
  const a = links[selected];
  if (focus) a.focus({ preventScroll: true });
  const id = a.dataset.shot as ShotId;
  $("desc").textContent = tr(...ITEMS[id]!);
  scene?.setShot(id);
}

links.forEach((a, k) => {
  a.addEventListener("mouseenter", () => select(k));
  a.addEventListener("focus", () => select(k));
});
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
    e.preventDefault();
    select(selected + 1, true);
  } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
    e.preventDefault();
    select(selected - 1, true);
  } else if (e.key === "Enter" && document.activeElement === document.body) {
    links[selected].click();
  } else if (e.key === "l" || e.key === "L") {
    setLang(getLang() === "en" ? "ja" : "en");
  }
});
document.addEventListener("langchange", () => select(selected));
select(0);

// ---------------------------------------------------------------- background
addEventListener("pointermove", (e) => scene?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
function renderReadout(): void {
  if (!scene) return;
  const r = scene.readout();
  const lat = `${Math.abs(r.lat).toFixed(3)}°${r.lat < 0 ? "S" : "N"}`;
  const elev = Number.isNaN(r.elevation) ? "" : ` · ${tr("ELEV", "標高")} ${Math.round(r.elevation).toLocaleString("en-US")} m`;
  $("readout").innerHTML =
    `<span>${lat} ${r.lon.toFixed(3)}°E${elev}</span><br>` +
    `<span class="dim">${tr("LOCAL SOLAR TIME", "現地太陽時")} ${pad(r.ltst)}:${pad((r.ltst % 1) * 60)} · Ls ${Math.round(r.ls)}°</span>`;
}

async function startScene(): Promise<void> {
  try {
    const host = $("bg");
    scene = await HomeScene.create(host, reduced);
    const [routes, positions] = await Promise.all([
      fetch("/data/home/routes.json").then((r) => (r.ok ? r.json() : null)),
      loadJson<Positions>("positions.json").catch(() => null),
    ]);
    if (routes) scene.addRoutes(routes.routes);
    for (const p of positions?.places ?? []) {
      if (p.kind === "base") scene.addMarker(p.easting, p.northing, "#7cc8ff");
      else if (p.kind === "stop") scene.addMarker(p.easting, p.northing, "#ffd166");
    }
    // the camera starts on the wide view and then flies to the selected item
    setTimeout(() => select(selected), reduced ? 0 : 900);
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
    // no WebGL: the still image stays and the menu works as normal
    console.warn("3D background unavailable", err);
    $("readout").textContent = "";
  }
}
void startScene();
