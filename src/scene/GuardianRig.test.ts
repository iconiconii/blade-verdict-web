import { expect,it } from 'vitest';
import { createCombat, startVerdict, applyContinuousCut } from '../domain/combat';
import { createGuardianRig, guardianStateFor, guardianPoseFor } from './GuardianRig';

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
