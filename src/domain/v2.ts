export type Quality = 'Broken' | 'Normal' | 'High' | 'Top';
export type ParryResult = 'Perfect' | 'Nice' | 'Miss';
export type ParryPhase = 'EarlyMiss' | 'Nice' | 'Perfect' | 'LateMiss';
export type BattlePhase = 'intro' | 'telegraph' | 'targetActive' | 'impact' | 'stagger' | 'verdictReady' | 'verdictSlash' | 'settle';
export type BossKind = 'corn' | 'jelly';
export interface AttackPresentation { targetIndex:number; position:{x:number;y:number}; startDelayMs:number; telegraphProgress:number; phase:'early'|'nice'|'perfect'|'late'; resolved:boolean; result?:ParryResult }
export interface VerdictPoint { x:number; y:number; time:number }
export interface VerdictWeakPoint { id:string; x:number; y:number; radius:number }
export interface VerdictStroke { points:VerdictPoint[]; hitWeakPointIds:string[]; score:number; valid:boolean }
export interface AttackConfig { telegraphMs:number; missDamage:number; perfectCounterDamage:number; niceCounterDamage:number; perfectMeterGain:number; niceMeterGain:number }
export const cornAttack: AttackConfig = { telegraphMs:900, missDamage:12, perfectCounterDamage:12, niceCounterDamage:8, perfectMeterGain:30, niceMeterGain:10 };
export const jellyAttack: AttackConfig = { telegraphMs:700, missDamage:8, perfectCounterDamage:12, niceCounterDamage:8, perfectMeterGain:30, niceMeterGain:10 };
export const parryPhase = (progress:number):ParryPhase => progress < .35 ? 'EarlyMiss' : progress < .7 ? 'Nice' : progress <= .9 ? 'Perfect' : 'LateMiss';
export const ringRatio = (p:number) => { p=Math.max(0,Math.min(1,p)); const lerp=(a:number,b:number,t:number)=>a+(b-a)*t; return p<.35?lerp(3,2.2,p/.35):p<.7?lerp(2.2,1.2,(p-.35)/.35):p<=.9?lerp(1.2,.8,(p-.7)/.2):lerp(.8,.25,(p-.9)/.1) };
export function resolveParry(elapsedMs:number, attack= cornAttack, lateGraceMs=0):ParryResult { if(elapsedMs>attack.telegraphMs+lateGraceMs) return 'Miss'; if(elapsedMs>attack.telegraphMs)return lateGraceMs>0?'Perfect':'Miss'; const phase=parryPhase(Math.max(0,elapsedMs/attack.telegraphMs)); return phase==='Perfect'?'Perfect':phase==='Nice'?'Nice':'Miss' }
export function deterministicTarget(seed:number,round:number,index:number,targetCount:number){let value=(seed+Math.imul(round,1013904223)+Math.imul(index,2654435761))>>>0;const unit=()=>{value=(value+0x9e3779b9)>>>0;let v=value;v=Math.imul(v^(v>>>16),0x85ebca6b);v=Math.imul(v^(v>>>13),0xc2b2ae35);return ((v^(v>>>16))&0xffffff)/16777216};const x=targetCount>1?(index===0?.16+unit()*.18:.66+unit()*.18):.2+unit()*.6;return{x,y:.4+unit()*.26}}
export function aggregateParryResults(results:ParryResult[]):ParryResult { if(results.some(result=>result==='Miss'))return'Miss';return results.length>0&&results.every(result=>result==='Perfect')?'Perfect':'Nice' }
export const scoreForHitCount=(valid:boolean,hits:number)=>!valid?0:[10,35,67,90,100][Math.max(0,Math.min(4,hits))];
export const damageForScore=(score:number)=>Math.round(160+Math.max(0,Math.min(100,score))*4.8);
export const qualityForScore=(score:number):Quality=>score>=95?'Top':score>=85?'High':score>=50?'Normal':'Broken';
export interface BattleState { playerHp:number; bossHp:number; meter:number; remainingParts:number; verdictCount:number; loot:{quality:Quality;count:number}[] }
export const newBattle=():BattleState=>({playerHp:100,bossHp:800,meter:0,remainingParts:3,verdictCount:0,loot:[]});
export function applyParry(state:BattleState,result:ParryResult,attack=cornAttack):BattleState { const s={...state}; if(result==='Miss'){s.playerHp=Math.max(0,s.playerHp-attack.missDamage);s.meter=Math.max(0,s.meter-10)} else {s.bossHp=Math.max(0,s.bossHp-(result==='Perfect'?attack.perfectCounterDamage:attack.niceCounterDamage));s.meter=Math.min(100,s.meter+(result==='Perfect'?attack.perfectMeterGain:attack.niceMeterGain))} return s }
export function applyVerdict(state:BattleState,score:number):BattleState { if(state.meter<100) throw Error('Verdict requires a full meter'); if(state.playerHp<=0||state.bossHp<=0)throw Error('Battle has ended');score=Math.max(0,Math.min(100,score)); const s={...state,loot:[...state.loot],meter:0,verdictCount:state.verdictCount+1}; const amount=Math.min(score>=95?2:score>=20?1:0,s.remainingParts); if(amount){s.loot.push({quality:qualityForScore(score),count:amount});s.remainingParts-=amount} s.bossHp=Math.max(0,s.bossHp-damageForScore(score)); if(!s.bossHp&&s.remainingParts){s.loot.push({quality:'Broken',count:s.remainingParts});s.remainingParts=0} return s }
