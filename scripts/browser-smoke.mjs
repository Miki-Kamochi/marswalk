/** Isolated, headless Chromium smoke test. Does not attach to a user's browser profile. */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const executable=process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert(existsSync(executable),'Set CHROME_PATH to an installed Chromium executable');
const profile=await mkdtemp(join(tmpdir(),'marswalk-smoke-'));
const browser=spawn(executable,['--headless=new','--use-gl=angle','--use-angle=swiftshader','--in-process-gpu','--disable-gpu-shader-disk-cache','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--window-size=1280,800','about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
let browserLog='';browser.stderr.on('data',d=>browserLog+=d.toString());
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try {
  let port;
  for(let i=0;i<80;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await delay(250);}}
  assert(port,'Headless browser did not start');
  const tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map(),errors=[];
  socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(data.error):p.resolve(data.result);}else if(data.method==='Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);};
  socket.onclose=e=>{for(const p of pending.values())p.reject(new Error(`CDP closed: ${e.code} ${e.reason}`));pending.clear();};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timeout=setTimeout(()=>{pending.delete(key);reject(new Error(`CDP timeout: ${method}`));},20000);pending.set(key,{resolve:r=>{clearTimeout(timeout);resolve(r);},reject:e=>{clearTimeout(timeout);reject(e);}});socket.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:`${process.env.MARSWALK_URL??'http://127.0.0.1:5174'}/?debug&manual&low`});
  for(let i=0;i<120;i++){if(await evaluate('!!window.__mw'))break;await delay(250);}
  assert(await evaluate('!!window.__mw'),'Game failed to load');
  const summary=await evaluate(`(() => {
    const g=window.__mw,check=(condition,name)=>{if(!condition)throw Error(name)};
    g.begin();g.tick(0);
    check(g.state.phase==='collect','collection mission start');
    check(Math.hypot(g.player.e-g.start.e,g.player.n-g.start.n)<.01,'spawn at lower-right start');
    check(!!g.world.scene.getObjectByName('Mars_view_STL_backdrop'),'STL loaded');
    const initial=g.nav.region.current.radius;
    dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
    for(let i=0;i<100;i++)g.tick(.1);
    dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));g.tick(0);
    check(g.nav.region.current.radius>initial,'movement expands region');
    const beforeScan=g.nav.region.current.radius;
    g.setSpeed(16);const scanClock=g.state.missionS;
    g.renderer.domElement.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));
    for(let i=0;i<50;i++)g.tick(.1);
    check(Math.abs(g.state.missionS-scanClock-20)<.1,'scan clock is fixed at 4x');
    check(g.nav.region.pins.length===1,'right-click creates scan pin');
    const pin=g.nav.region.pins[0];
    check(Math.hypot(pin.e-g.player.e,pin.n-g.player.n)<pin.radius,'pin contains truth');
    check(Math.hypot(pin.e-g.player.e,pin.n-g.player.n)>.01,'pin is not true position');
    const saved=JSON.stringify(pin);
    while(g.state.fixT>=0)g.tick(.1);
    dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM'}));
    check(g.hud.mapOpen&&!document.getElementById('mapOverlay').hidden,'M opens map');
    const time=g.state.missionS;g.tick(1);check(g.state.missionS===time,'map pauses mission clock');
    dispatchEvent(new KeyboardEvent('keyup',{code:'KeyM'}));
    return {initial,beforeScan,pin,match:g.nav.lastMatch,saved,walked:g.player.walked,triangles:g.renderer.info.render.triangles};
  })()`);
  console.log(JSON.stringify(summary,null,2));
  let shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(profile,'map.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`(() => {
    const g=__mw,check=(c,n)=>{if(!c)throw Error(n)};
    dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));
    check(!g.hud.mapOpen,'Escape closes map');
    const pin=JSON.stringify(g.nav.region.pins[0]);
    dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
    for(let i=0;i<20;i++)g.tick(.1);
    dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));g.tick(0);
    check(JSON.stringify(g.nav.region.pins[0])===pin,'historical pin stays fixed');
    g.scan();dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));g.tick(.1);
    dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));g.tick(0);
    check(g.state.scanT===-1&&g.nav.region.pins.length===1,'motion cancels scan');
    g.setSpeed(8);const beforeTime=g.state.missionS;g.tick(1);
    check(Math.abs(g.state.missionS-beforeTime-8)<.01,'8x scales mission time');
    g.setSpeed(1);const beforeWalk=g.player.walked;
    dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));g.tick(1);dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));g.tick(0);
    check(g.player.walked-beforeWalk<2,'1x scales walking');
  })()`);
  shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(profile,'game.png'),Buffer.from(shot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`dispatchEvent(new Event('resize'));__mw.tick(0);`);
  shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(profile,'mobile.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`(() => {const g=__mw,check=(c,n)=>{if(!c)throw Error(n)};
    for(const target of g.targets){g.player.e=target.e;g.player.n=target.n;g.tick(.1)}
    check(g.state.phase==='done'&&g.state.collected===1,'farthest-site collection completion');
    document.getElementById('againBtn').click();g.tick(0);check(g.state.phase==='collect'&&g.state.collected===0&&g.nav.region.pins.length===0,'restart');
    g.setSpeed(16);for(let i=0;i<Math.ceil(g.timeLimit/16)+1;i++)g.tick(1);
    check(g.state.phase==='done'&&document.getElementById('endTitle').textContent.includes('強制帰還'),'time-limit forced return');})()`);
  assert.deepEqual(errors,[],'Uncaught browser exceptions');
  console.log(`PASS: collection start, speed controls, scan, map pause, fixed history, farthest-site completion, restart and forced return. Screenshots: ${profile}`);
} catch(error) { console.error(browserLog.slice(-3000));throw error; }
finally {socket?.close();browser.kill();}
