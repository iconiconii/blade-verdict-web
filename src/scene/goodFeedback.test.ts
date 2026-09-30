import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createCombat, type CombatFeedback, type CombatState } from '../domain/combat';
import { SliceEffects } from './SliceEffects';

it('keeps the GOOD comic burst peripheral, bounded and specific to the latest contact',()=>{
  const scene=new THREE.Scene(),effects=new SliceEffects(scene,'corn');
  const event:CombatFeedback={id:1,kind:'Nice',amount:0,position:{x:.5,y:.5},energyGain:0,angle:0,time:0};
  const state:CombatState={...createCombat(),phase:'impact',time:85,feedback:event,effects:[event]};
  const render=(state:CombatState,reduced=false)=>effects.update(state,reduced,()=>({x:195,y:420}),390,844);
  render(state);
  const comic=scene.getObjectByName('good-comic-impact')!;
  expect(comic.visible).toBe(true);
  expect(comic.children.filter(child=>child.name==='good-peripheral-speed-line')).toHaveLength(16);
  expect((comic.getObjectByName('good-food-fragments') as THREE.InstancedMesh).count).toBe(7);
  const ray= comic.getObjectByName('good-peripheral-speed-line') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
  expect(ray.material.opacity).toBeLessThan(.3);
  expect(Math.hypot(ray.position.x-195,ray.position.y+844*.55)).toBeGreaterThan(110);
  const before=ray.position.clone();render({...state,paused:true});expect(ray.position.equals(before)).toBe(true);
  render(state,true);expect(comic.visible).toBe(false);
  render({...state,time:250});expect(comic.visible).toBe(false);
  render({...state,battle:{...state.battle,bossHp:0}});expect(comic.visible).toBe(false);
  render({...state,phase:'verdictSlash'});expect(comic.visible).toBe(false);
  const perfect={...event,id:2,kind:'Perfect' as const};
  render({...state,feedback:perfect,effects:[perfect]});expect(comic.visible).toBe(false);
  const relay={...event,id:3,kind:'Miss' as const,contactResult:'Nice' as const};
  render({...state,feedback:relay,effects:[relay]});expect(comic.visible).toBe(true);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  scene.traverse(object=>{
    if(object instanceof THREE.Mesh||object instanceof THREE.Line){
      geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));
    }
    if(object instanceof THREE.InstancedMesh)object.dispose();
  });
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
});
