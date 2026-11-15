import * as THREE from 'three';
import { StereoEffect } from 'three/examples/jsm/effects/StereoEffect.js';
import { toLonLat } from '../data/frame';
import { AREA, AREAS, areaOf } from '../data/areas';
import { dataUrl, loadRaster } from '../data/loader';
import { bearing } from '../nav/rng';
import { nextLocalTime } from '../nav/sun';
import type { Region } from '../nav/mgl';
import { loadWalkPlan } from '../plan/walk-plan';
import { getProject } from '../site/projects';
import { Controls, type ViewMode } from './controls';
import { Hud, type CollectionTarget } from './hud';
import { movementScale, SPEEDS, stormLevel, type Speed } from './mission';
import { Nav } from './nav';
import { Panorama } from './panorama';
import { EYE_HEIGHT, Player } from './player';
import { makeSampleSite, setSampleCollected } from './props';
import { scanFeedback } from './scan-feedback';
import { World } from '../world/world';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const low = matchMedia('(pointer: coarse)').matches || params.has('low');
const renderer = new THREE.WebGLRenderer({ antialias: !low, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
$('view').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.15, 400000);
/** VR: the scene drawn once per eye, side by side, for a phone in a headset case */
const stereo = new StereoEffect(renderer);
stereo.setSize(innerWidth, innerHeight);
const MODE_KEY = 'marswalk-view-mode';
const HELP: Record<ViewMode, string> = {
  fpv: 'WASD: 移動 · マウス: 見回す · M: 全域マップ',
  ar: 'スマホを向けて見回す · 画面を押している間 前進 · MAPボタン: 全域マップ',
  vr: '頭を動かして見回す · 画面（ゴーグルのボタン）を押している間 前進',
};

const COLLECTION_RADIUS = 7;
/** Peak-storm unnoticed turn to the right, restored to the original 0.5°/s scale. */
const RIGHT_VEER = Math.PI / 360;

async function main() {
  const projectId = params.get('project');
  const savedProject = projectId ? getProject(projectId) : undefined;
  if (savedProject && areaOf(savedProject.area) !== AREA) {
    location.replace(`/game.html?area=${areaOf(savedProject.area)}&project=${encodeURIComponent(savedProject.id)}`);
    return;
  }
  const world = await World.load(m => $('loading').textContent = m, low);
  const [sand, orbital, plan] = await Promise.all([
    loadRaster(world.meta.layers.sand.raw, world.meta.layers.sand.bounds),
    loadRaster(world.meta.images.ortho.file, world.meta.images.ortho.bounds),
    loadWalkPlan(world, projectId),
  ]);
  const controls = new Controls(renderer.domElement);
  const targets: CollectionTarget[] = plan.targets.map((t, index) => ({
    id: `planned-target-${index}`, name: t.name, e: t.e, n: t.n, collected: false, index,
  }));
  const start = plan.start;
  const timeLimit = plan.timeLimit;
  const startUtc = nextLocalTime(Date.UTC(2041, 5, 1), toLonLat(start.e, start.n).lon, 14.5);
  const sites = targets.map((target, index) => {
    const site = makeSampleSite(index);
    world.worldPos(target.e, target.n, 0, site.position);
    world.scene.add(site);
    return site;
  });
  const hud = new Hud(world, dataUrl(world.meta.images.color.file), plan.points);
  const areaName = AREAS.find(a => a.id === AREA)?.name[1] ?? AREA;
  $('missionName').textContent = targets.length > 1
    ? `${targets.map(t => t.name).join('→')}の${targets.length}か所で試料を回収する`
    : `${plan.target.name}へ向かい試料を回収する`;
  const planSummary = `${areaName} · ${plan.project?.name || '既定の計画'} · ${Math.round(plan.route.stats.distance)} m · 計画所要 ${Math.ceil(timeLimit / 60)}分 · ${plan.route.stats.photoCount}回の測位を想定`;
  const plannerQuery = new URLSearchParams({ area: AREA });
  if (plan.project) plannerQuery.set('project', plan.project.id);
  $('plannerLink').setAttribute('href', `/sim.html?${plannerQuery}`);
  const pano = new Panorama();
  $('panorama').appendChild(pano.canvas);
  let player: Player, nav: Nav;
  let phase: 'brief' | 'collect' | 'done' = 'brief';
  let missionS = 0, elapsed = 0, dust = 0.25, scanT = -1, fixT = -1, speed: Speed = 4;
  let fixFrom: Region | null = null, fixTo: Region | null = null;
  let scanStatus = '周囲をスキャンして位置を推定', message = '', messageUntil = 0, terrainNoticeAt = -Infinity;

  function say(text: string, seconds = 8) { message = text; messageUntil = elapsed + seconds; }
  function reset() {
    player = new Player(); player.e = start.e; player.n = start.n;
    controls.yaw = bearing(start.e, start.n, targets[0].e, targets[0].n); controls.pitch = 0;
    controls.mapOpen = false; hud.toggleMap(false);
    nav = new Nav(world, sand, orbital, player, Math.floor(Math.random() * 1e6) + 1, plan.localizability);
    targets.forEach((target, i) => { target.collected = false; setSampleCollected(sites[i], false); });
    missionS = elapsed = 0; dust = 0.25; scanT = fixT = -1; fixFrom = fixTo = null; speed = 4; phase = 'brief';
    scanStatus = '周囲をスキャンして位置を推定'; message = ''; messageUntil = 0; terrainNoticeAt = -Infinity;
    pano.reset(); $('scanCapture').hidden = true; hud.hideLocalization(); updateSpeedButtons();
  }
  // ------------------------------------------------------------ view modes
  let mode: ViewMode = 'fpv';
  try {
    const saved = params.get('mode') ?? localStorage.getItem(MODE_KEY);
    if (saved === 'fpv' || saved === 'ar' || saved === 'vr') mode = saved;
    else if (controls.touch) mode = 'ar';
  } catch { /* storage blocked: default */ }
  function renderModes() {
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on));
    });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode === mode) return;
    mode = b.dataset.mode as ViewMode;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* not kept */ }
    applyMode(true);
  }));
  /**
   * Switch to the chosen mode. From a tap (gesture) it can also go full screen and ask for the motion
   * sensor; on load it cannot, so the phone asks on the first touch instead.
   */
  function applyMode(gesture: boolean) {
    renderModes();
    if (mode !== 'fpv') controls.release();
    document.body.classList.toggle('mode-ar', mode === 'ar');
    document.body.classList.toggle('mode-vr', mode === 'vr');
    document.querySelector('#instruments .help')!.textContent = HELP[mode];
    const sensor = controls.setMode(mode, gesture);
    if (mode === 'fpv') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } else {
      if (gesture) {
        document.documentElement.requestFullscreen?.().catch(() => {});
        if (mode === 'vr') (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {});
      }
      void sensor.then(ok => {
        if (!ok) say('モーションセンサーが許可されていません。ドラッグで見回してください。');
        // no sensor event soon after: a laptop. The mouse looks around instead.
        setTimeout(() => { if (phase === 'collect' && !controls.motion) say('モーションセンサーがありません。クリックで視点操作、左ボタンを押している間 前進。'); }, 1500);
      });
    }
    onResize();
  }

  function begin() {
    $('end').style.display = 'none'; phase = 'collect'; controls.enabled = true; hud.show(true);
    if (!controls.touch) controls.capture();
    say(`${planSummary}。全体マップの計画経路を辿り、制限時間内に試料を回収してください。`, 10);
  }
  function toggleMap() {
    if (phase !== 'collect' || fixT >= 0) return;
    hud.toggleMap(); controls.mapOpen = hud.mapOpen;
  }
  function scan() {
    if (phase !== 'collect' || scanT >= 0 || fixT >= 0) return;
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
  controls.onMenu = () => { controls.release(); location.assign(import.meta.env.BASE_URL); };
  $('mapBtn').addEventListener('click', toggleMap);
  $('scanBtn').addEventListener('click', scan);
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => button.addEventListener('click', () => setSpeed(Number(button.dataset.speed))));

  function finish(success: boolean, reason = '') {
    phase = 'done'; scanT = fixT = -1; controls.enabled = false; controls.release(); hud.toggleMap(false); hud.hideLocalization(); controls.mapOpen = false; hud.show(false);
    $('endTitle').textContent = success ? '試料の採取を完了。' : '強制帰還';
    $('endLead').textContent = success ? '計画された採取地点へ制限時間内に到着しました。' : reason;
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
    const active = phase === 'collect' && !document.hidden;
    if (active) {
      const cinematic = scanT >= 0 || fixT >= 0;
      elapsed += dt; missionS += dt * (cinematic ? 4 : speed);
      controls.update();
      const moving = fixT < 0 && Math.hypot(controls.moveX, controls.moveY) > 0.05;
      if (scanT >= 0 && moving) { scanT = -1; scanStatus = '撮影中断 · 移動を検出'; $('scanCapture').hidden = true; say('立ち止まって、もう一度スキャンしてください。'); }
      if (fixT < 0) {
        if (moving && dust > 0.45) controls.turn(RIGHT_VEER * dt * Math.min(1, (dust - 0.45) / 0.5));
        const movement = player.update(dt * movementScale(speed), controls, world, plan.speedForGrade);
        if (moving && elapsed >= terrainNoticeAt) {
          if (movement.blocked) {
            say(`進入不可：登り傾斜 ${Math.round(movement.slopeDeg)}°（上限 20°）`, 2.5);
            terrainNoticeAt = elapsed + 2.5;
          } else if (movement.slopeDeg >= 12) {
            say(`急傾斜 ${Math.round(movement.slopeDeg)}°：歩行速度が低下しています`, 2.5);
            terrainNoticeAt = elapsed + 3;
          }
        }
        nav.update(player); collectNearby();
      }
      dust = stormLevel(missionS);
      if (phase === 'collect' && missionS >= timeLimit) finish(false, 'EVA時間切れ。安全規定により採取を中断し、隊員を強制帰還させました。');
    }
    world.worldPos(player.e, player.n, EYE_HEIGHT + (scanT >= 0 || fixT >= 0 ? 0 : Math.sin(player.bob * 1.9) * 0.05), camera.position);
    camera.rotation.set(controls.pitch, -controls.yaw, controls.roll, 'YXZ'); camera.updateMatrixWorld();
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
        const before = { ...nav.region.current };
        const { pin, match, observation, repeated } = nav.scan(player, dust, missionS);
        scanStatus = `#${pin.id} ${pin.improved ? '位置推定を更新' : '円の縮小なし'} · 照合品質 ${Math.round(match.quality * 100)}%`;
        say(pin.improved ? `存在可能性円を半径 ${Math.ceil(pin.radius)} m に更新。` : scanFeedback({
          sampleCount: observation.samples.length, repeated, accepted: match.accepted, improved: pin.improved,
          coverage: match.coverage, contrast: match.contrast, clarity: match.clarity,
          orientation: match.orientation, uniqueness: match.uniqueness, quality: match.quality,
        }));
        scanT = -1; $('scanCapture').hidden = true;
        if (pin.improved && pin.radius <= 40) {
          fixT = 0; fixFrom = before; fixTo = { ...pin };
          controls.release(); hud.showLocalization(nav, targets, fixFrom, fixTo, 0);
        }
      }
    }
    if (active && phase === 'collect' && fixT >= 0 && fixFrom && fixTo) {
      fixT += dt;
      hud.showLocalization(nav, targets, fixFrom, fixTo, fixT / 3.6);
      if (fixT >= 3.6) {
        fixT = -1; hud.hideLocalization();
        if (!controls.touch) controls.capture();
      }
    }
    if (phase === 'collect') hud.update(nav, targets, {
      time: missionS, remaining: Math.max(0, timeLimit - missionS), total: timeLimit, dust, scan: scanStatus,
      message: elapsed < messageUntil ? message : '', heading: controls.yaw, speed: scanT >= 0 || fixT >= 0 ? 4 : speed,
    });
    if (mode === 'vr' && phase === 'collect') {
      // the HUD is hidden in the headset: each eye gets a short readout instead
      const next = targets.find(t => !t.collected);
      const left = Math.max(0, timeLimit - missionS);
      const text = `残り ${Math.floor(left / 60)}分 · ${next ? `${next.name} まで ${Math.round(Math.hypot(next.e - player.e, next.n - player.n))} m` : '回収完了'} · 誤差円 ${Math.ceil(nav.region.current.radius)} m`;
      if (vrInfo[0].textContent !== text) vrInfo.forEach(el => { el.textContent = text; });
      stereo.render(world.scene, camera);
    } else renderer.render(world.scene, camera);
  }
  const vrInfo = Array.from(document.querySelectorAll<HTMLElement>('.vrInfo'));
  // no start card: you spawn as soon as the world has loaded
  reset(); applyMode(false); $('loading').style.display = 'none'; begin();
  $('againBtn').addEventListener('click', () => { reset(); begin(); });
  function onResize() {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); stereo.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', onResize);
  if (params.has('debug')) (window as unknown as Record<string, unknown>).__mw = {
    world, controls, camera, renderer, targets, start, timeLimit, plan, hud, begin, scan, tick, reset, setSpeed,
    get player() { return player; }, get nav() { return nav; },
    get state() { return { phase, missionS, dust, elapsed, scanT, fixT, speed, collected: targets.filter(t => t.collected).length }; },
  };
  let last = performance.now();
  renderer.setAnimationLoop(now => { const dt = Math.min((now - last) / 1000, 0.1); last = now; if (!params.has('manual')) tick(dt); });
  tick(0);
}
main().catch(err => { console.error(err); $('loading').textContent = `Could not start: ${err.message}`; });
