import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCombat, prepareRound, tapTarget, tickCombat, type CombatFeedback, type CombatState } from '../domain/combat';
import { CornGuardian } from './CornGuardian';
import { JellyGuardian } from './JellyGuardian';
import { CarrotGuardian, CabbageGuardian, TomatoGuardian } from './VegetableGuardian';
import { goodParryDurationMs, goodStaggerDurationMs, goodStaggerWeight, guardianHitExpression, hitExpressionFor, hitExpressionDurations, parryDuration } from './hitMotion';

const guardians:Array<{ root:THREE.Group; update:(state:CombatState)=>void }>=[];
const feedback=(kind:CombatFeedback['kind']):CombatFeedback=>({
  id:1,kind,amount:0,position:{x:.5,y:.5},energyGain:0,angle:0,time:0,
});
const stateFor=(kind:CombatFeedback['kind'],time=100):CombatState=>({
  ...createCombat(),phase:'impact',time,feedback:feedback(kind),effects:[],
});
const dispose=(root:THREE.Group)=>{
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  root.traverse(object=>{
    if(object instanceof THREE.Mesh){
      geometries.add(object.geometry);
      (Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));
    }
    if(object instanceof THREE.InstancedMesh)object.dispose();
  });
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
};

afterEach(()=>{for(const guardian of guardians.splice(0))dispose(guardian.root)});

describe('hit expression timing',()=>{
  it('keeps the GOOD reaction readable without changing its base recoil duration',()=>{
    expect(goodStaggerDurationMs).toBe(450);
    expect(hitExpressionDurations.Nice).toBe(goodStaggerDurationMs);
    expect(parryDuration('Nice')).toBe(goodParryDurationMs);
    expect(goodStaggerWeight(stateFor('Nice',100))).toBe(1);
    expect(goodStaggerWeight(stateFor('Nice',260))).toBe(1);
    expect(goodStaggerWeight(stateFor('Nice',400))).toBeGreaterThan(0);
    expect(goodStaggerWeight(stateFor('Nice',450))).toBe(0);
    expect(hitExpressionFor('Nice',400).kind).toBe('Good');
    expect(hitExpressionFor('Nice',450).kind).toBe('Idle');
  });

  it('uses the V2 expression durations while retaining legacy jelly timing',()=>{
    expect(hitExpressionDurations.Perfect).toBe(550);
    expect(hitExpressionDurations.Miss).toBe(500);
    expect(parryDuration('Perfect')).toBe(550);
    expect(parryDuration('Perfect','jelly')).toBe(350);
    expect(hitExpressionFor('Perfect',550).kind).toBe('Idle');
    expect(hitExpressionFor('Miss',500).kind).toBe('Idle');
    expect(hitExpressionFor('Perfect',550,'jelly').kind).toBe('Perfect');
    expect(hitExpressionFor('Miss',500,'jelly').kind).toBe('Miss');
  });

  it('synchronizes the GOOD reference pose and expression through landing',()=>{
    expect(goodStaggerWeight(stateFor('Nice',0))).toBeGreaterThan(0);
    expect(goodStaggerWeight(stateFor('Nice',100))).toBe(1);
    expect(goodStaggerWeight(stateFor('Nice',260))).toBe(1);
    expect(goodStaggerWeight(stateFor('Nice',400))).toBeGreaterThan(0);
    expect(goodStaggerWeight(stateFor('Nice',450))).toBe(0);
    expect(guardianHitExpression(stateFor('Nice',450)).kind).toBe('Idle');
    expect(goodStaggerWeight(stateFor('Nice'),true)).toBe(0);
    expect(goodStaggerWeight(stateFor('Perfect'))).toBe(0);
    expect(goodStaggerWeight({...stateFor('Nice'),phase:'verdictSlash'})).toBe(0);
    expect(goodStaggerWeight({...stateFor('Nice'),battle:{...createCombat().battle,bossHp:0}})).toBe(0);
    expect(goodStaggerWeight({...stateFor('Miss'),feedback:{...feedback('Miss'),contactResult:'Nice'}})).toBe(1);
  });
  it('maps all three ring outcomes to readable one-shot states',()=>{
    expect(hitExpressionFor('Nice',hitExpressionDurations.Nice/2)).toEqual({kind:'Good',weight:1});
    expect(hitExpressionFor('Perfect',hitExpressionDurations.Perfect/2)).toEqual({kind:'Perfect',weight:1});
    expect(hitExpressionFor('Miss',hitExpressionDurations.Miss/2)).toEqual({kind:'Miss',weight:1});
    expect(hitExpressionFor('Nice',hitExpressionDurations.Nice)).toEqual({kind:'Idle',weight:0});
    expect(hitExpressionFor('Perfect',0).weight).toBeGreaterThan(.5);
    expect(hitExpressionFor('Cut',20)).toEqual({kind:'Idle',weight:0});
    expect(hitExpressionFor('Nice',NaN)).toEqual({kind:'Idle',weight:0});
  });

  it.each([
    ['corn',()=>new CornGuardian(),'corn'],
    ['jelly',()=>new JellyGuardian(),'jelly'],
    ['carrot',()=>new CarrotGuardian(),'carrot'],
    ['cabbage',()=>new CabbageGuardian(),'cabbage'],
    ['tomato',()=>new TomatoGuardian(),'tomato'],
  ] as const)('gives %s distinct good, perfect and miss faces',(_,make,prefix)=>{
    const guardian=make();guardians.push(guardian);
    const faces=['good','perfect','miss'].map(kind=>guardian.root.getObjectByName(`${prefix}-expression-${kind}`)!);
    for(const [index,kind] of ['Nice','Perfect','Miss'].entries()){
      const state=stateFor(kind as CombatFeedback['kind']);
      guardian.update(state);
      expect(faces.map(face=>face.visible)).toEqual([index===0,index===1,index===2]);
      const before=faces[index].scale.clone();
      guardian.update({...state,time:180});
      expect(faces[index].scale.equals(before)).toBe(false);
      const paused={...state,paused:true};guardian.update(paused);
      const pose=()=>{const values:number[]=[];guardian.root.traverse(object=>values.push(...object.position.toArray(),...object.quaternion.toArray(),...object.scale.toArray()));return values};
      const frozen=pose();guardian.update(tickCombat(paused,1000));
      expect(pose()).toEqual(frozen);
    }
    guardian.update(stateFor('Miss',800));
    expect(faces.every(face=>!face.visible)).toBe(true);
    expect(guardian.root.getObjectByName(prefix==='jelly'?'jelly-smile':`${prefix}-mouth`)?.visible).toBe(true);
    guardian.update({...stateFor('Nice'),feedback:{...feedback('Nice'),contactResult:'Perfect'}});
    expect(faces[1].visible).toBe(true);
    guardian.update(stateFor('Perfect'),true);
    const still=faces[1].scale.clone();
    guardian.update(stateFor('Perfect',180),true);
    expect(faces[1].visible).toBe(true);
    expect(faces[1].scale.equals(still)).toBe(true);
    guardian.update({...stateFor('Perfect'),battle:{...createCombat().battle,bossHp:0}});
    expect(faces.every(face=>!face.visible)).toBe(true);
    guardian.update({...stateFor('Perfect'),phase:'verdictReady'});
    expect(faces.every(face=>!face.visible)).toBe(true);
  });

  it('uses actual ring input and timeout outcomes',()=>{
    const initial=prepareRound(createCombat());
    const active=tickCombat(initial,initial.tempo.telegraphMs);
    expect(guardianHitExpression(tapTarget(active,active.targets[0].circleId)).kind).toBe('Good');
    expect(guardianHitExpression(tapTarget(tickCombat(active,800),active.targets[0].circleId)).kind).toBe('Perfect');
    expect(guardianHitExpression(tickCombat(active,active.targets[0].ringDurationMs)).kind).toBe('Miss');
  });

  it.each([
    ['corn',()=>new CornGuardian()],
    ['carrot',()=>new CarrotGuardian()],
    ['cabbage',()=>new CabbageGuardian()],
    ['tomato',()=>new TomatoGuardian()],
  ] as const)('gives %s a 14-degree stronger Perfect with a wide-eyed shock face',(_,make)=>{
    const guardian=make();guardians.push(guardian);
    guardian.update(stateFor('Perfect',550*.34));
    expect(guardian.rig.poseRoot.rotation.x).toBeCloseTo(THREE.MathUtils.degToRad(14));
    expect(guardian.rig.poseRoot.scale.y).toBeLessThan(.91);
    expect(guardian.root.getObjectByName('perfect-surprise-pupil')).toBeDefined();
    guardian.update(stateFor('Perfect',550));
    expect(guardian.rig.poseRoot.rotation.x).toBeCloseTo(0);
  });

  it('gives corn an open-armed one-foot GOOD pose and resets it without drift',()=>{
    const corn=new CornGuardian();guardians.push(corn);
    const point=(part:THREE.Object3D)=>part.getWorldPosition(new THREE.Vector3());
    const actor=corn.rig.poseRoot;
    const leftFoot=corn.root.getObjectByName('left-knee')!.getObjectByName('corn-foot')!;
    const rightFoot=corn.root.getObjectByName('right-knee')!.getObjectByName('corn-foot')!;
    const leftHand=corn.root.getObjectByName('corn-left-hand')!;
    const rightHand=corn.root.getObjectByName('corn-right-hand')!;
    const idle={...stateFor('Nice',85),feedback:null};
    corn.update(idle);corn.root.updateMatrixWorld(true);
    const idleLeft=point(leftHand),idleRight=point(rightHand),idleRightFoot=point(rightFoot);
    corn.update(stateFor('Nice',85));corn.root.updateMatrixWorld(true);
    expect(actor.rotation.z).toBeGreaterThan(.1);
    expect(point(leftHand).y).toBeGreaterThan(idleLeft.y+.25);
    expect(point(rightHand).y).toBeGreaterThan(idleRight.y+.25);
    expect(point(rightHand).x-point(leftHand).x).toBeGreaterThan(idleRight.x-idleLeft.x+.3);
    expect(point(rightFoot).y).toBeGreaterThan(idleRightFoot.y+.15);
    expect(point(rightFoot).y-point(leftFoot).y).toBeGreaterThan(.15);
    // The slower GOOD curve eases into the one-foot support point during the
    // first 100ms; validate the planted sole once the pose reaches its
    // peak/hold window instead of requiring the final pose during entry.
    for(const age of [100,145,260]){
      corn.update(stateFor('Nice',age));corn.root.updateMatrixWorld(true);
      const sole=leftFoot.localToWorld(new THREE.Vector3(0,-.155,.2));
      expect(sole.distanceTo(new THREE.Vector3(-.31,-.345,.34))).toBeLessThan(1e-8);
    }
    expect(corn.root.getObjectByName('surprised-flushed-cheek')).toBeTruthy();
    const symbols=corn.root.getObjectByName('good-surprise-symbols')!;
    expect(symbols.position.y).toBeGreaterThan(.9);
    expect(corn.root.getObjectByName('surprised-red-mouth')).toBeTruthy();
    corn.update(stateFor('Nice',300));
    const fresh=new CornGuardian();guardians.push(fresh);fresh.update(stateFor('Nice',300));
    const transforms=(root:THREE.Object3D)=>{const values:number[]=[];root.traverse(object=>values.push(...object.position.toArray(),...object.quaternion.toArray(),...object.scale.toArray()));return values};
    expect(transforms(corn.root)).toEqual(transforms(fresh.root));
  });

  it.each([
    ['carrot',()=>new CarrotGuardian()],
    ['cabbage',()=>new CabbageGuardian()],
    ['tomato',()=>new TomatoGuardian()],
    ['jelly',()=>new JellyGuardian()],
  ] as const)('restores %s after the GOOD startle without changing later poses',(_,make)=>{
    const guardian=make(),fresh=make();guardians.push(guardian,fresh);
    guardian.update(stateFor('Nice',85));guardian.update(stateFor('Nice',210));
    const idle={...stateFor('Nice',300),feedback:null};
    guardian.update(idle);fresh.update(idle);
    const transforms=(root:THREE.Object3D)=>{const values:number[]=[];root.traverse(object=>values.push(...object.position.toArray(),...object.quaternion.toArray(),...object.scale.toArray()));return values};
    expect(transforms(guardian.root)).toEqual(transforms(fresh.root));
    for(const kind of ['Perfect','Miss'] as const){
      guardian.update(stateFor(kind));fresh.update(stateFor(kind));
      expect(transforms(guardian.root)).toEqual(transforms(fresh.root));
    }
  });
});
