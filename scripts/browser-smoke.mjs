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
    check(g.state.phase==='return','return-only start');
    check(Math.hypot(g.player.e-g.site.e,g.player.n-g.site.n)<.01,'spawn at collected sample');
    check(!!g.world.scene.getObjectByName('Mars_view_STL_backdrop'),'STL loaded');
    const initial=g.nav.region.current.radius;
    dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
    for(let i=0;i<100;i++)g.tick(.1);
    dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));g.tick(0);
    check(g.nav.region.current.radius>initial,'movement expands region');
    const beforeScan=g.nav.region.current.radius;
    g.renderer.domElement.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));
    for(let i=0;i<50;i++)g.tick(.1);
    check(g.nav.region.pins.length===1,'right-click creates scan pin');
    const pin=g.nav.region.pins[0];
    check(Math.hypot(pin.e-g.player.e,pin.n-g.player.n)<pin.radius,'pin contains truth');
    check(Math.hypot(pin.e-g.player.e,pin.n-g.player.n)>.01,'pin is not true position');
    const saved=JSON.stringify(pin);
    dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM'}));
    check(g.hud.mapOpen&&!document.getElementById('mapOverlay').hidden,'M opens map');
    const oxygen=g.state.oxygen;g.tick(1);check(g.state.oxygen===oxygen,'map pauses oxygen');
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
    for(let i=0;i<350;i++)g.tick(.1);
    check(g.world.fog.density<.0004,'gust stays gentle');
  })()`);
  shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(profile,'game.png'),Buffer.from(shot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`dispatchEvent(new Event('resize'));__mw.tick(0);`);
  shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(join(profile,'mobile.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`(() => {const g=__mw;g.player.e=g.home.e;g.player.n=g.home.n;g.tick(.1);if(g.state.phase!=='done')throw Error('base return completion');document.getElementById('againBtn').click();g.tick(0);if(g.state.phase!=='return'||g.nav.region.pins.length!==0)throw Error('restart');for(let i=0;i<500;i++)g.tick(1);if(g.state.phase!=='done'||!document.getElementById('endTitle').textContent.includes('酸素'))throw Error('oxygen failure');})()`);
  assert.deepEqual(errors,[],'Uncaught browser exceptions');
  console.log(`PASS: start, movement, right-click scan, containment, map toggle/pause, fixed history, scan cancellation, gust, completion, restart, oxygen failure. Screenshots: ${profile}`);
} catch(error) { console.error(browserLog.slice(-3000));throw error; }
finally {socket?.close();browser.kill();}
