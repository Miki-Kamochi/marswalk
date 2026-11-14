import * as THREE from 'three';
import { dataUrl, loadRaster } from '../data/loader';
import { bearing } from '../nav/rng';
import { nextLocalTime } from '../nav/sun';
import { toLonLat } from '../data/frame';
import { Controls } from './controls';
import { Hud } from './hud';
import { Nav } from './nav';
import { Panorama } from './panorama';
import { EYE_HEIGHT, Player, REAL_PACE, WALK_SPEED } from './player';
import { makeRover, makeSampleSite } from './props';
import { World } from './world';

export const TIME_SCALE = WALK_SPEED / REAL_PACE;
const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const low = matchMedia('(pointer: coarse)').matches || params.has('low');
const renderer = new THREE.WebGLRenderer({ antialias: !low, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
$('view').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.15, 400000);

async function main() {
  const world = await World.load(m => $('loading').textContent = m, low);
  const [sand, orbital] = await Promise.all([
    loadRaster(world.meta.layers.sand.raw, world.meta.layers.sand.bounds),
    loadRaster(world.meta.images.ortho.file, world.meta.images.ortho.bounds),
  ]);
  const controls = new Controls(renderer.domElement);
  const camp = world.place('forward_camp'), stop = world.place('stop_vera_rubin_ridge');
  const home = {e:camp.easting,n:camp.northing}, site = {e:stop.easting,n:stop.northing};
  const startUtc=nextLocalTime(Date.UTC(2041,5,1),toLonLat(site.e,site.n).lon,14.5);
  const rover = makeRover(), sample = makeSampleSite();
  world.worldPos(home.e,home.n,0,rover.position);
  world.worldPos(site.e,site.n,0,sample.position);
  sample.getObjectByName('sample')!.visible = false;
  world.scene.add(rover,sample);
  const hud = new Hud(world,dataUrl(world.meta.images.color.file));
  const pano = new Panorama();
  $('panorama').appendChild(pano.canvas);
  let player: Player, nav: Nav;
  let phase: 'brief'|'return'|'done' = 'brief';
  let missionS=0, oxygen=1800, elapsed=0, dust=0.42, scanT=-1;
  let scanStatus='周囲をスキャンして位置を推定', message='', messageUntil=0;
  function say(text: string) { message=text;messageUntil=elapsed+8; }
  function reset() {
    player=new Player();player.e=site.e;player.n=site.n;
    controls.yaw=bearing(site.e,site.n,home.e,home.n)+0.3;controls.pitch=0;
    controls.mapOpen=false;hud.toggleMap(false);
    nav=new Nav(world,sand,orbital,player,Math.floor(Math.random()*1e6)+1);
    missionS=elapsed=0;oxygen=1800;dust=0.42;scanT=-1;phase='brief';
    scanStatus='周囲をスキャンして位置を推定';message='';messageUntil=0;
    pano.reset();$('scanCapture').hidden=true;
  }
  function begin() {
    $('start').style.display='none';$('end').style.display='none';phase='return';controls.enabled=true;hud.show(true);
    if(!controls.touch) controls.capture();
    say('試料回収済み。基地へ帰還してください。右クリックで周囲をスキャン、Mで全域マップ。');
  }
  function toggleMap() {
    if(phase!=='return')return;
    hud.toggleMap();controls.mapOpen=hud.mapOpen;controls.release();
    if(!hud.mapOpen&&!controls.touch)controls.capture();
  }
  function scan() {
    if(phase!=='return'||hud.mapOpen||scanT>=0)return;
    controls.update();
    if(Math.hypot(controls.moveX,controls.moveY)>0.05){say('スキャンするには立ち止まってください。');return;}
    scanT=0;pano.reset();$('scanCapture').hidden=false;
    scanStatus='撮影 0 / 5 · 360°パノラマ';
  }
  controls.onMap=toggleMap;controls.onScan=scan;
  $('mapBtn').addEventListener('click',toggleMap);$('closeMap').addEventListener('click',toggleMap);
  $('scanBtn').addEventListener('click',scan);
  function finish(success: boolean) {
    phase='done';scanT=-1;controls.enabled=false;controls.release();hud.toggleMap(false);controls.mapOpen=false;hud.show(false);
    $('endTitle').textContent=success?'試料とともに、基地へ帰還。':'酸素が尽きました。';
    $('endStats').textContent=`歩行 ${Math.round(player.walked)} m · ミッション ${Math.floor(missionS/60)} 分 · スキャン ${nav.region.pins.length} 回 · 残り酸素 ${Math.max(0,Math.ceil(oxygen/60))} 分`;
    $('end').style.display='flex';
  }
  function tick(dt:number) {
    const active=phase==='return'&&!hud.mapOpen&&!document.hidden;
    if(active) {
      elapsed+=dt;missionS+=dt*TIME_SCALE;
      controls.update();
      const moving=Math.hypot(controls.moveX,controls.moveY)>0.05;
      if(scanT>=0&&moving){scanT=-1;scanStatus='撮影中断 · 移動を検出';say('立ち止まって、もう一度スキャンしてください。');}
      player.update(dt*(nav.isSand(player.e,player.n)?0.65:1),controls,world);
      nav.update(player);
      oxygen-=dt*TIME_SCALE*(nav.isSand(player.e,player.n)&&moving?1.3:1);
      // A soft ten-second gust every 42 seconds, never a near-field blackout.
      const cycle=elapsed%42;
      const gust=cycle>28&&cycle<40?Math.sin((cycle-28)/12*Math.PI)**2:0;
      dust=0.42+0.2*gust;
      if(Math.hypot(player.e-home.e,player.n-home.n)<12)finish(true);
      else if(oxygen<=0)finish(false);
    }
    world.worldPos(player.e,player.n,EYE_HEIGHT+(scanT>=0?0:Math.sin(player.bob*1.9)*0.05),camera.position);
    camera.rotation.set(controls.pitch,-controls.yaw,0,'YXZ');camera.updateMatrixWorld();
    world.setSky(startUtc+missionS*1000,player.e,player.n,dust,camera);
    if(active&&phase==='return'&&scanT>=0) {
      scanT+=dt;
      if(pano.pairs<5&&scanT>pano.pairs*0.75) {
        pano.capture(renderer,world.scene,camera.position);
        scanStatus=`撮影 ${pano.pairs} / 5 · 360°パノラマ`;
      }
      if(scanT>3.9) scanStatus='軌道画像・地形を照合中…';
      if(scanT>4.5) {
        const {pin,match}=nav.scan(player,dust,missionS);
        scanStatus=`#${pin.id} ${pin.improved?'位置推定を更新':'円の縮小なし'} · 照合品質 ${Math.round(match.quality*100)}%`;
        say(pin.improved?`存在可能性円を半径 ${Math.ceil(pin.radius)} m に更新。地図に #${pin.id} を保存しました。`:'十分な新しい情報が得られませんでした。開けた地形へ移動して再スキャンしてください。');
        scanT=-1;
      }
    }
    if(phase==='return') hud.update(nav,home,{time:missionS,oxygen,dust,scan:scanStatus,message:elapsed<messageUntil?message:'',heading:controls.yaw});
    renderer.render(world.scene,camera);
  }
  reset();
  $('loading').style.display='none';$('start').style.display='flex';
  $('startBtn').addEventListener('click',begin);
  $('againBtn').addEventListener('click',()=>{reset();begin();});
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  if(params.has('debug')) (window as unknown as Record<string,unknown>).__mw={world,controls,camera,renderer,home,site,hud,begin,scan,tick,reset,
    get player(){return player;},get nav(){return nav;},get state(){return{phase,missionS,oxygen,dust,elapsed,scanT};}};
  let last=performance.now();
  renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,0.1);last=now;if(!params.has('manual'))tick(dt);});
  tick(0);
}
main().catch(err=>{console.error(err);$('loading').textContent=`Could not start: ${err.message}`;});
