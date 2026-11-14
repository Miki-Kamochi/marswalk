/** Marswalk: game entry point and mission flow. */
import * as THREE from "three";
import { toLonLat } from "../data/frame";
import { dataUrl, loadRaster } from "../data/loader";
import { DEG, bearing } from "../nav/rng";
import { marsTime, nextLocalTime, sunPosition } from "../nav/sun";
import { Controls } from "./controls";
import { Hud, type HudState } from "./hud";
import { Nav } from "./nav";
import { EYE_HEIGHT, Player, REAL_PACE, WALK_SPEED } from "./player";
import { makeRover, makeSampleSite } from "./props";
import { drawReveal } from "./reveal";
import { World } from "./world";

/** The mission clock runs this many times faster than real time (and so does walking). */
export const TIME_SCALE = WALK_SPEED / REAL_PACE;
/** Oxygen for this EVA, minutes of mission time. */
const O2_MINUTES = 52;
/** Unnoticed turn while walking blind, radians per second of real time (to the right). */
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

type Phase = "brief" | "outbound" | "storm" | "return" | "done";

async function main() {
  const world = await World.load((m) => ($("loading").textContent = m), lowDetail);
  const sand = await loadRaster(world.meta.layers.sand.raw, world.meta.layers.sand.bounds);
  const controls = new Controls(renderer.domElement);
  const camp = world.place("forward_camp");
  const stop = world.place("stop_vera_rubin_ridge");
  const home = { e: camp.easting, n: camp.northing, name: "the rover" };
  const site = { e: stop.easting, n: stop.northing, name: "the sample site" };
  const imageryUrl = dataUrl(world.meta.images.color.file);
  const imagery = new Image();
  imagery.src = imageryUrl;
  const hud = new Hud(world, imageryUrl);
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
  let missionS = 0; // mission elapsed time, seconds of Mars-clock time
  let o2S = O2_MINUTES * 60;
  let dust = 0;
  let dustTarget = 0;
  let stormT = 0; // real seconds since the sample was taken
  let truth: [number, number][] = [];
  let stormIndex = 0;
  let unaided: [number, number][] = [];
  let unaidedHeading = 0;
  let seenFixes = 0;
  let note = { text: "", level: "info" as HudState["alertLevel"], until: 0 };
  let realT = 0;
  let maxError = 0;
  let failReason = "";

  const say = (text: string, level: HudState["alertLevel"] = "info", seconds = 5) => {
    note = { text, level, until: realT + seconds };
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
    dust = dustTarget = 0;
    stormT = 0;
    truth = [[player.e, player.n]];
    unaided = [];
    stormIndex = 0;
    seenFixes = 0;
    maxError = 0;
    failReason = "";
    sampleSite.getObjectByName("sample")!.visible = true;
    note.until = 0;
  }
  reset();

  function begin() {
    $("start").style.display = "none";
    $("end").style.display = "none";
    phase = "outbound";
    controls.enabled = true;
    hud.show(true);
    if (!controls.touch) controls.capture();
    say("EVA-1: walk to Vera Rubin Ridge and collect a hematite sample. Follow the amber marker.", "info", 8);
  }

  function nearSite(): boolean {
    return Math.hypot(player.e - site.e, player.n - site.n) < 7;
  }

  function collect() {
    if (phase !== "outbound" || !nearSite()) return;
    sampleSite.getObjectByName("sample")!.visible = false;
    phase = "storm";
    stormT = 0;
    dustTarget = 0.95;
    say("Hematite sample secured. It formed in water, billions of years ago.", "info", 5);
  }
  controls.onAction = collect;
  $("actionBtn").addEventListener("click", collect);

  function finish(success: boolean) {
    phase = "done";
    controls.enabled = false;
    controls.release();
    hud.show(false);
    const est = nav.wf.estimate;
    const finalError = Math.hypot(est.e - player.e, est.n - player.n);
    const miss = unaided.length ? Math.hypot(unaided[unaided.length - 1][0] - home.e, unaided[unaided.length - 1][1] - home.n) : 0;
    const inDunes = unaided.some((p) => nav.isSand(p[0], p[1]));
    $("endTitle").textContent = success ? "You made it home." : "EVA failed";
    $("endLead").textContent = success
      ? "In 2018, a dust storm ended the Opportunity rover's mission. This time, we made it home."
      : failReason;
    const stats = [
      `Walked ${Math.round(player.walked)} m in ${Math.round(missionS / 60)} min of mission time. Oxygen left: ${Math.max(0, Math.round(o2S / 60))} min.`,
      unaided.length
        ? `Without Wayfinder, the same steps would have ended ${Math.round(miss)} m from the rover${inDunes ? ", through the dunes" : ""}.`
        : "",
      `Wayfinder's largest position error: ${Math.round(maxError)} m. At the end: ${Math.round(finalError)} m. Landmark fixes: ${nav.fixes}.`,
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
    const playing = phase === "outbound" || phase === "storm" || phase === "return";
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

      if (phase === "storm") {
        const before = stormT;
        stormT += dt;
        if (before <= 5 && stormT > 5) say("Dust front coming in from the north-west. Visibility dropping.", "warn", 5);
        if (before <= 11 && stormT > 11) say("Mount Sharp is gone. The sun is gone.", "warn", 4);
        if (stormT > 15) {
          phase = "return";
          nav.mode = "home";
          nav.wf.recording = false;
          stormIndex = truth.length - 1;
          unaided = [[player.e, player.n]];
          unaidedHeading = bearing(player.e, player.n, home.e, home.n);
          say("GPS LOST. There is no GPS on Mars. Wayfinder is following your recorded path home.", "danger", 9);
        }
      } else if (phase === "return") {
        stormT += dt;
        // the storm thins for a few seconds now and then: a chance to sight a landmark
        const cycle = (stormT - 15) % 45;
        dustTarget = cycle > 30 && cycle < 37 ? 0.45 : 0.94;
        if (player.lastStep > 0) {
          unaidedHeading += VEER * dt;
          const u = unaided[unaided.length - 1];
          unaided.push([u[0] + Math.sin(unaidedHeading) * player.lastStep, u[1] + Math.cos(unaidedHeading) * player.lastStep]);
        }
        if (Math.hypot(player.e - home.e, player.n - home.n) < 9) return finish(true);
      }
      dust += (dustTarget - dust) * Math.min(1, dt * (dustTarget > dust ? 0.35 : 0.9));

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
      if (nav.fixes > seenFixes) {
        seenFixes = nav.fixes;
        const names = nav.status.inView.filter((l) => !l.fuzz).map((l) => l.name).slice(0, 2).join(" + ");
        if (phase === "return") say(`Landmarks through the dust: ${names}. Position checked: within ±${Math.round(est.r95)} m.`, "info", 5);
      }
      // alerts, most urgent first
      const st = nav.status;
      const o2Min = o2S / 60;
      const needMin = (st.homeDistance / REAL_PACE / 60) * 1.25;
      let alert = "";
      let level: HudState["alertLevel"] = "info";
      if (o2Min < 5) [alert, level] = ["OXYGEN CRITICAL", "danger"];
      else if (nav.isSand(player.e, player.n)) [alert, level] = ["Soft sand: you are in the dunes. Turn back the way you came.", "danger"];
      else if (realT < note.until && note.level === "danger") [alert, level] = [note.text, note.level];
      else if (st.sandAhead && phase === "return") [alert, level] = [`Dunes ${st.sandAhead} m ahead on this heading. Turn toward the amber marker.`, "warn"];
      else if (phase === "outbound" && o2Min < needMin + 4) [alert, level] = ["Turn back now: oxygen for the walk home is running short.", "warn"];
      else if (realT < note.until) [alert, level] = [note.text, note.level];
      const ll = toLonLat(player.e, player.n);
      const sp = sunPosition(utc, ll.lat, ll.lon);
      const hh = Math.floor(sp.ltst);
      const mm = Math.floor((sp.ltst - hh) * 60);
      hud.update(nav, {
        objective:
          phase === "outbound" ? "EVA-1 · Collect hematite at Vera Rubin Ridge" : phase === "storm" ? "EVA-1 · Sample secured" : "EVA-1 · Return to the rover",
        clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} local solar time`,
        o2Fraction: o2S / (O2_MINUTES * 60),
        o2Minutes: o2Min,
        alert,
        alertLevel: level,
        prompt: phase === "outbound" && nearSite() && !controls.touch ? "Press E to collect the sample" : "",
        dust,
      });
      $("actionBtn").style.display = phase === "outbound" && nearSite() && controls.touch ? "block" : "none";
    }
    renderer.render(world.scene, camera);
  }

  // ------------------------------------------------------------------ start / restart
  $("loading").style.display = "none";
  $("startHelp").textContent = controls.touch
    ? "Left thumb: walk. Right thumb: look around."
    : "Click to look with the mouse. W A S D to walk. E to collect. Esc frees the mouse.";
  $("start").style.display = "flex";
  $("startBtn").addEventListener("click", begin);
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
  // handle for automated checks in the browser (only with ?debug)
  if (debug) {
    (window as unknown as Record<string, unknown>).__mw = {
      controls,
      world,
      camera,
      renderer,
      tick,
      begin,
      collect,
      home,
      site,
      get player() {
        return player;
      },
      get nav() {
        return nav;
      },
      get state() {
        return { phase, missionS, o2S, dust, realT, maxError, fixes: nav.fixes };
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
          `${fps} fps  ${renderer.info.render.triangles.toLocaleString()} tris  phase ${phase}  dust ${dust.toFixed(2)}\n` +
          `TRUE E ${player.e.toFixed(0)} N ${player.n.toFixed(0)}  est error ${Math.hypot(est.e - player.e, est.n - player.n).toFixed(1)} m  r95 ${est.r95.toFixed(0)}\n` +
          `sun az ${world.sun.azimuth.toFixed(0)} el ${world.sun.elevation.toFixed(0)}  walked ${player.walked.toFixed(0)} m  range ${nav.status.visualRange.toFixed(0)} m`;
      }
    }
  });
}

main().catch((err) => {
  console.error(err);
  $("loading").textContent = `Could not start: ${err.message}`;
});
