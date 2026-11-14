import * as THREE from 'three';
import { toLonLat } from '../data/frame';
import { dataUrl, loadRaster, type Place } from '../data/loader';
import { bearing } from '../nav/rng';
import { nextLocalTime } from '../nav/sun';
import { Controls } from './controls';
import { Hud, type CollectionTarget } from './hud';
import { movementScale, SPEEDS, stormLevel, TIME_LIMIT, type Speed } from './mission';
import { Nav } from './nav';
import { Panorama } from './panorama';
import { EYE_HEIGHT, Player } from './player';
import { makeSampleSite, setSampleCollected } from './props';
import { World } from './world';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const low = matchMedia('(pointer: coarse)').matches || params.has('low');
const renderer = new THREE.WebGLRenderer({ antialias: !low, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
$('view').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.15, 400000);

const COLLECTION_RADIUS = 7;
/** Peak-storm unnoticed turn to the right: twice the former 0.5°/s value. */
const RIGHT_VEER = Math.PI / 180;

async function main() {
  const world = await World.load(m => $('loading').textContent = m, low);
  const [sand, orbital] = await Promise.all([
    loadRaster(world.meta.layers.sand.raw, world.meta.layers.sand.bounds),
    loadRaster(world.meta.images.ortho.file, world.meta.images.ortho.bounds),
  ]);
  const controls = new Controls(renderer.domElement);
  // Keep only the existing site farthest from the south-east starting point.
  const stopPlaces = ['stop_murray_buttes'].map(id => world.place(id));
  const targets: CollectionTarget[] = stopPlaces.map((p, index) => ({
    id: p.id, name: p.name.replace(/ \(.+\)$/, ''), e: p.easting, n: p.northing, collected: false, index,
  }));
  const start = {
    e: world.meta.frame.play.east - 110,
    n: world.meta.frame.play.south + 110,
  };
  const startUtc = nextLocalTime(Date.UTC(2041, 5, 1), toLonLat(start.e, start.n).lon, 14.5);
  const sites = stopPlaces.map((place: Place, index) => {
    const site = makeSampleSite(index);
    world.worldPos(place.easting, place.northing, 0, site.position);
    world.scene.add(site);
    return site;
  });
  const hud = new Hud(world, dataUrl(world.meta.images.color.file));
  const pano = new Panorama();
  $('panorama').appendChild(pano.canvas);
  let player: Player, nav: Nav;
  let phase: 'brief' | 'collect' | 'done' = 'brief';
  let missionS = 0, elapsed = 0, dust = 0.25, scanT = -1, speed: Speed = 4;
  let scanStatus = '周囲をスキャンして位置を推定', message = '', messageUntil = 0;

  function say(text: string, seconds = 8) { message = text; messageUntil = elapsed + seconds; }
  function reset() {
    player = new Player(); player.e = start.e; player.n = start.n;
    controls.yaw = bearing(start.e, start.n, targets[0].e, targets[0].n); controls.pitch = 0;
    controls.mapOpen = false; hud.toggleMap(false);
    nav = new Nav(world, sand, orbital, player, Math.floor(Math.random() * 1e6) + 1);
    targets.forEach((target, i) => { target.collected = false; setSampleCollected(sites[i], false); });
    missionS = elapsed = 0; dust = 0.25; scanT = -1; speed = 4; phase = 'brief';
    scanStatus = '周囲をスキャンして位置を推定'; message = ''; messageUntil = 0;
    pano.reset(); $('scanCapture').hidden = true; updateSpeedButtons();
  }
  function begin() {
    $('start').style.display = 'none'; $('end').style.display = 'none'; phase = 'collect'; controls.enabled = true; hud.show(true);
    if (!controls.touch) controls.capture();
    say('制限時間内にマップ上の最遠地点へ向かい、試料を回収してください。');
  }
  function toggleMap() {
    if (phase !== 'collect') return;
    hud.toggleMap(); controls.mapOpen = hud.mapOpen; controls.release();
    if (!hud.mapOpen && !controls.touch) controls.capture();
  }
  function scan() {
    if (phase !== 'collect' || hud.mapOpen || scanT >= 0) return;
    controls.update();
    if (Math.hypot(controls.moveX, controls.moveY) > 0.05) { say('スキャンするには立ち止まってください。'); return; }
    scanT = 0; pano.reset(); $('scanCapture').hidden = false;
    scanStatus = '撮影 0 / 5 · 360°パノラマ';
  }
  function setSpeed(value: number) {
    if (!SPEEDS.includes(value as Speed)) return;
    speed = value as Speed; updateSpeedButtons();
    say(`シミュレーション倍率を ${speed}× に変更。移動と時計が連動します。`, 4);
  }
  function updateSpeedButtons() {
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => {
      const active = Number(button.dataset.speed) === speed;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    $('speedReadout').textContent = `${speed}×`;
  }
  controls.onMap = toggleMap; controls.onScan = scan;
  $('mapBtn').addEventListener('click', toggleMap); $('closeMap').addEventListener('click', toggleMap);
  $('scanBtn').addEventListener('click', scan);
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => button.addEventListener('click', () => setSpeed(Number(button.dataset.speed))));

  function finish(success: boolean, reason = '') {
    phase = 'done'; scanT = -1; controls.enabled = false; controls.release(); hud.toggleMap(false); controls.mapOpen = false; hud.show(false);
    $('endTitle').textContent = success ? '試料の採取を完了。' : '強制帰還';
    $('endLead').textContent = success ? '全試料を制限時間内に確保しました。' : reason;
    $('endStats').textContent = `回収 ${targets.filter(t => t.collected).length}/${targets.length} · 歩行 ${Math.round(player.walked)} m · 経過 ${Math.floor(missionS / 60)}分${String(Math.floor(missionS % 60)).padStart(2, '0')}秒 · スキャン ${nav.region.pins.length} 回`;
    $('end').style.display = 'flex';
  }
  function collectNearby() {
    for (const target of targets) {
      if (target.collected || Math.hypot(player.e - target.e, player.n - target.n) > COLLECTION_RADIUS) continue;
      target.collected = true; setSampleCollected(sites[target.index], true);
      const count = targets.filter(t => t.collected).length;
      say(`${target.name}：試料回収完了（${count}/${targets.length}）`);
      if (count === targets.length) finish(true);
    }
  }
  function tick(dt: number) {
    const active = phase === 'collect' && !hud.mapOpen && !document.hidden;
    if (active) {
      elapsed += dt; missionS += dt * speed;
      controls.update();
      const moving = Math.hypot(controls.moveX, controls.moveY) > 0.05;
      if (scanT >= 0 && moving) { scanT = -1; scanStatus = '撮影中断 · 移動を検出'; $('scanCapture').hidden = true; say('立ち止まって、もう一度スキャンしてください。'); }
      const terrainFactor = nav.isSand(player.e, player.n) ? 0.65 : 1;
      if (moving && dust > 0.45) controls.yaw += RIGHT_VEER * dt * Math.min(1, (dust - 0.45) / 0.5);
      player.update(dt * movementScale(speed) * terrainFactor, controls, world);
      nav.update(player); collectNearby();
      dust = stormLevel(missionS);
      if (phase === 'collect' && missionS >= TIME_LIMIT) finish(false, 'EVA時間切れ。安全規定により採取を中断し、隊員を強制帰還させました。');
    }
    world.worldPos(player.e, player.n, EYE_HEIGHT + (scanT >= 0 ? 0 : Math.sin(player.bob * 1.9) * 0.05), camera.position);
    camera.rotation.set(controls.pitch, -controls.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
    world.setSky(startUtc + missionS * 1000, player.e, player.n, dust, camera);
    if (active && phase === 'collect' && scanT >= 0) {
      // Capture duration is real time so changing simulation speed does not corrupt the panorama.
      scanT += dt;
      if (pano.pairs < 5 && scanT > pano.pairs * 0.75) {
        pano.capture(renderer, world.scene, camera.position);
        scanStatus = `撮影 ${pano.pairs} / 5 · 360°パノラマ`;
      }
      if (scanT > 3.9) scanStatus = '軌道画像・地形を照合中…';
      if (scanT > 4.5) {
        const { pin, match } = nav.scan(player, dust, missionS);
        scanStatus = `#${pin.id} ${pin.improved ? '位置推定を更新' : '円の縮小なし'} · 照合品質 ${Math.round(match.quality * 100)}%`;
        say(pin.improved ? `存在可能性円を半径 ${Math.ceil(pin.radius)} m に更新。` : '十分な新しい情報が得られませんでした。');
        scanT = -1; $('scanCapture').hidden = true;
      }
    }
    if (phase === 'collect') hud.update(nav, targets, {
      time: missionS, remaining: Math.max(0, TIME_LIMIT - missionS), dust, scan: scanStatus,
      message: elapsed < messageUntil ? message : '', heading: controls.yaw, speed,
    });
    renderer.render(world.scene, camera);
  }
  reset(); $('loading').style.display = 'none'; $('start').style.display = 'flex';
  $('startBtn').addEventListener('click', begin); $('againBtn').addEventListener('click', () => { reset(); begin(); });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  if (params.has('debug')) (window as unknown as Record<string, unknown>).__mw = {
    world, controls, camera, renderer, targets, start, hud, begin, scan, tick, reset, setSpeed,
    get player() { return player; }, get nav() { return nav; },
    get state() { return { phase, missionS, dust, elapsed, scanT, speed, collected: targets.filter(t => t.collected).length }; },
  };
  let last = performance.now();
  renderer.setAnimationLoop(now => { const dt = Math.min((now - last) / 1000, 0.1); last = now; if (!params.has('manual')) tick(dt); });
  tick(0);
}
main().catch(err => { console.error(err); $('loading').textContent = `Could not start: ${err.message}`; });
