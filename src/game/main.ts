/** Marswalk: game entry point. */
import * as THREE from "three";
import { toLonLat } from "../data/frame";
import { marsTime, nextLocalTime } from "../nav/sun";
import { Controls } from "./controls";
import { EYE_HEIGHT, Player } from "./player";
import { makeRover, makeSampleSite } from "./props";
import { World } from "./world";

/** Mission clock runs this many times faster than real time (and so does walking). */
export const TIME_SCALE = 4;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const lowDetail = matchMedia("(pointer: coarse)").matches || new URLSearchParams(location.search).has("low");

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

async function main() {
  const world = await World.load((m) => ($("loading").textContent = m), lowDetail);
  const controls = new Controls(renderer.domElement);
  const player = new Player();

  const camp = world.place("forward_camp");
  const stop = world.place("stop_vera_rubin_ridge");
  player.e = camp.easting + 6;
  player.n = camp.northing - 8;
  controls.yaw = Math.atan2(stop.easting - player.e, stop.northing - player.n);

  const rover = makeRover();
  world.worldPos(camp.easting, camp.northing, 0, rover.position);
  rover.rotation.y = 0.6;
  const site = makeSampleSite();
  world.worldPos(stop.easting, stop.northing, 0, site.position);
  world.scene.add(rover, site);

  const startUtc = missionStart(toLonLat(camp.easting, camp.northing).lon);
  let missionS = 0; // mission elapsed time, seconds of Mars-clock time

  $("loading").style.display = "none";
  $("start").style.display = "flex";
  $("startBtn").addEventListener("click", () => {
    $("start").style.display = "none";
    controls.enabled = true;
    if (!controls.touch) renderer.domElement.requestPointerLock?.();
  });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  let debug = new URLSearchParams(location.search).has("debug");
  // handle for automated checks in the browser (only with ?debug)
  if (debug) (window as unknown as Record<string, unknown>).__mw = { player, controls, world, camera, renderer };
  addEventListener("keydown", (e) => {
    if (e.code === "Backquote") debug = !debug;
  });

  let last = performance.now();
  let frames = 0;
  let fpsT = last;
  let fps = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (controls.enabled) {
      controls.update();
      player.update(dt, controls, world);
      missionS += dt * TIME_SCALE;
    }
    const bob = Math.sin(player.bob * 1.9) * 0.05;
    world.worldPos(player.e, player.n, EYE_HEIGHT + bob, camera.position);
    camera.rotation.set(controls.pitch, -controls.yaw, 0, "YXZ");
    world.setSky(startUtc + missionS * 1000, player.e, player.n, 0, camera);
    renderer.render(world.scene, camera);

    frames++;
    if (now - fpsT > 500) {
      fps = Math.round((frames * 1000) / (now - fpsT));
      frames = 0;
      fpsT = now;
      const dbg = $("debug");
      dbg.style.display = debug ? "block" : "none";
      if (debug) {
        dbg.textContent =
          `${fps} fps  ${renderer.info.render.triangles.toLocaleString()} tris\n` +
          `TRUE E ${player.e.toFixed(0)} N ${player.n.toFixed(0)} elev ${world.groundElevation(player.e, player.n).toFixed(0)}\n` +
          `sun az ${world.sun.azimuth.toFixed(0)} el ${world.sun.elevation.toFixed(0)}  walked ${player.walked.toFixed(0)} m`;
      }
    }
  });
}

main().catch((err) => {
  console.error(err);
  $("loading").textContent = `Could not start: ${err.message}`;
});
