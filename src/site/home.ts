/**
 * Home screen: the title and the menu over the real Gale Crater terrain. Each menu item flies
 * the camera to its own view. Arrow keys / W S move the cursor, Enter opens, L switches language.
 */
import "@fontsource/pixelify-sans/700.css";
import "@fontsource/dotgothic16/400.css";
import { HomeScene, type ShotId } from "./homeScene";
import { getLang, initLang, setLang, tr } from "./lang";

initLang();

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Item {
  tag: [string, string];
  text: [string, string];
}
const ITEMS: Partial<Record<ShotId, Item>> = {
  planner: {
    tag: ["SIMULATION", "シミュレーション"],
    text: [
      "Pick any place in Gale Crater. Compare four routes that stay on safe ground, keep your position known, and leave enough oxygen to walk home.",
      "ゲール・クレーターの好きな場所を選び、安全な地面を通り、位置を見失わず、歩いて帰れる酸素を残す4つのルートを比べます。",
    ],
  },
  game: {
    tag: ["PROTOTYPE · ENGLISH ONLY", "試作版 · 英語のみ"],
    text: [
      "Walk to Vera Rubin Ridge in first person, collect a hematite sample and find your way back without GPS.",
      "一人称でヴェラ・ルービン・リッジまで歩き、ヘマタイトを採取して、GPSなしで帰ってきます。",
    ],
  },
  how: {
    tag: ["LEARN", "学ぶ"],
    text: [
      "Why astronauts can get lost on Mars, the three map layers, the four routes and every assumption we made.",
      "火星でなぜ迷うのか、3つの地図レイヤー、4つのルート、そして私たちが置いたすべての仮定。",
    ],
  },
  credits: {
    tag: ["DATA & TEAM", "データとチーム"],
    text: [
      "The NASA missions behind every pixel: MRO HiRISE and CRISM, MGS MOLA and MSL Curiosity.",
      "すべてのピクセルの元になったNASAのミッション：MROのHiRISEとCRISM、MGSのMOLA、MSLキュリオシティ。",
    ],
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
  const it = ITEMS[id]!;
  $("desc").innerHTML = `<span class="tag">${tr(...it.tag)}</span><p>${tr(...it.text)}</p>`;
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
  const parts = [`${lat} ${r.lon.toFixed(3)}°E`];
  if (!Number.isNaN(r.elevation)) parts.push(`${tr("elev", "標高")} ${Math.round(r.elevation)} m`);
  parts.push(`${tr("local time", "現地時刻")} ${pad(r.ltst)}:${pad((r.ltst % 1) * 60)}`);
  $("readout").textContent = parts.join("  ·  ");
}

async function startScene(): Promise<void> {
  try {
    const host = $("bg");
    scene = await HomeScene.create(host, reduced);
    const routes = await fetch("/data/home/routes.json").then((r) => (r.ok ? r.json() : null));
    if (routes) scene.addRoutes(routes.routes);
    // the camera starts on the wide view and flies to the selected item
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
    // no WebGL: the still image behind stays, the menu works as normal
    console.warn("3D background unavailable", err);
    $("readout").textContent = "";
  }
}
void startScene();
