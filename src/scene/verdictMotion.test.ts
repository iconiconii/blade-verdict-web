import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyContinuousCut, createCombat, durations, startVerdict, tapTarget, tickCombat } from '../domain/combat';
import type { BossKind } from '../domain/v2';
import { CornGuardian } from './CornGuardian';
import { JellyGuardian } from './JellyGuardian';
import { verdictMotion } from './verdictMotion';
import { MonsterHitArea } from './MonsterHitArea';
import { makeBattleCamera, projectPoint } from './layout';

const guardians:Array<CornGuardian|JellyGuardian>=[];
function actor(kind:BossKind){
  const guardian=kind==='corn'?new CornGuardian():new JellyGuardian();
  guardians.push(guardian);return guardian;
}
function ready(kind:BossKind){
  const s=createCombat(7319,kind);
  return {...s,phase:'verdictReady' as const,battle:{...s.battle,meter:100}};
}
function pose(g:CornGuardian|JellyGuardian){
  const values:number[]=[];
  g.root.traverse(o=>values.push(...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()));
  return values;
}
afterEach(()=>{
  for(const g of guardians.splice(0)){
    const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    g.root.traverse(o=>{
      if(o instanceof THREE.Mesh){geometry.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}
      if(o instanceof THREE.InstancedMesh)o.dispose();
    });
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
});

describe.each(['corn','jelly'] as const)('%s verdict animation',kind=>{
  it('keeps a living vulnerable pose even without cutting',()=>{
    const g=actor(kind);
    for(const initial of [ready(kind),startVerdict(ready(kind))]){
      g.update(tickCombat(initial,240));const first=pose(g);
      g.update(tickCombat(initial,480));expect(pose(g)).not.toEqual(first);
    }
  });
  it('distinguishes opposite horizontal and vertical cuts',()=>{
    const g=actor(kind),s=startVerdict(ready(kind));
    for(const angle of [0,Math.PI/2]){
      g.update(tickCombat(applyContinuousCut(s,{x:.5,y:.5},true,angle),90));const first=pose(g);
      g.update(tickCombat(applyContinuousCut(s,{x:.5,y:.5},true,angle+Math.PI),90));
      expect(pose(g)).not.toEqual(first);
    }
  });
  it('produces the same pose with batched or individually rendered rapid cuts',()=>{
    const g=actor(kind);let s=startVerdict(ready(kind));
    for(let i=0;i<6;i++){
      s=applyContinuousCut(s,{x:.5,y:.5},true,0);g.update(s);
      s=tickCombat(s,40);g.update(s);
    }
    const fresh=actor(kind);fresh.update(s);
    expect(pose(g)).toEqual(pose(fresh));
    g.update(s);expect(pose(g)).toEqual(pose(fresh));
  });
  it('freezes motion with the simulation when paused',()=>{
    const g=actor(kind);
    const hit=tickCombat(applyContinuousCut(startVerdict(ready(kind)),{x:.5,y:.5},true),90);
    g.update(hit);const first=pose(g);
    g.update(tickCombat({...hit,paused:true},1000));expect(pose(g)).toEqual(first);
  });
  it('accumulates rapid hits instead of resetting and rebounds when cutting stops',()=>{
    const s=startVerdict(ready(kind));let rapid=s;
    for(let i=0;i<6;i++){
      if(i)rapid=tickCombat(rapid,40);
      rapid=applyContinuousCut(rapid,{x:.5,y:.5},true,0);
    }
    rapid=tickCombat(rapid,16);
    const single=tickCombat(applyContinuousCut(s,{x:.5,y:.5},true,0),216);
    expect(verdictMotion(rapid).energy).toBeGreaterThan(verdictMotion(single).energy);
    expect(verdictMotion(rapid).x).toBeGreaterThan(verdictMotion(single).x);
    expect(verdictMotion({...rapid,effects:[...rapid.effects,...rapid.effects]})).toEqual(verdictMotion(rapid));
    const rebound=tickCombat(applyContinuousCut(s,{x:.5,y:.5},true,0),300);
    expect(verdictMotion(rebound).compression).toBeLessThan(0);
    expect(verdictMotion(tickCombat(rebound,400)).energy).toBe(0);
  });
  it('reduces motion without losing the readable pain expression',()=>{
    const s=tickCombat(applyContinuousCut(startVerdict(ready(kind)),{x:.5,y:.5},true,0),80);
    const normal=verdictMotion(s),reduced=verdictMotion(s,true);
    expect(reduced.x).toBeCloseTo(normal.x*.18);
    expect(reduced.compression).toBeCloseTo(normal.compression*.18);
    expect(reduced.breath).toBe(0);expect(reduced.pain).toBe(normal.pain);
  });
  it.each([[390,844],[1280,800]])('keeps the touch volume stable through deformation at %ix%i', (width,height)=>{
    const g=actor(kind),area=new MonsterHitArea(g.root),camera=makeBattleCamera(width,height);
    const grid=Array.from({length:41*41},(_,i)=>({x:(i%41)/40,y:Math.floor(i/41)/40}));
    area.update(camera);const before=grid.map(p=>area.contains(p));
    let s=startVerdict(ready(kind));
    for(let i=0;i<9;i++)s=applyContinuousCut(s,{x:.5,y:.5},true,0);
    g.update(tickCombat(s,80));area.update(camera);
    expect(grid.map(p=>area.contains(p))).toEqual(before);
    // Visible body anchors remain inside this stable, forgiving input volume.
    for(const id of ['head','belly'] as const){
      expect(area.contains(projectPoint(g.getAnchor(id).getWorldPosition(new THREE.Vector3()),camera))).toBe(true);
    }
    // It follows actual stage placement and camera changes, not a fixed screen rectangle.
    g.root.position.x=1;area.update(camera);
    expect(grid.map(p=>area.contains(p))).not.toEqual(before);
    g.root.position.x=0;area.update(makeBattleCamera(height,width));
    expect(grid.map(p=>area.contains(p))).not.toEqual(before);
  });
  it('changes the face on break and restores it before the next clickable ring',()=>{
    const g=actor(kind);let s=startVerdict(ready(kind));
    g.update(s);
    const mouth=g.root.getObjectByName(`${kind}-pain-mouth`);
    expect(mouth).toBeDefined();expect(mouth?.visible).toBe(true);
    s=tickCombat(s,durations.verdict);g.update(s);
    s=tickCombat(s,durations.stagger);s=tickCombat(s,s.tempo.telegraphMs);g.update(s);
    expect(mouth?.visible).toBe(false);
    expect(tapTarget(s,0).feedback?.kind).toBe('Nice');
    const fresh=actor(kind);fresh.update(s);expect(pose(g)).toEqual(pose(fresh));
  });
  it('keeps geometry finite and positive through maximum cuts, recovery and death',()=>{
    const g=actor(kind);let s=startVerdict(ready(kind));
    for(let i=0;i<17;i++)s=applyContinuousCut(s,{x:.5,y:.5},true,i%2?Math.PI:0);
    expect(s.verdictDamageDealt).toBe(200);expect(s.phase).toBe('stagger');
    for(const elapsed of [0,50,150,299]){
      g.update({...s,elapsed,time:s.time+elapsed});
      expect(pose(g).every(Number.isFinite)).toBe(true);
      g.root.traverse(o=>expect(Math.min(o.scale.x,o.scale.y,o.scale.z)).toBeGreaterThan(0));
    }
    g.update({...s,phase:'settle',battle:{...s.battle,bossHp:0}});
    expect(g.root.getObjectByName(`${kind}-pain-mouth`)?.visible).toBe(false);
    expect(g.root.getObjectByName(kind==='corn'?'corn-mouth':'jelly-smile')?.visible).toBe(false);
  });
});
