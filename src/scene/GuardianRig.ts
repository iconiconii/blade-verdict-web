import * as THREE from 'three';
import type { BodyAnchorId } from '../domain/v2';
import type { CombatState } from '../domain/combat';

export type GuardianState='Idle'|'Hit'|'Break'|'Dead';

export interface GuardianPose {
  state:GuardianState;
  hitWeight:number;
  breakWeight:number;
  deadProgress:number;
  hitX:number;
  hitY:number;
  squash:number;
}

export interface GuardianRig {
  root:THREE.Group;
  poseRoot:THREE.Group;
  visualRoot:THREE.Group;
  hitProxy:THREE.Group;
  anchors:Partial<Record<BodyAnchorId,THREE.Object3D>>;
  fxSockets:Record<string,THREE.Object3D>;
}

export function guardianStateFor(combat:CombatState):GuardianState{
  if(combat.battle.bossHp<=0)return 'Dead';
  if(combat.phase==='verdictReady'||combat.phase==='verdictSlash')return 'Break';
  if(combat.feedback?.kind==='Nice'||combat.feedback?.kind==='Perfect')return 'Hit';
  return 'Idle';
}

export function guardianPoseFor(combat:CombatState,hitX=0,hitY=0,squash=0):GuardianPose{
  const state=guardianStateFor(combat);
  const deadProgress=state==='Dead'?THREE.MathUtils.smoothstep(Math.max(0,Math.min(1,(combat.time-(combat.feedback?.time??combat.time))/1250)),0,1):0;
  return {state,hitWeight:state==='Hit'?1:0,breakWeight:state==='Break'?1:0,deadProgress,hitX,hitY,squash};
}

export function createGuardianRig(name:string):GuardianRig{
  const root=new THREE.Group();root.name=name;
  const poseRoot=new THREE.Group();poseRoot.name=`${name}-pose-root`;
  const visualRoot=new THREE.Group();visualRoot.name=`${name}-visual-root`;
  const hitProxy=new THREE.Group();hitProxy.name=`${name}-hit-proxy`;hitProxy.visible=false;
  root.add(poseRoot,hitProxy);poseRoot.add(visualRoot);
  return {root,poseRoot,visualRoot,hitProxy,anchors:{},fxSockets:{}};
}
