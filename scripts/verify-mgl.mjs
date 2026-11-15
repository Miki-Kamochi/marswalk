/** Headless numerical integration check against the committed NASA imagery and DEM. */
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {Nav}=await server.ssrLoadModule('/src/game/nav.ts');
  const {HeightGrid,Raster}=await server.ssrLoadModule('/src/data/loader.ts');
  const meta=JSON.parse(readFileSync('public/data/meta.json','utf8'));
  const places=JSON.parse(readFileSync('public/data/positions.json','utf8')).places;
  const dem=readFileSync('public/data/'+meta.grids.play.file);
  const grid=new HeightGrid(meta.grids.play,new Uint16Array(dem.buffer.slice(dem.byteOffset,dem.byteOffset+dem.byteLength)));
  // Windows ships this image decoder; no additional Python or npm dependencies.
  const decode=`Add-Type -AssemblyName System.Drawing
    $bitmap = [Drawing.Bitmap]::new((Join-Path (Get-Location) 'public/data/${meta.images.ortho.file}'))
    $rect = [Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height)
    $data = $bitmap.LockBits($rect,[Drawing.Imaging.ImageLockMode]::ReadOnly,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bytes = [byte[]]::new($data.Stride * $bitmap.Height)
    [Runtime.InteropServices.Marshal]::Copy($data.Scan0,$bytes,0,$bytes.Length)
    $stream = [Console]::OpenStandardOutput()
    $stream.Write([BitConverter]::GetBytes([uint32]$bitmap.Width),0,4)
    $stream.Write([BitConverter]::GetBytes([uint32]$bitmap.Height),0,4)
    $stream.Write($bytes,0,$bytes.Length)
    $bitmap.UnlockBits($data); $bitmap.Dispose()`;
  const raw=execFileSync('powershell.exe',['-NoProfile','-Command',decode],{maxBuffer:64*1024*1024,windowsHide:true});
  for(let i=8;i<raw.length;i+=4){const blue=raw[i];raw[i]=raw[i+2];raw[i+2]=blue;}
  const orbital=new Raster(meta.images.ortho.bounds,raw.readUInt32LE(0),raw.readUInt32LE(4),new Uint8ClampedArray(raw.subarray(8)));
  const sand={index:()=>-1,rgba:[]};
  const world={dataElevation:(e,n)=>grid.sample(e,n)};
  const site=places.find(p=>p.id==='stop_vera_rubin_ridge');
  const base=places.find(p=>p.id==='forward_camp');
  const results=[];
  for(const t of [0,.25,.5,.75,1]) {
    const player={e:site.easting+(base.easting-site.easting)*t,n:site.northing+(base.northing-site.northing)*t,lastStep:0,lastCourse:0};
    const nav=new Nav(world,sand,orbital,player,42);
    const before=nav.region.current.radius;
    const start=performance.now();
    const result=nav.scan(player,.42,0);
    const error=Math.hypot(result.pin.e-player.e,result.pin.n-player.n);
    assert(error<=result.pin.radius,'real-data scan must contain truth');
    assert(error>.01,'real-data pin must be off-centre');
    const repeat=nav.scan(player,.42,1);
    assert(!repeat.pin.improved,'stationary re-scan must not reduce uncertainty again');
    results.push({t,before,after:result.pin.radius,improved:result.pin.improved,quality:result.match.quality,coverage:result.match.coverage,uniqueness:result.match.uniqueness,error,ms:Math.round(performance.now()-start)});
  }
  assert(results.some(r=>r.improved),'at least one return-route scan should improve localization');
  console.log(JSON.stringify(results,null,2));
} finally {await server.close();}
