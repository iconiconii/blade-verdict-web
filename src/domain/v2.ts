export type Quality = 'Broken' | 'Normal' | 'High' | 'Top';
export type ParryResult = 'Perfect' | 'Nice' | 'Miss';
export type ParryPhase = 'EarlyMiss' | 'Nice' | 'Perfect' | 'LateMiss';
export type BattlePhase = 'intro' | 'telegraph' | 'targetActive' | 'impact' | 'stagger' | 'verdictReady' | 'verdictSlash' | 'settle';
export type BossKind = 'corn' | 'jelly';
/** Named points on the 3D guardian used to attach a parry ring to the actor. */
export type BodyAnchorId = 'head'|'belly'|'leftHand'|'rightHand'|'leftKnee'|'rightKnee'|'leftShoulder'|'rightShoulder'|'leftFin'|'rightFin'|'leftJoint'|'rightJoint'|'lowerJoint';
export interface AttackPresentation { targetIndex:number; anchorId:BodyAnchorId; position:{x:number;y:number}; startDelayMs:number; telegraphProgress:number; phase:'early'|'nice'|'perfect'|'late'; resolved:boolean; result?:ParryResult }
export interface VerdictPoint { x:number; y:number; time:number }
export interface VerdictWeakPoint { id:string; x:number; y:number; radius:number }
export interface VerdictStroke { points:VerdictPoint[]; hitWeakPointIds:string[]; score:number; valid:boolean }
export interface AttackConfig { telegraphMs:number; missDamage:number; perfectCounterDamage:number; niceCounterDamage:number; perfectMeterGain:number; niceMeterGain:number }
export const cornAttack: AttackConfig = { telegraphMs:900, missDamage:12, perfectCounterDamage:12, niceCounterDamage:8, perfectMeterGain:30, niceMeterGain:10 };
export const jellyAttack: AttackConfig = { telegraphMs:700, missDamage:8, perfectCounterDamage:12, niceCounterDamage:8, perfectMeterGain:30, niceMeterGain:10 };
export const parryPhase = (progress:number):ParryPhase => progress < .35 ? 'EarlyMiss' : progress < .7 ? 'Nice' : progress <= .9 ? 'Perfect' : 'LateMiss';
export const ringRatio = (p:number) => { p=Math.max(0,Math.min(1,p)); const lerp=(a:number,b:number,t:number)=>a+(b-a)*t; return p<.35?lerp(3,2.2,p/.35):p<.7?lerp(2.2,1.2,(p-.35)/.35):p<=.9?lerp(1.2,.8,(p-.7)/.2):lerp(.8,.25,(p-.9)/.1) };
export function resolveParry(elapsedMs:number, attack= cornAttack, lateGraceMs=0):ParryResult { if(elapsedMs>attack.telegraphMs+lateGraceMs) return 'Miss'; if(elapsedMs>attack.telegraphMs)return lateGraceMs>0?'Perfect':'Miss'; const phase=parryPhase(Math.max(0,elapsedMs/attack.telegraphMs)); return phase==='Perfect'?'Perfect':phase==='Nice'?'Nice':'Miss' }
export const bodyAnchorIds:Record<BossKind,readonly BodyAnchorId[]>={
  // The order is intentionally stable: it is part of the deterministic replay seed.
  corn:['head','leftHand','rightHand','belly','leftKnee','rightKnee','leftShoulder','rightShoulder'],
  jelly:['head','leftFin','rightFin','belly','leftJoint','rightJoint','lowerJoint'],
};
// Widely separated combinations keep two touch targets readable on small screens.
// Selection is still random, not a head → hand → knee sequence.
const anchorPartners:Record<BodyAnchorId,readonly BodyAnchorId[]>={
  head:['leftKnee','rightKnee','leftJoint','rightJoint','lowerJoint','belly'],
  belly:['head'],
  leftHand:['rightHand','rightShoulder','head'],rightHand:['leftHand','leftShoulder','head'],
  leftShoulder:['rightKnee','rightHand'],rightShoulder:['leftKnee','leftHand'],
  leftKnee:['head','rightShoulder'],rightKnee:['head','leftShoulder'],
  leftFin:['rightFin','rightJoint','head'],rightFin:['leftFin','leftJoint','head'],
  leftJoint:['rightFin','rightJoint','head'],rightJoint:['leftFin','leftJoint','head'],
  lowerJoint:['head'],
};
function deterministicUnit(seed:number,round:number,index:number,salt:number){
  let value=(seed+Math.imul(round,1013904223)+Math.imul(index,2654435761)+salt)>>>0;
  value=(value+0x9e3779b9)>>>0;let v=value;v=Math.imul(v^(v>>>16),0x85ebca6b);v=Math.imul(v^(v>>>13),0xc2b2ae35);return ((v^(v>>>16))&0xffffff)/16777216;
}
/** Stable random body part selection; two simultaneous targets never share an anchor. */
export function deterministicBodyAnchor(seed:number,round:number,index:number,targetCount:number,bossKind:BossKind='corn'):BodyAnchorId{
  const anchors=bodyAnchorIds[bossKind];
  const first=anchors[Math.floor(deterministicUnit(seed,round,0,0x4f1bbcdc)*anchors.length)];
  if(targetCount<2||index===0)return first;
  const candidates=anchorPartners[first].filter(id=>anchors.includes(id));
  return candidates[Math.floor(deterministicUnit(seed,round,index,0x7f4a7c15)*candidates.length)];
}
export function deterministicTarget(seed:number,round:number,index:number,targetCount:number,bossKind:BossKind='corn'){
  const anchor=deterministicBodyAnchor(seed,round,index,targetCount,bossKind);
  // Fallback only (the live scene projects the actual 3D anchor). Keeping a
  // stable body-shaped position makes domain snapshots and no-WebGL mode useful.
  const positions:Partial<Record<BodyAnchorId,{x:number;y:number}>>={head:{x:.5,y:.3},belly:{x:.5,y:.53},leftHand:{x:.34,y:.46},rightHand:{x:.66,y:.46},leftKnee:{x:.42,y:.72},rightKnee:{x:.58,y:.72},leftShoulder:{x:.37,y:.38},rightShoulder:{x:.63,y:.38},leftFin:{x:.29,y:.53},rightFin:{x:.71,y:.53},leftJoint:{x:.34,y:.68},rightJoint:{x:.66,y:.68},lowerJoint:{x:.5,y:.74}};
  const base=positions[anchor]??{x:.5,y:.5},jitter=(deterministicUnit(seed,round,index,0xa53c9e11)-.5)*.06;
  return{x:Math.max(.12,Math.min(.88,base.x+jitter)),y:Math.max(.25,Math.min(.78,base.y+jitter*.65))};
}
export function bodyAnchorLabel(anchor:BodyAnchorId){
  const labels:Record<BodyAnchorId,string>={head:'头部',belly:'腹部',leftHand:'左手',rightHand:'右手',leftKnee:'左膝',rightKnee:'右膝',leftShoulder:'左肩',rightShoulder:'右肩',leftFin:'左侧鳍',rightFin:'右侧鳍',leftJoint:'左触手关节',rightJoint:'右触手关节',lowerJoint:'下方关节'};
  return labels[anchor];
}
export function aggregateParryResults(results:ParryResult[]):ParryResult { if(results.some(result=>result==='Miss'))return'Miss';return results.length>0&&results.every(result=>result==='Perfect')?'Perfect':'Nice' }
export const scoreForHitCount=(valid:boolean,hits:number)=>!valid?0:[10,35,67,90,100][Math.max(0,Math.min(4,hits))];
export const damageForScore=(score:number)=>Math.round(160+Math.max(0,Math.min(100,score))*4.8);
export const qualityForScore=(score:number):Quality=>score>=95?'Top':score>=85?'High':score>=50?'Normal':'Broken';
export interface BattleState { playerHp:number; bossHp:number; meter:number; remainingParts:number; verdictCount:number; loot:{quality:Quality;count:number}[] }
export const newBattle=():BattleState=>({playerHp:100,bossHp:800,meter:0,remainingParts:3,verdictCount:0,loot:[]});
export function applyParry(state:BattleState,result:ParryResult,attack=cornAttack):BattleState { const s={...state}; if(result==='Miss'){s.playerHp=Math.max(0,s.playerHp-attack.missDamage);s.meter=Math.max(0,s.meter-10)} else {s.bossHp=Math.max(0,s.bossHp-(result==='Perfect'?attack.perfectCounterDamage:attack.niceCounterDamage));s.meter=Math.min(100,s.meter+(result==='Perfect'?attack.perfectMeterGain:attack.niceMeterGain))} return s }
export function applyVerdict(state:BattleState,score:number):BattleState { if(state.meter<100) throw Error('Verdict requires a full meter'); if(state.playerHp<=0||state.bossHp<=0)throw Error('Battle has ended');score=Math.max(0,Math.min(100,score)); const s={...state,loot:[...state.loot],meter:0,verdictCount:state.verdictCount+1}; const amount=Math.min(score>=95?2:score>=20?1:0,s.remainingParts); if(amount){s.loot.push({quality:qualityForScore(score),count:amount});s.remainingParts-=amount} s.bossHp=Math.max(0,s.bossHp-damageForScore(score)); if(!s.bossHp&&s.remainingParts){s.loot.push({quality:'Broken',count:s.remainingParts});s.remainingParts=0} return s }
