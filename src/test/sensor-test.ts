/**
 * Phase 1 sensor check: "look-around" mode. Turning the phone turns the camera, like holding
 * a window onto Mars. Also counts steps from the accelerometer (walking on the spot), which
 * Wayfinder's dead reckoning will use later. Minimal scene, no NASA data needed.
 */
import * as THREE from "three";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9a273);
scene.fog = new THREE.Fog(0xd9a273, 60, 420);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 1.7, 0);
scene.add(new THREE.HemisphereLight(0xffe6cc, 0x6b4a36, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-1, 2, -1);
scene.add(sun);

// faceted ground
const groundGeo = new THREE.PlaneGeometry(900, 900, 60, 60).toNonIndexed();
groundGeo.rotateX(-Math.PI / 2);
const gp = groundGeo.attributes.position;
for (let i = 0; i < gp.count; i++) {
  const x = gp.getX(i);
  const z = gp.getZ(i);
  gp.setY(i, Math.sin(x * 0.05) * Math.cos(z * 0.04) * 1.2 + Math.sin(x * 0.011 + z * 0.017) * 3 - 3);
}
groundGeo.computeVertexNormals();
scene.add(new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ color: 0xb5673c, flatShading: true })));

function label(text: string, color: string): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const ctx = cv.getContext("2d")!;
  ctx.font = "700 72px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), fog: false }));
  s.scale.set(40, 20, 1);
  return s;
}

// compass markers + a stand-in "Mount Sharp" to the south-east and some buttes
const marks: [string, number, string][] = [
  ["N", 0, "#ffffff"],
  ["E", 90, "#ffe066"],
  ["S", 180, "#ffffff"],
  ["W", 270, "#ffe066"],
];
for (const [t, deg, col] of marks) {
  const a = THREE.MathUtils.degToRad(deg);
  const s = label(t, col);
  s.position.set(Math.sin(a) * 200, 28, -Math.cos(a) * 200);
  scene.add(s);
}
const rock = new THREE.MeshLambertMaterial({ color: 0x8a4a2b, flatShading: true });
const mountain = new THREE.Mesh(new THREE.ConeGeometry(260, 150, 7), rock);
mountain.position.set(300, 60, 300);
scene.add(mountain);
for (let i = 0; i < 9; i++) {
  const a = i * 2.4;
  const butte = new THREE.Mesh(new THREE.CylinderGeometry(5 + (i % 3) * 3, 9 + (i % 4) * 3, 8 + (i % 5) * 3, 6), rock);
  butte.position.set(Math.sin(a) * (50 + i * 16), 2, -Math.cos(a) * (50 + i * 16));
  scene.add(butte);
}

// ---------------------------------------------------------------- device orientation -> camera
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // look out the back of the phone
const deviceQ = new THREE.Quaternion();
const yawOffset = new THREE.Quaternion();
let haveOrientation = false;
let orientationEvents = 0;
let lastAlpha = 0;

function screenAngle(): number {
  return THREE.MathUtils.degToRad(screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);
}

function onOrientation(ev: DeviceOrientationEvent) {
  if (ev.alpha === null || ev.beta === null || ev.gamma === null) return;
  haveOrientation = true;
  orientationEvents++;
  lastAlpha = ev.alpha;
  const alpha = THREE.MathUtils.degToRad(ev.alpha);
  const beta = THREE.MathUtils.degToRad(ev.beta);
  const gamma = THREE.MathUtils.degToRad(ev.gamma);
  euler.set(beta, alpha, -gamma, "YXZ");
  deviceQ.setFromEuler(euler);
  deviceQ.multiply(q1);
  deviceQ.multiply(q0.setFromAxisAngle(zee, -screenAngle()));
  const webkit = (ev as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  $("orient").textContent =
    `alpha ${ev.alpha.toFixed(0)}°  beta ${ev.beta.toFixed(0)}°  gamma ${ev.gamma.toFixed(0)}°\n` +
    `absolute: ${ev.absolute ? "yes" : "no"}` +
    (webkit !== undefined ? `  compass ${webkit.toFixed(0)}°` : "");
}

function recenter() {
  // make the current facing direction "north" in the scene
  yawOffset.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(lastAlpha));
}

// ---------------------------------------------------------------- step counter from accelerometer
let steps = 0;
let motionEvents = 0;
let smooth = 9.81;
let above = false;
let lastStepAt = 0;
function onMotion(ev: DeviceMotionEvent) {
  const a = ev.accelerationIncludingGravity;
  if (!a || a.x === null || a.y === null || a.z === null) return;
  motionEvents++;
  const mag = Math.hypot(a.x, a.y, a.z);
  smooth = smooth * 0.9 + mag * 0.1; // slow baseline (gravity)
  const d = mag - smooth;
  const now = performance.now();
  if (!above && d > 1.4 && now - lastStepAt > 280) {
    above = true;
    steps++;
    lastStepAt = now;
  } else if (above && d < 0.3) {
    above = false;
  }
  $("motion").textContent = `|accel| ${mag.toFixed(1)} m/s²   steps ${steps}`;
}

// ---------------------------------------------------------------- permission + fallback
type PermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

async function enable() {
  const out = $("perm");
  try {
    const O = DeviceOrientationEvent as unknown as PermissionApi;
    const M = DeviceMotionEvent as unknown as PermissionApi;
    const results: string[] = [];
    if (typeof O.requestPermission === "function") results.push(`orientation: ${await O.requestPermission()}`);
    if (typeof M.requestPermission === "function") results.push(`motion: ${await M.requestPermission()}`);
    addEventListener("deviceorientation", onOrientation);
    addEventListener("devicemotion", onMotion);
    out.textContent = results.length ? results.join(", ") : "no permission prompt needed on this device";
    setTimeout(() => {
      if (!haveOrientation) {
        out.textContent += "\nNo sensor data arrived. On a laptop this is expected: drag to look instead.";
        out.className = "bad";
      } else {
        out.className = "ok";
        recenter();
      }
    }, 1200);
    $("enable").style.display = "none";
  } catch (err) {
    out.textContent = `failed: ${(err as Error).message}`;
    out.className = "bad";
  }
}

$("enable").addEventListener("click", enable);
$("recenter").addEventListener("click", recenter);
$("secure").textContent = isSecureContext
  ? "secure page (HTTPS or localhost): sensors allowed"
  : "NOT a secure page: sensors are blocked. Use the HTTPS address.";
$("secure").className = isSecureContext ? "ok" : "bad";

// drag-to-look fallback (desktop, or when sensors are denied)
let yaw = 0;
let pitch = 0;
let drag: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY }));
addEventListener("pointerup", () => (drag = null));
addEventListener("pointermove", (e) => {
  if (!drag || haveOrientation) return;
  yaw -= (e.clientX - drag.x) * 0.005;
  pitch = THREE.MathUtils.clamp(pitch - (e.clientY - drag.y) * 0.005, -1.4, 1.4);
  drag = { x: e.clientX, y: e.clientY };
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const fwd = new THREE.Vector3();
let rateT = performance.now();
renderer.setAnimationLoop(() => {
  if (haveOrientation) camera.quaternion.copy(yawOffset).multiply(deviceQ);
  else camera.rotation.set(pitch, yaw, 0, "YXZ");
  camera.getWorldDirection(fwd);
  const heading = (THREE.MathUtils.radToDeg(Math.atan2(fwd.x, -fwd.z)) + 360) % 360;
  $("heading").textContent = `looking ${heading.toFixed(0)}° (0 = N marker, 90 = E)`;
  const now = performance.now();
  if (now - rateT > 1000) {
    $("rate").textContent = `sensor events/s: orientation ${orientationEvents}, motion ${motionEvents}`;
    orientationEvents = motionEvents = 0;
    rateT = now;
  }
  renderer.render(scene, camera);
});
