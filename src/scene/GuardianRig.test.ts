import { expect,it } from 'vitest';
import { createCombat, startVerdict, applyContinuousCut } from '../domain/combat';
import { createGuardianRig, guardianStateFor, guardianPoseFor } from './GuardianRig';
import { CornGuardian } from './CornGuardian';
import { JellyGuardian } from './JellyGuardian';

it('exposes a shared rig contract and state priority',()=>{
  const rig=createGuardianRig('test');
  expect(rig.poseRoot.children).toContain(rig.visualRoot);
  expect(rig.root.children).toContain(rig.hitProxy);
  const base=createCombat();
  expect(guardianStateFor(base)).toBe('Idle');
  const breakState=startVerdict({...base,phase:'verdictReady',battle:{...base.battle,meter:100}});
  expect(guardianStateFor(breakState)).toBe('Break');
  const dead=applyContinuousCut({...breakState,battle:{...breakState.battle,bossHp:12}},{x:.5,y:.5},true);
  expect(guardianStateFor(dead)).toBe('Dead');
  expect(guardianPoseFor(dead).state).toBe('Dead');
});

it('exposes articulated corn limbs and three-segment jelly tentacles',()=>{
  const corn=new CornGuardian(),jelly=new JellyGuardian();
  expect(corn.root.getObjectByName('corn-upper-arm')).toBeTruthy();
  expect(corn.root.getObjectByName('corn-thigh')).toBeTruthy();
  expect(corn.root.getObjectByName('corn-cob-undercoat')).toBeTruthy();
  expect(corn.root.getObjectByName('corn-top-cut')).toBeTruthy();
  expect(corn.root.getObjectByName('corn-wooden-spatula')).toBeTruthy();
  expect(corn.root.getObjectByName('corn-round-shield')).toBeTruthy();
  expect(corn.root.getObjectByName('corn-husk-cloak')).toBeTruthy();
  expect(corn.getAnchor('leftHand')?.parent?.name).toBe('corn-left-hand');
  expect(corn.getAnchor('rightHand')?.parent?.name).toBe('corn-right-hand');
  const spatula = corn.root.getObjectByName('corn-wooden-spatula');
  expect(spatula?.parent?.name).toBe('corn-left-hand');
  expect(spatula?.position.z).toBeGreaterThan(.3);
  expect(jelly.root.getObjectByName('jelly-fin-left-segment-0')).toBeTruthy();
  expect(jelly.root.getObjectByName('jelly-fin-right-segment-2')).toBeTruthy();
});
