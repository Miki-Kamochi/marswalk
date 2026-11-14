/** AresSight: game entry point and mission flow. */
import * as THREE from "three";
import { toLonLat } from "../data/frame";
import { dataUrl, loadRaster } from "../data/loader";
import { DEG, bearing } from "../nav/rng";
import { marsTime, nextLocalTime, sunPosition } from "../nav/sun";
import { Controls } from "./controls";
import { Hud, type HudState } from "./hud";
import { MIN_HORIZON_RANGE, Nav } from "./nav";
import { EYE_HEIGHT, Player, REAL_PACE, WALK_SPEED } from "./player";
import { makeRover, makeSampleSite } from "./props";
import { drawReveal } from "./reveal";
import { World } from "../world/world";

// opened from the planner: "← Planner" goes back to the same plan
if (/\/sim\.html/.test(document.referrer)) {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a.menuLink")) a.href = document.referrer;
}

/** The mission clock runs this many times faster than real time (and so does walking). */
export const TIME_SCALE = WALK_SPEED / REAL_PACE;
/** Oxygen for this EVA, minutes of mission time. */
const O2_MINUTES = 52;
/** Suit power used by one horizon scan (camera + matching), fraction of the battery. */
const SCAN_COST = 0.07;
/** How long a horizon scan takes, real seconds. */
const SCAN_TIME = 1.2;
/**
 * Unnoticed turn while walking blind, radians per second of real time (to the right).
 * People cannot hold a straight line without something to look at (Souman et al. 2009).
 */
const VEER = 0.5 * DEG;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const lowDetail = matchMedia("(pointer: coarse)").matches || params.has("low");

const renderer = new THREE.WebGLRenderer({ antialias: !lowDetail, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowDetail ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
$("view").appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.15, 400000);

/** A date in the southern-summer dust-storm season, at 14:30 local solar time at Gale. */
function missionStart(lonEast: number): number {
  let t = Date.UTC(2041, 0, 1);
  while (Math.abs(marsTime(t).ls - 262) > 3) t += 86400000 * 2;
  return nextLocalTime(t, lonEast, 14.5);
}

type Phase = "brief" | "outbound" | "return" | "done";

async function main() {
  const world = await World.load((m) => ($("loading").textContent = m), lowDetail);
  const sand = await loadRaster(world.meta.layers.sand.raw, world.meta.layers.sand.bounds);
  const controls = new Controls(renderer.domElement);
  const camp = world.place("forward_camp");
  const stop = world.place("stop_vera_rubin_ridge");
  const home = { e: camp.easting, n: camp.northing, name: "the rover" };
  const site = { e: stop.easting, n: stop.northing, name: "the sample site" };
  const routePts = (world.positions.route.find((r) => r.id === "eva1_from_forward_camp")?.points ?? [
    [home.e, home.n],
    [site.e, site.n],
  ]) as [number, number][];
  const imageryUrl = dataUrl(world.meta.images.color.file);
  const imagery = new Image();
  imagery.src = imageryUrl;
  const hud = new Hud(world, imageryUrl, [...routePts, [home.e, home.n], [site.e, site.n]], routePts);
  const startUtc = missionStart(toLonLat(camp.easting, camp.northing).lon);

  const rover = makeRover();
  world.worldPos(home.e, home.n, 0, rover.position);
  rover.rotation.y = 0.6;
  const sampleSite = makeSampleSite();
  world.worldPos(site.e, site.n, 0, sampleSite.position);
  world.scene.add(rover, sampleSite);

  // ------------------------------------------------------------------ mission state
  let player = new Player();
  let nav!: Nav;
  let phase: Phase = "brief";
  let missionS = 0;
  let o2S = O2_MINUTES * 60;
  let power = 1;
  let dust = 0;
  let dustTarget = 0;
  let stormT = 0; // real seconds since the sample was taken
  let linkOk = true;
  let scanT = 0; // > 0 while a horizon scan is running
  let truth: [number, number][] = [];
  let stormIndex = 0;
  let unaided: [number, number][] = [];
  let unaidedHeading = 0;
  let note = { text: "", level: "info" as HudState["alertLevel"], until: 0 };
  let realT = 0;
  let maxError = 0;
  let biggestJump = 0;
  let failReason = "";
  let beats = new Set<string>();
  let wasClearing = false;

  const say = (text: string, level: HudState["alertLevel"] = "info", seconds = 5) => {
    note = { text, level, until: realT + seconds };
  };
  const beat = (id: string, title: string, text: string, seconds = 11) => {
    if (beats.has(id)) return;
    beats.add(id);
    hud.coach(title, text, realT, seconds);
  };

  function reset() {
    player = new Player();
    player.e = home.e + 6;
    player.n = home.n - 8;
    controls.yaw = bearing(player.e, player.n, site.e, site.n) - 0.5;
    controls.pitch = 0;
    nav = new Nav(world, sand, player, controls.yaw, home, 1 + Math.floor(Math.random() * 1e6));
    nav.mode = "site";
    nav.site = site;
    phase = "brief";
    missionS = 0;
    o2S = O2_MINUTES * 60;
    power = 1;
    dust = dustTarget = 0;
    stormT = 0;
    linkOk = true;
    scanT = 0;
    truth = [[player.e, player.n]];
    unaided = [];
    stormIndex = 0;
    maxError = 0;
    biggestJump = 0;
    failReason = "";
    beats = new Set();
    wasClearing = false;
    sampleSite.getObjectByName("sample")!.visible = true;
    note.until = 0;
    hud.clearCoach();
  }
  reset();

  function begin() {
    $("start").style.display = "none";
    $("end").style.display = "none";
    phase = "outbound";
    controls.enabled = true;
    hud.show(true);
    if (!controls.touch) controls.capture();
    beat(
      "dot",
      "The map has no GPS dot",
      "The blue dot is Wayfinder's estimate, worked out by counting your steps and turns. Every step is a little off, so the circle around the dot grows as you walk.",
      12,
    );
  }

  const nearSite = () => Math.hypot(player.e - site.e, player.n - site.n) < 7;

  function collect() {
    sampleSite.getObjectByName("sample")!.visible = false;
    phase = "return";
    stormT = 0;
    dustTarget = 0.95;
    nav.mode = "home";
    nav.wf.recording = false;
    stormIndex = truth.length - 1;
    unaided = [[player.e, player.n]];
    unaidedHeading = bearing(player.e, player.n, home.e, home.n);
    hud.clearCoach();
    say("Hematite sample secured: it formed in water, billions of years ago. The forecast dust front is here. Head back to the rover.", "warn", 7);
  }

  function scan() {
    if (scanT > 0) return;
    if (power < SCAN_COST) {
      say("Not enough suit power for a horizon scan.", "warn", 4);
      return;
    }
    power -= SCAN_COST;
    scanT = SCAN_TIME;
  }

  function finishScan() {
    const r = nav.snapshot(player, controls.yaw, missionS);
    hud.showSkyline(r, realT);
    if (r.fix.ok) {
      biggestJump = Math.max(biggestJump, r.jump);
      say(
        r.jump >= 8
          ? `Horizon matched. You were ${Math.round(r.jump)} m from where your steps said. Position now known to ±${Math.round(r.r95After)} m.`
          : `Horizon matched. Position known to ±${Math.round(r.r95After)} m (was ±${Math.round(r.r95Before)} m).`,
        "info",
        7,
      );
    } else {
      say(`No horizon: the dust hides everything beyond ${Math.round(r.range)} m. Scan wasted.`, "warn", 6);
    }
  }

  function action() {
    if (phase === "outbound" && nearSite()) collect();
    else if (phase === "outbound" || phase === "return") scan();
  }
  controls.onAction = action;
  $("actionBtn").addEventListener("click", action);

  function finish(success: boolean) {
    phase = "done";
    controls.enabled = false;
    controls.release();
    hud.show(false);
    const est = nav.wf.estimate;
    const finalError = Math.hypot(est.e - player.e, est.n - player.n);
    maxError = Math.max(maxError, finalError);
    const end = unaided[unaided.length - 1];
    const miss = unaided.length > 1 ? Math.hypot(end[0] - home.e, end[1] - home.n) : 0;
    const inDunes = unaided.some((p) => nav.isSand(p[0], p[1]));
    $("endTitle").textContent = success ? "You made it home." : "EVA failed";
    $("endLead").textContent = success
      ? "In 2018, a dust storm ended the Opportunity rover's mission. This time, we made it home."
      : failReason;
    const stats = [
      `You walked ${Math.round(player.walked)} m in ${Math.round(missionS / 60)} minutes of mission time, with ${Math.max(0, Math.round(o2S / 60))} min of oxygen and ${Math.round(power * 100)}% power left.`,
      `Horizon scans: ${nav.fixesOk} matched, ${nav.fixesFailed} blocked by dust.${biggestJump >= 8 ? ` The biggest correction moved your dot ${Math.round(biggestJump)} m.` : ""}`,
      unaided.length > 1
        ? `Red line: walking the same steps by your own sense of direction, you would have ended ${Math.round(miss)} m from the rover${inDunes ? ", after crossing the dunes" : ""}. In thick dust, 50 m is already out of sight.`
        : "",
      `Wayfinder never knew your true position. Its largest error was ${Math.round(maxError)} m.`,
    ];
    $("endStats").innerHTML = stats.filter(Boolean).map((s) => `<li>${s}</li>`).join("");
    $("end").style.display = "flex";
    drawReveal($<HTMLCanvasElement>("revealMap"), world, imagery, {
      truth,
      stormIndex: Math.min(stormIndex, truth.length - 1),
      estimate: nav.wf.history,
      unaided,
      home: [home.e, home.n],
      site: [site.e, site.n],
    });
  }

  // ------------------------------------------------------------------ one step of the game
  function tick(dt: number) {
    realT += dt;
    const dtSim = dt * TIME_SCALE;
    const playing = phase === "outbound" || phase === "return";
    if (playing) {
      controls.update();
      const inSand = nav.isSand(player.e, player.n);
      const moving = Math.hypot(controls.moveX, controls.moveY) > 0.05;
      // walking blind, people curve without noticing: the body turns, the mind does not register it
      if (phase === "return" && dust > 0.8 && moving) controls.yaw += VEER * dt;
      player.update(dt * (inSand ? 0.55 : 1), controls, world);
      missionS += dtSim;
      o2S -= dtSim * (inSand ? 2 : 1);
      const lastT = truth[truth.length - 1];
      if (Math.hypot(player.e - lastT[0], player.n - lastT[1]) >= 3) truth.push([player.e, player.n]);

      if (scanT > 0) {
        scanT -= dt;
        if (scanT <= 0) finishScan();
      }

      if (phase === "outbound") {
        if (nav.wf.estimate.r95 > 12)
          beat(
            "scan",
            `Horizon scan (${controls.touch ? "Scan button" : "press E"})`,
            "The suit photographs the skyline and matches it to skylines computed from NASA's orbital elevation map of Gale Crater. That puts the dot back where you really are. Each scan costs a little suit power.",
            14,
          );
      } else if (phase === "return") {
        const before = stormT;
        stormT += dt;
        if (before <= 9 && stormT > 9) say("Mount Sharp is gone. The sun is gone.", "warn", 4);
        if (linkOk && dust > 0.75) {
          linkOk = false;
          say("LINK TO ROVER LOST. Static on every channel. You are on your own.", "danger", 7);
          beat(
            "storm",
            "Wayfinder runs blind now",
            "The dust hides the skyline, so horizon scans will fail. Wayfinder still knows the way you came from your steps, but the circle will grow with every step. When the dust thins, scan.",
            14,
          );
        }
        // the storm thins for a few seconds now and then: the chance for a horizon fix
        if (stormT > 30) {
          const cycle = (stormT - 30) % 40;
          const clearing = cycle > 22 && cycle < 32;
          dustTarget = clearing ? 0.45 : 0.95;
          if (clearing && !wasClearing) say(`The dust is thinning. Scan the horizon now (${controls.touch ? "Scan" : "E"})!`, "info", 7);
          wasClearing = clearing;
        }
        if (player.lastStep > 0 && unaided.length) {
          unaidedHeading += VEER * dt;
          const u = unaided[unaided.length - 1];
          unaided.push([u[0] + Math.sin(unaidedHeading) * player.lastStep, u[1] + Math.cos(unaidedHeading) * player.lastStep]);
        }
        if (Math.hypot(player.e - home.e, player.n - home.n) < 9) return finish(true);
      }
      dust += (dustTarget - dust) * Math.min(1, dt * (dustTarget > dust ? 0.12 : 0.9));

      if (o2S <= 0) {
        failReason = `Oxygen ran out ${Math.round(Math.hypot(player.e - home.e, player.n - home.n))} m from the rover.`;
        return finish(false);
      }
    }

    const utc = startUtc + missionS * 1000;
    const bob = Math.sin(player.bob * 1.9) * 0.05;
    world.worldPos(player.e, player.n, EYE_HEIGHT + bob, camera.position);
    camera.rotation.set(controls.pitch, -controls.yaw, 0, "YXZ");
    world.setSky(utc, player.e, player.n, dust, camera);

    if (playing) {
      nav.update(dtSim, missionS, utc, dust, player, controls);
      const est = nav.wf.estimate;
      maxError = Math.max(maxError, Math.hypot(est.e - player.e, est.n - player.n));
      const st = nav.status;
      const o2Min = o2S / 60;
      const needMin = (st.homeDistance / REAL_PACE / 60) * 1.25;
      let alert = "";
      let level: HudState["alertLevel"] = "info";
      if (o2Min < 5) [alert, level] = ["OXYGEN CRITICAL", "danger"];
      else if (nav.isSand(player.e, player.n)) [alert, level] = ["Soft sand: you are in the dunes. Turn back the way you came.", "danger"];
      else if (realT < note.until && note.level === "danger") [alert, level] = [note.text, note.level];
      else if (st.sandAhead && phase === "return") [alert, level] = [`Dunes ${st.sandAhead} m ahead on this heading. Turn toward the amber arrow.`, "warn"];
      else if (phase === "outbound" && o2Min < needMin + 4) [alert, level] = ["Turn back now: oxygen for the walk home is running short.", "warn"];
      else if (realT < note.until) [alert, level] = [note.text, note.level];
      const ll = toLonLat(player.e, player.n);
      const sp = sunPosition(utc, ll.lat, ll.lon);
      const hh = Math.floor(sp.ltst);
      const mm = Math.floor((sp.ltst - hh) * 60);
      const prompt = scanT > 0 ? "Scanning the horizon…" : phase === "outbound" && nearSite() && !controls.touch ? "Press E to collect the sample" : "";
      hud.update(
        nav,
        {
          objective: phase === "outbound" ? "EVA-1 · Collect hematite at Vera Rubin Ridge" : "EVA-1 · Return to the rover",
          clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} local solar time`,
          o2Fraction: o2S / (O2_MINUTES * 60),
          o2Minutes: o2Min,
          power,
          alert,
          alertLevel: level,
          prompt,
          dust,
          linkOk,
          scanning: scanT > 0,
          sinceFix: nav.lastHorizonFix === null ? null : missionS - nav.lastHorizonFix,
        },
        realT,
      );
      const btn = $("actionBtn");
      btn.style.display = controls.touch ? "block" : "none";
      btn.textContent = phase === "outbound" && nearSite() ? "Collect sample" : scanT > 0 ? "Scanning…" : "Scan horizon";
      btn.classList.toggle("ready", st.visualRange >= MIN_HORIZON_RANGE);
    }
    renderer.render(world.scene, camera);
  }

  // ------------------------------------------------------------------ start / restart
  $("loading").style.display = "none";
  $("startHelp").textContent = controls.touch
    ? "Left thumb: walk. Right thumb: look around. Buttons: scan horizon, collect."
    : "Click to look with the mouse. W A S D to walk. E: scan the horizon (or collect at the site). Esc frees the mouse.";
  const slides = Array.from(document.querySelectorAll<HTMLElement>("#start .slide"));
  let slide = 0;
  const showSlide = () => {
    slides.forEach((s, i) => (s.style.display = i === slide ? "block" : "none"));
    $("startBtn").textContent = slide < slides.length - 1 ? "Next" : "Begin EVA";
    $("dots").textContent = slides.map((_, i) => (i === slide ? "●" : "○")).join(" ");
  };
  showSlide();
  $("start").style.display = "flex";
  $("startBtn").addEventListener("click", () => {
    if (slide < slides.length - 1) {
      slide++;
      showSlide();
    } else begin();
  });
  $("againBtn").addEventListener("click", () => {
    reset();
    begin();
  });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  let debug = params.has("debug");
  addEventListener("keydown", (e) => {
    if (e.code === "Backquote") debug = !debug;
  });
  if (debug) {
    (window as unknown as Record<string, unknown>).__mw = {
      controls,
      world,
      camera,
      renderer,
      tick,
      begin,
      action,
      home,
      site,
      get player() {
        return player;
      },
      get nav() {
        return nav;
      },
      get state() {
        return { phase, missionS, o2S, power, dust, realT, maxError, linkOk, scanning: scanT > 0, fixesOk: nav.fixesOk, fixesFailed: nav.fixesFailed };
      },
    };
  }

  let last = performance.now();
  let frames = 0;
  let fpsT = last;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!params.has("manual")) tick(dt);
    frames++;
    if (now - fpsT > 500) {
      const fps = Math.round((frames * 1000) / (now - fpsT));
      frames = 0;
      fpsT = now;
      const dbg = $("debug");
      dbg.style.display = debug ? "block" : "none";
      if (debug) {
        const est = nav.wf.estimate;
        dbg.textContent =
          `${fps} fps  phase ${phase}  dust ${dust.toFixed(2)}\n` +
          `TRUE E ${player.e.toFixed(0)} N ${player.n.toFixed(0)}  est error ${Math.hypot(est.e - player.e, est.n - player.n).toFixed(1)} m  r95 ${est.r95.toFixed(0)}\n` +
          `walked ${player.walked.toFixed(0)} m  range ${nav.status.visualRange.toFixed(0)} m`;
      }
    }
  });
}

main().catch((err) => {
  console.error(err);
  $("loading").textContent = `Could not start: ${err.message}`;
});
