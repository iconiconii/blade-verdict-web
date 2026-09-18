import * as THREE from 'three';
import type { BossKind, VerdictWeakPoint } from '../domain/v2';

export function makeBattleCamera(width:number,height:number){
  const aspect=Math.max(.2,width/height),camera=new THREE.PerspectiveCamera(35,aspect,.1,70);
  // Fit the entire weapon/shield silhouette on narrow screens; leave HUD space.
  const distance=Math.max(6.8,3.2/aspect);
  camera.position.set(0,1.75,distance);camera.lookAt(0,1.15,0);camera.updateMatrixWorld(true);return camera;
}
export function projectPoint(point:THREE.Vector3,camera:THREE.Camera){const p=point.clone().project(camera);return{x:(p.x+1)/2,y:(1-p.y)/2}}
export function projectedWeakPoints(verdictCount:number,width:number,height:number,bossKind:BossKind='corn'):VerdictWeakPoint[]{
  const patterns=bossKind==='jelly'?[[[.24,.68],[.74,.68],[.26,.36],[.76,.36]],[[.22,.66],[.45,.48],[.63,.68],[.78,.38]],[[.28,.62],[.68,.66],[.66,.36],[.4,.4]]]:[[[.22,.55],[.4,.55],[.58,.55],[.76,.55]],[[.22,.68],[.4,.59],[.58,.5],[.76,.41]],[[.3,.7],[.3,.52],[.3,.34],[.68,.34]]];
  const camera=makeBattleCamera(width,height),radius=Math.max(22,Math.min(27,width*.065))/height;
  return patterns[Math.max(0,verdictCount)%3].map(([x,y],i)=>({id:`weak-${i}`,...projectPoint(new THREE.Vector3((x-.5)*2.1,.7+(y-.24)*2.2,.72),camera),radius}));
}
