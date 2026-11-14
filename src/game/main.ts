/** Marswalk: game entry point and mission flow. */
import * as THREE from "three";
import { curvatureDrop, toLonLat } from "../data/frame";
import { dataUrl, loadRaster } from "../data/loader";
import { DEG, bearing, wrap } from "../nav/rng";
import { marsTime, nextLocalTime, sunPosition } from "../nav/sun";
import type { Landmark } from "../nav/wayfinder";
import { Controls } from "./controls";
import { Hud, type HudState, type Marker } from "./hud";
import { Nav } from "./nav";
import { EYE_HEIGHT, Player, REAL_PACE, WALK_SPEED } from "./player";
import { makeRover, makeSampleSite } from "./props";
import { drawReveal } from "./reveal";
import { World } from "./world";

/** The mission clock runs this many times faster than real time (and so does walking). */
export const TIME_SCALE = WALK_SPEED / REAL_PACE;
/** Oxygen for this EVA, minutes of mission time. */
const O2_MINUTES = 52;
/**
 * Unnoticed turn while walking blind, radians per second of real time (to the right).
 * People cannot hold a straight line without something to look at (Souman et al. 2009).
 */
const VEER = 0.5 * DEG;
/** Look within this angle of a landmark, for this long (s), to take its bearing. */
const AIM_ANGLE = 4.5 * DEG;
const AIM_TIME = 0.7;

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

type Phase = "brief" | "outbound" | "storm" | "gut" | "return" | "done";

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
  let returnT = 0; // real seconds since the walk home began
  let truth: [number, number][] = [];
  let stormIndex = 0;
  let unaided: [number, number][] = [];
  let unaidedHeading = 0;
  let note = { text: "", level: "info" as HudState["alertLevel"], until: 0 };
  let realT = 0;
  let maxError = 0;
  let failReason = "";
  let gutErrorDeg: number | null = null;
  let aimId = "";
  let aimT = 0;
  let beats = new Set<string>();
  let wasClearing = false;

  const say = (text: string, level: HudState["alertLevel"] = "info", seconds = 5) => {
    note = { text, level, until: realT + seconds };
  };
  /** One-time explanation card. Returns true the first time. */
  const beat = (id: string, title: string, text: string, seconds = 10, sticky = false): boolean => {
    if (beats.has(id)) return false;
    beats.add(id);
    hud.coach(title, text, realT, seconds, sticky);
    return true;
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
    stormT = returnT = 0;
    truth = [[player.e, player.n]];
    unaided = [];
    stormIndex = 0;
    maxError = 0;
    failReason = "";
    gutErrorDeg = null;
    aimId = "";
    aimT = 0;
    beats = new Set();
    wasClearing = false;
    sampleSite.getObjectByName("sample")!.visible = true;
    note.until = 0;
    hud.blind(false);
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
      "map",
      "You have a map. You do not have “you are here”.",
      "The map on your visor was photographed from orbit. Mars has no GPS to put you on it. The blue circle is Wayfinder's estimate of where you are. It is small now because you started at the rover, a known spot.",
      12,
    );
  }

  const nearSite = () => Math.hypot(player.e - site.e, player.n - site.n) < 7;

  function action() {
    if (phase === "outbound" && nearSite()) {
      sampleSite.getObjectByName("sample")!.visible = false;
      phase = "storm";
      stormT = 0;
      dustTarget = 0.95;
      nav.mode = "home";
      nav.wf.recording = false;
      stormIndex = truth.length - 1;
      hud.clearCoach();
      say("Hematite sample secured. It formed in water, billions of years ago. Head back to the rover.", "info", 5);
    } else if (phase === "gut") {
      // the player's own sense of direction, measured
      const err = wrap(controls.yaw - bearing(player.e, player.n, home.e, home.n));
      const deg = Math.round(Math.abs(err) / DEG);
      gutErrorDeg = deg;
      const dist = Math.hypot(player.e - home.e, player.n - home.n);
      const miss = Math.round(Math.abs(err) > Math.PI / 2 ? dist : dist * Math.abs(Math.sin(err)));
      const see = Math.round(nav.status.visualRange / 5) * 5;
      say(
        deg < 6
          ? `Good instinct: only ${deg}° off. But nobody can hold a straight line blind. Watch the red line on the map.`
          : `You pointed ${deg}° to the ${err > 0 ? "right" : "left"} of the rover. On that line you would pass it by ${miss} m, and you can only see ${see} m.`,
        "danger",
        10,
      );
      phase = "return";
      returnT = 0;
      unaided = [[player.e, player.n]];
      unaidedHeading = controls.yaw;
      hud.blind(false);
      beat(
        "trail",
        "Wayfinder never needed to see",
        "It counted every step on the way out and still has your path. Follow the amber arrow back along it. The red line on the map is where your own guess would take you.",
        12,
      );
    }
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
    const miss = unaided.length ? Math.hypot(unaided[unaided.length - 1][0] - home.e, unaided[unaided.length - 1][1] - home.n) : 0;
    const inDunes = unaided.some((p) => nav.isSand(p[0], p[1]));
    $("endTitle").textContent = success ? "You made it home." : "EVA failed";
    $("endLead").textContent = success
      ? "In 2018, a dust storm ended the Opportunity rover's mission. This time, we made it home."
      : failReason;
    const stats = [
      `You walked ${Math.round(player.walked)} m in ${Math.round(missionS / 60)} minutes of mission time, with ${Math.max(0, Math.round(o2S / 60))} minutes of oxygen left.`,
      gutErrorDeg !== null ? `When the storm hit, your own guess of the way home was ${gutErrorDeg}° off.` : "",
      unaided.length > 1
        ? `Red line: walking on that guess, blind, you would have ended ${Math.round(miss)} m from the rover${inDunes ? ", after crossing the dunes" : ""}.`
        : "",
      `Wayfinder was never told where you were. Its largest error was ${Math.round(maxError)} m; at the end it was ${Math.round(finalError)} m. You took ${nav.sightings} landmark bearing${nav.sightings === 1 ? "" : "s"}.`,
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

  // ------------------------------------------------------------------ landmarks on the visor
  const v = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  function updateMarkers(dt: number, active: boolean) {
    if (!active) {
      hud.markers([], 0);
      aimId = "";
      return;
    }
    camera.getWorldDirection(fwd);
    const list: Marker[] = [];
    let best: { lm: Landmark; angle: number } | null = null;
    const shown = [...nav.status.inView]
      .sort((a, b) => Math.hypot(a.e - player.e, a.n - player.n) - Math.hypot(b.e - player.e, b.n - player.n))
      .slice(0, 7);
    let edge = 0;
    for (const lm of shown) {
      const x = world.frame.toWorldX(lm.e);
      const z = world.frame.toWorldZ(lm.n);
      const far = Math.hypot(lm.e - player.e, lm.n - player.n) > 4000;
      v.set(x, world.frame.toWorldY(lm.elev) + 2 - (far ? curvatureDrop(Math.hypot(x, z)) : 0), z);
      const angle = v.clone().sub(camera.position).normalize().angleTo(fwd);
      const done = nav.recentlySighted(lm, missionS);
      v.project(camera);
      const onScreen = angle < Math.PI / 2 && Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.9;
      if (onScreen) {
        if (!done && angle < AIM_ANGLE && (!best || angle < best.angle)) best = { lm, angle };
        list.push({
          id: lm.id,
          name: lm.name,
          x: ((v.x + 1) / 2) * innerWidth,
          y: ((1 - v.y) / 2) * innerHeight,
          side: "",
          state: done ? "done" : "idle",
        });
      } else if (!done && edge < 3) {
        const right = wrap(bearing(player.e, player.n, lm.e, lm.n) - controls.yaw) > 0;
        list.push({
          id: lm.id,
          name: lm.name,
          x: right ? innerWidth - 12 : 12,
          y: innerHeight * 0.42 + edge * 26,
          side: right ? "right" : "left",
          state: "idle",
        });
        edge++;
      }
    }
    if (best && best.lm.id === aimId) aimT += dt;
    else {
      aimId = best ? best.lm.id : "";
      aimT = 0;
    }
    if (best) {
      const m = list.find((m) => m.id === best!.lm.id);
      if (m) m.state = "aim";
      if (aimT >= AIM_TIME) {
        const before = nav.wf.estimate.r95;
        const res = nav.sight(best.lm, player, controls.yaw, missionS);
        aimT = 0;
        aimId = "";
        if (res.fix) {
          say(
            before - res.r95 >= 3
              ? `Position fix. Two bearings cross at one point: ±${Math.round(before)} m became ±${Math.round(res.r95)} m.`
              : `Position confirmed by two bearings: ±${Math.round(res.r95)} m.`,
            "info",
            6,
          );
          if (beats.has("bearing")) hud.clearCoach();
        } else if (best.lm.fuzz) {
          say(`Bearing to ${best.lm.name} taken. Too far and too wide to fix a position, but it checks your direction.`, "info", 5);
        } else {
          say(`Bearing to ${best.lm.name} taken: you are somewhere on that line. Sight one more landmark to fix your position.`, "info", 6);
        }
      }
    }
    hud.markers(list, best ? Math.min(1, aimT / AIM_TIME) : 0);
  }

  // ------------------------------------------------------------------ one step of the game
  function tick(dt: number) {
    realT += dt;
    const dtSim = dt * TIME_SCALE;
    const playing = phase === "outbound" || phase === "storm" || phase === "gut" || phase === "return";
    if (playing) {
      controls.update();
      if (phase === "gut") controls.moveX = controls.moveY = 0; // stand still and point
      const inSand = nav.isSand(player.e, player.n);
      const moving = Math.hypot(controls.moveX, controls.moveY) > 0.05;
      // walking blind, people curve without noticing: the body turns, the mind does not register it
      if (phase === "return" && dust > 0.8 && moving) controls.yaw += VEER * dt;
      player.update(dt * (inSand ? 0.55 : 1), controls, world);
      missionS += dtSim;
      o2S -= dtSim * (inSand ? 2 : 1);

      const lastT = truth[truth.length - 1];
      if (Math.hypot(player.e - lastT[0], player.n - lastT[1]) >= 3) truth.push([player.e, player.n]);

      if (phase === "outbound") {
        const r95 = nav.wf.estimate.r95;
        if (player.walked > 45)
          beat(
            "steps",
            "Counting steps",
            "Wayfinder counts every step and measures every turn, the way the Apollo Moon rovers kept track of the way back. Each step is a little off, so the errors add up: watch the blue circle grow.",
          );
        if (player.walked > 150)
          beat(
            "sun",
            "Sun compass",
            "A magnetic compass is useless here: Mars has no global magnetic field. Wayfinder knows exactly where the sun must be at this minute at Gale Crater, so seeing the sun gives true direction.",
          );
        if (player.walked > 380 || r95 > 22)
          if (beat("bearing", "Take a bearing", "Now shrink the circle. Look straight at a ◇ landmark and hold steady for a second. Then do the same with a second landmark.", 0, true)) {
            /* stays until the first fix */
          }
      } else if (phase === "storm") {
        const before = stormT;
        stormT += dt;
        if (before <= 5 && stormT > 5) say("A dust front is coming in from the north-west. Visibility is dropping.", "warn", 5);
        if (before <= 11 && stormT > 11) say("Mount Sharp is gone. The sun is gone.", "warn", 4);
        if (stormT > 15) {
          phase = "gut";
          hud.blind(true);
          hud.clearCoach();
        }
      } else if (phase === "return") {
        returnT += dt;
        // the storm thins for a few seconds now and then: a chance to sight a landmark
        const cycle = returnT % 45;
        const clearing = cycle > 27 && cycle < 37;
        dustTarget = clearing ? 0.45 : 0.94;
        if (clearing && !wasClearing) say("The dust is thinning. Quick: look at a ◇ landmark to check your position.", "info", 7);
        wasClearing = clearing;
        if (player.lastStep > 0) {
          unaidedHeading += VEER * dt;
          const u = unaided[unaided.length - 1];
          unaided.push([u[0] + Math.sin(unaidedHeading) * player.lastStep, u[1] + Math.cos(unaidedHeading) * player.lastStep]);
        }
        const g = nav.status.guidance;
        if (returnT > 12 && moving && g && Math.abs(g.turn) > 12 * DEG && dust > 0.8)
          beat(
            "veer",
            "You are curving without feeling it",
            "With nothing to look at, nobody walks straight. In experiments people walked in circles when the sun was hidden. You cannot feel the turn. Wayfinder's gyro can.",
            11,
          );
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
    camera.updateMatrixWorld();
    world.setSky(utc, player.e, player.n, dust, camera);

    if (playing) {
      nav.update(dtSim, missionS, utc, dust, player, controls);
      const est = nav.wf.estimate;
      maxError = Math.max(maxError, Math.hypot(est.e - player.e, est.n - player.n));
      updateMarkers(dt, phase !== "gut");

      // alerts, most urgent first
      const st = nav.status;
      const o2Min = o2S / 60;
      const needMin = (st.homeDistance / REAL_PACE / 60) * 1.25;
      let alert = "";
      let level: HudState["alertLevel"] = "info";
      if (phase === "gut")
        [alert, level] = ["ZERO VISIBILITY. No sun. No landmarks. And Mars has no GPS. Before Wayfinder helps: turn to face where you think the rover is.", "danger"];
      else if (o2Min < 5) [alert, level] = ["OXYGEN CRITICAL", "danger"];
      else if (nav.isSand(player.e, player.n)) [alert, level] = ["Soft sand: you are in the dunes. Turn back the way you came.", "danger"];
      else if (realT < note.until && note.level === "danger") [alert, level] = [note.text, note.level];
      else if (st.sandAhead && phase === "return") [alert, level] = [`Dunes ${st.sandAhead} m ahead on this heading. Turn toward the amber arrow.`, "warn"];
      else if (phase === "outbound" && o2Min < needMin + 4) [alert, level] = ["Turn back now: oxygen for the walk home is running short.", "warn"];
      else if (realT < note.until) [alert, level] = [note.text, note.level];
      const ll = toLonLat(player.e, player.n);
      const sp = sunPosition(utc, ll.lat, ll.lon);
      const hh = Math.floor(sp.ltst);
      const mm = Math.floor((sp.ltst - hh) * 60);
      const prompt =
        phase === "outbound" && nearSite()
          ? controls.touch
            ? ""
            : "Press E to collect the sample"
          : phase === "gut" && !controls.touch
            ? "Face the rover, then press E"
            : "";
      hud.update(
        nav,
        {
          objective: phase === "outbound" ? "EVA-1 · Collect hematite at Vera Rubin Ridge" : "EVA-1 · Return to the rover",
          clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} local solar time`,
          o2Fraction: o2S / (O2_MINUTES * 60),
          o2Minutes: o2Min,
          alert,
          alertLevel: level,
          prompt,
          dust,
          ghost: phase === "return" ? unaided : [],
        },
        realT,
      );
      const btn = $("actionBtn");
      const showBtn = controls.touch && ((phase === "outbound" && nearSite()) || phase === "gut");
      btn.style.display = showBtn ? "block" : "none";
      btn.textContent = phase === "gut" ? "The rover is this way" : "Collect sample";
    }
    renderer.render(world.scene, camera);
  }

  // ------------------------------------------------------------------ start / restart
  $("loading").style.display = "none";
  $("startHelp").textContent = controls.touch
    ? "Left thumb: walk. Right thumb: look around."
    : "Click to look with the mouse. W A S D to walk. E to act. Esc frees the mouse.";
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
  // handle for automated checks in the browser (only with ?debug)
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
        return { phase, missionS, o2S, dust, realT, maxError, fixes: nav.fixes, sightings: nav.sightings };
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
