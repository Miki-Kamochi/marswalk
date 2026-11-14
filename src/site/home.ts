/**
 * Title screen → menu, like a game. The background is the real Gale Crater terrain; each menu
 * item flies the camera to its own view. "/#menu" opens the menu directly (the other pages
 * link back there).
 */
import { HomeScene, type ShotId } from "./homeScene";
import { getLang, initLang, setLang, tr } from "./lang";

initLang();

const $ = (id: string) => document.getElementById(id)!;
const body = document.body;
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
  body.style.setProperty("--noise", `url(${cv.toDataURL()})`);
})();

// ---------------------------------------------------------------- menu content
interface Item {
  tag: [string, string];
  text: [string, string];
  view: [string, string];
}
const ITEMS: Record<ShotId, Item> = {
  title: { tag: ["", ""], text: ["", ""], view: ["", ""] },
  planner: {
    tag: ["SIMULATION", "シミュレーション"],
    text: [
      "Pick any place in Gale Crater. Compare four routes that stay on safe ground, keep your position known, and leave enough oxygen to walk home.",
      "ゲール・クレーターの好きな場所を選び、安全な地面を通り、位置を見失わず、歩いて帰れる酸素を残す4つのルートを比べます。",
    ],
    view: ["VIEW: BASE CAMP → VERA RUBIN RIDGE · THE RECOMMENDED ROUTE IN ORANGE", "表示：ベースキャンプ → ヴェラ・ルービン・リッジ · オレンジがおすすめのルート"],
  },
  game: {
    tag: ["PROTOTYPE · ENGLISH ONLY", "試作版 · 英語のみ"],
    text: [
      "Walk to Vera Rubin Ridge in first person, collect a hematite sample and find your way back without GPS.",
      "一人称でヴェラ・ルービン・リッジまで歩き、ヘマタイトを採取して、GPSなしで帰ってきます。",
    ],
    view: ["VIEW: STANDING AT BASE CAMP, EYE HEIGHT", "表示：ベースキャンプに立った目線"],
  },
  how: {
    tag: ["LEARN", "学ぶ"],
    text: [
      "Why astronauts can get lost on Mars, the three map layers, the four routes and every assumption we made.",
      "火星でなぜ迷うのか、3つの地図レイヤー、4つのルート、そして私たちが置いたすべての仮定。",
    ],
    view: ["VIEW: THE MAP AREA FROM 2.3 KM UP · HIRISE IMAGERY", "表示：上空2.3 kmから見た地図の範囲 · HiRISE画像"],
  },
  credits: {
    tag: ["DATA & TEAM", "データとチーム"],
    text: [
      "The NASA missions behind every pixel: MRO HiRISE and CRISM, MGS MOLA and MSL Curiosity.",
      "すべてのピクセルの元になったNASAのミッション：MROのHiRISEとCRISM、MGSのMOLA、MSLキュリオシティ。",
    ],
    view: ["VIEW: FROM VERA RUBIN RIDGE TOWARDS MOUNT SHARP", "表示：ヴェラ・ルービン・リッジからシャープ山を望む"],
  },
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
  const it = ITEMS[id];
  $("desc").innerHTML = `<span class="tag">${tr(...it.tag)}</span><p>${tr(...it.text)}</p>`;
  $("view").textContent = tr(...it.view);
  scene?.setShot(id);
}

// ---------------------------------------------------------------- screens
function showMenu(instant = false): void {
  if (body.dataset.screen === "menu") return;
  const title = $("titleScreen");
  const menu = $("menuScreen");
  const go = () => {
    title.hidden = true;
    title.classList.remove("leaving");
    menu.hidden = false;
    body.dataset.screen = "menu";
    select(selected, true);
  };
  if (location.hash !== "#menu") history.replaceState(null, "", "#menu");
  if (instant || reduced) go();
  else {
    title.classList.add("leaving");
    setTimeout(go, 380);
  }
}

function showTitle(): void {
  if (body.dataset.screen === "title") return;
  history.replaceState(null, "", location.pathname);
  $("menuScreen").hidden = true;
  $("titleScreen").hidden = false;
  body.dataset.screen = "title";
  scene?.setShot("title");
}

$("titleScreen").addEventListener("click", () => showMenu());
links.forEach((a, k) => {
  a.addEventListener("mouseenter", () => select(k));
  a.addEventListener("focus", () => select(k));
});

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (body.dataset.screen === "title") {
    if (e.key === "Tab" || e.key === "Shift") return;
    e.preventDefault();
    showMenu();
    return;
  }
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
    e.preventDefault();
    select(selected + 1, true);
  } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
    e.preventDefault();
    select(selected - 1, true);
  } else if (e.key === "Escape" || e.key === "Backspace") {
    e.preventDefault();
    showTitle();
  } else if (e.key === "l" || e.key === "L") {
    setLang(getLang() === "en" ? "ja" : "en");
  }
});
// the language buttons should not also start the game
document.querySelector(".corner.tr")!.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("langchange", () => {
  if (body.dataset.screen === "menu") select(selected);
});

// ---------------------------------------------------------------- background
addEventListener("pointermove", (e) => scene?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
function renderReadout(): void {
  if (!scene) return;
  const r = scene.readout();
  const h = r.ltst;
  const lat = `${Math.abs(r.lat).toFixed(3)}°${r.lat < 0 ? "S" : "N"}`;
  const lon = `${r.lon.toFixed(3)}°E`;
  const elev = Number.isNaN(r.elevation) ? "" : ` · ${tr("ELEV", "標高")} ${Math.round(r.elevation).toLocaleString("en-US")} m`;
  $("readout").innerHTML =
    `<span>${lat} ${lon}${elev}</span>` +
    `<span class="dim">${tr("LOCAL SOLAR TIME", "現地太陽時")} ${pad(h)}:${pad((h % 1) * 60)} · Ls ${Math.round(r.ls)}°</span>`;
}

async function startScene(): Promise<void> {
  try {
    const host = $("bg");
    scene = await HomeScene.create(host, reduced);
    const routes = await fetch("/data/home/routes.json").then((r) => (r.ok ? r.json() : null));
    if (routes) scene.addRoutes(routes.routes);
    if (body.dataset.screen === "menu") select(selected);
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
    // let the first frames render before fading in
    setTimeout(() => host.classList.add("ready"), 120);
  } catch (err) {
    // no WebGL: the still image behind stays, everything else works
    console.warn("3D background unavailable", err);
    $("readout").textContent = "";
  }
}

if (location.hash === "#menu") showMenu(true);
void startScene();
