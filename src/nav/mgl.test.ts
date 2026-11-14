import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchTerrain, scanQuality, type Observation, type Surface } from './mgl.ts';
import { PositionRegion } from './region.ts';

test('quality increases monotonically as each independent requirement improves', () => {
  const factors={coverage:.5,contrast:.5,clarity:.5,orientation:.5,uniqueness:.5};
  for(const key of Object.keys(factors)) {
    assert(scanQuality({...factors,[key]:.9})>scanQuality(factors));
    assert(scanQuality({...factors,[key]:.1})<scanQuality(factors));
  }
});
test('motion grows uncertainty, stationary time does not; history pins are immutable and off-centre', () => {
  for(let seed=1;seed<=100;seed++) {
    const truth={e:0,n:0},region=new PositionRegion(truth,seed);
    const start=region.current.radius;
    region.move(0,0);assert.equal(region.current.radius,start);
    for(let i=0;i<200;i++) {
      const course=i*.15;truth.e+=Math.sin(course)*4;truth.n+=Math.cos(course)*4;
      region.move(4,course);
      assert(Math.hypot(region.current.e-truth.e,region.current.n-truth.n)<region.current.radius);
    }
    assert(region.current.radius>start);
    const pin=region.record(truth,{accepted:true,position:{e:truth.e+3,n:truth.n-2},radius:18,quality:.9},100);
    assert(pin.improved);assert(pin.radius<start);
    const offset=Math.hypot(pin.e-truth.e,pin.n-truth.n);
    assert(offset>0&&offset<pin.radius);
    const copy={...pin};region.move(100,0);assert.deepEqual(pin,copy);assert(Object.isFrozen(pin));
    const before={...region.current};
    const failed=region.record(truth,{accepted:false,position:{e:1000,n:1000},radius:1,quality:0},200);
    assert(!failed.improved);assert.deepEqual(region.current,before);
  }
});
const terrain:Surface={
  intensity:(e,n)=>.5+.16*Math.sin(e*.43)+.12*Math.cos(n*.29)+.07*Math.sin((e+n)*.71),
  elevation:(e,n)=>Math.sin(e*.08)*3+Math.cos(n*.11)*2,
};
function observation(surface:Surface,e:number,n:number):Observation {
  const samples=[];
  for(let a=0;a<32;a++)for(const radius of [5,12,22,38]) {
    const de=Math.sin(a*Math.PI/16)*radius,dn=Math.cos(a*Math.PI/16)*radius;
    samples.push({de,dn,intensity:surface.intensity(e+de,n+dn),height:surface.elevation(e+de,n+dn)});
  }
  return {samples,coverage:1,contrast:1,clarity:1,orientation:1};
}
test('orbital matching recovers an offset position from local measurements without truth input', () => {
  const obs=observation(terrain,10,-6);
  const match=matchTerrain(obs,terrain,{e:25,n:12,radius:60});
  assert(match.accepted);
  assert(Math.hypot(match.position.e-10,match.position.n+6)<3);
});
test('blank/repeating terrain, missing observations and poor coverage cannot produce a fix', () => {
  const flat:Surface={intensity:()=>.5,elevation:()=>0};
  const prior={e:0,n:0,radius:60};
  assert(!matchTerrain(observation(flat,0,0),flat,prior).accepted);
  assert(!matchTerrain({...observation(terrain,0,0),samples:[],coverage:0},terrain,prior).accepted);
  assert(!matchTerrain({...observation(terrain,0,0),coverage:.1},terrain,prior).accepted);
});
