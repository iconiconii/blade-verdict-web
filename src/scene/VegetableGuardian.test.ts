import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyContinuousCut, createCombat, startVerdict } from '../domain/combat';
import { CarrotGuardian, CabbageGuardian, TomatoGuardian, type VegetableGuardian } from './VegetableGuardian';

const guardians:VegetableGuardian[]=[];
const make=(kind:'carrot'|'cabbage'|'tomato')=>{
  const guardian=kind==='carrot'?new CarrotGuardian():kind==='cabbage'?new CabbageGuardian():new TomatoGuardian();
  guardians.push(guardian);return guardian;
};
const dispose=(guardian:VegetableGuardian)=>{
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  guardian.root.traverse(object=>{
    if(object instanceof THREE.Mesh){geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));}
    if(object instanceof THREE.InstancedMesh)object.dispose();
  });
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
};
afterEach(()=>{for(const guardian of guardians.splice(0))dispose(guardian)});

describe.each(['carrot','cabbage','tomato'] as const)('%s guardian',kind=>{
  it('builds an identifiable smooth model with the shared rig contract',()=>{
    const guardian=make(kind);
    expect(guardian.root.name).toBe(`${kind}-guardian-3d`);
    expect(guardian.root.getObjectByName(`${kind}-surface`)).toBeTruthy();
    expect(guardian.root.getObjectByName(`${kind}-face`)).toBeTruthy();
    expect(guardian.root.getObjectByName(`${kind}-pain-mouth`)).toBeTruthy();
    expect(guardian.rig.hitProxy.visible).toBe(false);
    expect(guardian.getAnchor('head')).toBeTruthy();
    expect(guardian.getAnchor('belly')).toBeTruthy();
    const surface=guardian.root.getObjectByName(`${kind}-surface`);
    expect(surface instanceof THREE.Mesh).toBe(true);
    expect((surface as THREE.Mesh).geometry.getAttribute('position').count).toBeGreaterThan(100);
    const bounds=new THREE.Box3().setFromObject(guardian.root);
    expect(bounds.min.y).toBeCloseTo(-.1,1);
    expect(bounds.max.y-bounds.min.y).toBeGreaterThan(2.35);
    expect(bounds.max.y-bounds.min.y).toBeLessThan(2.75);
    expect(Object.keys(guardian.anchors)).toHaveLength(8);
    const detailNames=kind==='carrot'
      ?['carrot-root-groove-0','carrot-root-hair-0','carrot-leaf-blade-0','carrot-trident-tine']
      :kind==='cabbage'
        ?['cabbage-leaf-stalk','cabbage-leaf-0','cabbage-vein-0','cabbage-pin-knob-right']
        :['tomato-top-dimple','tomato-top-rim','tomato-curved-stem','tomato-calyx-0'];
    detailNames.forEach(name=>expect(guardian.root.getObjectByName(name)).toBeTruthy());
    if(kind==='tomato'){
      const tomatoSurface=surface as THREE.Mesh;
      expect(tomatoSurface.material instanceof THREE.MeshPhysicalMaterial).toBe(true);
      expect((tomatoSurface.material as THREE.MeshPhysicalMaterial).clearcoat).toBeGreaterThan(.5);
    }
  });

  it('keeps finite articulated poses while receiving verdict cuts',()=>{
    const guardian=make(kind);
    const base=createCombat(7319,kind),ready={...base,phase:'verdictReady' as const,battle:{...base.battle,meter:100}};
    let state=startVerdict(ready);
    for(const angle of [0,Math.PI/2,-.7])state=applyContinuousCut(state,{x:.5,y:.5},true,angle);
    guardian.update(state);guardian.root.updateMatrixWorld(true);
    const values:number[]=[];
    guardian.root.traverse(object=>values.push(...object.position.toArray(),...object.quaternion.toArray(),...object.scale.toArray()));
    expect(values.every(Number.isFinite)).toBe(true);
    guardian.root.traverse(object=>expect(Math.min(object.scale.x,object.scale.y,object.scale.z)).toBeGreaterThan(0));
  });

  it('rebuilds the rest pose when time moves back to idle',()=>{
    const guardian=make(kind);
    const base=createCombat(9911,kind);
    const actor=guardian.root.getObjectByName(`${kind}-reaction-rig`) as THREE.Group;
    const initial={position:actor.position.clone(),rotation:actor.rotation.clone(),scale:actor.scale.clone()};
    const hit=startVerdict({...base,phase:'verdictReady' as const,battle:{...base.battle,meter:100}});
    guardian.update({...hit,time:hit.time+90});
    guardian.update({...base,time:base.time+120});
    expect(actor.position.distanceTo(initial.position)).toBeLessThan(1e-8);
    expect(actor.rotation.x).toBeCloseTo(initial.rotation.x,8);
    expect(actor.rotation.y).toBeCloseTo(initial.rotation.y,8);
    expect(actor.rotation.z).toBeCloseTo(initial.rotation.z,8);
    expect(actor.scale.distanceTo(initial.scale)).toBeLessThan(1e-8);
  });
});
